/* Writer's Codex — hydration.
 *
 * The engine renders from a project that has derived fields present (_prose/_words on chapters,
 * _worldbuilding/_wbwords on worlds+books, _reference on the root). Those live in separate stores
 * (or a bundled pack), exactly as build.py kept them out of project.json. This builds a throwaway
 * hydrated clone for rendering — the canonical stored data stays derived-field-free.
 */

import type { ProjectData, ReferencePack } from '../schema';
import { allProse, allWorldbuilding } from '../db';
import { mergedReference } from '../packs';

const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

// Two bundled reference packs can exist side by side: the public Sherlock Holmes demo pack (git-tracked,
// always present) and TJ's private Cosmos pack (git-ignored, local dev only). Which one (if either) a
// project shows is decided by matching `ProjectData.referencePackId` against the pack's own `id` — set on
// both sides by their respective build scripts (build-sherlock-demo.mjs / build-sample.mjs) so the two
// stay self-consistent. A project with no marker (e.g. a fresh blank project) shows no pack.
const publicRefImporters = import.meta.glob('../examples/sherlock-holmes-reference.json', { import: 'default' });
const privateRefImporters = import.meta.glob('../sample/sample-reference.json', { import: 'default' });
let _publicRefCache: ReferencePack | null | undefined;
let _privateRefCache: ReferencePack | null | undefined;

async function loadPublicRefPack(): Promise<ReferencePack | null> {
  if (_publicRefCache !== undefined) return _publicRefCache;
  const key = Object.keys(publicRefImporters)[0];
  _publicRefCache = key ? ((await publicRefImporters[key]()) as ReferencePack) : null;
  return _publicRefCache;
}
async function loadPrivateRefPack(): Promise<ReferencePack | null> {
  if (_privateRefCache !== undefined) return _privateRefCache;
  const key = Object.keys(privateRefImporters)[0];
  _privateRefCache = key ? ((await privateRefImporters[key]()) as ReferencePack) : null;
  return _privateRefCache;
}

/* Every downloaded pack at once, plus the bundled seed this project points at, merged into one set.
 *
 * This used to resolve a single pack — the reader's choice, else the project's — and show only that.
 * A twelve-pack library read one pack at a time is a filing cabinet you can only open one drawer of:
 * the tropes you want to compare are usually in two genres at once. So the set is the whole library
 * and the Reference view filters it by pack. `packs.ts` memoises the merge; this is called on every
 * save, and re-cloning 9 MB out of IndexedDB each time would be felt in the writing.
 *
 * The bundled pair are still the offline seed — they keep the app non-empty on a first run with no
 * network. Everything else is fetched on demand and cached in the `packs` store. Bundling all twelve
 * would put 9.2 MB of JSON into the bundle and make a phone download eleven packs to read one. */
async function loadReferencePack(data: ProjectData): Promise<ReferencePack | null> {
  const wantId = data.referencePackId;
  return mergedReference(async () => {
    if (!wantId) return null;
    const [pub, priv] = await Promise.all([loadPublicRefPack(), loadPrivateRefPack()]);
    if (pub && pub.id === wantId) return { ...pub, id: wantId };
    if (priv && priv.id === wantId) return { ...priv, id: wantId };
    return null;
  }, wantId);
}

export async function hydrate(projectId: string, data: ProjectData): Promise<ProjectData> {
  // shallow clone + clone the collections we annotate (avoid mutating the store's reactive object)
  const prose = await allProse(projectId);
  const wb = await allWorldbuilding(projectId);
  const pack = await loadReferencePack(data);

  const out: ProjectData = { ...data };

  out.chapters = (data.chapters || []).map((c) => {
    const md = prose[c.id];
    return md != null ? { ...c, _prose: md, _words: wordCount(md) } : c;
  });
  out.worlds = (data.worlds || []).map((w) => {
    const md = wb[w.id];
    return md != null ? { ...w, _worldbuilding: md, _wbwords: wordCount(md) } : w;
  });
  out.books = (data.books || []).map((b) => {
    const md = wb[b.id];
    return md != null ? { ...b, _worldbuilding: md, _wbwords: wordCount(md) } : b;
  });
  if (pack) out._reference = pack;

  return out;
}
