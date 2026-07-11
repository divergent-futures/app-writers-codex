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

  // GUARDRAIL: manuscript prose is NOT shipped.
  const prose = {};

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
  const refPath = join(SRC, 'reference.json');
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
    `\n  worldbuilding docs: ${Object.keys(worldbuilding).length}   prose: 0 (excluded by guardrail)`,
  );
}

main();
