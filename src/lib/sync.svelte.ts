/* Writer's Codex — client sync engine (Phase 2).
 *
 * Additive to the local-first app: IndexedDB stays the source of truth. When signed in and online,
 * this drains the outbox to the Worker API (push) and applies remote changes back (pull), with a
 * single server `rev` cursor. Everything here fails soft — offline or signed-out just leaves the app
 * working locally.
 *
 * TWO RULES LEARNED THE HARD WAY (2026-08-02):
 *
 *  1. Push is sliced by payload size. D1 caps any single string/blob column at 2,000,000 characters
 *     and applies a whole push as one db.batch(), so one fat row used to fail the entire request. The
 *     bundled Sherlock example project is 2.3 MB on its own — every device that had it could never
 *     complete a push. Records are now grouped into size-bounded requests, each request clears its own
 *     outbox keys so partial progress sticks, and any single record that can never fit is quarantined
 *     (left in local IndexedDB, removed from the outbox, reported in the UI) instead of jamming sync
 *     forever.
 *
 *  2. A failed push must NEVER prevent pull. Push still runs first so the server resolves
 *     last-write-wins on our latest edits before pull returns the authoritative version — but if push
 *     throws, we carry on and pull anyway. A bad local record must not be able to stop cloud data from
 *     arriving. Pull continues to SKIP any record still in the outbox, so an edit made mid-cycle is
 *     never clobbered by an older server copy.
 */

import {
  clearOutboxKeys,
  deleteImage,
  deleteProse,
  deleteProject,
  deleteWeirScore,
  deleteWorldbuilding,
  getImage,
  getMeta,
  getProject,
  getProse,
  getWeirScore,
  getWorldbuilding,
  listOutbox,
  putImage,
  putProject,
  putProse,
  putWeirScore,
  putWorldbuilding,
  seedOutboxAll,
  setMeta,
  setOutboxListener,
  setOutboxSuppressed,
  type OutboxEntry,
  type WeirScoreRecord,
} from './db';
import type { ProjectData } from './schema';
import type { GateResult, Verdict, WeirMode } from './weir/verdict';
import { app } from './stores/app.svelte';

const CURSOR_KEY = 'syncCursor';
const SEEDED_KEY = 'syncSeeded';
const KEY_KEY = 'syncKey';
const BLOCKED_KEY = 'syncBlocked';
/** Remembers whether this deployment was ever seen to have a sync backend — see backendAvailable. */
const BACKEND_KEY = 'syncBackendPresent';
const POLL_MS = 30_000;
const PUSH_DEBOUNCE_MS = 1500;

/** Target size for one push request. Small enough that no request is ever near a D1 or Worker limit,
 *  large enough that a normal editing session goes up in one round trip. */
const MAX_BYTES_PER_PUSH = 400_000;

/** Hard ceiling for a single record. D1's per-column cap is 2,000,000 characters and the Worker
 *  rejects anything over 1,900,000; a record above that can never be stored, so retrying it forever
 *  would jam the outbox. Quarantine it locally instead. Slightly under the server's figure because we
 *  measure the whole row and the server measures the one big column. */
const MAX_BYTES_PER_RECORD = 1_800_000;

export type SyncStatus = 'off' | 'checking' | 'syncing' | 'synced' | 'offline' | 'error';

/** A record too big for the server to ever accept. Kept locally; simply not synced. */
export interface BlockedRecord {
  key: string;
  label: string;
  bytes: number;
  at: number;
}

/* ---------------- auth ----------------
 *
 * Single-user sync uses a shared key: one long random secret held as a Worker secret (SYNC_KEY) and
 * typed once per device into the sync pill. It lives in IndexedDB meta alongside the cursor, and rides
 * every request as `Authorization: Bearer <key>`. `credentials: 'include'` stays on all of these so the
 * Cloudflare Access cookie path keeps working unchanged for anyone using that instead.
 */

let syncKey: string | null = null;

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { ...(extra ?? {}) };
  if (syncKey) h['Authorization'] = `Bearer ${syncKey}`;
  return h;
}

/* ---------------- API helpers ---------------- */

class AuthError extends Error {}

/** POST JSON and return JSON. On failure the thrown message carries the server's own words — the UI
 *  used to be able to say no more than "Sync error", which made every fault look identical. */
async function apiJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
    credentials: 'include',
  });
  if (res.status === 401) throw new AuthError();
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const detail = text.trim().slice(0, 300);
    throw new Error(`${path} → ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  return (await res.json()) as T;
}

const enc = (s: string) => encodeURIComponent(s);
const bytesOf = (v: unknown): number => {
  const s = JSON.stringify(v) ?? '';
  // Cheap, exact enough: counts UTF-16 code units. We only need an ordering and a safety margin.
  return s.length;
};
const blobToDataUri = (b: Blob) =>
  new Promise<string>((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result as string);
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(b);
  });

type Bucket = 'projects' | 'prose' | 'worldbuilding' | 'weir';

interface PushItem {
  bucket: Bucket;
  row: unknown;
  key: string;
  label: string;
  bytes: number;
}

/** Group records so no single request carries more than MAX_BYTES_PER_PUSH. */
function sliceByBytes(items: PushItem[]): PushItem[][] {
  const out: PushItem[][] = [];
  let batch: PushItem[] = [];
  let bytes = 0;
  for (const it of items) {
    if (batch.length && bytes + it.bytes > MAX_BYTES_PER_PUSH) {
      out.push(batch);
      batch = [];
      bytes = 0;
    }
    batch.push(it);
    bytes += it.bytes;
  }
  if (batch.length) out.push(batch);
  return out;
}

/* ---------------- engine ---------------- */

class SyncEngine {
  status = $state<SyncStatus>('off');
  signedIn = $state(false);
  email = $state<string | null>(null);
  pending = $state(0);
  lastSyncedAt = $state<number | null>(null);
  /** True once a sync key is stored on this device — drives the pill's "Connect"/"Connected" copy. */
  hasKey = $state(false);
  /** Plain-language description of the last failure, or null. Shown in the pill's detail panel. */
  lastError = $state<string | null>(null);
  /** Records too large for the server to accept. They stay on this device and are skipped. */
  blocked = $state<BlockedRecord[]>([]);
  /** True when the deployment has no photo storage (R2) yet. Text still syncs normally; photos wait
   *  in the queue and go up on their own once it is enabled. Deliberately NOT an error state. */
  photosUnavailable = $state(false);
  /**
   * False when this deployment has no sync backend at all — i.e. the static open-source build,
   * where nothing serves `/api/*`.
   *
   * This matters because "no backend" and "backend, but this device isn't connected yet" both
   * surface as a failed auth probe, and they deserve opposite treatment. On a private deployment
   * the second case wants the loud connect banner. On the public build there is nothing to
   * connect to, and showing that banner told every first-time visitor their books lived in the
   * cloud — flatly contradicting the local-first promise the app is built on, before they had
   * seen a single feature.
   *
   * Detected, not configured, so neither deployment carries a flag someone can forget to set.
   */
  backendAvailable = $state(true);

  private cursor = 0;
  private started = false;
  private triggersWired = false;
  private inFlight: Promise<void> | null = null;
  private debounce: ReturnType<typeof setTimeout> | null = null;

  /** Called once from App.svelte after app.init(). Safe to call when signed out (just goes 'off'). */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.status = 'checking';

    // Load the device's stored sync key before the first auth probe, so a returning device is
    // signed in immediately with no interaction.
    syncKey = (await getMeta<string>(KEY_KEY)) ?? null;
    this.hasKey = !!syncKey;
    this.blocked = (await getMeta<BlockedRecord[]>(BLOCKED_KEY)) ?? [];
    // Start from what this deployment told us last time, so an offline launch doesn't nag about
    // connecting to a backend we already know isn't there. Re-checked by the probe below.
    this.backendAvailable = (await getMeta<boolean>(BACKEND_KEY)) ?? true;

    const me = await this.checkAuth();
    if (!me) {
      this.status = 'off';
      // still wire the outbox listener so a later sign-in flushes; and re-check on focus/online.
      this.wireTriggers();
      return;
    }
    await this.onSignedIn(me);
  }

  /** Shared tail of start() and setKey(): record identity, seed the outbox once, then sync. */
  private async onSignedIn(me: { userId: string; email: string }): Promise<void> {
    this.signedIn = true;
    this.email = me.email;
    this.cursor = (await getMeta<number>(CURSOR_KEY)) ?? 0;

    // First successful connection on a device pushes everything it already holds, so the local
    // library becomes the seed of the cloud copy rather than being replaced by it.
    if (!(await getMeta<boolean>(SEEDED_KEY))) {
      await seedOutboxAll();
      await setMeta(SEEDED_KEY, true);
    }
    this.wireTriggers();
    await this.syncNow();
  }

  private wireTriggers(): void {
    if (this.triggersWired) return; // start() and setKey() can both reach here
    this.triggersWired = true;
    setOutboxListener(() => this.nudge());
    addEventListener('online', () => this.syncNow());
    addEventListener('focus', () => this.syncNow());
    setInterval(() => this.syncNow(), POLL_MS);
    this.refreshPending();
  }

  /** Debounced push trigger after local edits. */
  private nudge(): void {
    this.refreshPending();
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => this.syncNow(), PUSH_DEBOUNCE_MS);
  }

  private async refreshPending(): Promise<void> {
    this.pending = (await listOutbox()).length;
  }

  private async checkAuth(): Promise<{ userId: string; email: string } | null> {
    try {
      const res = await fetch('/api/auth/me', { headers: authHeaders(), credentials: 'include' });
      // Only a JSON answer proves there is a sync backend here. A real Worker replies in JSON
      // whether or not the device is authorised (200 with the user, or 401 with an error object).
      // A build with no Worker replies with whatever the static host does for an unknown path —
      // the SPA shell, a 404 page, a plain-text error — none of which is JSON. Testing for the
      // positive case is what makes this robust: we never have to enumerate the ways "nothing is
      // there" can look.
      const isJson = (res.headers.get('content-type') || '').includes('application/json');
      this.backendAvailable = isJson;
      void setMeta(BACKEND_KEY, isJson);
      if (!isJson || !res.ok) return null;
      return (await res.json()) as { userId: string; email: string };
    } catch {
      // The request never completed (offline, DNS, a dropped connection). That says nothing about
      // whether a backend exists, so leave the remembered answer alone rather than guessing.
      return null;
    }
  }

  /** Save a sync key on this device and connect. Verified against the server BEFORE it is stored, so a
   *  mistyped key never gets persisted; on rejection the previous working key (if any) is restored. */
  async setKey(key: string): Promise<{ ok: true } | { ok: false; error: string }> {
    const k = key.trim();
    if (!k) return { ok: false, error: 'Paste your sync key first.' };

    const previous = syncKey;
    syncKey = k;
    this.status = 'checking';

    let me: { userId: string; email: string } | null = null;
    try {
      me = await this.checkAuth();
    } catch {
      me = null;
    }
    if (!me) {
      syncKey = previous;
      this.status = 'off';
      return {
        ok: false,
        error: navigator.onLine
          ? 'That key was rejected. Check for a stray space at either end and try again.'
          : "You're offline — connect to the internet and try again.",
      };
    }

    await setMeta(KEY_KEY, k);
    this.hasKey = true;
    await this.onSignedIn(me);
    return { ok: true };
  }

  /** Forget the key on this device. Local data is untouched; the app just goes back to local-only. */
  async forgetKey(): Promise<void> {
    syncKey = null;
    this.hasKey = false;
    this.signedIn = false;
    this.email = null;
    this.status = 'off';
    this.lastError = null;
    await setMeta(KEY_KEY, null);
  }

  /** Cloudflare Access fallback: full-page navigation that runs the one-time-PIN flow, then returns. */
  signIn(): void {
    location.href = `/api/auth/login?redirect=${enc(location.pathname + location.search)}`;
  }

  /* -------- the cycle -------- */

  async syncNow(): Promise<void> {
    if (!this.signedIn) return;
    if (this.inFlight) return this.inFlight; // coalesce concurrent triggers
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.status = 'offline';
      return;
    }
    this.inFlight = (async () => {
      this.status = 'syncing';
      const offline = () => typeof navigator !== 'undefined' && !navigator.onLine;

      let authFailed = false;
      let pushError: string | null = null;
      let pullError: string | null = null;

      // Push first so the server resolves last-write-wins on our newest edits before pull answers.
      try {
        await this.push();
      } catch (e) {
        if (e instanceof AuthError) authFailed = true;
        else pushError = e instanceof Error ? e.message : String(e);
      }

      // Pull ALWAYS runs, even after a failed push. Nothing local may block incoming data.
      if (!authFailed) {
        try {
          await this.pull();
        } catch (e) {
          if (e instanceof AuthError) authFailed = true;
          else pullError = e instanceof Error ? e.message : String(e);
        }
      }

      if (authFailed) {
        this.signedIn = false;
        this.status = 'off';
        this.lastError = 'The server no longer accepts this device’s sync key. Connect it again.';
      } else if (offline()) {
        this.status = 'offline';
        this.lastError = null;
      } else if (pullError) {
        this.status = 'error';
        this.lastError = `Couldn't download changes. ${pullError}`;
      } else if (pushError) {
        // The book came down; only our own uploads failed. Say exactly that.
        this.status = 'error';
        this.lastError = `Downloaded fine, but some of this device's changes wouldn't upload. ${pushError}`;
      } else {
        this.lastSyncedAt = Date.now();
        this.status = 'synced';
        this.lastError = null;
      }

      await this.refreshPending();
    })();
    try {
      await this.inFlight;
    } finally {
      this.inFlight = null;
    }
  }

  /* -------- push -------- */

  /** Turn the outbox into size-bounded requests. Each request clears its own keys, so a failure part
   *  way through keeps everything already accepted. Throws only after doing as much as it could. */
  private async push(): Promise<void> {
    const entries = await listOutbox();
    if (!entries.length) return;

    const items: PushItem[] = [];
    const images: OutboxEntry[] = [];

    for (const e of entries) {
      if (e.store === 'projects') {
        let row: unknown;
        if (e.op === 'delete') {
          row = { id: e.projectId, name: '', data: {}, updated_at: e.updatedAt, deleted: true };
        } else {
          const rec = await getProject(e.projectId);
          row = rec
            ? { id: rec.id, name: rec.name, data: rec.data, updated_at: e.updatedAt, deleted: false }
            : { id: e.projectId, name: '', data: {}, updated_at: e.updatedAt, deleted: true };
        }
        items.push({ bucket: 'projects', row, key: e.key, label: `Project “${e.projectId}”`, bytes: bytesOf(row) });
      } else if (e.store === 'prose') {
        const md = e.op === 'delete' ? '' : await getProse(e.projectId, e.entityKey!);
        const row = {
          project_id: e.projectId,
          chapter_id: e.entityKey,
          markdown: md,
          updated_at: e.updatedAt,
          deleted: e.op === 'delete',
        };
        items.push({ bucket: 'prose', row, key: e.key, label: `Chapter “${e.entityKey}”`, bytes: bytesOf(row) });
      } else if (e.store === 'worldbuilding') {
        const md = e.op === 'delete' ? '' : await getWorldbuilding(e.projectId, e.entityKey!);
        const row = {
          project_id: e.projectId,
          entity_id: e.entityKey,
          markdown: md,
          updated_at: e.updatedAt,
          deleted: e.op === 'delete',
        };
        items.push({ bucket: 'worldbuilding', row, key: e.key, label: `Entry “${e.entityKey}”`, bytes: bytesOf(row) });
      } else if (e.store === 'weir') {
        const rec = e.op === 'delete' ? undefined : await getWeirScore(e.entityKey!);
        const row =
          e.op === 'delete' || !rec
            ? { id: e.entityKey, project_id: e.projectId, updated_at: e.updatedAt, deleted: true }
            : {
                id: rec.id,
                project_id: rec.projectId,
                mode: rec.mode,
                target_type: rec.targetType ?? null,
                target_id: rec.targetId ?? null,
                title: rec.title ?? null,
                tier: rec.tier ?? null,
                axes: rec.axes,
                total: rec.total,
                gates: rec.gates,
                verdict: rec.verdict,
                fix: rec.fix ?? null,
                created_at: rec.createdAt,
                updated_at: e.updatedAt,
                deleted: false,
              };
        items.push({ bucket: 'weir', row, key: e.key, label: `Weir score “${e.entityKey}”`, bytes: bytesOf(row) });
      } else if (e.store === 'images') {
        images.push(e); // bytes go through the dedicated endpoint below
      }
    }

    // Quarantine anything the server could never store. It stays in local IndexedDB — nothing is
    // lost — but it comes out of the outbox so it can never block another cycle. Editing it later
    // creates a fresh outbox entry, so it retries automatically once it is small enough.
    const tooBig = items.filter((i) => i.bytes > MAX_BYTES_PER_RECORD);
    const sendable = items.filter((i) => i.bytes <= MAX_BYTES_PER_RECORD);
    if (tooBig.length) {
      await clearOutboxKeys(tooBig.map((i) => i.key));
      const now = Date.now();
      const merged = new Map(this.blocked.map((b) => [b.key, b]));
      for (const i of tooBig) merged.set(i.key, { key: i.key, label: i.label, bytes: i.bytes, at: now });
      this.blocked = [...merged.values()];
      await setMeta(BLOCKED_KEY, $state.snapshot(this.blocked));
    } else if (this.blocked.length && sendable.length) {
      // Anything previously blocked that is now flowing again should stop being reported.
      const live = new Set(sendable.map((i) => i.key));
      const kept = this.blocked.filter((b) => !live.has(b.key));
      if (kept.length !== this.blocked.length) {
        this.blocked = kept;
        await setMeta(BLOCKED_KEY, $state.snapshot(this.blocked));
      }
    }

    let firstError: unknown = null;

    for (const batch of sliceByBytes(sendable)) {
      const payload: Record<Bucket, unknown[]> = { projects: [], prose: [], worldbuilding: [], weir: [] };
      for (const it of batch) payload[it.bucket].push(it.row);
      try {
        const res = await apiJSON<PushResponse>('/api/sync/push', payload);
        // The server names anything it had to skip. Record it the same way as a locally-detected
        // oversize so the UI can say which item, and so it stops being retried every 30 seconds.
        if (res?.rejected?.length) await this.noteServerRejections(res.rejected, batch);
        await clearOutboxKeys(batch.map((i) => i.key));
      } catch (e) {
        if (e instanceof AuthError) throw e; // no point continuing; the key is bad
        if (!firstError) firstError = e;
      }
    }

    let photosOff = false;
    for (const e of images) {
      try {
        const outcome = await this.pushImage(e);
        if (outcome === 'sent') await clearOutboxKeys([e.key]);
        // 'unavailable' means the deployment has no photo storage yet. Leave the entry queued and
        // say nothing: the photo is safe on this device and uploads by itself the moment R2 is
        // switched on. Treating it as an error would put a permanent red badge on a working app.
        else photosOff = true;
      } catch (err) {
        if (err instanceof AuthError) throw err;
        if (!firstError) firstError = err;
      }
    }
    this.photosUnavailable = photosOff;

    if (firstError) throw firstError instanceof Error ? firstError : new Error(String(firstError));
  }

  /** Fold the server's `rejected` list into `blocked`, matching each rejection back to the outbox item
   *  it came from so the message names something the writer recognises. */
  private async noteServerRejections(rejections: PushRejection[], batch: PushItem[]): Promise<void> {
    const bucketOf: Record<PushRejection['kind'], Bucket> = {
      project: 'projects',
      prose: 'prose',
      worldbuilding: 'worldbuilding',
      weir: 'weir',
    };
    const now = Date.now();
    const merged = new Map(this.blocked.map((b) => [b.key, b]));
    for (const r of rejections) {
      const tail = r.id.includes('/') ? r.id.slice(r.id.indexOf('/') + 1) : r.id;
      const match =
        batch.find((i) => i.bucket === bucketOf[r.kind] && (i.key.endsWith(`:${tail}`) || i.key.endsWith(`:${r.id}`))) ??
        batch.find((i) => i.bucket === bucketOf[r.kind]);
      const key = match?.key ?? `${bucketOf[r.kind]}:${r.id}`;
      merged.set(key, { key, label: match?.label ?? `${r.kind} “${r.id}”`, bytes: r.chars, at: now });
    }
    this.blocked = [...merged.values()];
    await setMeta(BLOCKED_KEY, $state.snapshot(this.blocked));
  }

  /** Returns 'sent' when the server took it, 'unavailable' when this deployment has no photo storage
   *  yet (503). Throws for anything genuinely wrong. Uploads the thumbnail first, because that is
   *  the copy other devices need; the full size follows and is allowed to fail on its own without
   *  costing the thumbnail, since a photo you can see small beats a photo you cannot see at all. */
  private async pushImage(e: OutboxEntry): Promise<'sent' | 'unavailable'> {
    const path = `/api/images/${enc(e.projectId)}/${enc(e.entityKey!)}`;
    if (e.op === 'delete') {
      const res = await fetch(path, { method: 'DELETE', headers: authHeaders(), credentials: 'include' });
      if (res.status === 401) throw new AuthError();
      if (res.status === 503) return 'unavailable';
      return 'sent';
    }
    const rec = await getImage(e.projectId, e.entityKey!);
    if (!rec) return 'sent'; // gone locally before push — nothing to upload
    const blob = await (await fetch(rec.url)).blob(); // data URI → bytes
    const res = await fetch(`${path}${rec.caption ? `?caption=${enc(rec.caption)}` : ''}`, {
      method: 'PUT',
      headers: authHeaders({ 'Content-Type': blob.type || 'image/webp' }),
      body: blob,
      credentials: 'include',
    });
    if (res.status === 401) throw new AuthError();
    if (res.status === 503) return 'unavailable';
    if (!res.ok) throw new Error(`image upload → ${res.status}`);

    if (rec.full) {
      const full = await fetch(`${path}?variant=full`, {
        method: 'PUT',
        headers: authHeaders({ 'Content-Type': rec.full.type || 'image/webp' }),
        body: rec.full,
        credentials: 'include',
      });
      if (full.status === 401) throw new AuthError();
      if (!full.ok && full.status !== 503) throw new Error(`full-size image upload → ${full.status}`);
    }
    return 'sent';
  }

  /* -------- pull -------- */

  private async pull(): Promise<void> {
    const res = await apiJSON<PullResponse>('/api/sync/pull', { since: this.cursor });
    // Records still pending locally must not be overwritten by an older server copy.
    const pending = new Set((await listOutbox()).map((e) => e.key));

    setOutboxSuppressed(true);
    try {
      for (const p of res.projects) {
        if (pending.has(`projects:${p.id}`)) continue;
        if (p.deleted) await deleteProject(p.id);
        else await putProject({ id: p.id, name: p.name, updatedAt: p.updated_at, data: p.data as ProjectData });
      }
      for (const pr of res.prose) {
        if (pending.has(`prose:${pr.project_id}:${pr.chapter_id}`)) continue;
        if (pr.deleted) await deleteProse(pr.project_id, pr.chapter_id);
        else await putProse(pr.project_id, pr.chapter_id, pr.markdown);
      }
      for (const w of res.worldbuilding) {
        if (pending.has(`worldbuilding:${w.project_id}:${w.entity_id}`)) continue;
        if (w.deleted) await deleteWorldbuilding(w.project_id, w.entity_id);
        else await putWorldbuilding(w.project_id, w.entity_id, w.markdown);
      }
      for (const im of res.images) {
        if (pending.has(`images:${im.project_id}:${im.entity_id}`)) continue;
        if (im.deleted) await deleteImage(im.project_id, im.entity_id);
        else await this.pullImage(im);
      }
      for (const s of res.weir ?? []) {
        if (pending.has(`weir:${s.id}`)) continue;
        if (s.deleted) await deleteWeirScore(s.project_id, s.id);
        else {
          const rec: WeirScoreRecord = {
            id: s.id,
            projectId: s.project_id,
            mode: s.mode as WeirMode,
            targetType: (s.target_type ?? undefined) as WeirScoreRecord['targetType'],
            targetId: s.target_id ?? undefined,
            title: s.title ?? undefined,
            tier: s.tier ?? undefined,
            axes: (s.axes ?? {}) as Record<string, number>,
            total: s.total,
            gates: (s.gates ?? {}) as Record<string, GateResult>,
            verdict: s.verdict as Verdict,
            fix: s.fix ?? undefined,
            createdAt: s.created_at,
          };
          await putWeirScore(rec);
        }
      }
    } finally {
      setOutboxSuppressed(false);
    }

    this.cursor = res.rev;
    await setMeta(CURSOR_KEY, this.cursor);
    await app.syncReload();
  }

  /** Thumbnail only, on purpose. Pulling every full-size copy would turn one sync into tens of
   *  megabytes over mobile data to show pictures nobody has asked to look at yet. The full copy is
   *  fetched by fetchFullImageBytes() the first time the photo is actually opened. */
  private async pullImage(im: ImageMeta): Promise<void> {
    const res = await fetch(`/api/images/${enc(im.project_id)}/${enc(im.entity_id)}`, {
      headers: authHeaders(),
      credentials: 'include',
    });
    if (!res.ok) return; // missing bytes — skip, metadata will retry next pull
    const dataUri = await blobToDataUri(await res.blob());
    await putImage({ projectId: im.project_id, entityId: im.entity_id, url: dataUri, caption: im.caption ?? undefined });
  }
}

/* ---------------- server response shapes ---------------- */

interface PushRejection {
  kind: 'project' | 'prose' | 'worldbuilding' | 'weir';
  id: string;
  chars: number;
  reason: string;
}
interface PushResponse {
  applied: number;
  rev: number;
  rejected?: PushRejection[];
}

interface PullResponse {
  rev: number;
  projects: Array<{ id: string; name: string; data: unknown; updated_at: number; deleted: number | boolean }>;
  prose: Array<{ project_id: string; chapter_id: string; markdown: string; deleted: number | boolean }>;
  worldbuilding: Array<{ project_id: string; entity_id: string; markdown: string; deleted: number | boolean }>;
  images: ImageMeta[];
  weir?: WeirMetaRow[];
}
interface ImageMeta {
  project_id: string;
  entity_id: string;
  r2_key: string;
  caption: string | null;
  deleted: number | boolean;
}
interface WeirMetaRow {
  id: string;
  project_id: string;
  mode: string;
  target_type: string | null;
  target_id: string | null;
  title: string | null;
  tier: string | null;
  axes: unknown;
  total: number;
  gates: unknown;
  verdict: string;
  fix: string | null;
  created_at: number;
  deleted: number | boolean;
}

export const sync = new SyncEngine();

/** Fetch one photo's full-size copy on demand — called by lib/images.ts when a photo is opened.
 *
 * Returns null for every ordinary "there isn't one": no key on this device, photo storage not
 * enabled yet (503), the original was small enough that no full copy was ever made (404), or the
 * network is down. All of those mean the same thing to the caller — keep showing the thumbnail —
 * so none of them throw. The caller is a click on a picture, not a sync cycle; it must never be
 * able to put the app into an error state. */
export async function fetchFullImageBytes(projectId: string, entityId: string): Promise<Blob | null> {
  if (!syncKey) return null; // never connected on this device — there is nothing in the cloud to ask
  try {
    const res = await fetch(`/api/images/${enc(projectId)}/${enc(entityId)}?variant=full`, {
      headers: authHeaders(),
      credentials: 'include',
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    return blob.size ? blob : null;
  } catch {
    return null;
  }
}
