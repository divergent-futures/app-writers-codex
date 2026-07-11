/* Writer's Codex — local-first persistence (IndexedDB via `idb`).
 *
 * Object stores mirror build.py's canonical-vs-derived split:
 *   - projects       : one record per project ({id, name, updatedAt, data: ProjectData}). ~160KB each,
 *                      so a single record is fine and makes export/import 1:1.
 *   - prose          : chapter markdown, keyed [projectId, chapterId]  (heavy, like manuscript/*.md)
 *   - worldbuilding  : world/book lore markdown, keyed [projectId, entityId]
 *   - images         : image blobs, keyed [projectId, entityId]        (ports prototype wb_images)
 *   - packs          : bundled reference packs, keyed by id            (shared across projects)
 *   - meta           : app singletons (activeProjectId, settings)      (keyed by string)
 *
 * `idb` is isolated to this file so the store engine stays swappable.
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { ProjectData, ReferencePack } from './schema';

export interface ProjectRecord {
  id: string;
  name: string;
  updatedAt: number;
  data: ProjectData;
}

export interface ProseRecord {
  projectId: string;
  chapterId: string;
  markdown: string;
}

export interface WorldbuildingRecord {
  projectId: string;
  entityId: string;
  markdown: string;
}

export interface ImageRecord {
  projectId: string;
  entityId: string; // e.g. "character:john" (the prototype's slot key)
  url: string; // data URI (downscaled webp), like the prototype's image layer
  caption?: string;
}

interface CodexDB extends DBSchema {
  projects: { key: string; value: ProjectRecord };
  prose: { key: [string, string]; value: ProseRecord };
  worldbuilding: { key: [string, string]; value: WorldbuildingRecord };
  images: { key: [string, string]; value: ImageRecord };
  packs: { key: string; value: ReferencePack & { id: string } };
  meta: { key: string; value: unknown };
}

const DB_NAME = 'writers-codex';
const DB_VERSION = 1;

let _db: Promise<IDBPDatabase<CodexDB>> | null = null;

function db(): Promise<IDBPDatabase<CodexDB>> {
  if (!_db) {
    _db = openDB<CodexDB>(DB_NAME, DB_VERSION, {
      upgrade(d) {
        if (!d.objectStoreNames.contains('projects')) d.createObjectStore('projects', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('prose'))
          d.createObjectStore('prose', { keyPath: ['projectId', 'chapterId'] });
        if (!d.objectStoreNames.contains('worldbuilding'))
          d.createObjectStore('worldbuilding', { keyPath: ['projectId', 'entityId'] });
        if (!d.objectStoreNames.contains('images'))
          d.createObjectStore('images', { keyPath: ['projectId', 'entityId'] });
        if (!d.objectStoreNames.contains('packs')) d.createObjectStore('packs', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta');
      },
    });
  }
  return _db;
}

/* ---------------- projects ---------------- */

export async function listProjects(): Promise<ProjectRecord[]> {
  const all = await (await db()).getAll('projects');
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getProject(id: string): Promise<ProjectRecord | undefined> {
  return (await db()).get('projects', id);
}

export async function putProject(rec: ProjectRecord): Promise<void> {
  await (await db()).put('projects', rec);
}

export async function deleteProject(id: string): Promise<void> {
  const d = await db();
  await d.delete('projects', id);
  // cascade: drop this project's prose / worldbuilding / images
  for (const store of ['prose', 'worldbuilding', 'images'] as const) {
    const tx = d.transaction(store, 'readwrite');
    let cursor = await tx.store.openCursor();
    while (cursor) {
      if ((cursor.key as [string, string])[0] === id) await cursor.delete();
      cursor = await cursor.continue();
    }
    await tx.done;
  }
}

/* ---------------- prose ---------------- */

export async function getProse(projectId: string, chapterId: string): Promise<string> {
  const r = await (await db()).get('prose', [projectId, chapterId]);
  return r?.markdown ?? '';
}

export async function putProse(projectId: string, chapterId: string, markdown: string): Promise<void> {
  await (await db()).put('prose', { projectId, chapterId, markdown });
}

export async function deleteProse(projectId: string, chapterId: string): Promise<void> {
  await (await db()).delete('prose', [projectId, chapterId]);
}

export async function allProse(projectId: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const tx = (await db()).transaction('prose', 'readonly');
  let cursor = await tx.store.openCursor();
  while (cursor) {
    const rec = cursor.value;
    if (rec.projectId === projectId) out[rec.chapterId] = rec.markdown;
    cursor = await cursor.continue();
  }
  return out;
}

/* ---------------- worldbuilding ---------------- */

export async function getWorldbuilding(projectId: string, entityId: string): Promise<string> {
  const r = await (await db()).get('worldbuilding', [projectId, entityId]);
  return r?.markdown ?? '';
}

export async function putWorldbuilding(projectId: string, entityId: string, markdown: string): Promise<void> {
  await (await db()).put('worldbuilding', { projectId, entityId, markdown });
}

export async function deleteWorldbuilding(projectId: string, entityId: string): Promise<void> {
  await (await db()).delete('worldbuilding', [projectId, entityId]);
}

export async function allWorldbuilding(projectId: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const tx = (await db()).transaction('worldbuilding', 'readonly');
  let cursor = await tx.store.openCursor();
  while (cursor) {
    const rec = cursor.value;
    if (rec.projectId === projectId) out[rec.entityId] = rec.markdown;
    cursor = await cursor.continue();
  }
  return out;
}

/* ---------------- images (ports prototype wb_images) ---------------- */

export async function getImage(projectId: string, entityId: string): Promise<ImageRecord | undefined> {
  return (await db()).get('images', [projectId, entityId]);
}

export async function putImage(rec: ImageRecord): Promise<void> {
  await (await db()).put('images', rec);
}

export async function deleteImage(projectId: string, entityId: string): Promise<void> {
  await (await db()).delete('images', [projectId, entityId]);
}

export async function allImages(projectId: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const tx = (await db()).transaction('images', 'readonly');
  let cursor = await tx.store.openCursor();
  while (cursor) {
    const rec = cursor.value;
    if (rec.projectId === projectId) out[rec.entityId] = rec.url;
    cursor = await cursor.continue();
  }
  return out;
}

/* ---------------- reference packs (shared) ---------------- */

export async function getPack(id: string): Promise<(ReferencePack & { id: string }) | undefined> {
  return (await db()).get('packs', id);
}

export async function putPack(pack: ReferencePack & { id: string }): Promise<void> {
  await (await db()).put('packs', pack);
}

/* ---------------- meta / settings ---------------- */

export async function getMeta<T = unknown>(key: string): Promise<T | undefined> {
  return (await db()).get('meta', key) as Promise<T | undefined>;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await (await db()).put('meta', value, key);
}

export const ACTIVE_PROJECT_KEY = 'activeProjectId';
/** Set once the bundled example world has been auto-seeded, so it's added exactly one time
 *  (even for returning visitors) and never re-added if the user deletes it. */
export const EXAMPLE_SEEDED_KEY = 'exampleWorldSeeded';
