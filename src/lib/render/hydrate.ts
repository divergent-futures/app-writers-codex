/* Writer's Codex — hydration.
 *
 * The engine renders from a project that has derived fields present (_prose/_words on chapters,
 * _worldbuilding/_wbwords on worlds+books, _reference on the root). Those live in separate stores
 * (or a bundled pack), exactly as build.py kept them out of project.json. This builds a throwaway
 * hydrated clone for rendering — the canonical stored data stays derived-field-free.
 */

import type { ProjectData, ReferencePack } from '../schema';
import { allProse, allWorldbuilding } from '../db';

const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

// The bundled reference pack is TJ's private dev data (git-ignored). Resolved via glob so its
// absence in the public repo is graceful — the Reference view simply shows empty.
const refImporters = import.meta.glob('../sample/sample-reference.json', { import: 'default' });
let _refCache: ReferencePack | null | undefined;
async function loadReferencePack(): Promise<ReferencePack | null> {
  if (_refCache !== undefined) return _refCache;
  const key = Object.keys(refImporters)[0];
  _refCache = key ? ((await refImporters[key]()) as ReferencePack) : null;
  return _refCache;
}

export async function hydrate(projectId: string, data: ProjectData): Promise<ProjectData> {
  // shallow clone + clone the collections we annotate (avoid mutating the store's reactive object)
  const prose = await allProse(projectId);
  const wb = await allWorldbuilding(projectId);
  const pack = await loadReferencePack();

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
