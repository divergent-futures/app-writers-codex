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

/* Cloud-sync outbox (Phase 2). Every local mutation records a dirty marker here; the sync engine
 * (src/lib/sync.svelte.ts) drains it to the Worker API. Entries collapse by `key`, so repeated edits
 * to the same record queue only once. This is the ONLY seam the untouched editors/views need: because
 * they all mutate through the functions below, they enqueue automatically. */
export type OutboxStore = 'projects' | 'prose' | 'worldbuilding' | 'images';
export interface OutboxEntry {
  key: string; // unique per record, e.g. "prose:alpha:ch1"
  store: OutboxStore;
  op: 'put' | 'delete';
  projectId: string;
  entityKey?: string; // chapterId | entityId (absent for projects)
  updatedAt: number; // client write time — the LWW key sent to the server
}

interface CodexDB extends DBSchema {
  projects: { key: string; value: ProjectRecord };
  prose: { key: [string, string]; value: ProseRecord };
  worldbuilding: { key: [string, string]; value: WorldbuildingRecord };
  images: { key: [string, string]; value: ImageRecord };
  packs: { key: string; value: ReferencePack & { id: string } };
  meta: { key: string; value: unknown };
  outbox: { key: string; value: OutboxEntry };
}

const DB_NAME = 'writers-codex';
const DB_VERSION = 2;

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
        // v2: the sync outbox
        if (!d.objectStoreNames.contains('outbox')) d.createObjectStore('outbox', { keyPath: 'key' });
      },
    });
  }
  return _db;
}

/* ---------------- outbox (sync change-tracking) ---------------- */

// When the sync engine writes pulled remote changes back into IndexedDB it uses these same functions,
// so it flips this flag to avoid re-queuing (and re-pushing) what it just pulled.
let suppressOutbox = false;
export function setOutboxSuppressed(v: boolean): void {
  suppressOutbox = v;
}

// A single debounced nudge so the engine can push promptly after a burst of edits, without polling.
let outboxListener: (() => void) | null = null;
export function setOutboxListener(fn: (() => void) | null): void {
  outboxListener = fn;
}

async function enqueue(e: Omit<OutboxEntry, 'updatedAt'>): Promise<void> {
  if (suppressOutbox) return;
  const entry: OutboxEntry = { ...e, updatedAt: Date.now() };
  await (await db()).put('outbox', entry);
  outboxListener?.();
}

export async function listOutbox(): Promise<OutboxEntry[]> {
  return (await db()).getAll('outbox');
}

export async function clearOutboxKeys(keys: string[]): Promise<void> {
  if (!keys.length) return;
  const d = await db();
  const tx = d.transaction('outbox', 'readwrite');
  for (const k of keys) await tx.store.delete(k);
  await tx.done;
}

/** First-sign-in seed: mark every existing local record dirty so the whole current library uploads.
 *  Runs once (guarded by a meta flag in the sync engine). */
export async function seedOutboxAll(): Promise<void> {
  const d = await db();
  const now = Date.now();
  const tx = d.transaction(['projects', 'prose', 'worldbuilding', 'images', 'outbox'], 'readwrite');
  const box = tx.objectStore('outbox');
  for (const p of await tx.objectStore('projects').getAll())
    await box.put({ key: `projects:${p.id}`, store: 'projects', op: 'put', projectId: p.id, updatedAt: p.updatedAt || now });
  for (const r of await tx.objectStore('prose').getAll())
    await box.put({ key: `prose:${r.projectId}:${r.chapterId}`, store: 'prose', op: 'put', projectId: r.projectId, entityKey: r.chapterId, updatedAt: now });
  for (const r of await tx.objectStore('worldbuilding').getAll())
    await box.put({ key: `worldbuilding:${r.projectId}:${r.entityId}`, store: 'worldbuilding', op: 'put', projectId: r.projectId, entityKey: r.entityId, updatedAt: now });
  for (const r of await tx.objectStore('images').getAll())
    await box.put({ key: `images:${r.projectId}:${r.entityId}`, store: 'images', op: 'put', projectId: r.projectId, entityKey: r.entityId, updatedAt: now });
  await tx.done;
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
  await enqueue({ key: `projects:${rec.id}`, store: 'projects', op: 'put', projectId: rec.id });
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
  // Only the project tombstone is queued; the server cascades tombstones to its prose/wb/images,
  // and the peer's pull-apply cascades the local delete — so child deletes need no separate markers.
  await enqueue({ key: `projects:${id}`, store: 'projects', op: 'delete', projectId: id });
}

/* ---------------- prose ---------------- */

export async function getProse(projectId: string, chapterId: string): Promise<string> {
  const r = await (await db()).get('prose', [projectId, chapterId]);
  return r?.markdown ?? '';
}

export async function putProse(projectId: string, chapterId: string, markdown: string): Promise<void> {
  await (await db()).put('prose', { projectId, chapterId, markdown });
  await enqueue({ key: `prose:${projectId}:${chapterId}`, store: 'prose', op: 'put', projectId, entityKey: chapterId });
}

export async function deleteProse(projectId: string, chapterId: string): Promise<void> {
  await (await db()).delete('prose', [projectId, chapterId]);
  await enqueue({ key: `prose:${projectId}:${chapterId}`, store: 'prose', op: 'delete', projectId, entityKey: chapterId });
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
  await enqueue({ key: `worldbuilding:${projectId}:${entityId}`, store: 'worldbuilding', op: 'put', projectId, entityKey: entityId });
}

export async function deleteWorldbuilding(projectId: string, entityId: string): Promise<void> {
  await (await db()).delete('worldbuilding', [projectId, entityId]);
  await enqueue({ key: `worldbuilding:${projectId}:${entityId}`, store: 'worldbuilding', op: 'delete', projectId, entityKey: entityId });
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
  await enqueue({ key: `images:${rec.projectId}:${rec.entityId}`, store: 'images', op: 'put', projectId: rec.projectId, entityKey: rec.entityId });
}

export async function deleteImage(projectId: string, entityId: string): Promise<void> {
  await (await db()).delete('images', [projectId, entityId]);
  await enqueue({ key: `images:${projectId}:${entityId}`, store: 'images', op: 'delete', projectId, entityKey: entityId });
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
