/* The Craft Registry — builtin systems (design §1.5, §4, §5; Phase 1 scope only).
 *
 * Phase 1 migrates Weir in as three entries — weir-idea, weir-prose, weir-science — using exactly the
 * rubric content already shipped in writers-codex-weir-module.md §3-6 (the same tiers, axes, gates
 * and bands that src/lib/weir/verdict.ts already implements). This is deliberately NOT the full v5
 * weir-science entry from the design doc's §1.5 table: `fields` (POSSIBILITY/LICENCE) arrives in
 * Phase 3.5, `passes` and the licence-ledger `register` in Phase 4. Adding those now would register
 * parts the app has no engine for yet, which is exactly the "legal, silent, and wrong" failure mode
 * §3.3 exists to prevent — so they're left off until the phase that gives them a real implementation.
 *
 * Every entry here is `source: 'builtin'`, which per §3.13 means it ships with the app and never
 * syncs — user- and pack-authored entries (Phase 9+) are the ones that ride the outbox/pull engine.
 */

import type { AxesPart, BandsPart, GatesPart, LadderPart } from './parts';
import { assertCategoryFailableConsistent, type CraftSystem } from './types';

/* The verdict mapping is identical across all three Weir modes (writers-codex-weir-module.md §3,
 * src/lib/weir/verdict.ts) — REWORK on any gate fail, otherwise banded by total. Shared here so the
 * three entries can't drift from each other or from verdict.ts. */
const WEIR_BANDS: BandsPart = {
  kind: 'bands',
  gateOverride: 'REWORK',
  bands: [
    { min: 48, max: 60, verdict: 'ACCEPT', colour: 'green' },
    { min: 36, max: 47, verdict: 'USABLE', colour: 'amber' },
    { min: 24, max: 35, verdict: 'REWRITE', colour: 'red' },
    { min: 0, max: 23, verdict: 'CUT', colour: 'red' },
  ],
};

function weirAxes(axes: { code: string; label: string; question: string }[]): AxesPart {
  return {
    kind: 'axes',
    total: 60,
    axes: axes.map((a) => ({ ...a, max: 10 })),
  };
}

function weirGates(gates: { code: string; label: string; test: string }[]): GatesPart {
  return {
    kind: 'gates',
    runBefore: 'axes',
    gates: gates.map((g) => ({ ...g, onFail: 'REWORK' })),
  };
}

const WEIR_IDEA_LADDER: LadderPart = {
  kind: 'ladder',
  tiers: [
    { code: 'I0', label: 'Vibe', description: 'A mood or image, not yet an idea. Develop or discard.' },
    { code: 'I1', label: 'Familiar', description: 'A known shape with no fresh turn.' },
    { code: 'I2', label: 'Turned', description: 'A known shape with one genuine fresh angle.' },
    { code: 'I3', label: 'Distinctive', description: 'Original and load-bearing — the story could not be told without this specific idea.' },
    { code: 'I4', label: 'Overloaded', description: 'So many ideas crammed together that none can breathe. Split or prune.' },
  ],
};

export const WEIR_IDEA: CraftSystem = {
  id: 'weir-idea',
  name: 'Weir Matrix — Idea',
  version: '1.1.1',
  source: 'builtin',
  category: 'matrix',
  failable: true,
  group: 'weir',
  question: 'Is this idea developed enough to carry a story — and does it hold up honestly?',
  target: { shape: 'element', types: ['premise', 'character', 'worldbuilding', 'thread'] },
  output: 'verdict',
  parts: [
    WEIR_IDEA_LADDER,
    weirAxes([
      { code: 'CLARITY', label: 'Clarity', question: 'Can you state it in one sentence with no "somehow"?' },
      { code: 'FRESHNESS', label: 'Freshness', question: 'Does it avoid the first, most obvious version of itself?' },
      { code: 'STAKES', label: 'Stakes', question: 'Is something at risk that a reader will care about?' },
      { code: 'SPECIFICITY', label: 'Specificity', question: 'Is it concrete and particular, or generic?' },
      { code: 'GENERATIVITY', label: 'Generativity', question: 'Does it make more story?' },
      { code: 'TENSION', label: 'Tension', question: 'Is there a real cost, obstacle, or contradiction driving it?' },
    ]),
    weirGates([
      { code: 'G1', label: 'Legible', test: 'Could a stranger restate the idea correctly after reading it once?' },
      { code: 'G2', label: 'Not-the-obvious', test: 'Is it more than the first thing anyone would think of on that prompt?' },
      { code: 'G3', label: 'Wanting', test: 'Does someone want something, for a reason a reader can feel?' },
      { code: 'G4', label: 'Opposition', test: 'Is there genuine resistance, or does the idea get what it wants for free?' },
      { code: 'G5', label: 'Pays-off', test: 'Could this actually resolve into something, or does it only pose a mood?' },
    ]),
    WEIR_BANDS,
  ],
  publicDefault: true,
};

const WEIR_PROSE_LADDER: LadderPart = {
  kind: 'ladder',
  tiers: [
    { code: 'P0', label: 'Placeholder', description: 'Notes or summary standing in for prose. Not yet writing.' },
    { code: 'P1', label: 'Functional', description: 'Conveys the information but lies flat on the page.' },
    { code: 'P2', label: 'Clean', description: 'Clear and competent; nothing snags, nothing sings.' },
    { code: 'P3', label: 'Alive', description: 'Voice, image, and momentum are working; it wants to be read aloud.' },
    { code: 'P4', label: 'Overwrought / Murky', description: 'Over- or under-written to the point of failure. Cut back or clarify.' },
  ],
};

export const WEIR_PROSE: CraftSystem = {
  id: 'weir-prose',
  name: 'Weir Matrix — Prose',
  version: '1.1.1',
  source: 'builtin',
  category: 'matrix',
  failable: true,
  group: 'weir',
  question: 'Is this passage actually working on the page?',
  target: { shape: 'element', types: ['prose'] },
  output: 'verdict',
  parts: [
    WEIR_PROSE_LADDER,
    weirAxes([
      { code: 'CLARITY', label: 'Clarity', question: 'Does every sentence parse on the first read, with no backtracking?' },
      { code: 'CONCRETENESS', label: 'Concreteness', question: 'Specific, sensory, particular detail — or abstraction and generality?' },
      { code: 'MOMENTUM', label: 'Momentum', question: 'Does it pull the reader forward, or stall and circle?' },
      { code: 'VOICE', label: 'Voice', question: 'Is there a distinct, consistent, living voice, or is it anonymous?' },
      { code: 'ECONOMY', label: 'Economy', question: 'Is every word earning its place? Does it survive the cut-test?' },
      { code: 'SHOW_TELL', label: 'Show/Tell balance', question: 'Dramatised where it matters, summarised where it should be?' },
    ]),
    weirGates([
      { code: 'G1', label: 'Reads-clean', test: 'Is there any sentence you have to re-read just to parse it? (One is a fail.)' },
      { code: 'G2', label: 'No-cliché-crutch', test: 'Is it leaning on stock phrases to do the emotional work?' },
      { code: 'G3', label: 'Earns-its-length', test: 'Does anything survive only because you\'re attached to it?' },
      { code: 'G4', label: 'Concrete-anchor', test: 'Is there at least one real, specific image, or is it abstraction top to bottom?' },
      { code: 'G5', label: 'Consistent', test: 'Does POV, tense, and tone hold, or does it drift mid-passage?' },
    ]),
    WEIR_BANDS,
  ],
  publicDefault: true,
};

const WEIR_SCIENCE_LADDER: LadderPart = {
  kind: 'ladder',
  tiers: [
    { code: 'T0', label: 'Established', description: 'Real, current science or engineering.' },
    { code: 'T1', label: 'Extrapolated', description: 'A straight-line extension of established science.' },
    { code: 'T2', label: 'Speculative-consistent', description: 'Speculative but internally and physically consistent.' },
    { code: 'T3', label: 'Declared licence', description: 'A named, budgeted impossibility, declared as such.' },
    { code: 'T4', label: 'Hand-wave', description: 'Undeclared and unaccounted-for.', banned: true },
  ],
};

export const WEIR_SCIENCE: CraftSystem = {
  id: 'weir-science',
  name: 'Weir Matrix — Science',
  version: '1.1.1',
  source: 'builtin',
  category: 'matrix',
  failable: true,
  group: 'weir',
  question: 'Is this grounded — would it survive an expert reading?',
  target: { shape: 'element', types: ['worldbuilding', 'character', 'system'] },
  output: 'verdict',
  parts: [
    WEIR_SCIENCE_LADDER,
    weirAxes([
      { code: 'ANCHOR', label: 'Anchor', question: 'What real science or established canon does this tie to?' },
      { code: 'MECHANISM', label: 'Mechanism', question: 'Is there an actual mechanism, not just an assertion?' },
      { code: 'CONSERVATION', label: 'Conservation', question: 'Does it respect conservation laws, or does it budget the break?' },
      { code: 'COST_LIMIT', label: 'Cost & Limit', question: 'What does it cost, and what can it not do?' },
      { code: 'CONSEQUENCE', label: 'Consequence', question: 'What follows from this existing, that the story must now account for?' },
      { code: 'FAILURE_MODE', label: 'Failure Mode', question: 'How does it fail, and is that failure mode used anywhere?' },
    ]),
    weirGates([
      { code: 'G1', label: 'Conservation', test: 'Does the budget balance, or is it off by orders of magnitude?' },
      { code: 'G2', label: 'One-Lie', test: 'Is this deriving from an already-spent licence, or minting a new one unnecessarily?' },
      { code: 'G3', label: 'Universality', test: 'Does the rule hold everywhere it should, with no special-cased exception?' },
      { code: 'G4', label: 'Numbers', test: 'Are the actual numbers shown, not just gestured at?' },
      { code: 'G5', label: 'Expert', test: 'Would a domain expert reading this find an error or a declared licence?' },
    ]),
    WEIR_BANDS,
    // fields(POSSIBILITY, LICENCE) + register(licence ledger) + passes(3) land in Phase 3.5 / Phase 4
    // — see the module comment above. Do not add them here piecemeal.
  ],
  publicDefault: true,
};

export const BUILTIN_SYSTEMS: readonly CraftSystem[] = [WEIR_IDEA, WEIR_PROSE, WEIR_SCIENCE];

// Registration-time check (§3.3) — fails fast if a future edit adds an entry with an inconsistent
// category/failable pair, rather than letting it ship silently wrong.
for (const system of BUILTIN_SYSTEMS) assertCategoryFailableConsistent(system);

const BY_ID: ReadonlyMap<string, CraftSystem> = new Map(BUILTIN_SYSTEMS.map((s) => [s.id, s]));

export function getSystem(id: string): CraftSystem | undefined {
  return BY_ID.get(id);
}

export function listSystems(): readonly CraftSystem[] {
  return BUILTIN_SYSTEMS;
}

/** Grouped by `group`, then category — the shape the Craft Systems screen needs from its first
 *  version (design §3.9, and the "one UI risk, owned early" note in §7): an ungrouped wall of
 *  entries is the thing most likely to make the registry feel like a regression from three
 *  hardcoded lenses, even at Phase 1's count of three. */
export function listSystemsGrouped(): Map<string, CraftSystem[]> {
  const out = new Map<string, CraftSystem[]>();
  for (const system of BUILTIN_SYSTEMS) {
    const key = system.group ?? '(ungrouped)';
    const list = out.get(key) ?? [];
    list.push(system);
    out.set(key, list);
  }
  return out;
}
