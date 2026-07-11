/* Writer's Codex — app state (Svelte 5 runes).
 *
 * Single shared reactive store over the IndexedDB layer. Holds the project list, the active
 * project's data, and its validation warnings. Views read `app.active?.data`; edits (step 3) will
 * go through `save()` which debounce-writes the project record.
 */

import {
  ACTIVE_PROJECT_KEY,
  EXAMPLE_SEEDED_KEY,
  EXAMPLE_VERSION_KEY,
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

// The example world has a FIXED, deterministic id (not a random one). This is load-bearing: every
// device and every "Load example" click resolves to the same record, so cloud-sync merges them
// (last-write-wins) instead of fanning out duplicate copies. It also lets a shipped content change
// refresh the seeded copy in place (via demoVersion) rather than being frozen at first-seed content.
const EXAMPLE_PROJECT_ID = 'example-sherlock-holmes';
const EXAMPLE_NAME = 'Sherlock Holmes (example)';
// Legacy copies (seeded before the fixed id existed) got random ids like `sherlock-holmes-example-a1b2c3`.
const LEGACY_EXAMPLE_ID_PREFIX = 'sherlock-holmes-example-';

// The public example world: the Sherlock Holmes demo (public domain, git-tracked — ships to everyone).
const PUBLIC_EXAMPLE_IMPORTERS = import.meta.glob('../examples/sherlock-holmes.json', { import: 'default' });
// TJ's private dev sample (his own Cosmos world) is git-ignored and never present in the public repo;
// resolved via glob purely as a local-dev convenience so it can still be reached if regenerated.
const PRIVATE_SAMPLE_IMPORTERS = import.meta.glob('../sample/sample-project.json', { import: 'default' });

/** True for the bundled example world and any of its legacy random-id / renamed copies — and ONLY
 *  those. Scoped strictly to Sherlock so it can never match TJ's private Cosmos or a user's project. */
function isExampleCopy(p: ProjectRecord): boolean {
  return p.id === EXAMPLE_PROJECT_ID || p.id.startsWith(LEGACY_EXAMPLE_ID_PREFIX) || p.name === EXAMPLE_NAME;
}

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
      // ships empty: create a first blank project so the app always has something to show
      pick = await this._create(emptyProject('My first world'), 'My first world');
    }
    // Seed / de-duplicate / refresh the bundled example world (adds it to the dropdown without
    // switching to it). Runs every load — it's cheap and idempotent, and self-heals a store that
    // still holds legacy duplicate copies from before the fixed-id scheme.
    try {
      await this.reconcileExampleWorld();
    } catch {
      /* example bundle missing/unreadable — fine, app still opens on the active world */
    }
    this.projects = await listProjects();
    // reconcile may have removed the record we picked (a legacy duplicate) — re-resolve the pick,
    // preferring the canonical example if that's what the user was last on.
    if (!this.projects.find((p) => p.id === pick.id)) {
      pick =
        (isExampleCopy(pick) && this.projects.find((p) => p.id === EXAMPLE_PROJECT_ID)) ||
        this.projects[0] ||
        pick;
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

  /** The bundled example bundle, or null if none ships in this build.
   *
   * Prefers the public Sherlock Holmes demo (public domain, git-tracked — always present in the
   * public repo). Falls back to TJ's private Cosmos sample when present (git-ignored, local dev
   * only) so a dev checkout without the public bundle still has something to load. */
  private async loadExampleBundle(): Promise<ProjectBundle | null> {
    const importers = { ...PUBLIC_EXAMPLE_IMPORTERS, ...PRIVATE_SAMPLE_IMPORTERS };
    const key = Object.keys(PUBLIC_EXAMPLE_IMPORTERS)[0] ?? Object.keys(PRIVATE_SAMPLE_IMPORTERS)[0];
    if (!key) return null;
    return (await importers[key]()) as unknown as ProjectBundle;
  }

  /** Write the example bundle at the fixed id (upsert = create-or-overwrite-in-place), then record
   *  its content version so we know when a future shipped change should refresh it. */
  private async writeExampleWorld(bundle: ProjectBundle): Promise<void> {
    await importProjectBundle(bundle, { id: EXAMPLE_PROJECT_ID });
    await setMeta(EXAMPLE_SEEDED_KEY, true);
    await setMeta(EXAMPLE_VERSION_KEY, bundle.demoVersion ?? 1);
  }

  /** Converge the store on exactly ONE example world at the fixed id. Called on every init.
   *
   *  - First run (never seeded, no copy present): seed it once, in the background.
   *  - Copies present: keep exactly one canonical fixed-id record, delete every legacy/duplicate
   *    copy, and refresh its content in place when a newer bundle has shipped (demoVersion bump).
   *  - No copy present but seeded before: the user deleted it — respect that, don't resurrect.
   *
   *  Deleting the extra copies enqueues sync tombstones, so signed-in devices and the cloud converge
   *  on the single canonical record too, instead of endlessly re-fanning out duplicates. */
  async reconcileExampleWorld(): Promise<void> {
    const bundle = await this.loadExampleBundle();
    if (!bundle) return; // no example ships in this build — nothing to do
    const version = bundle.demoVersion ?? 1;

    const all = await listProjects();
    const copies = all.filter(isExampleCopy);
    const seeded = (await getMeta<boolean>(EXAMPLE_SEEDED_KEY)) ?? false;
    const storedVersion = (await getMeta<number>(EXAMPLE_VERSION_KEY)) ?? 0;

    if (copies.length === 0) {
      // Only seed on genuine first run. If we've seeded before and there's no copy now, the user
      // deleted it deliberately — leave it gone.
      if (!seeded) await this.writeExampleWorld(bundle);
      return;
    }

    // Collapse duplicates: drop every copy that isn't the canonical fixed-id record.
    for (const p of copies) {
      if (p.id !== EXAMPLE_PROJECT_ID) await deleteProject(p.id);
    }
    const canonicalExists = copies.some((p) => p.id === EXAMPLE_PROJECT_ID);
    // (Re)write the canonical record when it's missing (we just migrated off a legacy id) or when a
    // newer content version has shipped. Otherwise leave the existing record untouched so any user
    // edits to the demo survive between content updates.
    if (!canonicalExists || storedVersion < version) {
      await this.writeExampleWorld(bundle);
    } else {
      await setMeta(EXAMPLE_SEEDED_KEY, true); // ensure the flag is set for pre-fixed-id installs
    }
    this.projects = await listProjects();
  }

  /** Manual "Load example" button: refresh the single example world to the latest shipped content,
   *  clear any stray duplicates, and switch to it. */
  async loadSampleWorld(): Promise<void> {
    const bundle = await this.loadExampleBundle();
    if (!bundle) throw new Error('No example world is bundled in this build yet.');
    await this.writeExampleWorld(bundle);
    for (const p of (await listProjects()).filter((x) => isExampleCopy(x) && x.id !== EXAMPLE_PROJECT_ID)) {
      await deleteProject(p.id);
    }
    this.projects = await listProjects();
    await this.switchTo(EXAMPLE_PROJECT_ID);
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

  /** Re-read the library + active project from IndexedDB after the sync engine applied remote changes.
   *  Re-assigning `active` drives the existing Codex reactivity (drawer/views/hydration) to refresh. */
  async syncReload(): Promise<void> {
    this.projects = await listProjects();
    if (!this.active) return;
    const fresh = await getProject(this.active.id);
    if (fresh) {
      this.active = fresh;
      this.warnings = validate(fresh.data);
    } else {
      // the active project was deleted on another device
      const next = this.projects[0];
      if (next) await this.switchTo(next.id);
      else await this.init();
    }
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
