#!/usr/bin/env node
// Writer's Codex — generic story importer.
//
// Converts your own story notes, written in the block-markdown format described in
// AI-IMPORT-GUIDE.md, into a project file you can load with the app's own "Import…" button.
// This script is generic and content-free — it ships in the public repo and works for any story,
// not just the examples bundled with the app.
//
//   usage : node scripts/import-story.mjs <input-file-or-directory> [output.json]
//   input : one markdown file, or a directory of .md files (all are read and concatenated)
//   output: a Writer's Codex project file (defaults to <input-name>.codex.json next to the input)
//
// The whole point of this script is to do the mechanical, error-prone parts (generating ids,
// resolving "Character Name" -> the right internal id, matching the exact JSON shape the app
// expects) so you — or the AI you're working with — only ever have to write plain, readable
// markdown. See AI-IMPORT-GUIDE.md for the format spec and a ready-to-paste prompt for your own
// AI assistant.

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename, extname, resolve } from 'node:path';

const SCHEMA_VERSION = 1;

/* ==================== generic block-markdown parsing ==================== */
// These four helpers are format-only — they know nothing about Writer's Codex's schema. They turn
// markdown text into blocks of {fields, sections}, which the schema-specific mapping below reads.

function slug(s) {
  return (s || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';
}

function uniqueId(base, taken) {
  let id = base;
  let n = 2;
  while (taken.has(id)) id = `${base}-${n++}`;
  taken.add(id);
  return id;
}

function splitBlocks(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  const blocks = [];
  let cur = null;
  for (const line of lines) {
    const m = line.match(/^##\s+([A-Z]+)\s*$/);
    if (m) {
      if (cur) blocks.push(cur);
      cur = { type: m[1], lines: [] };
      continue;
    }
    if (line.trim() === '---') continue;
    if (cur) cur.lines.push(line);
  }
  if (cur) blocks.push(cur);
  return blocks;
}

// Parse a block's lines into { fields: {Key: value}, sections: {Key: [bulletText,...]} }.
// Three field mechanics: `**Key:** value` (scalar), `**Key:** |` + indented paragraph (long text),
// `**Key:**` (empty) + indented `- ` bullets (a list; items may themselves be structured — see
// parseBullet below).
function parseBlock(lines) {
  const fields = {};
  const sections = {};
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const top = line.match(/^\*\*([^*:]+):\*\*\s*(.*)$/);
    if (!top) { i++; continue; } // stray line, ignore
    const key = top[1].trim();
    const value = top[2];

    if (value.trim() === '|') {
      const para = [];
      i++;
      while (i < lines.length && /^\s{2,}\S/.test(lines[i])) {
        para.push(lines[i].replace(/^\s+/, ''));
        i++;
      }
      fields[key] = para.join(' ').trim();
      continue;
    }

    if (value.trim() === '') {
      const bullets = [];
      let cur = null;
      i++;
      while (i < lines.length && /^\s+\S/.test(lines[i])) {
        const bm = lines[i].match(/^\s*-\s+(.*)$/);
        if (bm) {
          if (cur !== null) bullets.push(cur);
          cur = bm[1];
        } else if (cur !== null) {
          cur += ' ' + lines[i].trim();
        }
        i++;
      }
      if (cur !== null) bullets.push(cur);
      sections[key] = bullets;
      continue;
    }

    fields[key] = value.trim();
    i++;
  }
  return { fields, sections };
}

// A structured bullet like "**To:** Sherlock Holmes — **Type:** ally — **Note:** trusted friend"
// becomes {To: 'Sherlock Holmes', Type: 'ally', Note: 'trusted friend'}.
function parseBullet(text) {
  const segments = text.split(/\s+—\s+(?=\*\*)/);
  const out = {};
  for (const seg of segments) {
    const m = seg.match(/^\*\*([^*]+):\*\*\s*(.*)$/s);
    if (!m) continue;
    out[m[1].trim()] = m[2].trim().replace(/\s*—\s*$/, '');
  }
  return out;
}

const splitList = (v) => {
  if (!v || /^\(.*\)$/.test(v.trim())) return [];
  return v.split(/,\s*/).map((s) => s.trim()).filter(Boolean);
};
// Simple (non-structured) list fields accept EITHER a comma-separated scalar ("**Tags:** a, b") OR
// a bullet section ("**Tags:**" + indented "- a" / "- b") — an AI writing this format won't always
// pick the same one we would, so both are accepted everywhere a plain list is expected.
const listField = (fields, sections, key) =>
  sections[key] ? sections[key].map((s) => s.trim()).filter(Boolean) : splitList(fields[key]);
// For free-text list fields where a comma is likely to appear WITHIN an item (findings, tenets...):
// bullets are preferred; a scalar fallback is treated as a single item, never comma-split.
const bulletOrOne = (fields, sections, key) =>
  sections[key] ? sections[key].map((s) => s.trim()).filter(Boolean) : fields[key] ? [fields[key]] : [];
const num = (v) => (v === undefined || v === '' ? undefined : Number(v));
const bool = (v) => /^(yes|true|y)$/i.test((v || '').trim());

/* ==================== load input ==================== */

const inputArg = process.argv[2];
if (!inputArg) {
  console.error('usage: node scripts/import-story.mjs <input-file-or-directory> [output.json]');
  process.exit(1);
}
const inputPath = resolve(inputArg);
let text;
if (statSync(inputPath).isDirectory()) {
  const files = readdirSync(inputPath).filter((f) => extname(f) === '.md').sort();
  if (!files.length) {
    console.error(`no .md files found in ${inputPath}`);
    process.exit(1);
  }
  text = files.map((f) => readFileSync(join(inputPath, f), 'utf8')).join('\n\n');
} else {
  text = readFileSync(inputPath, 'utf8');
}
const outputPath = resolve(
  process.argv[3] || join(process.cwd(), `${basename(inputPath, extname(inputPath))}.codex.json`),
);

/* ==================== schema-specific mapping ==================== */
// Everything below knows about Writer's Codex's actual data shape (src/lib/schema.ts). Entities are
// referenced BY NAME in the markdown (never by id — the AI writing this doesn't know ids), resolved
// to real ids in a second pass once every block has been parsed once.

const blocks = splitBlocks(text);

let series = { title: 'Untitled', logline: '', author: '', note: '' };
const books = [], threads = [], tracks = [], characters = [], worlds = [], timeline = [],
  chapters = [], notes = [], research = [], themes = [], pantheon = [], reading = [], religions = [];

const takenIds = new Set();
const bookIdByTitle = new Map();
const threadIdByName = new Map();
const trackIdByName = new Map();
const charIdByName = new Map();
const worldIdByName = new Map();
const beatIdByLabel = new Map();
const religionIdByName = new Map();
const worldParentNameById = new Map();

for (const block of blocks) {
  const { fields, sections } = parseBlock(block.lines);

  switch (block.type) {
    case 'SERIES': {
      series = {
        title: fields['Title'] || series.title,
        logline: fields['Logline'] || '',
        author: fields['Author'] || '',
        note: fields['Note'] || '',
      };
      break;
    }
    case 'BOOK': {
      const id = uniqueId(slug(fields['Title']), takenIds);
      bookIdByTitle.set(fields['Title'], id);
      books.push({
        id,
        title: fields['Title'] || 'Untitled book',
        order: num(fields['Order']) ?? books.length + 1,
        status: fields['Status'] || 'planned',
        type: fields['Type'] || undefined,
        wordTarget: num(fields['Word target']),
        branch: fields['Branch'] ? bool(fields['Branch']) : undefined,
        _worldNames: listField(fields, sections, 'Worlds'), // resolved to ids below
      });
      break;
    }
    case 'THREAD': {
      const id = uniqueId(slug(fields['Name']), takenIds);
      threadIdByName.set(fields['Name'], id);
      threads.push({ id, name: fields['Name'] || 'Untitled thread', color: fields['Color'] || '#888888', source: fields['Source'] || '' });
      break;
    }
    case 'TRACK': {
      const id = uniqueId(slug(fields['Name']), takenIds);
      trackIdByName.set(fields['Name'], id);
      tracks.push({
        id,
        name: fields['Name'] || 'Untitled track',
        color: fields['Color'] || '#888888',
        kind: fields['Kind'] || 'spine',
        _worldName: fields['World'] || undefined,
      });
      break;
    }
    case 'CHARACTER': {
      const id = uniqueId(slug(fields['Name']), takenIds);
      charIdByName.set(fields['Name'], id);
      const relationships = (sections['Relationships'] || []).map(parseBullet).map((b) => ({
        _to: b['To'], type: b['Type'] || undefined, note: b['Note'] || undefined,
      }));
      const links = (sections['Links'] || []).map(parseBullet).map((b) => ({
        _to: b['To'], kind: (b['Kind'] || 'world').toLowerCase(), type: b['Type'] || undefined, note: b['Note'] || undefined,
      }));
      const arcs = (sections['Arcs'] || []).map(parseBullet).map((b) => {
        const scores = {};
        for (const part of (b['Scores'] || '').split(',')) {
          const m = part.trim().match(/^(\w+)\s+(\d+)$/);
          if (m) scores[m[1]] = Number(m[2]);
        }
        return {
          _book: b['Book'], status: b['Status'] || undefined, want: b['Want'] || undefined,
          need: b['Need'] || undefined, wound: b['Wound'] || undefined,
          scores: Object.keys(scores).length ? scores : undefined,
          circle: splitList(b['Circle']),
          rationale: b['Rationale'] || undefined,
        };
      });
      const lessons = (sections['Lessons'] || []).map(parseBullet).map((b, idx) => ({
        id: `${id}-lesson-${idx + 1}`, _book: b['Book'], order: idx + 1,
        trigger: b['Trigger'] || '', lesson: b['Lesson'] || '', becomes: b['Becomes'] || '',
        status: b['Status'] || undefined,
      }));
      characters.push({
        id, name: fields['Name'] || 'Untitled character', role: fields['Role'] || '',
        oneLine: fields['One-line'] || '', source: fields['Source'] || '',
        aliases: listField(fields, sections, 'Aliases'), relationships, links, arcs, lessons,
      });
      break;
    }
    case 'WORLD': {
      const id = uniqueId(slug(fields['Name']), takenIds);
      worldIdByName.set(fields['Name'], id);
      if (fields['Parent']) worldParentNameById.set(id, fields['Parent']);
      worlds.push({
        id, name: fields['Name'] || 'Untitled world', note: fields['Note'] || '',
        source: fields['Source'] || '', type: fields['Type'] || 'world', parent: null,
      });
      break;
    }
    case 'TIMELINE': {
      const id = uniqueId(slug(fields['Label'] || 'beat'), takenIds);
      if (fields['Label']) beatIdByLabel.set(fields['Label'], id);
      timeline.push({
        id, order: num(fields['Order']) ?? timeline.length + 1, label: fields['Label'] || '',
        era: fields['Era'] || undefined, _book: fields['Book'] || undefined,
        _threadNames: listField(fields, sections, 'Threads'), _characterNames: listField(fields, sections, 'Characters'),
        summary: fields['Summary'] || '', _trackName: fields['Track'] || undefined,
        _alsoTrackNames: listField(fields, sections, 'Also tracks'),
      });
      break;
    }
    case 'CHAPTER': {
      const id = uniqueId(slug(fields['Title'] || 'chapter'), takenIds);
      const scenes = (sections['Scenes'] || []).map(parseBullet).map((b) => ({
        title: b['Title'] || undefined, summary: b['Summary'] || undefined,
        _characterNames: splitList(b['Characters']),
      }));
      chapters.push({
        id, _book: fields['Book'], order: num(fields['Order']) ?? chapters.length + 1,
        title: fields['Title'] || 'Untitled chapter', _pov: fields['POV'] || undefined,
        _thread: fields['Thread'] || undefined, status: fields['Status'] || 'draft',
        wordcount: num(fields['Word count']) ?? 0, summary: fields['Summary'] || '',
        scenes, bodyFile: `${id}.md`, _characterNames: listField(fields, sections, 'Characters'),
      });
      break;
    }
    case 'NOTE': {
      const id = uniqueId(slug(`note-${fields['Date'] || notes.length}`), takenIds);
      notes.push({ id, date: fields['Date'] || '', text: fields['Text'] || '', tags: listField(fields, sections, 'Tags') });
      break;
    }
    case 'RESEARCH': {
      const id = uniqueId(slug(fields['Title'] || 'research'), takenIds);
      const sources = (sections['Sources'] || []).map(parseBullet).map((b) => ({
        title: b['Title'] || '', url: b['URL'] || '', note: b['Note'] || undefined,
      }));
      research.push({
        id, title: fields['Title'] || 'Untitled research', question: fields['Question'] || '',
        status: fields['Status'] || 'open', _bookNames: listField(fields, sections, 'Books'),
        _threadNames: listField(fields, sections, 'Threads'), findings: bulletOrOne(fields, sections, 'Findings'),
        forks: bulletOrOne(fields, sections, 'Forks'), sources,
      });
      break;
    }
    case 'THEME': {
      const id = uniqueId(slug(fields['Name'] || 'theme'), takenIds);
      themes.push({
        id, name: fields['Name'] || 'Untitled theme', statement: fields['Statement'] || '',
        _bookNames: listField(fields, sections, 'Books'), _characterNames: listField(fields, sections, 'Characters'),
        _beatLabels: listField(fields, sections, 'Beats'),
      });
      break;
    }
    case 'PANTHEON': {
      const id = uniqueId(slug(fields['Name'] || 'pantheon'), takenIds);
      pantheon.push({
        id, name: fields['Name'] || '', age: fields['Age'] || '', category: fields['Category'] || 'personal-stage',
        order: num(fields['Order']) ?? pantheon.length + 1, role: fields['Role'] || '',
        voice: fields['Voice'] || '', function: fields['Function'] || '', tie: fields['Tie'] || '',
      });
      break;
    }
    case 'READING': {
      const id = uniqueId(slug(fields['Title'] || 'reading'), takenIds);
      reading.push({
        id, title: fields['Title'] || '', author: fields['Author'] || '', status: fields['Status'] || 'toread',
        gives: fields['Gives'] || '', tags: listField(fields, sections, 'Tags'), correlation: fields['Correlation'] || '',
        takeaways: bulletOrOne(fields, sections, 'Takeaways'),
      });
      break;
    }
    case 'RELIGION': {
      const id = uniqueId(slug(fields['Name'] || 'religion'), takenIds);
      religionIdByName.set(fields['Name'], id);
      const figures = (sections['Figures'] || []).map(parseBullet).map((b) => ({ _to: b['To'], role: b['Role'] || undefined }));
      const relationships = (sections['Relationships'] || []).map(parseBullet).map((b) => ({ _to: b['To'], type: b['Type'] || undefined }));
      religions.push({
        id, name: fields['Name'] || 'Untitled religion', _worldName: fields['World'],
        scope: fields['Scope'] || '', status: fields['Status'] || 'emerging', truth: fields['Truth'] || 'partial',
        creed: fields['Creed'] || '', mythologizes: fields['Mythologizes'] || '', afterlife: fields['Afterlife'] || '',
        _beatLabels: listField(fields, sections, 'Beats'), figures, tenets: bulletOrOne(fields, sections, 'Tenets'), relationships,
        source: fields['Source'] || undefined,
      });
      break;
    }
    default:
      console.warn(`[import-story] unknown block type "## ${block.type}" — skipped`);
  }
}

/* ---------------- second pass: resolve every name reference to an id ---------------- */

const warn = (msg) => console.warn(`[import-story] ${msg}`);
const lookup = (map, name, kind) => {
  if (!name) return undefined;
  const id = map.get(name);
  if (!id) warn(`could not find ${kind} named "${name}" — reference dropped`);
  return id;
};

for (const b of books) { b.worlds = b._worldNames.map((n) => lookup(worldIdByName, n, 'world')).filter(Boolean); delete b._worldNames; }
for (const t of tracks) { t.world = t._worldName ? lookup(worldIdByName, t._worldName, 'world') : undefined; delete t._worldName; }
for (const w of worlds) {
  const parentName = worldParentNameById.get(w.id);
  w.parent = parentName ? lookup(worldIdByName, parentName, 'world') ?? null : null;
}
for (const c of characters) {
  c.relationships = c.relationships.map((r) => ({ to: lookup(charIdByName, r._to, 'character'), type: r.type, note: r.note })).filter((r) => r.to);
  c.links = c.links.map((l) => {
    const map = l.kind === 'thread' ? threadIdByName : worldIdByName;
    const to = lookup(map, l._to, l.kind);
    return to ? { to, kind: l.kind, type: l.type, note: l.note } : null;
  }).filter(Boolean);
  c.arcs = c.arcs.map((a) => ({ ...a, book: lookup(bookIdByTitle, a._book, 'book'), _book: undefined }));
  c.arcs.forEach((a) => delete a._book);
  c.lessons = c.lessons.map((l) => ({ ...l, book: lookup(bookIdByTitle, l._book, 'book'), _book: undefined }));
  c.lessons.forEach((l) => delete l._book);
}
for (const beat of timeline) {
  beat.book = lookup(bookIdByTitle, beat._book, 'book');
  beat.threads = beat._threadNames.map((n) => lookup(threadIdByName, n, 'thread')).filter(Boolean);
  beat.characters = beat._characterNames.map((n) => lookup(charIdByName, n, 'character')).filter(Boolean);
  beat.track = lookup(trackIdByName, beat._trackName, 'track');
  beat.alsoTracks = beat._alsoTrackNames.map((n) => lookup(trackIdByName, n, 'track')).filter(Boolean);
  delete beat._book; delete beat._threadNames; delete beat._characterNames; delete beat._trackName; delete beat._alsoTrackNames;
}
for (const ch of chapters) {
  ch.book = lookup(bookIdByTitle, ch._book, 'book') || '';
  ch.pov = ch._pov ? (lookup(charIdByName, ch._pov, 'character') || '') : '';
  ch.thread = ch._thread ? (lookup(threadIdByName, ch._thread, 'thread') || '') : '';
  ch.characters = ch._characterNames.map((n) => lookup(charIdByName, n, 'character')).filter(Boolean);
  ch.scenes = ch.scenes.map((s) => ({ ...s, characters: s._characterNames.map((n) => lookup(charIdByName, n, 'character')).filter(Boolean), _characterNames: undefined }));
  ch.scenes.forEach((s) => delete s._characterNames);
  delete ch._book; delete ch._pov; delete ch._thread; delete ch._characterNames;
}
for (const r of research) {
  r.books = r._bookNames.map((n) => lookup(bookIdByTitle, n, 'book')).filter(Boolean);
  r.threads = r._threadNames.map((n) => lookup(threadIdByName, n, 'thread')).filter(Boolean);
  delete r._bookNames; delete r._threadNames;
}
for (const th of themes) {
  th.books = th._bookNames.map((n) => lookup(bookIdByTitle, n, 'book')).filter(Boolean);
  th.characters = th._characterNames.map((n) => lookup(charIdByName, n, 'character')).filter(Boolean);
  th.beats = th._beatLabels.map((n) => lookup(beatIdByLabel, n, 'timeline beat')).filter(Boolean);
  delete th._bookNames; delete th._characterNames; delete th._beatLabels;
}
for (const rel of religions) {
  rel.world = lookup(worldIdByName, rel._worldName, 'world') || '';
  rel.beats = rel._beatLabels.map((n) => lookup(beatIdByLabel, n, 'timeline beat')).filter(Boolean);
  rel.figures = rel.figures.map((f) => ({ to: lookup(charIdByName, f._to, 'character'), role: f.role })).filter((f) => f.to);
  rel.relationships = rel.relationships.map((r) => ({ to: lookup(religionIdByName, r._to, 'religion'), type: r.type })).filter((r) => r.to);
  delete rel._worldName; delete rel._beatLabels;
}

/* ==================== assemble + write ==================== */

const project = {
  schemaVersion: SCHEMA_VERSION,
  series, books, threads, characters, worlds, tracks, timeline, chapters,
  notes, research, themes, pantheon, reading, religions,
};

const bundle = {
  format: 'writers-codex-project',
  schemaVersion: SCHEMA_VERSION,
  exportedAt: new Date().toISOString(),
  name: series.title,
  project,
  prose: {},
  worldbuilding: {},
};

writeFileSync(outputPath, JSON.stringify(bundle, null, 2));

const counts = Object.fromEntries(
  Object.entries(project).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, v.length]),
);
console.log(`[import-story] wrote ${outputPath}`);
console.log(`  "${series.title}" —`, JSON.stringify(counts));
console.log(`  Open Writer's Codex, click Import…, and select this file.`);
