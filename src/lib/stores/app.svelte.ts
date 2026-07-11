/* Writer's Codex — app state (Svelte 5 runes).
 *
 * Single shared reactive store over the IndexedDB layer. Holds the project list, the active
 * project's data, and its validation warnings. Views read `app.active?.data`; edits (step 3) will
 * go through `save()` which debounce-writes the project record.
 */

import {
  ACTIVE_PROJECT_KEY,
  deleteImage,
  deleteProject,
  deleteProse,
  deleteWorldbuilding,
  getMeta,
  getProject,
  listProjects,
  putProject,
  setMeta,
  type ProjectRecord,
} from '../db';
import { COLLECTION_KEYS, emptyProject, type ProjectData } from '../schema';
import { deleteEntity as removeFromCollection } from '../edit';
import { validate, type Warning } from '../validate';
import { importFromFile, importProjectBundle, type ImportResult, type ProjectBundle } from '../export';

function genProjectId(name: string): string {
  const base = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'project';
  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}

// The public example world: the Sherlock Holmes demo (public domain, git-tracked — ships to everyone).
const PUBLIC_EXAMPLE_IMPORTERS = import.meta.glob('../examples/sherlock-holmes.json', { import: 'default' });
// TJ's private dev sample (his own Cosmos world) is git-ignored and never present in the public repo;
// resolved via glob purely as a local-dev convenience so it can still be reached if regenerated.
const PRIVATE_SAMPLE_IMPORTERS = import.meta.glob('../sample/sample-project.json', { import: 'default' });

class AppStore {
  projects = $state<ProjectRecord[]>([]);
  active = $state<ProjectRecord | null>(null);
  warnings = $state<Warning[]>([]);
  loading = $state(true);
  /** True whenever an example world is bundled in this build — the public Sherlock Holmes demo
   *  always ships, plus TJ's private dev sample when present locally. */
  readonly hasExampleWorld =
    Object.keys(PUBLIC_EXAMPLE_IMPORTERS).length > 0 || Object.keys(PRIVATE_SAMPLE_IMPORTERS).length > 0;

  async init(): Promise<void> {
    this.loading = true;
    this.projects = await listProjects();
    const lastId = await getMeta<string>(ACTIVE_PROJECT_KEY);
    let pick = (lastId && this.projects.find((p) => p.id === lastId)) || this.projects[0] || null;
    if (!pick) {
      // First run: seed a blank "My first world" (the active default) AND, when an example world is
      // bundled, pre-load it as a second project so it's already in the switcher dropdown to explore.
      // No button/click needed. Guarded on lastId so it only happens on a genuinely fresh install.
      pick = await this._create(emptyProject('My first world'), 'My first world');
      if (this.hasExampleWorld && !lastId) {
        try {
          await this.seedExampleWorld();
        } catch {
          /* example bundle missing/unreadable — fine, app still opens on the blank world */
        }
      }
    }
    await this.switchTo(pick.id);
    this.loading = false;
  }

  private async _create(data: ProjectData, name: string): Promise<ProjectRecord> {
    const rec: ProjectRecord = { id: genProjectId(name), name, updatedAt: Date.now(), data };
    await putProject(rec);
    this.projects = await listProjects();
    return rec;
  }

  async newEmptyProject(name = 'Untitled world'): Promise<void> {
    const rec = await this._create(emptyProject(name), name);
    await this.switchTo(rec.id);
  }

  async switchTo(id: string): Promise<void> {
    const rec = await getProject(id);
    if (!rec) return;
    this.active = rec;
    this.warnings = validate(rec.data);
    await setMeta(ACTIVE_PROJECT_KEY, id);
  }

  async remove(id: string): Promise<void> {
    const wasActive = this.active?.id === id;
    if (wasActive) this.active = null; // avoid a phantom deleted-project read during the async gap
    await deleteProject(id);
    this.projects = await listProjects();
    if (wasActive) {
      const next = this.projects[0];
      if (next) await this.switchTo(next.id);
      else await this.init(); // no projects left → recreate a blank one
    }
  }

  /** Persist the active project's data back to the store (used by editing, step 3). */
  async save(): Promise<void> {
    if (!this.active) return;
    this.active.updatedAt = Date.now();
    await putProject($state.snapshot(this.active) as ProjectRecord);
    this.projects = await listProjects();
    this.warnings = validate(this.active.data);
  }

  /** Load the bundled example world as a fresh project.
   *
   * Prefers the public Sherlock Holmes demo (public domain, git-tracked — always present in the
   * public repo). Falls back to TJ's private Cosmos sample when present (git-ignored, local dev
   * only) so the button still has something to load in a dev checkout without the public bundle. */
  async loadSampleWorld(): Promise<void> {
    const result = await this._importExampleBundle();
    await this.switchTo(result.id);
  }

  /** Import the example world as a background project (does NOT switch to it) — used on first run
   *  to pre-populate the switcher dropdown while the blank "My first world" stays active. */
  async seedExampleWorld(): Promise<void> {
    await this._importExampleBundle();
  }

  private async _importExampleBundle(): Promise<ImportResult> {
    const importers = { ...PUBLIC_EXAMPLE_IMPORTERS, ...PRIVATE_SAMPLE_IMPORTERS };
    const key = Object.keys(PUBLIC_EXAMPLE_IMPORTERS)[0] ?? Object.keys(PRIVATE_SAMPLE_IMPORTERS)[0];
    if (!key) throw new Error('No example world is bundled in this build yet.');
    const bundle = (await importers[key]()) as unknown as ProjectBundle;
    const result = await importProjectBundle(bundle);
    this.projects = await listProjects();
    return result;
  }

  /** Quick-capture (BUILD-SPEC §7): drop a note / character / world / idea into the active project
   *  in 1–2 taps, saved immediately. Ideas & notes land as notes (an inbox to organise later). */
  async capture(kind: 'note' | 'idea' | 'character' | 'world', text: string): Promise<void> {
    if (!this.active) return;
    const t = text.trim();
    if (!t) return;
    const d = this.active.data;
    const slug = t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || kind;
    // ids are only unique *within* a collection, but a shared bare id across collections is a latent
    // hazard (esp. for image/prose keys), so keep every id globally unique here.
    const taken = new Set<string>();
    for (const key of COLLECTION_KEYS) for (const e of d[key] as { id: string }[]) taken.add(e.id);
    let id = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
    while (taken.has(id)) id = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
    const today = new Date().toISOString().slice(0, 10);
    if (kind === 'character') {
      d.characters.push({ id, name: t, role: '', oneLine: '', source: '', relationships: [], links: [] });
    } else if (kind === 'world') {
      d.worlds.push({ id, name: t, note: '', source: '', type: 'world', parent: null });
    } else {
      d.notes.push({ id, date: today, text: t, tags: [kind === 'idea' ? 'idea' : 'capture'] });
    }
    await this.save();
  }

  /** Delete a top-level entity AND its associated prose / worldbuilding / image rows, then save. */
  async deleteEntity(type: string, id: string): Promise<void> {
    if (!this.active) return;
    const pid = this.active.id;
    const ok = removeFromCollection(this.active.data, type, id);
    if (!ok) return;
    if (type === 'chapter') await deleteProse(pid, id);
    if (type === 'world' || type === 'book') await deleteWorldbuilding(pid, id);
    await deleteImage(pid, `${type}:${id}`); // no-op if none
    await this.save();
  }

  /** Parse a user file (project or library bundle), import every project, switch to the first. */
  async importFile(file: File): Promise<ImportResult[]> {
    const results = await importFromFile(file);
    this.projects = await listProjects();
    if (results[0]) await this.switchTo(results[0].id);
    return results;
  }
}

export const app = new AppStore();
