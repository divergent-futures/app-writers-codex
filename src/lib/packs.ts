/* Writer's Codex — reference pack sources.
 *
 * WHY THIS EXISTS. `hydrate.ts` used to compile exactly two packs into the bundle with
 * `import.meta.glob` and pick between them by id. That is fine for one private pack and one demo,
 * and wrong for a twelve-pack public library: bundling all twelve would put **9.2 MB of JSON into
 * the JS bundle**, paid for on every first load, parsed at startup, on every device — and a phone
 * would pay it to read one pack. This app has been bitten by exactly that shape before: the 2.3M-
 * character Sherlock demo world broke cloud sync for every other row in the same request.
 *
 * So packs are fetched on demand and cached, and the bundle keeps one seed pack for offline/first
 * run. The `packs` IndexedDB store and its `getPack`/`putPack` helpers already existed in db.ts and
 * had never been called by anything — this is the code that was missing, not new storage.
 *
 * The shape, and it covers desktop and mobile equally:
 *   1. manifest.json (~11 KB) lists what exists          — one small request
 *   2. a pack is fetched only when chosen (~600–1400 KB) — you pay for what you read
 *   3. it is cached in IndexedDB                          — second open is instant and offline
 *   4. one pack stays bundled                             — the app is never empty with no network
 *
 * jsDelivr serves the raw blob with `Access-Control-Allow-Origin: *`, so this works from any origin
 * and needs no proxy.
 *
 * 2026-08-29. The library is no longer one-pack-at-a-time. Everything downloaded is merged into a
 * single reference set and the reader filters it with pack buttons, so the model here changed from
 * "which pack am I reading" to "what is in my library": `mergedReference()` builds the set,
 * `refetchPack` pulls a newer version (plan v1.2.1 §3.2 — compare, offer, never push), and
 * `removePack` is the way back out of ~9 MB of IndexedDB.
 */
import { getPack, putPack, deletePack, listCachedPackIds, allCachedPacks } from './db';
import type { ReferencePack, ReferencePackInfo, ReferenceCollection, ReferenceEntry } from './schema';

/** Pinned to `@main`. Change to `@v1.2.3` to freeze the library at a tag. */
const CDN = 'https://cdn.jsdelivr.net/gh/space-divergentfutures/writers-codex-reference-packs@main';

export interface ManifestPack {
  id: string;
  label: string;
  file: string;
  packVersion: string;
  schemaVersion?: number;
  entryCount: number;
  approxSizeKB?: number;
  /** `planned` packs have a manifest row and no file — never offer them. */
  status: 'live' | 'planned' | 'refreshing' | 'deprecated';
}

export interface PackChoice extends ManifestPack {
  cached: boolean;
  /** the version sitting in IndexedDB, or null if it isn't downloaded (or predates version tracking) */
  cachedVersion: string | null;
  /** downloaded, and the manifest offers a higher `packVersion` */
  updatable: boolean;
}

let _manifest: ManifestPack[] | null = null;

/** Live packs only. Returns [] when offline — the library list then shows just what is downloaded. */
export async function fetchManifest(force = false): Promise<ManifestPack[]> {
  if (_manifest && !force) return _manifest;
  try {
    const r = await fetch(`${CDN}/manifest.json`, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`manifest ${r.status}`);
    const m = (await r.json()) as { packs?: ManifestPack[] };
    _manifest = (m.packs || []).filter((p) => p.status === 'live');
  } catch {
    _manifest = [];
  }
  return _manifest;
}

/* Downloaded versions, mirrored in localStorage.
 *
 * The honest place to read a downloaded pack's version is the pack itself, but `getPack` is a
 * structured clone of up to 2 MB and the library list would pay ~9 MB to render twelve rows. The
 * store's KEYS answer "is it downloaded"; this map answers "which version", and is written on every
 * put and delete. A missing entry means unknown, not stale — the row then offers a re-download
 * rather than claiming an update exists. */
const VER_KEY = 'wc.packVersions';

function readVersions(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(VER_KEY) || '{}') as Record<string, string>;
  } catch {
    return {};
  }
}
function writeVersion(id: string, v: string | null): void {
  try {
    const map = readVersions();
    if (v) map[id] = v;
    else delete map[id];
    localStorage.setItem(VER_KEY, JSON.stringify(map));
  } catch {
    /* private mode — versions just aren't remembered */
  }
}

/** -1 / 0 / 1, on the numeric semver triple. Non-numeric or malformed parts sort as 0. */
function cmpVersion(a: string, b: string): number {
  const pa = String(a || '').split('.');
  const pb = String(b || '').split('.');
  for (let i = 0; i < 3; i++) {
    const x = parseInt(pa[i], 10) || 0;
    const y = parseInt(pb[i], 10) || 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/** The library list: every live pack, marked with whether it is downloaded and whether it is behind. */
export async function listPacks(): Promise<PackChoice[]> {
  const man = await fetchManifest();
  const cached = new Set(await listCachedPackIds());
  const vers = readVersions();
  return man.map((p) => {
    const has = cached.has(p.id);
    const cv = has ? vers[p.id] || null : null;
    return { ...p, cached: has, cachedVersion: cv, updatable: has && !!cv && cmpVersion(cv, p.packVersion) < 0 };
  });
}

/** A fetched body must look like a pack before it is allowed into the store: a truncated or HTML
 *  error body cached as a pack is worse than a failed fetch, because nothing ever retries it. */
function looksLikeAPack(p: unknown): p is ReferencePack {
  const q = p as ReferencePack;
  return !!q && Array.isArray(q.entries) && Array.isArray(q.collections) && q.entries.length > 0;
}

async function download(id: string): Promise<(ReferencePack & { id: string }) | null> {
  const entry = (await fetchManifest()).find((p) => p.id === id);
  if (!entry) return null;
  try {
    const r = await fetch(`${CDN}/${entry.file}`);
    if (!r.ok) return null;
    const pack = (await r.json()) as ReferencePack & { id?: string };
    if (!looksLikeAPack(pack)) return null;
    const withId = { ...pack, id: pack.id || id } as ReferencePack & { id: string };
    await putPack(withId);
    writeVersion(withId.id, withId.packVersion || entry.packVersion || null);
    invalidateMergedReference();
    return withId;
  } catch {
    return null;
  }
}

/** IndexedDB first, network second, null if neither. Never throws — the caller renders "unavailable". */
export async function ensurePack(id: string): Promise<(ReferencePack & { id: string }) | null> {
  const cached = await getPack(id);
  if (cached) return cached;
  return download(id);
}

/** Pull a newer copy over the cached one. The old copy stays put if the fetch fails. */
export async function refetchPack(id: string): Promise<(ReferencePack & { id: string }) | null> {
  await fetchManifest(true); // a stale in-memory manifest would re-download the same version
  return download(id);
}

/** Give back the disk. A removed pack is re-downloadable at any time — nothing is authored here. */
export async function removePack(id: string): Promise<void> {
  await deletePack(id);
  writeVersion(id, null);
  invalidateMergedReference();
}

/* ---------------- which packs the reader is looking at ---------------- */

/* Held in localStorage, NOT on the project. Filtering the reference to two packs while you write is
 * a reading choice, not an edit to the book — writing it to ProjectData would dirty the sync outbox
 * and put a UI preference into synced data.
 *
 * HIDDEN, not visible. Storing the shown set would mean a pack downloaded tomorrow arrives invisible,
 * with nothing on screen to explain why. Storing what is switched off makes "everything I have" the
 * default that survives every future download. */
const HIDDEN_KEY = 'wc.hiddenPacks';
const LEGACY_ACTIVE_KEY = 'wc.activePackId'; // pre-2026-08-29: the single pack being read

export function getHiddenPackIds(): string[] {
  try {
    localStorage.removeItem(LEGACY_ACTIVE_KEY); // one pack at a time is not a thing any more
    const raw = localStorage.getItem(HIDDEN_KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(v) ? (v as string[]) : [];
  } catch {
    return [];
  }
}
export function setHiddenPackIds(ids: string[]): void {
  try {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(ids));
  } catch {
    /* private mode — the choice just doesn't persist */
  }
}

/* ---------------- the merged reference set ---------------- */

/** `mystery-crime-thriller-reference` → `Mystery Crime Thriller`. Only used when a pack carries no
 *  `name` and the manifest is unreachable — offline, the label still has to say something. */
function prettyId(id: string): string {
  return id
    .replace(/-reference$/, '')
    .split('-')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/* Merge is memoised on the set of pack ids, because `rehydrate()` runs on every save: rebuilding
 * 8,000 entries and re-cloning 9 MB out of IndexedDB on each keystroke-driven save would make
 * writing feel slow, and the merge only changes when a pack is downloaded, updated or removed —
 * all three of which call `invalidateMergedReference`. */
let _merged: { key: string; value: (ReferencePack & { packs: ReferencePackInfo[] }) | null } | null = null;

export function invalidateMergedReference(): void {
  _merged = null;
}

function mergeReference(list: (ReferencePack & { id: string; _builtin?: boolean })[]): ReferencePack & { packs: ReferencePackInfo[] } {
  const packs: ReferencePackInfo[] = [];
  const entries: ReferenceEntry[] = [];
  const order: string[] = [];
  const first = new Map<string, ReferenceCollection>();
  const labelVotes = new Map<string, Map<string, number>>();

  for (const p of list) {
    const label = p.name || prettyId(p.id);
    packs.push({ id: p.id, label, entryCount: (p.entries || []).length, packVersion: p.packVersion, builtin: p._builtin });

    for (const c of p.collections || []) {
      if (!first.has(c.id)) {
        first.set(c.id, { ...c });
        order.push(c.id);
      }
      const votes = labelVotes.get(c.id) || new Map<string, number>();
      const lab = c.label || c.id;
      votes.set(lab, (votes.get(lab) || 0) + 1);
      labelVotes.set(c.id, votes);
    }

    // Ids are namespaced here and nowhere else. 619 entry ids collide across the twelve packs, so a
    // flat merge would give the search drawer two `subgenre-1`s and it would open whichever came
    // first. `kind` is deliberately NOT namespaced: one "Tropes" button spanning every pack the
    // reader has switched on is the entire point of merging.
    for (const e of p.entries || []) {
      entries.push({ ...e, id: `${p.id}:${e.id}`, _pack: p.id, _packLabel: label });
    }
  }

  // A collection id shared by several packs is labelled differently in each (`psychology` is
  // "Psychology of Laughter" in Comedy and "Psychology of Fear" in Horror). One button cannot carry
  // seven names, so the commonest wins; with one pack switched on it is that pack's own label.
  const collections = order.map((id) => {
    const c = first.get(id) as ReferenceCollection;
    const votes = labelVotes.get(id);
    if (!votes) return c;
    let best = c.label;
    let n = -1;
    for (const [lab, count] of votes) {
      if (count > n || (count === n && lab < best)) {
        best = lab;
        n = count;
      }
    }
    return { ...c, label: best };
  });

  return { collections, entries, packs };
}

/** Everything downloaded, plus the bundled seed the project points at, as one reference set.
 *  `bundled` is supplied by hydrate, which owns the `import.meta.glob` importers. */
export async function mergedReference(
  bundled: () => Promise<(ReferencePack & { id: string }) | null>,
  projectPackId?: string,
): Promise<(ReferencePack & { packs: ReferencePackInfo[] }) | null> {
  const ids = (await listCachedPackIds()).slice().sort();
  const key = `${ids.join(',')}|${projectPackId || ''}`;
  if (_merged && _merged.key === key) return _merged.value;

  const downloaded = await allCachedPacks();
  const list: (ReferencePack & { id: string; _builtin?: boolean })[] = downloaded
    .slice()
    .sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));

  // The bundled seed joins the set only if the project points at it and it isn't already downloaded
  // — the sample pack and the SF pack share the id `sf-reference` on purpose, and one copy is enough.
  if (projectPackId && !ids.includes(projectPackId)) {
    const b = await bundled();
    if (b) list.unshift({ ...b, _builtin: true });
  }

  const value = list.length ? mergeReference(list) : null;
  _merged = { key, value };
  return value;
}
