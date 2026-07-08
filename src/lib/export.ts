/* Writer's Codex — export / import.
 *
 * The project bundle is the file the user OWNS — their backup, their portability, their
 * "sync via my own Dropbox/GitHub." A bundle is prose-inclusive (prose + worldbuilding markdown),
 * but keeps images out for now (images/.zip land in step 3/6, porting the prototype's zip writer).
 */

import { SCHEMA_VERSION, type ProjectData } from './schema';
import { validate, type Warning } from './validate';
import {
  allProse,
  allWorldbuilding,
  getProject,
  listProjects,
  putProject,
  putProse,
  putWorldbuilding,
  type ProjectRecord,
} from './db';

export interface ProjectBundle {
  format: 'writers-codex-project';
  schemaVersion: number;
  exportedAt: string;
  name: string;
  project: ProjectData;
  prose: Record<string, string>;
  worldbuilding: Record<string, string>;
}

export interface LibraryBundle {
  format: 'writers-codex-library';
  schemaVersion: number;
  exportedAt: string;
  projects: ProjectBundle[];
}

const nowISO = () => new Date().toISOString();

/* ---------------- build ---------------- */

export async function buildProjectBundle(projectId: string): Promise<ProjectBundle | null> {
  const rec = await getProject(projectId);
  if (!rec) return null;
  return {
    format: 'writers-codex-project',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: nowISO(),
    name: rec.name,
    project: rec.data,
    prose: await allProse(projectId),
    worldbuilding: await allWorldbuilding(projectId),
  };
}

export async function buildLibraryBundle(): Promise<LibraryBundle> {
  const recs = await listProjects();
  const projects: ProjectBundle[] = [];
  for (const r of recs) {
    const b = await buildProjectBundle(r.id);
    if (b) projects.push(b);
  }
  return { format: 'writers-codex-library', schemaVersion: SCHEMA_VERSION, exportedAt: nowISO(), projects };
}

/* ---------------- download helper ---------------- */

export function downloadJSON(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const slug = (s: string) =>
  s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'project';

export async function exportProjectToFile(projectId: string): Promise<void> {
  const bundle = await buildProjectBundle(projectId);
  if (!bundle) throw new Error('project not found');
  downloadJSON(`${slug(bundle.name)}.codex.json`, bundle);
}

export async function exportLibraryToFile(): Promise<void> {
  const bundle = await buildLibraryBundle();
  downloadJSON(`writers-codex-library.json`, bundle);
}

/* ---------------- import ---------------- */

export interface ImportResult {
  id: string;
  name: string;
  warnings: Warning[];
}

function genId(base: string): string {
  // permanent handle for the project record itself (NOT an entity id)
  const rand = Math.random().toString(36).slice(2, 8);
  return `${slug(base)}-${rand}`;
}

/** Commit one bundle into the store as a NEW project record (import never overwrites silently). */
export async function importProjectBundle(bundle: ProjectBundle): Promise<ImportResult> {
  if (bundle.format !== 'writers-codex-project') throw new Error('not a Writer’s Codex project file');
  if (bundle.schemaVersion !== SCHEMA_VERSION)
    throw new Error(`unsupported schemaVersion ${bundle.schemaVersion} (expected ${SCHEMA_VERSION})`);

  const warnings = validate(bundle.project);
  const id = genId(bundle.name || bundle.project.series?.title || 'imported');
  const rec: ProjectRecord = {
    id,
    name: bundle.name || bundle.project.series?.title || 'Imported project',
    updatedAt: Date.now(),
    data: bundle.project,
  };
  await putProject(rec);
  for (const [chapterId, md] of Object.entries(bundle.prose ?? {})) await putProse(id, chapterId, md);
  for (const [entityId, md] of Object.entries(bundle.worldbuilding ?? {})) await putWorldbuilding(id, entityId, md);
  return { id, name: rec.name, warnings };
}

/** Parse a JSON file (project or library) and import every project it contains. */
export async function importFromFile(file: File): Promise<ImportResult[]> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('file is not valid JSON');
  }
  const obj = parsed as { format?: string };
  if (obj.format === 'writers-codex-library') {
    const results: ImportResult[] = [];
    for (const b of (parsed as LibraryBundle).projects ?? []) results.push(await importProjectBundle(b));
    return results;
  }
  if (obj.format === 'writers-codex-project') {
    return [await importProjectBundle(parsed as ProjectBundle)];
  }
  throw new Error('unrecognized file (expected a Writer’s Codex project or library export)');
}
