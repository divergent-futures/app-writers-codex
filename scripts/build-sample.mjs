// Writer's Codex — sample-world builder (build-time only; not shipped as code).
//
// Reads the story-workbench reference data (READ-ONLY — never writes there) and emits a bundled
// "Science-Fiction example world" the app can one-tap load. Per the guardrail in HANDOFF.md, TJ's
// unpublished MANUSCRIPT PROSE is excluded; the structured world + worldbuilding lore ship.
//
//   input : C:\Projects\story-workbench\{project.json, worldbuilding/*.md}
//   output: src/lib/sample/sample-project.json   (a ProjectBundle)
//           src/lib/sample/sample-reference.json  (the reference pack, for the step-2 Reference view)

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC = 'C:\\Projects\\story-workbench';
const OUT_DIR = join(ROOT, 'src', 'lib', 'sample');

const SCHEMA_VERSION = 1;

function main() {
  if (!existsSync(join(SRC, 'project.json'))) {
    console.error(`[build-sample] source not found at ${SRC} — skipping (sample not regenerated).`);
    // Do not fail the build; a previously-generated sample (if any) stays in place.
    return;
  }

  const project = JSON.parse(readFileSync(join(SRC, 'project.json'), 'utf8'));

  // strip any accidentally-present derived fields; keep canonical data only
  for (const key of Object.keys(project)) {
    if (key.startsWith('_')) delete project[key];
  }

  // points hydrate.ts at sample-reference.json's `id` below — keep these in sync.
  project.referencePackId = 'sf-reference';

  // worldbuilding lore: worldbuilding/<id>.md -> { id: markdown }
  const worldbuilding = {};
  const wbDir = join(SRC, 'worldbuilding');
  if (existsSync(wbDir)) {
    for (const f of readdirSync(wbDir)) {
      if (!f.endsWith('.md')) continue;
      const id = basename(f, '.md');
      worldbuilding[id] = readFileSync(join(wbDir, f), 'utf8').trim();
    }
  }

  // Shelf documents (added 2026-09-04). The type briefs write to characters\\, canon\\branches\\,
  // craft\\ and research\\ and nothing read those folders, so correctly filed work never reached the
  // app — see _brain\\cosmos-book\\SHELVES-VS-APP-2026-09-04.md. They ride in the SAME worldbuilding
  // store (no new sync store, no worker change), under a namespaced key `<shelf>::<id>`. A world or
  // book id can never contain "::", so nothing collides; hydrate.ts splits them back out and
  // export.ts keeps any key containing "::". Keep this in step with story-workbench\\build.py.
  for (const shelf of ['characters', 'canon/branches', 'craft', 'research']) {
    const dir = join(SRC, ...shelf.split('/'));
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.md') || f.toLowerCase() === 'readme.md') continue;
      worldbuilding[`${shelf}::${basename(f, '.md')}`] = readFileSync(join(dir, f), 'utf8').trim();
    }
  }

  // Manuscript prose: chapters[].bodyFile -> markdown text, keyed by chapter id (matches how the
  // app stores/reads prose — see src/lib/export.ts's importProjectBundle). This is TJ's own private
  // pipeline: gated by /src/lib/sample/ being git-ignored, and by the build-public.mjs guard that
  // hides this folder from every public build — none of this ever reaches the public repo or site.
  // Chapters that are still just the auto-generated "write the scene below" placeholder (nothing
  // actually written yet) are skipped so an unwritten chapter doesn't masquerade as having content.
  const prose = {};
  for (const ch of project.chapters ?? []) {
    if (!ch.bodyFile) continue;
    const bodyPath = join(SRC, ch.bodyFile);
    if (!existsSync(bodyPath)) continue;
    const raw = readFileSync(bodyPath, 'utf8');
    const isStubOnly = /^\s*<!--[\s\S]*-->\s*$/.test(raw.trim());
    if (isStubOnly || !raw.trim()) continue;
    prose[ch.id] = raw;
  }

  const bundle = {
    format: 'writers-codex-project',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    name: project?.series?.title ? `${project.series.title} (example)` : 'Science-Fiction example world',
    project,
    prose,
    worldbuilding,
  };

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, 'sample-project.json'), JSON.stringify(bundle));

  // reference pack (kept separate; wired when the Reference view is built in step 2)
  /* The reference pack comes from the PUBLISHED library, not from story-workbench.
   *
   * This line used to read `join(SRC, 'reference.json')` — the 656-entry private research file that
   * pack one was originally converted from. That made `npm run build:private` a trap: it silently
   * downgraded the bundled pack from the shipped version to the 2026-08 ancestor, losing everything
   * built since. Science Fiction is now 2.1.0 with 1,200 entries and is a published artefact; the
   * staging repo's `packs/` is its only canonical home (PACK-SPEC §6b). */
  const refPath = join(ROOT, '..', 'writers-codex-reference-packs-staging', 'packs', 'reference-scifi.json');
  if (existsSync(refPath)) {
    const ref = JSON.parse(readFileSync(refPath, 'utf8'));
    writeFileSync(
      join(OUT_DIR, 'sample-reference.json'),
      JSON.stringify({ id: 'sf-reference', name: 'Science-Fiction reference', ...ref }),
    );
  }

  const counts = Object.fromEntries(
    Object.entries(project)
      .filter(([, v]) => Array.isArray(v))
      .map(([k, v]) => [k, v.length]),
  );
  console.log(
    `[build-sample] wrote sample-project.json — "${bundle.name}"`,
    `\n  collections:`,
    JSON.stringify(counts),
    `\n  worldbuilding docs: ${Object.keys(worldbuilding).filter((k) => !k.includes('::')).length}   shelf docs: ${Object.keys(worldbuilding).filter((k) => k.includes('::')).length}   prose: ${Object.keys(prose).length} chapter(s) with real content`,
  );
}

main();
