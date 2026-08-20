// Writer's Codex — regenerate the PRIVATE reference pack.
// Private = the public sci-fi pack + the Cosmos overlay, prepended. Never hand-edit the
// output; rerun this whenever the public pack updates. That is the lock-step guarantee.
//
// Usage (from the writers-codex repo root):  node scripts/build-private-reference.mjs
//
// Reads:  ../writers-codex-reference-packs-staging/packs/reference-scifi.json  (public, canonical)
//         src/lib/sample/cosmos-overlay.json                                   (private, gitignored)
// Writes: src/lib/sample/sample-reference.json                                 (private, gitignored)

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PUBLIC_PACK = resolve('../writers-codex-reference-packs-staging/packs/reference-scifi.json');
const OVERLAY = resolve('src/lib/sample/cosmos-overlay.json');
const OUT = resolve('src/lib/sample/sample-reference.json');

const pub = JSON.parse(readFileSync(PUBLIC_PACK, 'utf8'));
const overlay = JSON.parse(readFileSync(OVERLAY, 'utf8'));

if (overlay.overlayFor !== pub.id) {
  throw new Error(`Overlay is for ${overlay.overlayFor} but public pack is ${pub.id}`);
}

const byId = new Map(pub.entries.map((e) => [e.id, e]));
let applied = 0;
const missing = [];
for (const item of overlay.examples) {
  const entry = byId.get(item.tropeId);
  if (!entry) { missing.push(item.tropeId); continue; }
  entry.examples = entry.examples ?? [];
  entry.examples.unshift(item.example);
  applied++;
}
if (missing.length) {
  console.warn(`WARNING: ${missing.length} overlay targets missing from public pack: ${missing.join(', ')}`);
  console.warn('The public pack may have renumbered — reconcile before shipping.');
}

writeFileSync(OUT, JSON.stringify(pub));
console.log(`private pack written: ${OUT}`);
console.log(`base ${pub.id} v${pub.packVersion} (${pub.entries.length} entries) + ${applied}/${overlay.examples.length} overlay examples`);
