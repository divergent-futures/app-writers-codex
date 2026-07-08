/* Writer's Codex — entity editing config.
 *
 * A small, declarative map from a detail-drawer entity type to its collection + editable scalar
 * fields. This powers in-app update/delete for every top-level entity (create happens via Capture
 * and the Write prose editor). Nested structures (arcs, relationships, scores, links) are shown
 * read-only in the drawer for now and edited by editing their parent's scalars first — deeper
 * nested editors are a follow-up on top of this same store-mutation path.
 */

import type { CollectionKey, ProjectData } from './schema';

export type FieldType = 'text' | 'textarea' | 'number' | 'color' | 'bool';
export interface EditField {
  key: string;
  label: string;
  type: FieldType;
}

export interface ArrayField {
  key: string;
  label: string;
  kind: 'strings' | 'refs';
  refColl?: CollectionKey; // required when kind === 'refs'
}

export interface EditConfig {
  coll: CollectionKey;
  title: string;
  fields: EditField[];
  arrays?: ArrayField[];
}

const refs = (key: string, label: string, refColl: CollectionKey): ArrayField => ({ key, label, kind: 'refs', refColl });
const strs = (key: string, label: string): ArrayField => ({ key, label, kind: 'strings' });

const f = (key: string, label: string, type: FieldType = 'text'): EditField => ({ key, label, type });

export const EDIT_CONFIG: Record<string, EditConfig> = {
  character: {
    coll: 'characters',
    title: 'character',
    fields: [f('name', 'Name'), f('role', 'Role'), f('oneLine', 'One-line', 'textarea'), f('source', 'Canon source')],
  },
  world: {
    coll: 'worlds',
    title: 'world',
    fields: [f('name', 'Name'), f('type', 'Type'), f('note', 'Note', 'textarea'), f('source', 'Canon source')],
  },
  thread: {
    coll: 'threads',
    title: 'thread',
    fields: [f('name', 'Name'), f('color', 'Colour', 'color'), f('source', 'Canon source')],
  },
  book: {
    coll: 'books',
    title: 'book',
    fields: [f('title', 'Title'), f('status', 'Status'), f('type', 'Type'), f('order', 'Order', 'number'), f('branch', 'Side story', 'bool')],
    arrays: [refs('worlds', 'Worlds surfaced in this book', 'worlds')],
  },
  beat: {
    coll: 'timeline',
    title: 'timeline beat',
    fields: [f('label', 'Label'), f('era', 'Era'), f('summary', 'Summary', 'textarea'), f('order', 'Order', 'number')],
    arrays: [
      refs('threads', 'Threads', 'threads'),
      refs('characters', 'Characters', 'characters'),
      refs('alsoTracks', 'Also braids into tracks', 'tracks'),
    ],
  },
  theme: {
    coll: 'themes',
    title: 'theme',
    fields: [f('name', 'Name'), f('statement', 'Statement', 'textarea')],
    arrays: [refs('books', 'Books', 'books'), refs('characters', 'Carried by', 'characters'), refs('beats', 'Beats', 'timeline')],
  },
  note: {
    coll: 'notes',
    title: 'note',
    fields: [f('text', 'Text', 'textarea'), f('date', 'Date')],
  },
  research: {
    coll: 'research',
    title: 'research dossier',
    fields: [f('title', 'Title'), f('question', 'Question', 'textarea'), f('status', 'Status')],
    arrays: [refs('books', 'Books', 'books'), refs('threads', 'Threads', 'threads'), strs('findings', 'Findings'), strs('forks', 'Open forks')],
  },
  reading: {
    coll: 'reading',
    title: 'reading entry',
    fields: [f('title', 'Title'), f('author', 'Author'), f('status', 'Status'), f('gives', 'Gives', 'textarea'), f('correlation', 'For my book', 'textarea')],
    arrays: [strs('tags', 'Tags'), strs('takeaways', 'Takeaways')],
  },
  pantheon: {
    coll: 'pantheon',
    title: 'pantheon figure',
    fields: [f('name', 'Name'), f('age', 'Age'), f('role', 'Role'), f('function', 'Function', 'textarea'), f('voice', 'Voice'), f('tie', 'In the arc', 'textarea')],
  },
  religion: {
    coll: 'religions',
    title: 'faith',
    fields: [f('name', 'Name'), f('creed', 'Creed', 'textarea'), f('status', 'Status'), f('truth', 'Truth'), f('mythologizes', 'Reads', 'textarea'), f('afterlife', 'Afterlife')],
    arrays: [refs('beats', 'Beats', 'timeline'), strs('tenets', 'Tenets')],
  },
  chapter: {
    coll: 'chapters',
    title: 'chapter',
    fields: [f('title', 'Title'), f('status', 'Status'), f('summary', 'Summary', 'textarea'), f('next', 'Next step')],
  },
};

export function isEditable(type: string): boolean {
  return type in EDIT_CONFIG;
}

/* ---- reference helpers (for nested id-array + relationship pickers) ---- */
type Named = { id: string; name?: string; title?: string; label?: string };

export function refLabel(data: ProjectData, coll: CollectionKey, id: string): string {
  const e = (data[coll] as unknown as Named[]).find((x) => x.id === id);
  return e ? e.name || e.title || e.label || id : id;
}

export function refOptions(data: ProjectData, coll: CollectionKey): { id: string; label: string }[] {
  return (data[coll] as unknown as Named[]).map((e) => ({ id: e.id, label: e.name || e.title || e.label || e.id }));
}

type Entity = Record<string, unknown> & { id: string };

export function findEntity(data: ProjectData, type: string, id: string): Entity | undefined {
  const cfg = EDIT_CONFIG[type];
  if (!cfg) return undefined;
  return (data[cfg.coll] as unknown as Entity[]).find((e) => e.id === id);
}

export function deleteEntity(data: ProjectData, type: string, id: string): boolean {
  const cfg = EDIT_CONFIG[type];
  if (!cfg) return false;
  const arr = data[cfg.coll] as unknown as Entity[];
  const i = arr.findIndex((e) => e.id === id);
  if (i < 0) return false;
  arr.splice(i, 1);
  return true;
}
