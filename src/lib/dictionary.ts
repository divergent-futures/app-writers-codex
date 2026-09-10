/* Writer's Codex — the writer's dictionary.
 *
 * WHY THIS IS NOT A REFERENCE PACK. `packs.ts` downloads packs and merges them all into ONE
 * in-memory set (`mergedReference()`), which is right for ~600 curated cards and catastrophic for
 * 127,737 dictionary entries: ~31 MB of JSON becomes something like 80 MB of live objects and takes
 * a browser tab down on an older phone. A dictionary is a LOOKUP TABLE, not a pack. So:
 *
 *   1. the data is built as 26 files, one per first letter   (scripts/build-dictionary.py)
 *   2. each is stored in IndexedDB as an UNPARSED STRING     (db.ts `dictionary` store)
 *   3. a lookup parses only the shard its word lives in, and at most MAX_HOT stay parsed
 *
 * Peak memory is therefore two shards (~10-15 MB of objects), not the whole dictionary, no matter
 * how many words are looked up.
 *
 * WHERE THE FILES COME FROM. The app's own origin (`/dictionary/…`), copied there from `public/` at
 * build time. That is deliberate for the first language: one deploy ships it, with no second
 * repository and no CDN cache to wait on. When other languages arrive they move to a CDN repo the
 * way reference packs did — change BASE below and nothing else in this file.
 *
 * LICENCE. Open English WordNet, CC BY 4.0. The attribution travels in `index.json` and MUST be
 * shown wherever the dictionary is displayed; `DictionaryView.svelte` renders it from the manifest
 * rather than hard-coding it, so a future language carries its own.
 *
 * Background and the measurements behind every choice here:
 * `_brain\writers-codex\docs\DICTIONARY-DECISION-2026-09-09.md`
 */
import { getDictShard, putDictShard, listDictShardIds, deleteDictLanguage } from './db';

/** Swap for a CDN base when the dictionary outgrows the app's own origin. */
const BASE = '/dictionary';

/** How many parsed shards stay in memory. Two covers "look up a word, then a word in its synonyms". */
const MAX_HOT = 2;

export interface DictionarySense {
  p: string;              // part of speech: n | v | adj | adv
  d: string;              // definition
  s?: string[];           // synonyms
  b?: string[];           // broader words
  n?: string[];           // narrower words
  x?: (string | { t: string; q: string })[]; // usage examples; the object form is an attributed quote
}
export interface DictionaryIndex {
  language: string;
  label: string;
  source: string;
  licence: string;
  attribution: string;
  definitionsIn?: string;
  built: string;
  headwords: number;
  headwordsWithExample: number;
  totalBytes: number;
  shards: { shard: string; file: string; words: number; bytes: number }[];
}

let manifest: DictionaryIndex | null = null;
const hot = new Map<string, Record<string, DictionarySense[]>>();

/** The shard a word belongs to. Anything not starting a-z lives in the "0" shard. */
export function shardFor(word: string): string {
  const c = (word || '').trim()[0]?.toLowerCase() ?? '';
  return c >= 'a' && c <= 'z' ? c : '0';
}

/** The manifest, fetched once. Returns null when no dictionary has been published with this build. */
export async function dictionaryManifest(): Promise<DictionaryIndex | null> {
  if (manifest) return manifest;
  try {
    const res = await fetch(`${BASE}/index.json`, { cache: 'force-cache' });
    if (!res.ok) return null;
    manifest = (await res.json()) as DictionaryIndex;
    return manifest;
  } catch {
    return null; // offline and not yet downloaded — the view says so rather than throwing
  }
}

export interface DictionaryStatus {
  available: boolean;   // the build shipped a dictionary
  downloaded: boolean;  // every shard is in IndexedDB
  have: number;
  total: number;
  index: DictionaryIndex | null;
}

export async function dictionaryStatus(): Promise<DictionaryStatus> {
  const idx = await dictionaryManifest();
  if (!idx) return { available: false, downloaded: false, have: 0, total: 0, index: null };
  const ids = new Set(await listDictShardIds());
  const have = idx.shards.filter((s) => ids.has(`${idx.language}-${s.shard}`)).length;
  return { available: true, downloaded: have === idx.shards.length, have, total: idx.shards.length, index: idx };
}

/**
 * Download every shard that is not already stored. Reports progress per shard so a 31 MB download
 * on a phone is never a spinner with nothing behind it. Safe to call again after a failure: shards
 * already stored are skipped, so a dropped connection resumes rather than restarts.
 */
export async function downloadDictionary(
  onProgress?: (done: number, total: number, label: string) => void,
): Promise<{ ok: boolean; error?: string }> {
  const idx = await dictionaryManifest();
  if (!idx) return { ok: false, error: 'This build has no dictionary to download.' };
  const stored = new Set(await listDictShardIds());
  const todo = idx.shards.filter((s) => !stored.has(`${idx.language}-${s.shard}`));
  let done = idx.shards.length - todo.length;
  onProgress?.(done, idx.shards.length, 'starting');
  for (const s of todo) {
    try {
      const res = await fetch(`${BASE}/${s.file}`);
      if (!res.ok) return { ok: false, error: `${s.file}: HTTP ${res.status}` };
      const json = await res.text();
      JSON.parse(json); // fail here, on this shard, rather than at some later lookup
      await putDictShard({ id: `${idx.language}-${s.shard}`, language: idx.language, json, words: s.words, bytes: s.bytes });
    } catch (e) {
      return { ok: false, error: `${s.file}: ${(e as Error).message}` };
    }
    done++;
    onProgress?.(done, idx.shards.length, s.shard.toUpperCase());
  }
  return { ok: true };
}

export async function removeDictionary(language = 'en'): Promise<void> {
  await deleteDictLanguage(language);
  hot.clear();
}

async function shard(language: string, letter: string): Promise<Record<string, DictionarySense[]> | null> {
  const id = `${language}-${letter}`;
  const cached = hot.get(id);
  if (cached) return cached;
  const rec = await getDictShard(id);
  if (!rec) return null;
  const parsed = JSON.parse(rec.json) as Record<string, DictionarySense[]>;
  hot.set(id, parsed);
  while (hot.size > MAX_HOT) hot.delete(hot.keys().next().value as string); // oldest out
  return parsed;
}

export interface DictionaryEntry { word: string; senses: DictionarySense[] }

/** One word. Case-insensitive, and falls back to the lower-cased form for sentence-start capitals. */
export async function lookup(word: string, language = 'en'): Promise<DictionaryEntry | null> {
  const w = (word || '').trim();
  if (!w) return null;
  const sh = await shard(language, shardFor(w));
  if (!sh) return null;
  for (const candidate of [w, w.toLowerCase(), w[0].toUpperCase() + w.slice(1).toLowerCase()]) {
    if (sh[candidate]) return { word: candidate, senses: sh[candidate] };
  }
  return null;
}

/** Words starting with `prefix`, for the search box. Only ever reads the one shard it needs. */
export async function startingWith(prefix: string, limit = 40, language = 'en'): Promise<string[]> {
  const p = (prefix || '').trim().toLowerCase();
  if (!p) return [];
  const sh = await shard(language, shardFor(p));
  if (!sh) return [];
  const hits: string[] = [];
  for (const w of Object.keys(sh)) {
    if (w.toLowerCase().startsWith(p)) {
      hits.push(w);
      if (hits.length >= limit * 3) break;
    }
  }
  return hits.sort((a, b) => a.length - b.length || a.localeCompare(b)).slice(0, limit);
}
