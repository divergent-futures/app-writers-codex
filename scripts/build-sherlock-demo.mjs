// Writer's Codex — Sherlock Holmes public example-world builder.
//
// One-time (re-runnable) conversion of sherlock-demo/{world.md,images.md,prose/*.md,reference/*.md}
// into git-tracked assets: a ProjectBundle and a ReferencePack. Unlike build-sample.mjs (which reads
// TJ's private, git-ignored Cosmos data), this source content is public domain and the OUTPUT ships in
// the public repo as the "Load example world" button's content.
//
//   input : sherlock-demo/world.md, sherlock-demo/images.md, sherlock-demo/prose/*.md,
//           sherlock-demo/reference/*.md
//   output: src/lib/examples/sherlock-holmes.json            (a ProjectBundle, images as data URIs)
//           src/lib/examples/sherlock-holmes-reference.json  (a ReferencePack)

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'sherlock-demo');
const OUT_DIR = join(ROOT, 'src', 'lib', 'examples');
const SCHEMA_VERSION = 1;

const UA = 'WritersCodexDemoBuilder/1.0 (https://writers-codex.space-divergentfutures.workers.dev)';

/* ---------------- markdown parsing ---------------- */

function slug(s) {
  return s
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
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

// Parse a block's lines into { fields: {key: rawValue}, sections: {key: [bulletText,...]}, order: [key,...] }
function parseBlock(linesIn) {
  const lines = linesIn;
  const fields = {};
  const sections = {};
  const order = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const top = line.match(/^\*\*([^*:]+):\*\*\s*(.*)$/);
    if (!top) { i++; continue; } // stray line, ignore
    const key = top[1].trim();
    let value = top[2];
    order.push(key);

    if (value.trim() === '|') {
      // literal block: following indented (>=2 spaces) lines, dedented
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
      // list section: following indented bullets, "- " starts a new item, continuation lines append
      const bullets = [];
      let curBullet = null;
      i++;
      while (i < lines.length && /^\s+\S/.test(lines[i])) {
        const bm = lines[i].match(/^\s*-\s+(.*)$/);
        if (bm) {
          if (curBullet !== null) bullets.push(curBullet);
          curBullet = bm[1];
        } else if (curBullet !== null) {
          curBullet += ' ' + lines[i].trim();
        }
        i++;
      }
      if (curBullet !== null) bullets.push(curBullet);
      sections[key] = bullets;
      continue;
    }

    fields[key] = value.trim();
    i++;
  }
  return { fields, sections, order };
}

// Split a bullet's joined text into {Key: value} sub-fields, separated by " — **Key:**"
function parseBullet(text) {
  const segments = text.split(/\s+—\s+(?=\*\*)/);
  const out = {};
  for (const seg of segments) {
    const m = seg.match(/^\*\*([^*]+):\*\*\s*(.*)$/s);
    if (!m) continue;
    let v = m[2].trim();
    v = v.replace(/\s*—\s*$/, ''); // trailing separator dash, if the last segment carried one
    out[m[1].trim()] = v;
  }
  return out;
}

const splitList = (v) => {
  if (!v || /^\(.*\)$/.test(v.trim())) return [];
  return v.split(/,\s*/).map((s) => s.trim()).filter(Boolean);
};

/* ---------------- load + parse world.md ---------------- */

const worldMd = readFileSync(join(SRC, 'world.md'), 'utf8');
const blocks = splitBlocks(worldMd);

let series = { title: 'Sherlock Holmes', logline: '', author: '', note: '' };
const books = [];
const characters = [];
const worlds = [];
const threads = [];
const tracks = [];
const timeline = [];
const chapters = [];
const themes = [];
const notes = [];

// name -> id maps, populated as we go (single pass is fine: characters/worlds/threads/tracks/books
// are all defined before they're referenced by beats/chapters/themes later in the file; worlds
// reference each other via Parent, resolved in a second pass below).
const bookId = new Map();
const charId = new Map();
const worldId = new Map();
const threadId = new Map();
const trackId = new Map();
const beatIdByLabel = new Map();

const worldParentNameById = new Map(); // resolved in a second pass

for (const block of blocks) {
  const { fields, sections } = parseBlock(block.lines);

  if (block.type === 'SERIES') {
    series = {
      title: fields['Title'] || 'Sherlock Holmes',
      author: fields['Author'] || '',
      logline: fields['Logline'] || '',
      note: fields['Note'] || '',
    };
  } else if (block.type === 'BOOK') {
    const id = slug(fields['Title']);
    bookId.set(fields['Title'], id);
    books.push({
      id,
      title: fields['Title'],
      order: Number(fields['Order']) || books.length + 1,
      status: fields['Status'] || 'published',
      worlds: splitList(fields['Worlds']),
      _blurb: fields['Blurb'] || '', // resolved to worlds ids + stashed for worldbuilding map below
    });
  } else if (block.type === 'CHARACTER') {
    const id = slug(fields['Name']);
    charId.set(fields['Name'], id);
    const relationships = (sections['Relationships'] || []).map(parseBullet).map((b) => ({
      to: b['To'],
      type: b['Type'],
      note: b['Note'],
    }));
    const links = (sections['Linked to (worlds/threads)'] || []).map(parseBullet).map((b) => {
      if (b['World']) return { to: b['World'], kind: 'world', note: b['Note'] };
      return { to: b['Thread'], kind: 'thread', note: b['Note'] };
    });
    const arcs = (sections['Arcs (one per book where the character grows)'] || []).map(parseBullet).map((b) => {
      const scores = {};
      for (const part of (b['Scores'] || '').split(',')) {
        const m = part.trim().match(/^(\w+)\s+(\d+)$/);
        if (m) scores[m[1]] = Number(m[2]);
      }
      return {
        _book: b['Book'],
        status: b['Status'],
        want: b['Want'],
        need: b['Need'],
        wound: b['Wound'],
        scores,
        circle: splitList(b['Story-circle steps']),
        rationale: b['Why these scores'],
      };
    });
    const lessons = (sections['Lessons (optional, moral/emotional beats)'] || []).map(parseBullet).map((b, idx) => ({
      id: `${id}-lesson-${idx + 1}`,
      _book: b['Book'],
      order: idx + 1,
      trigger: b['Trigger'],
      lesson: b['Lesson'],
      becomes: b['Becomes'],
      status: (b['Status'] || '').toLowerCase().startsWith('achiev') ? 'learned' : (b['Status'] || '').toLowerCase(),
    }));
    const aliasesRaw = fields['Aliases'];
    characters.push({
      id,
      name: fields['Name'],
      role: fields['Role'] || '',
      oneLine: fields['One-line'] || '',
      source: 'Sherlock Holmes canon, Arthur Conan Doyle (public domain)',
      aliases: aliasesRaw ? [aliasesRaw.replace(/\s*\(.*\)$/, '')] : undefined,
      relationships,
      links,
      arcs,
      lessons: lessons.length ? lessons : undefined,
    });
  } else if (block.type === 'WORLD') {
    const id = slug(fields['Name']);
    worldId.set(fields['Name'], id);
    const parentName = fields['Parent'];
    if (parentName && !/^\(.*\)$/.test(parentName.trim())) worldParentNameById.set(id, parentName.trim());
    worlds.push({
      id,
      name: fields['Name'],
      type: fields['Type'] || 'place',
      parent: null,
      note: fields['Note'] || '',
      source: 'Sherlock Holmes canon, Arthur Conan Doyle (public domain)',
      _worldbuilding: fields['Worldbuilding'] || '',
    });
  } else if (block.type === 'THREAD') {
    const id = slug(fields['Name']);
    threadId.set(fields['Name'], id);
    threads.push({ id, name: fields['Name'], color: fields['Color'] || 'grey', source: fields['Source'] || '' });
  } else if (block.type === 'TRACK') {
    const id = slug(fields['Name']);
    trackId.set(fields['Name'], id);
    tracks.push({ id, name: fields['Name'], kind: (fields['Kind'] || 'character').trim(), color: fields['Color'] || 'grey' });
  } else if (block.type === 'BEAT') {
    const label = fields['Label'];
    const id = `beat-${String(fields['Order']).padStart(2, '0')}-${slug(label).slice(0, 40)}`;
    beatIdByLabel.set(label, id);
    timeline.push({
      id,
      order: Number(fields['Order']) || timeline.length + 1,
      label,
      era: fields['Era'] || '',
      _book: fields['Book'],
      _track: fields['Home track'],
      _alsoTracks: splitList(fields['Also braids into']),
      _threads: splitList(fields['Threads']),
      _characters: splitList(fields['Characters']),
      summary: fields['Summary'] || '',
    });
  } else if (block.type === 'CHAPTER') {
    const id = slug(fields['Title']);
    chapters.push({
      id,
      _book: fields['Book'],
      order: Number(fields['Order']) || chapters.length + 1,
      title: fields['Title'],
      _pov: fields['POV'],
      _thread: fields['Thread'],
      status: fields['Status'] || 'published',
      summary: fields['Summary'] || '',
      _cast: splitList(fields['Cast']),
      proseFile: fields['Prose file'],
      scenes: [],
      bodyFile: `${id}.md`,
    });
  } else if (block.type === 'THEME') {
    const id = slug(fields['Name']);
    themes.push({
      id,
      name: fields['Name'],
      statement: fields['Statement'] || '',
      _books: splitList(fields['Books']),
      _characters: splitList(fields['Characters']),
      _beats: splitList(fields['Beats']),
    });
  } else if (block.type === 'NOTE') {
    notes.push({
      id: `note-${notes.length + 1}-${fields['Date']}`,
      date: fields['Date'],
      tags: splitList(fields['Tags']),
      text: fields['Text'] || '',
    });
  }
}

// resolve world parents (second pass — names -> ids)
for (const w of worlds) {
  const parentName = worldParentNameById.get(w.id);
  w.parent = parentName ? (worldId.get(parentName) || null) : null;
}

// resolve books.worlds names -> ids
for (const b of books) b.worlds = b.worlds.map((n) => worldId.get(n)).filter(Boolean);

// resolve character cross-refs
for (const c of characters) {
  c.relationships = c.relationships.map((r) => ({ ...r, to: charId.get(r.to) || r.to }));
  c.links = c.links.map((l) => ({ ...l, to: (l.kind === 'world' ? worldId.get(l.to) : threadId.get(l.to)) || l.to }));
  c.arcs = c.arcs.map(({ _book, ...rest }) => ({ ...rest, book: bookId.get(_book) }));
  if (c.lessons) c.lessons = c.lessons.map(({ _book, ...rest }) => ({ ...rest, book: bookId.get(_book) }));
}

// resolve timeline cross-refs
for (const e of timeline) {
  e.book = bookId.get(e._book);
  e.track = trackId.get(e._track);
  e.alsoTracks = e._alsoTracks.map((n) => trackId.get(n)).filter(Boolean);
  e.threads = e._threads.map((n) => threadId.get(n)).filter(Boolean);
  e.characters = e._characters.map((n) => charId.get(n)).filter(Boolean);
  delete e._book; delete e._track; delete e._alsoTracks; delete e._threads; delete e._characters;
}

// resolve chapter cross-refs
const proseByChapter = {};
for (const c of chapters) {
  c.book = bookId.get(c._book);
  c.pov = charId.get(c._pov) || '';
  c.thread = c._thread ? (threadId.get(c._thread) || '') : '';
  c.characters = c._cast.map((n) => charId.get(n)).filter(Boolean);
  delete c._book; delete c._pov; delete c._thread; delete c._cast;
  const raw = readFileSync(join(SRC, 'prose', c.proseFile), 'utf8');
  // strip the trailing "---\n*Source: ...*" Gutenberg attribution footer — clean prose only
  const clean = raw.replace(/\n---\n\*Source:.*$/s, '').trim();
  c.wordcount = clean.trim().split(/\s+/).length;
  proseByChapter[c.id] = clean;
  delete c.proseFile;
}

// resolve theme cross-refs
for (const th of themes) {
  th.books = th._books.map((n) => bookId.get(n)).filter(Boolean);
  th.characters = th._characters.map((n) => charId.get(n)).filter(Boolean);
  th.beats = th._beats.map((n) => beatIdByLabel.get(n)).filter(Boolean);
  delete th._books; delete th._characters; delete th._beats;
}

// worldbuilding map: world lore + book blurbs
const worldbuilding = {};
for (const w of worlds) {
  if (w._worldbuilding) worldbuilding[w.id] = w._worldbuilding;
  delete w._worldbuilding;
}
for (const b of books) {
  if (b._blurb) worldbuilding[b.id] = b._blurb;
  delete b._blurb;
}

/* ---------------- reading ---------------- */

const readingMd = readFileSync(join(SRC, 'reading.md'), 'utf8');
const reading = [];
const readingIdsSeen = new Set();
for (const block of splitBlocks(readingMd)) {
  if (block.type !== 'READING') continue;
  const { fields, sections } = parseBlock(block.lines);
  const title = fields['Title'] || '';
  if (!title) continue;
  let id = slug(title);
  let dedupeId = id;
  let n = 2;
  while (readingIdsSeen.has(dedupeId)) dedupeId = `${id}-${n++}`;
  readingIdsSeen.add(dedupeId);
  reading.push({
    id: dedupeId,
    title,
    author: fields['Author'] || '',
    status: fields['Status'] || 'toread',
    gives: fields['Gives'] || '',
    tags: splitList(fields['Tags']),
    correlation: fields['Correlation'] || '',
    takeaways: sections['Takeaways'] || [],
  });
}

/* ---------------- reference pack ---------------- */

const REFERENCE_PACK_ID = 'detective-reference';
const REFERENCE_DIR = join(SRC, 'reference');

const REF_COLLECTIONS = [
  { id: 'trope', label: 'Tropes', labelSingular: 'Trope', badge: 'Trope', schema: 'example_cards', badgeBg: '#2b2416', badgeFg: '#e0c68a' },
  { id: 'forensics', label: 'Forensics & Technology', labelSingular: 'Forensic Technique', badge: 'Forensics', schema: 'example_cards', badgeBg: '#16323a', badgeFg: '#7fd4e8' },
  { id: 'science', label: 'Science Primers', labelSingular: 'Science Primer', badge: 'Science', schema: 'principle_cards', badgeBg: '#1f3a2b', badgeFg: '#9be0b4' },
  { id: 'author', label: 'Authors', labelSingular: 'Author', badge: 'Author', schema: 'author_cards', badgeBg: '#3a1f43', badgeFg: '#e0a6f0' },
  { id: 'book', label: 'Books', labelSingular: 'Book', badge: 'Book', schema: 'book_cards', badgeBg: '#3a2a16', badgeFg: '#f0c48a' },
  { id: 'subgenre', label: 'Subgenres', labelSingular: 'Subgenre', badge: 'Subgenre', schema: 'principle_cards', badgeBg: '#3a1f1f', badgeFg: '#f0a6a6' },
  { id: 'history', label: 'History', labelSingular: 'History', badge: 'History', schema: 'principle_cards', badgeBg: '#2a2342', badgeFg: '#c3b6f0' },
  { id: 'psychology', label: 'Psychology', labelSingular: 'Psychology', badge: 'Psych', schema: 'principle_cards', badgeBg: '#16303a', badgeFg: '#8ac8f0' },
  { id: 'craft', label: 'Craft', labelSingular: 'Craft', badge: 'Craft', schema: 'principle_cards', badgeBg: '#1a3a30', badgeFg: '#7fe0c0' },
  { id: 'checklist', label: 'Checklist', labelSingular: 'Checklist', badge: 'Check', schema: 'checklist_cards', badgeBg: '#33163a', badgeFg: '#d18af0' },
];

const REF_FILE_TO_COLLECTION = {
  'tropes.md': 'trope', 'forensics.md': 'forensics', 'science.md': 'science',
  'authors.md': 'author', 'books.md': 'book', 'subgenres.md': 'subgenre',
  'history.md': 'history', 'psychology.md': 'psychology', 'craft.md': 'craft',
  'checklist.md': 'checklist',
};

const refExamples = (bullets) => bullets.map(parseBullet).map((b) => ({
  work: b['Work'] || '',
  medium: b['Medium'] || '',
  year: b['Year'] || '',
  quality: (b['Quality'] || '').trim() === 'weak' ? 'weak' : 'strong',
  text: b['Text'] || '',
}));

const refWorks = (bullets) => bullets.map(parseBullet).map((b) => ({
  title: b['Title'] || '',
  year: b['Year'] || '',
  note: b['Note'] || '',
  start: (b['Start'] || '').trim().toLowerCase() === 'true',
}));

function buildReferencePack() {
  const seq = new Map(); // collection id -> entries emitted so far
  const entries = [];

  for (const [file, collectionId] of Object.entries(REF_FILE_TO_COLLECTION)) {
    const collection = REF_COLLECTIONS.find((c) => c.id === collectionId);
    const md = readFileSync(join(REFERENCE_DIR, file), 'utf8');
    for (const block of splitBlocks(md)) {
      if (block.type !== 'ENTRY') continue;
      const { fields, sections } = parseBlock(block.lines);
      const n = (seq.get(collectionId) || 0) + 1;
      seq.set(collectionId, n);
      const entry = {
        id: `${collectionId}-${n}`,
        kind: collectionId,
        category: fields['Category'] || '',
        name: fields['Name'] || '',
        description: fields['Description'] || '',
        _label: collection.label,
        _badge: collection.badge,
        _bg: collection.badgeBg,
        _fg: collection.badgeFg,
      };
      if (collection.schema === 'example_cards') {
        entry.examples = refExamples(sections['Examples'] || []);
      } else if (collection.schema === 'principle_cards') {
        entry.principle = fields['Principle'] || '';
        entry.example = fields['Example'] || '';
        entry.application = fields['Application'] || '';
      } else if (collection.schema === 'author_cards') {
        entry.meta = fields['Meta'] || '';
        entry.knownFor = fields['Known For'] || '';
        entry.signature = fields['Signature'] || '';
        entry.works = refWorks(sections['Works'] || []);
      } else if (collection.schema === 'book_cards') {
        entry.author = fields['Author'] || '';
        entry.year = fields['Year'] || '';
        entry.awards = fields['Awards'] || '';
        entry.text = fields['Text'] || '';
      } else if (collection.schema === 'checklist_cards') {
        entry.items = sections['Items'] || [];
      }
      entries.push(entry);
    }
  }

  return { id: REFERENCE_PACK_ID, name: 'Detective Fiction Reference', collections: REF_COLLECTIONS, entries };
}

/* ---------------- images ---------------- */

async function fetchThumbDataUri(pageUrl, width) {
  const title = decodeURIComponent(pageUrl.split('/wiki/')[1]);
  const api =
    'https://commons.wikimedia.org/w/api.php?action=query&titles=' +
    encodeURIComponent(title) +
    '&prop=imageinfo&iiprop=url|mime&iiurlwidth=' +
    width +
    '&format=json';
  const meta = await (await fetch(api, { headers: { 'User-Agent': UA } })).json();
  const pages = meta.query.pages;
  const page = Object.values(pages)[0];
  const info = page.imageinfo && page.imageinfo[0];
  if (!info) throw new Error(`Commons image not found: ${title}`);
  const url = info.thumburl || info.url;
  const mime = info.thumbmime || info.mime || 'image/jpeg';
  const bytes = Buffer.from(await (await fetch(url, { headers: { 'User-Agent': UA } })).arrayBuffer());
  return `data:${mime};base64,${bytes.toString('base64')}`;
}

async function embedImages() {
  // Verified against the two flagged items in images.md's "Verification notes":
  //  - Watson: confirmed as English Wikipedia's own Dr. Watson infobox portrait (just needed the
  //    correct un-escaped filename — the '%26' in the handed-off URL doesn't resolve on its own).
  //  - Scandal in Bohemia beat: the handed-off file (#04, "HE TORE THE MASK FROM HIS FACE", p.65) is
  //    a confirmed, correctly-attributed Paget illustration from the story, so it ships as-is; a second
  //    confirmed Paget illustration from the very same Strand issue ("THEN HE STOOD BEFORE THE FIRE",
  //    p.62 — the exact scene the prose excerpt opens on) is added as a bonus chapter image.
  const targets = [
    { url: 'https://commons.wikimedia.org/wiki/File:Paget_holmes.png', width: 640, set: (img) => { characters.find((c) => c.name === 'Sherlock Holmes').image = img; } },
    { url: 'https://commons.wikimedia.org/wiki/File:Sherlock_Holmes_%26_Watson_-_The_Greek_Interpreter_-_Sidney_Paget.jpg', width: 640, set: (img) => { characters.find((c) => c.name === 'John Watson').image = img; } },
    { url: 'https://commons.wikimedia.org/wiki/File:Sherlock_Holmes_and_Professor_Moriarty_at_the_Reichenbach_Falls.jpg', width: 800, set: (img) => { worlds.find((w) => w.name === 'Reichenbach Falls').image = img; } },
    { url: 'https://commons.wikimedia.org/wiki/File:A_Scandal_in_Bohemia-04.jpg', width: 700, set: (img) => { timeline.find((e) => e.label === 'A Scandal in Bohemia — "the woman"').image = img; } },
    { url: 'https://commons.wikimedia.org/wiki/File:Strand2-062-ThenHeStoodBeforeTheFire.jpg', width: 700, set: (img) => { chapters.find((c) => c.title === 'A Scandal in Bohemia').image = img; } },
  ];
  for (const t of targets) {
    const img = await fetchThumbDataUri(t.url, t.width);
    t.set(img);
    console.log(`[build-sherlock-demo] embedded ${t.url} (${Math.round(img.length / 1024)}KB base64)`);
  }
}

/* ---------------- validation (mirrors src/lib/validate.ts) ---------------- */

function validate(p) {
  const warnings = [];
  const idsOf = (arr) => new Set(arr.map((x) => x.id));
  const books_ = idsOf(p.books), chars_ = idsOf(p.characters), threads_ = idsOf(p.threads);
  const worlds_ = idsOf(p.worlds), tracks_ = idsOf(p.tracks), timeline_ = idsOf(p.timeline);
  const has = (set, id) => !!id && set.has(id);
  for (const [name, arr] of [['book', p.books], ['character', p.characters], ['thread', p.threads], ['world', p.worlds], ['timeline', p.timeline], ['track', p.tracks], ['chapter', p.chapters], ['theme', p.themes], ['note', p.notes], ['reading', p.reading]]) {
    const seen = new Set();
    arr.forEach((it) => {
      if (!it.id) warnings.push(`${name}: missing id`);
      else if (seen.has(it.id)) warnings.push(`${name}:${it.id} duplicate id`);
      seen.add(it.id);
    });
  }
  for (const b of p.books) for (const wid of b.worlds || []) if (!has(worlds_, wid)) warnings.push(`book:${b.id} unknown world ${wid}`);
  for (const e of p.timeline) {
    for (const t of e.threads) if (!has(threads_, t)) warnings.push(`timeline:${e.id} unknown thread ${t}`);
    for (const c of e.characters) if (!has(chars_, c)) warnings.push(`timeline:${e.id} unknown character ${c}`);
    if (e.book && !has(books_, e.book)) warnings.push(`timeline:${e.id} unknown book ${e.book}`);
    if (!has(tracks_, e.track)) warnings.push(`timeline:${e.id} unknown track ${e.track}`);
    for (const t of e.alsoTracks) if (!has(tracks_, t)) warnings.push(`timeline:${e.id} unknown alsoTrack ${t}`);
  }
  for (const c of p.characters) {
    for (const r of c.relationships) if (!has(chars_, r.to)) warnings.push(`character:${c.id} unknown relationship.to ${r.to}`);
    for (const l of c.links) {
      if (l.kind === 'world' && !has(worlds_, l.to)) warnings.push(`character:${c.id} unknown link.world ${l.to}`);
      if (l.kind === 'thread' && !has(threads_, l.to)) warnings.push(`character:${c.id} unknown link.thread ${l.to}`);
    }
    for (const a of c.arcs) if (a.book && !has(books_, a.book)) warnings.push(`character:${c.id} unknown arc.book ${a.book}`);
    for (const l of c.lessons || []) if (l.book && !has(books_, l.book)) warnings.push(`character:${c.id} unknown lesson.book ${l.book}`);
  }
  const worldById = new Map(p.worlds.map((w) => [w.id, w]));
  for (const w of p.worlds) {
    if (w.parent && !has(worlds_, w.parent)) warnings.push(`world:${w.id} unknown parent ${w.parent}`);
    let cur = w.parent, seen = new Set([w.id]);
    while (cur) { if (seen.has(cur)) { warnings.push(`world:${w.id} parent loop`); break; } seen.add(cur); cur = worldById.get(cur)?.parent ?? null; }
  }
  for (const ch of p.chapters) {
    if (ch.book && !has(books_, ch.book)) warnings.push(`chapter:${ch.id} unknown book ${ch.book}`);
    if (ch.pov && !has(chars_, ch.pov)) warnings.push(`chapter:${ch.id} unknown pov ${ch.pov}`);
    if (ch.thread && !has(threads_, ch.thread)) warnings.push(`chapter:${ch.id} unknown thread ${ch.thread}`);
    for (const cid of ch.characters || []) if (!has(chars_, cid)) warnings.push(`chapter:${ch.id} unknown cast ${cid}`);
  }
  for (const th of p.themes) {
    for (const c of th.characters) if (!has(chars_, c)) warnings.push(`theme:${th.id} unknown character ${c}`);
    for (const b of th.beats) if (!has(timeline_, b)) warnings.push(`theme:${th.id} unknown beat ${b}`);
    for (const b of th.books) if (!has(books_, b)) warnings.push(`theme:${th.id} unknown book ${b}`);
  }
  return warnings;
}

/* ---------------- assemble + write ---------------- */

async function main() {
  await embedImages();

  const project = {
    schemaVersion: SCHEMA_VERSION,
    series,
    books,
    threads,
    characters,
    worlds,
    tracks,
    timeline,
    chapters,
    notes,
    research: [],
    themes,
    pantheon: [],
    reading,
    religions: [],
    referencePackId: REFERENCE_PACK_ID,
  };

  const warnings = validate(project);
  if (warnings.length) {
    console.error('[build-sherlock-demo] validation warnings:');
    for (const w of warnings) console.error('  -', w);
    process.exitCode = 1;
    return;
  }

  const bundle = {
    format: 'writers-codex-project',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    name: 'Sherlock Holmes (example)',
    project,
    prose: proseByChapter,
    worldbuilding,
  };

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, 'sherlock-holmes.json'), JSON.stringify(bundle));

  const counts = Object.fromEntries(Object.entries(project).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, v.length]));
  console.log('[build-sherlock-demo] wrote sherlock-holmes.json', JSON.stringify(counts));

  const referencePack = buildReferencePack();
  writeFileSync(join(OUT_DIR, 'sherlock-holmes-reference.json'), JSON.stringify(referencePack));
  const refCounts = Object.fromEntries(
    REF_COLLECTIONS.map((c) => [c.id, referencePack.entries.filter((e) => e.kind === c.id).length]),
  );
  console.log('[build-sherlock-demo] wrote sherlock-holmes-reference.json', JSON.stringify(refCounts));
}

main();
