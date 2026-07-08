/* Writer's Codex — app state (Svelte 5 runes).
 *
 * Single shared reactive store over the IndexedDB layer. Holds the project list, the active
 * project's data, and its validation warnings. Views read `app.active?.data`; edits (step 3) will
 * go through `save()` which debounce-writes the project record.
 */

import {
  ACTIVE_PROJECT_KEY,
  deleteProject,
  getMeta,
  getProject,
  listProjects,
  putProject,
  setMeta,
  type ProjectRecord,
} from '../db';
import { emptyProject, type ProjectData } from '../schema';
import { validate, type Warning } from '../validate';
import { importFromFile, importProjectBundle, type ImportResult, type ProjectBundle } from '../export';

function genProjectId(name: string): string {
  const base = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'project';
  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}

class AppStore {
  projects = $state<ProjectRecord[]>([]);
  active = $state<ProjectRecord | null>(null);
  warnings = $state<Warning[]>([]);
  loading = $state(true);

  async init(): Promise<void> {
    this.loading = true;
    this.projects = await listProjects();
    const lastId = await getMeta<string>(ACTIVE_PROJECT_KEY);
    let pick = (lastId && this.projects.find((p) => p.id === lastId)) || this.projects[0] || null;
    if (!pick) {
      // ships empty: create a first blank project so the app always has something to show
      pick = await this._create(emptyProject('My first world'), 'My first world');
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
    await deleteProject(id);
    this.projects = await listProjects();
    if (this.active?.id === id) {
      const next = this.projects[0];
      if (next) await this.switchTo(next.id);
      else await this.init();
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
   * The bundle is resolved via import.meta.glob so its ABSENCE is graceful: TJ's private Cosmos
   * world lives in the git-ignored src/lib/sample/ (dev data only), so the public open-source repo
   * builds fine without it and this button simply reports that no example is bundled. The public
   * app's own neutral example world will be wired in here later. */
  async loadSampleWorld(): Promise<void> {
    const importers = import.meta.glob('../sample/sample-project.json', { import: 'default' });
    const key = Object.keys(importers)[0];
    if (!key) throw new Error('No example world is bundled in this build yet.');
    const bundle = (await importers[key]()) as unknown as ProjectBundle;
    const result = await importProjectBundle(bundle);
    this.projects = await listProjects();
    await this.switchTo(result.id);
  }

  /** Quick-capture (BUILD-SPEC §7): drop a note / character / world / idea into the active project
   *  in 1–2 taps, saved immediately. Ideas & notes land as notes (an inbox to organise later). */
  async capture(kind: 'note' | 'idea' | 'character' | 'world', text: string): Promise<void> {
    if (!this.active) return;
    const t = text.trim();
    if (!t) return;
    const d = this.active.data;
    const slug = t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || kind;
    const taken = new Set<string>([
      ...d.notes.map((n) => n.id), ...d.characters.map((c) => c.id), ...d.worlds.map((w) => w.id),
    ]);
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

  /** Parse a user file (project or library bundle), import every project, switch to the first. */
  async importFile(file: File): Promise<ImportResult[]> {
    const results = await importFromFile(file);
    this.projects = await listProjects();
    if (results[0]) await this.switchTo(results[0].id);
    return results;
  }
}

export const app = new AppStore();
