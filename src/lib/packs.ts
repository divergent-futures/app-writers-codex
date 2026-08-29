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
 */
import { getPack, putPack } from './db';
import type { ReferencePack } from './schema';

/** Pinned to `@main`. Change to `@v1.2.3` to freeze the library at a tag. */
const CDN = 'https://cdn.jsdelivr.net/gh/space-divergentfutures/writers-codex-reference-packs@main';

export interface ManifestPack {
  id: string;
  label: string;
  file: string;
  packVersion: string;
  entryCount: number;
  approxSizeKB?: number;
  /** `planned` packs have a manifest row and no file — never offer them. */
  status: 'live' | 'planned' | 'refreshing' | 'deprecated';
}

export interface PackChoice extends ManifestPack {
  cached: boolean;
}

let _manifest: ManifestPack[] | null = null;

/** Live packs only. Returns [] when offline — the picker then shows just what is already cached. */
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

/** The picker's list: every live pack, each marked with whether it is already downloaded. */
export async function listPacks(): Promise<PackChoice[]> {
  const man = await fetchManifest();
  return Promise.all(man.map(async (p) => ({ ...p, cached: !!(await getPack(p.id)) })));
}

/** IndexedDB first, network second, null if neither. Never throws — the caller renders "unavailable". */
export async function ensurePack(id: string): Promise<(ReferencePack & { id: string }) | null> {
  const cached = await getPack(id);
  if (cached) return cached;

  const entry = (await fetchManifest()).find((p) => p.id === id);
  if (!entry) return null;

  try {
    const r = await fetch(`${CDN}/${entry.file}`);
    if (!r.ok) return null;
    const pack = (await r.json()) as ReferencePack & { id?: string };
    // Shape check before it goes in the store. A truncated or HTML error body must not be cached
    // as a pack — a bad cached entry is worse than a failed fetch, because it never retries.
    if (!Array.isArray(pack.entries) || !Array.isArray(pack.collections) || !pack.entries.length) return null;
    const withId = { ...pack, id: pack.id || id } as ReferencePack & { id: string };
    await putPack(withId);
    return withId;
  } catch {
    return null;
  }
}

/* The pack the Reference view is currently showing.
 *
 * Held in localStorage, NOT on the project. Switching packs to look something up is a reading
 * choice, not an edit to the book — writing it to ProjectData would dirty the sync outbox and put a
 * UI preference into synced data. `ProjectData.referencePackId` remains the project's own default
 * and is what hydrate falls back to. */
const ACTIVE_KEY = 'wc.activePackId';

export function getActivePackId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}
export function setActivePackId(id: string | null): void {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* private mode — the choice just doesn't persist */
  }
}
