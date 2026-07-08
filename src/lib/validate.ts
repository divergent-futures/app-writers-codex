/* Writer's Codex — validation.
 *
 * Ported from story-workbench/build.py `validate()`. Returns a flat list of warnings (non-fatal,
 * exactly like the original — the build never blocked on these). The app surfaces them in a panel
 * so referential drift is visible without stopping the writer.
 *
 * Asset-existence checks (image/bodyFile on disk) from build.py are intentionally NOT reproduced
 * here: in the app, prose/images live in separate IndexedDB stores, so "missing asset" is a
 * different concern handled by the store layer. Everything else — id uniqueness, reference
 * resolution, enums, score ranges, circle steps, parent loops — is ported faithfully.
 */

import {
  CIRCLE_STEPS,
  CONTAINER_TYPE,
  LESSON_STATUS,
  LINK_KIND,
  PANTHEON_CAT,
  READING_STATUS,
  RELIGION_STATUS,
  RELIGION_TRUTH,
  RESEARCH_STATUS,
  TRACK_KIND,
  type ProjectData,
} from './schema';

export interface Warning {
  scope: string; // e.g. "character:john"
  message: string;
}

type IdSet = Set<string>;

function idSet(items: { id?: string }[] | undefined): IdSet {
  const s = new Set<string>();
  for (const it of items ?? []) if (it.id) s.add(it.id);
  return s;
}

export function validate(p: ProjectData): Warning[] {
  const w: Warning[] = [];
  const add = (scope: string, message: string) => w.push({ scope, message });

  // --- id uniqueness (per collection) + non-empty ---
  const collections: [string, { id?: string }[]][] = [
    ['book', p.books],
    ['character', p.characters],
    ['thread', p.threads],
    ['world', p.worlds],
    ['timeline', p.timeline],
    ['track', p.tracks],
    ['chapter', p.chapters],
    ['note', p.notes],
    ['research', p.research],
    ['theme', p.themes],
    ['pantheon', p.pantheon],
    ['reading', p.reading],
    ['religion', p.religions],
  ];
  for (const [name, arr] of collections) {
    const seen = new Set<string>();
    (arr ?? []).forEach((it, i) => {
      if (!it.id) {
        add(`${name}[${i}]`, `missing id`);
        return;
      }
      if (seen.has(it.id)) add(`${name}:${it.id}`, `duplicate id`);
      seen.add(it.id);
    });
  }

  const books = idSet(p.books);
  const chars = idSet(p.characters);
  const threads = idSet(p.threads);
  const worlds = idSet(p.worlds);
  const tracks = idSet(p.tracks);
  const timeline = idSet(p.timeline);
  const religions = idSet(p.religions);

  const has = (set: IdSet, id: string | null | undefined) => !!id && set.has(id);

  // --- books ---
  for (const b of p.books ?? []) {
    if (b.type && !(CONTAINER_TYPE as readonly string[]).includes(b.type))
      add(`book:${b.id}`, `invalid type "${b.type}"`);
    for (const wid of b.worlds ?? [])
      if (!has(worlds, wid)) add(`book:${b.id}`, `worlds -> unknown world "${wid}"`);
  }

  // --- timeline ---
  for (const e of p.timeline ?? []) {
    for (const t of e.threads ?? [])
      if (!has(threads, t)) add(`timeline:${e.id}`, `threads -> unknown thread "${t}"`);
    for (const c of e.characters ?? [])
      if (!has(chars, c)) add(`timeline:${e.id}`, `characters -> unknown character "${c}"`);
    if (e.book && !has(books, e.book)) add(`timeline:${e.id}`, `book -> unknown book "${e.book}"`);
    if (e.track && !has(tracks, e.track)) add(`timeline:${e.id}`, `track -> unknown track "${e.track}"`);
    for (const t of e.alsoTracks ?? [])
      if (!has(tracks, t)) add(`timeline:${e.id}`, `alsoTracks -> unknown track "${t}"`);
  }

  // --- tracks ---
  for (const t of p.tracks ?? []) {
    if (t.kind && !(TRACK_KIND as readonly string[]).includes(t.kind))
      add(`track:${t.id}`, `invalid kind "${t.kind}"`);
    if (t.world && !has(worlds, t.world)) add(`track:${t.id}`, `world -> unknown world "${t.world}"`);
  }

  // --- characters ---
  for (const c of p.characters ?? []) {
    for (const r of c.relationships ?? []) {
      if (!r.to) add(`character:${c.id}`, `relationship missing "to"`);
      else if (r.to === c.id) add(`character:${c.id}`, `relationship points at self`);
      else if (!has(chars, r.to)) add(`character:${c.id}`, `relationship -> unknown character "${r.to}"`);
    }
    for (const l of c.links ?? []) {
      if (!l.to) {
        add(`character:${c.id}`, `link missing "to"`);
        continue;
      }
      if (!(LINK_KIND as readonly string[]).includes(l.kind)) {
        add(`character:${c.id}`, `link invalid kind "${l.kind}"`);
        continue;
      }
      if (l.kind === 'world' && !has(worlds, l.to))
        add(`character:${c.id}`, `link -> unknown world "${l.to}"`);
      if (l.kind === 'thread' && !has(threads, l.to))
        add(`character:${c.id}`, `link -> unknown thread "${l.to}"`);
    }
    for (const a of c.arcs ?? []) {
      if (a.book && !has(books, a.book)) add(`character:${c.id}`, `arc -> unknown book "${a.book}"`);
      if (a.scores) {
        for (const [k, v] of Object.entries(a.scores)) {
          if (v === null || v === undefined) continue;
          if (typeof v !== 'number' || Number.isNaN(v) || v < 0 || v > 10)
            add(`character:${c.id}`, `arc score ${k}=${v} out of 0-10`);
        }
      }
      for (const step of a.circle ?? [])
        if (!(CIRCLE_STEPS as readonly string[]).includes(step))
          add(`character:${c.id}`, `arc circle invalid step "${step}"`);
    }
    for (const les of c.lessons ?? []) {
      if (les.book && !has(books, les.book)) add(`character:${c.id}`, `lesson -> unknown book "${les.book}"`);
      if (les.status && !(LESSON_STATUS as readonly string[]).includes(les.status))
        add(`character:${c.id}`, `lesson invalid status "${les.status}"`);
    }
  }

  // --- worlds (parent resolution + loop detection) ---
  const worldById = new Map((p.worlds ?? []).map((x) => [x.id, x]));
  for (const wo of p.worlds ?? []) {
    if (wo.parent) {
      if (wo.parent === wo.id) add(`world:${wo.id}`, `parent points at self`);
      else if (!has(worlds, wo.parent)) add(`world:${wo.id}`, `parent -> unknown world "${wo.parent}"`);
    }
    // loop detection
    const seen = new Set<string>([wo.id]);
    let cur = wo.parent;
    while (cur) {
      if (seen.has(cur)) {
        add(`world:${wo.id}`, `parent loop via "${cur}"`);
        break;
      }
      seen.add(cur);
      cur = worldById.get(cur)?.parent ?? null;
    }
  }

  // --- chapters ---
  for (const ch of p.chapters ?? []) {
    if (ch.book && !has(books, ch.book)) add(`chapter:${ch.id}`, `book -> unknown book "${ch.book}"`);
    if (ch.pov && !has(chars, ch.pov)) add(`chapter:${ch.id}`, `pov -> unknown character "${ch.pov}"`);
    if (ch.thread && !has(threads, ch.thread)) add(`chapter:${ch.id}`, `thread -> unknown thread "${ch.thread}"`);
  }

  // --- research ---
  for (const r of p.research ?? []) {
    if (r.status && !(RESEARCH_STATUS as readonly string[]).includes(r.status))
      add(`research:${r.id}`, `invalid status "${r.status}"`);
    for (const b of r.books ?? []) if (!has(books, b)) add(`research:${r.id}`, `books -> unknown book "${b}"`);
    for (const t of r.threads ?? []) if (!has(threads, t)) add(`research:${r.id}`, `threads -> unknown thread "${t}"`);
  }

  // --- themes ---
  for (const th of p.themes ?? []) {
    for (const c of th.characters ?? [])
      if (!has(chars, c)) add(`theme:${th.id}`, `characters -> unknown character "${c}"`);
    for (const b of th.beats ?? []) if (!has(timeline, b)) add(`theme:${th.id}`, `beats -> unknown beat "${b}"`);
    for (const b of th.books ?? []) if (!has(books, b)) add(`theme:${th.id}`, `books -> unknown book "${b}"`);
  }

  // --- pantheon ---
  for (const pa of p.pantheon ?? []) {
    if (pa.category && !(PANTHEON_CAT as readonly string[]).includes(pa.category))
      add(`pantheon:${pa.id}`, `invalid category "${pa.category}"`);
  }

  // --- reading ---
  for (const rd of p.reading ?? []) {
    if (rd.status && !(READING_STATUS as readonly string[]).includes(rd.status))
      add(`reading:${rd.id}`, `invalid status "${rd.status}"`);
  }

  // --- religions ---
  for (const rel of p.religions ?? []) {
    if (rel.world && !has(worlds, rel.world)) add(`religion:${rel.id}`, `world -> unknown world "${rel.world}"`);
    if (rel.status && !(RELIGION_STATUS as readonly string[]).includes(rel.status))
      add(`religion:${rel.id}`, `invalid status "${rel.status}"`);
    if (rel.truth && !(RELIGION_TRUTH as readonly string[]).includes(rel.truth))
      add(`religion:${rel.id}`, `invalid truth "${rel.truth}"`);
    for (const f of rel.figures ?? [])
      if (f.to && !has(chars, f.to)) add(`religion:${rel.id}`, `figure -> unknown character "${f.to}"`);
    for (const b of rel.beats ?? [])
      if (!has(timeline, b)) add(`religion:${rel.id}`, `beats -> unknown beat "${b}"`);
    for (const rr of rel.relationships ?? [])
      if (rr.to && !has(religions, rr.to)) add(`religion:${rel.id}`, `relationship -> unknown religion "${rr.to}"`);
  }

  return w;
}
