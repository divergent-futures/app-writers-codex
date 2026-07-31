/* Writer's Codex — client sync engine (Phase 2).
 *
 * Additive to the local-first app: IndexedDB stays the source of truth. When signed in and online,
 * this drains the outbox to the Worker API (push) and applies remote changes back (pull), with a
 * single server `rev` cursor. Everything here fails soft — offline or signed-out just leaves the app
 * working locally.
 *
 * Ordering matters: push BEFORE pull each cycle, so the server resolves last-write-wins on our latest
 * edits first and pull then returns the authoritative version. Pull also SKIPS any record still in the
 * outbox, so an edit made mid-cycle is never clobbered by an older server copy.
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
const POLL_MS = 30_000;
const PUSH_DEBOUNCE_MS = 1500;

export type SyncStatus = 'off' | 'checking' | 'syncing' | 'synced' | 'offline' | 'error';

/* ---------------- API helpers ---------------- */

async function apiJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'include',
  });
  if (res.status === 401) throw new AuthError();
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return (await res.json()) as T;
}

class AuthError extends Error {}

const enc = (s: string) => encodeURIComponent(s);
const blobToDataUri = (b: Blob) =>
  new Promise<string>((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result as string);
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(b);
  });

/* ---------------- engine ---------------- */

class SyncEngine {
  status = $state<SyncStatus>('off');
  signedIn = $state(false);
  email = $state<string | null>(null);
  pending = $state(0);
  lastSyncedAt = $state<number | null>(null);

  private cursor = 0;
  private started = false;
  private inFlight: Promise<void> | null = null;
  private debounce: ReturnType<typeof setTimeout> | null = null;

  /** Called once from App.svelte after app.init(). Safe to call when signed out (just goes 'off'). */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.status = 'checking';

    const me = await this.checkAuth();
    if (!me) {
      this.status = 'off';
      // still wire the outbox listener so a later sign-in flushes; and re-check on focus/online.
      this.wireTriggers();
      return;
    }
    this.signedIn = true;
    this.email = me.email;
    this.cursor = (await getMeta<number>(CURSOR_KEY)) ?? 0;

    if (!(await getMeta<boolean>(SEEDED_KEY))) {
      await seedOutboxAll();
      await setMeta(SEEDED_KEY, true);
    }
    this.wireTriggers();
    await this.syncNow();
  }

  private wireTriggers(): void {
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
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (!res.ok) return null;
      return (await res.json()) as { userId: string; email: string };
    } catch {
      return null;
    }
  }

  /** Full-page navigation that lets Cloudflare Access run its one-time-PIN flow, then returns here. */
  signIn(): void {
    location.href = `/api/auth/login?redirect=${enc(location.pathname + location.search)}`;
  }

  async syncNow(): Promise<void> {
    if (!this.signedIn) return;
    if (this.inFlight) return this.inFlight; // coalesce concurrent triggers
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.status = 'offline';
      return;
    }
    this.inFlight = (async () => {
      this.status = 'syncing';
      try {
        await this.push();
        await this.pull();
        this.lastSyncedAt = Date.now();
        this.status = 'synced';
      } catch (e) {
        if (e instanceof AuthError) {
          this.signedIn = false;
          this.status = 'off';
        } else {
          this.status = typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'error';
        }
      } finally {
        await this.refreshPending();
      }
    })();
    try {
      await this.inFlight;
    } finally {
      this.inFlight = null;
    }
  }

  /* -------- push -------- */

  private async push(): Promise<void> {
    const entries = await listOutbox();
    if (!entries.length) return;

    const projects: unknown[] = [];
    const prose: unknown[] = [];
    const worldbuilding: unknown[] = [];
    const weir: unknown[] = [];
    const images: OutboxEntry[] = [];
    const dataKeys: string[] = []; // projects/prose/wb/weir keys pushed in the JSON changeset

    for (const e of entries) {
      if (e.store === 'projects') {
        if (e.op === 'delete') {
          projects.push({ id: e.projectId, name: '', data: {}, updated_at: e.updatedAt, deleted: true });
        } else {
          const rec = await getProject(e.projectId);
          if (rec) projects.push({ id: rec.id, name: rec.name, data: rec.data, updated_at: e.updatedAt, deleted: false });
          else projects.push({ id: e.projectId, name: '', data: {}, updated_at: e.updatedAt, deleted: true });
        }
        dataKeys.push(e.key);
      } else if (e.store === 'prose') {
        const md = e.op === 'delete' ? '' : await getProse(e.projectId, e.entityKey!);
        prose.push({ project_id: e.projectId, chapter_id: e.entityKey, markdown: md, updated_at: e.updatedAt, deleted: e.op === 'delete' });
        dataKeys.push(e.key);
      } else if (e.store === 'worldbuilding') {
        const md = e.op === 'delete' ? '' : await getWorldbuilding(e.projectId, e.entityKey!);
        worldbuilding.push({ project_id: e.projectId, entity_id: e.entityKey, markdown: md, updated_at: e.updatedAt, deleted: e.op === 'delete' });
        dataKeys.push(e.key);
      } else if (e.store === 'weir') {
        const rec = e.op === 'delete' ? undefined : await getWeirScore(e.entityKey!);
        if (e.op === 'delete' || !rec) {
          weir.push({ id: e.entityKey, project_id: e.projectId, updated_at: e.updatedAt, deleted: true });
        } else {
          weir.push({
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
          });
        }
        dataKeys.push(e.key);
      } else if (e.store === 'images') {
        images.push(e); // bytes go through the dedicated endpoint below
      }
    }

    if (projects.length || prose.length || worldbuilding.length || weir.length) {
      await apiJSON('/api/sync/push', { projects, prose, worldbuilding, weir });
      await clearOutboxKeys(dataKeys);
    }

    for (const e of images) {
      await this.pushImage(e);
      await clearOutboxKeys([e.key]);
    }
  }

  private async pushImage(e: OutboxEntry): Promise<void> {
    const path = `/api/images/${enc(e.projectId)}/${enc(e.entityKey!)}`;
    if (e.op === 'delete') {
      const res = await fetch(path, { method: 'DELETE', credentials: 'include' });
      if (res.status === 401) throw new AuthError();
      return;
    }
    const rec = await getImage(e.projectId, e.entityKey!);
    if (!rec) return; // gone locally before push — nothing to upload
    const blob = await (await fetch(rec.url)).blob(); // data URI → bytes
    const res = await fetch(`${path}${rec.caption ? `?caption=${enc(rec.caption)}` : ''}`, {
      method: 'PUT',
      headers: { 'Content-Type': blob.type || 'image/webp' },
      body: blob,
      credentials: 'include',
    });
    if (res.status === 401) throw new AuthError();
    if (!res.ok) throw new Error(`image PUT → ${res.status}`);
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

  private async pullImage(im: ImageMeta): Promise<void> {
    const res = await fetch(`/api/images/${enc(im.project_id)}/${enc(im.entity_id)}`, { credentials: 'include' });
    if (!res.ok) return; // missing bytes — skip, metadata will retry next pull
    const dataUri = await blobToDataUri(await res.blob());
    await putImage({ projectId: im.project_id, entityId: im.entity_id, url: dataUri, caption: im.caption ?? undefined });
  }
}

/* ---------------- pull response shapes ---------------- */

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
