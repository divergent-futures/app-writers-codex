/* Writer's Codex — data schema.
 *
 * Ported verbatim from story-workbench/SCHEMA.md + the real project.json shape (field optionality
 * comes from auditing the actual data, not just the doc). This is the canonical, medium-agnostic
 * story model: characters, worlds, threads, the timeline spine, and `books` as one packaging of it.
 *
 * Derived fields are prefixed `_` and are NEVER stored in the canonical project — they are
 * recomputed from markdown/asset blobs (mirroring how build.py injects them at build time). They
 * are declared optional here only so views can read them when hydrated.
 */

export const SCHEMA_VERSION = 1;

/** Reference-pack schema version (independent of the project SCHEMA_VERSION above).
 *  v2 (2026-08-06, Reference Pack Library Plan v1.2 §3): work_cards (with medium enum),
 *  four-tier quality, pack version header fields. */
export const REF_SCHEMA_VERSION = 2;

/* ---------- enums (build.py validates these; free-text fields stay `string`) ---------- */
export const CONTAINER_TYPE = ['book', 'season', 'episode', 'arc', 'game', 'part', 'movement'] as const;
export const TRACK_KIND = ['spine', 'species', 'world'] as const;
export const CIRCLE_STEPS = ['you', 'need', 'go', 'search', 'find', 'take', 'return', 'change'] as const;
export const LESSON_STATUS = ['learned', 'partial', 'resisted'] as const;
export const RESEARCH_STATUS = ['open', 'grounded', 'locked'] as const;
export const PANTHEON_CAT = ['personal-stage', 'ancestral-collective', 'external'] as const;
export const READING_STATUS = ['read', 'reading', 'toread'] as const;
export const RELIGION_STATUS = ['emerging', 'established', 'dominant', 'corrupted', 'dead'] as const;
export const RELIGION_TRUTH = ['accurate', 'partial', 'distorted', 'corrupted'] as const;
export const LINK_KIND = ['world', 'thread'] as const;
/** Four-tier since ref-schema v2. `excellent` is intentionally rare ("study this");
 *  `terrible` actively teaches the wrong lesson (cautionary example). */
export const REF_QUALITY = ['excellent', 'strong', 'weak', 'terrible'] as const;
/** Medium enum for work_cards entries (ref-schema v2; `nonfiction` added in the
 *  2026-08-06 pre-release amendment — enum closed at 9 values). Per-example `medium` on
 *  example_cards stays free text. `stage` deferred. */
export const REF_MEDIUM = ['novel', 'film', 'tv', 'comic', 'manga', 'graphic-novel', 'game', 'audio', 'nonfiction'] as const;
export const ARC_STATUS = ['open', 'closed'] as const;

export type ContainerType = (typeof CONTAINER_TYPE)[number];
export type TrackKind = (typeof TRACK_KIND)[number];
export type CircleStep = (typeof CIRCLE_STEPS)[number];
export type LessonStatus = (typeof LESSON_STATUS)[number];
export type ResearchStatus = (typeof RESEARCH_STATUS)[number];
export type PantheonCat = (typeof PANTHEON_CAT)[number];
export type ReadingStatus = (typeof READING_STATUS)[number];
export type ReligionStatus = (typeof RELIGION_STATUS)[number];
export type ReligionTruth = (typeof RELIGION_TRUTH)[number];
export type LinkKind = (typeof LINK_KIND)[number];
export type RefQuality = (typeof REF_QUALITY)[number];
export type RefMedium = (typeof REF_MEDIUM)[number];

/* ---------- shared ---------- */
export interface MediaItem {
  type?: 'image' | 'video';
  file: string;
  caption?: string;
}

export interface Series {
  title: string;
  logline?: string;
  author?: string;
  note?: string;
}

/* ---------- containers ---------- */
export interface Book {
  id: string;
  title: string;
  order: number;
  status: string; // planned|drafting|revised|done (free-text in data)
  type?: ContainerType;
  wordTarget?: number;
  branch?: boolean;
  worlds?: string[]; // world ids
  /** derived */
  _worldbuilding?: string;
  _wbwords?: number;
}

export interface Thread {
  id: string;
  name: string;
  color: string;
  source: string;
}

export interface Track {
  id: string;
  name: string;
  color: string;
  kind: TrackKind;
  world?: string; // world id
}

/* ---------- characters ---------- */
export interface Arc {
  book?: string; // book id
  status?: string; // open|closed
  want?: string;
  need?: string;
  wound?: string;
  scores?: { proactivity?: number | null; relatability?: number | null; capability?: number | null };
  circle?: CircleStep[];
  rationale?: string;
}

export interface Relationship {
  to: string; // character id
  type?: string;
  note?: string;
}

export interface CharacterLink {
  to: string; // world id or thread id
  kind: LinkKind;
  type?: string;
  note?: string;
}

export interface Lesson {
  id: string;
  book?: string;
  order: number;
  trigger: string;
  lesson: string;
  becomes: string;
  status?: LessonStatus;
}

export interface Character {
  id: string;
  name: string;
  role: string;
  oneLine: string;
  source: string;
  image?: string;
  media?: MediaItem[];
  aliases?: string[];
  arcs?: Arc[];
  relationships: Relationship[];
  links: CharacterLink[];
  lessons?: Lesson[];
}

/* ---------- worlds ---------- */
export interface World {
  id: string;
  name: string;
  note: string;
  source: string;
  type: string; // galaxy|system|world|region|realm|species (free-text in data)
  parent: string | null; // world id
  image?: string;
  media?: MediaItem[];
  /** derived */
  _worldbuilding?: string;
  _wbwords?: number;
}

/* ---------- timeline ---------- */
export interface TimelineBeat {
  id: string;
  order: number;
  label: string;
  era?: string;
  book?: string;
  threads: string[]; // thread ids
  characters: string[]; // character ids
  summary: string;
  track: string; // home track id
  alsoTracks?: string[]; // other track ids it braids into
  image?: string;
}

/* ---------- chapters ---------- */
export interface Scene {
  id?: string;
  title?: string;
  summary?: string;
  characters?: string[];
  image?: string;
}

export interface Chapter {
  id: string;
  book: string;
  order: number;
  title: string;
  pov: string; // character id (or "")
  thread: string; // thread id or ""
  status: string;
  wordcount: number;
  summary: string;
  scenes: Scene[];
  bodyFile: string;
  image?: string;
  media?: MediaItem[];
  characters?: string[]; // explicit cast
  next?: string;
  /** derived */
  _prose?: string;
  _words?: number;
}

/* ---------- misc collections ---------- */
export interface Note {
  id: string;
  date: string;
  text: string;
  tags: string[];
}

export interface ResearchSource {
  title: string;
  url: string;
  note?: string;
}

export interface Research {
  id: string;
  title: string;
  question: string;
  status: ResearchStatus;
  books: string[];
  threads: string[];
  findings: string[];
  forks: string[];
  sources: ResearchSource[];
}

export interface Theme {
  id: string;
  name: string;
  statement: string;
  books: string[];
  characters: string[];
  beats: string[]; // timeline ids
}

export interface Pantheon {
  id: string;
  name: string;
  age: string;
  category: PantheonCat;
  order: number;
  role: string;
  voice: string;
  function: string;
  tie: string;
}

export interface Reading {
  id: string;
  title: string;
  author: string;
  status: ReadingStatus;
  gives: string;
  tags: string[];
  correlation: string;
  takeaways: string[];
}

export interface ReligionFigure {
  to: string; // character id
  role?: string;
}

export interface ReligionRelationship {
  to: string; // religion id
  type?: string;
}

export interface Religion {
  id: string;
  name: string;
  world: string; // world id
  scope: string; // free-text in data
  status: ReligionStatus;
  truth: ReligionTruth;
  creed: string;
  mythologizes: string;
  afterlife: string;
  beats: string[]; // timeline ids
  figures: ReligionFigure[];
  tenets: string[];
  relationships: ReligionRelationship[];
  source?: string;
}

/* ---------- reference library (bundled pack) ---------- */
export interface ReferenceCollection {
  id: string;
  label: string;
  labelSingular: string;
  badge: string;
  /** `book_cards` is retired as of ref-schema v2 (replaced by `work_cards`, which adds
   *  `medium`); it remains in the union only so pre-v2 bundled packs still type-check. */
  schema: 'example_cards' | 'principle_cards' | 'author_cards' | 'work_cards' | 'book_cards' | 'checklist_cards';
  badgeBg: string;
  badgeFg: string;
}

export interface ReferenceExample {
  work?: string;
  medium?: string; // free text — NOT the RefMedium enum (predates it; richer descriptions)
  year?: string;
  quality?: RefQuality;
  text?: string;
}

export interface ReferenceWork {
  title?: string;
  year?: string;
  note?: string;
  start?: boolean;
}

export interface ReferenceEntry {
  id: string;
  kind: string; // == a collection id
  category: string;
  name: string;
  description: string;
  // example_cards
  examples?: ReferenceExample[];
  // principle_cards
  principle?: string;
  example?: string;
  application?: string;
  // author_cards
  meta?: string;
  knownFor?: string;
  signature?: string;
  works?: ReferenceWork[];
  // work_cards (formerly book_cards; gains `medium` in ref-schema v2)
  author?: string;
  year?: string;
  awards?: string;
  text?: string;
  medium?: RefMedium;
  // checklist_cards
  items?: string[];
  /** derived UI fields */
  _label?: string;
  _badge?: string;
  _bg?: string;
  _fg?: string;
}

export interface ReferencePack {
  id?: string;
  name?: string;
  /** ref-schema v2 version header (Plan v1.2 §3.2) — optional so pre-v2 packs still load */
  packVersion?: string; // semver; patch=corrections, minor=new entries, major=breaking
  schemaVersion?: number; // == REF_SCHEMA_VERSION for v2 packs
  lastUpdated?: string; // YYYY-MM-DD
  minAppVersion?: string;
  collections: ReferenceCollection[];
  entries: ReferenceEntry[];
}

/* ---------- the project ---------- */
export interface ProjectData {
  schemaVersion: number;
  series: Series;
  books: Book[];
  threads: Thread[];
  characters: Character[];
  worlds: World[];
  tracks: Track[];
  timeline: TimelineBeat[];
  chapters: Chapter[];
  notes: Note[];
  research: Research[];
  themes: Theme[];
  pantheon: Pantheon[];
  reading: Reading[];
  religions: Religion[];
  /** which bundled ReferencePack (by its `id`) this project wants hydrated in, if any — see hydrate.ts */
  referencePackId?: string;
  /** derived, injected only when hydrated */
  _reference?: ReferencePack;
}

/** The collection keys that hold `{id}` arrays — used by validation & counting. */
export const COLLECTION_KEYS = [
  'books',
  'threads',
  'characters',
  'worlds',
  'tracks',
  'timeline',
  'chapters',
  'notes',
  'research',
  'themes',
  'pantheon',
  'reading',
  'religions',
] as const;

export type CollectionKey = (typeof COLLECTION_KEYS)[number];

/** An empty project — what the app ships with (BUILD-SPEC §8: ships empty). */
export function emptyProject(title = 'Untitled world'): ProjectData {
  return {
    schemaVersion: SCHEMA_VERSION,
    series: { title, logline: '', author: '', note: '' },
    books: [],
    threads: [],
    characters: [],
    worlds: [],
    tracks: [],
    timeline: [],
    chapters: [],
    notes: [],
    research: [],
    themes: [],
    pantheon: [],
    reading: [],
    religions: [],
  };
}
