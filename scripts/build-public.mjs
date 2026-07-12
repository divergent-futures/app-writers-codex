// Writer's Codex — PUBLIC production build.
//
// Guarantees TJ's private Cosmos data can never ship in a public build, no matter
// which machine the build runs on. Vite's import.meta.glob picks up
// src/lib/sample/*.json whenever those files exist on disk — so this wrapper:
//   1. temporarily hides src/lib/sample/ (renames it out of the glob's view)
//   2. runs `vite build`
//   3. restores the folder (even if the build fails)
//   4. verifies dist/ contains no sample-* chunks and no sw.js references to them
//
// For a LOCAL build that includes the private sample, use `npm run build:private`.
// Never deploy a build:private dist.

import { existsSync, renameSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SAMPLE = join(ROOT, 'src', 'lib', 'sample');
const HIDDEN = join(ROOT, '.sample-hidden'); // git-ignored; outside src/ so the glob can't see it

const hadSample = existsSync(SAMPLE);
if (hadSample) renameSync(SAMPLE, HIDDEN);

let buildFailed = false;
try {
  execSync('npx vite build', { cwd: ROOT, stdio: 'inherit' });
} catch {
  buildFailed = true;
} finally {
  if (hadSample) renameSync(HIDDEN, SAMPLE); // always restore
}
if (buildFailed) process.exit(1);

// Belt and braces: fail loudly if anything sample-ish reached dist anyway.
const leaks = [];
const assetsDir = join(ROOT, 'dist', 'assets');
for (const f of readdirSync(assetsDir)) {
  if (f.startsWith('sample-')) leaks.push(`dist/assets/${f}`);
}
const swPath = join(ROOT, 'dist', 'sw.js');
if (existsSync(swPath) && readFileSync(swPath, 'utf8').includes('sample-')) {
  leaks.push('dist/sw.js references sample-* chunks');
}
if (leaks.length) {
  console.error('[build-public] FATAL — private data reached dist/:\n  ' + leaks.join('\n  '));
  console.error('[build-public] DO NOT DEPLOY. Delete dist/ and rerun npm run build.');
  process.exit(1);
}
console.log('[build-public] OK — dist/ is clean (no private sample chunks). Safe to deploy.');
