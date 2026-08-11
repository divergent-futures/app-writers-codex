/* The Craft Registry — builtin systems (design §1.5, §4, §5).
 *
 * Phase 1 migrated Weir in as three entries — weir-idea, weir-prose, weir-science — using exactly the
 * rubric content already shipped in writers-codex-weir-module.md §3-6 (the same tiers, axes, gates
 * and bands that src/lib/weir/verdict.ts already implements). That is deliberately NOT the full v5
 * weir-science entry from the design doc's §1.5 table: `fields` (POSSIBILITY/LICENCE) arrives in
 * Phase 3.5, `passes` and the licence-ledger `register` in Phase 4. Adding those now would register
 * parts the app has no engine for yet, which is exactly the "legal, silent, and wrong" failure mode
 * §3.3 exists to prevent — so they're left off until the phase that gives them a real implementation.
 *
 * Phase 2 adds `leguin`, using the exact ladder/axes/gates content from leguin-coherence-lens.md
 * Parts Three through Five. Per design §7, "Le Guin — data only; reuses the Weir engine and card
 * verbatim" — this is why `scoredAxesOf60`/`hardGatesRework`/the shared bands constant below are
 * factored out rather than duplicated: Le Guin is *literally* running through the same code Weir
 * does, which is the whole point of the phase. For the same reason Le Guin's `register` (the culture
 * ledger) and `passes` (Derive/Red-team/Reconcile) are left off here too, exactly as weir-science's
 * were in Phase 1 — Phase 4 ("Registers first-class + passes") is generic across every matrix, not
 * Weir-specific, so neither framework gets those parts before the engine that backs them exists.
 *
 * Every entry here is `source: 'builtin'`, which per §3.13 means it ships with the app and never
 * syncs — user- and pack-authored entries (Phase 9+) are the ones that ride the outbox/pull engine.
 */

import type { AxesPart, AxisBand, BandsPart, FieldsPart, GatesPart, LadderPart } from './parts';
import { assertCategoryFailableConsistent, type CraftSystem, type Precondition } from './types';

/* The verdict mapping is identical across every scored matrix in the seed set — Weir's three modes
 * AND Le Guin (design §2: "thresholds 48+/36-47/24-35/<24, byte-identical to Weir's") — REWORK on
 * any gate fail, otherwise banded by total. Shared here so no entry can quietly drift from another
 * or from verdict.ts. */
const SCORED_MATRIX_BANDS: BandsPart = {
  kind: 'bands',
  gateOverride: 'REWORK',
  bands: [
    { min: 48, max: 60, verdict: 'ACCEPT', colour: 'green' },
    { min: 36, max: 47, verdict: 'USABLE', colour: 'amber' },
    { min: 24, max: 35, verdict: 'REWRITE', colour: 'red' },
    { min: 0, max: 23, verdict: 'CUT', colour: 'red' },
  ],
};

/** Six scored axes /60 — the shape every scored matrix in the seed set uses (Weir's three modes,
 *  Le Guin). Named for the shape, not for Weir, now that a second framework uses it verbatim. */
function scoredAxesOf60(
  axes: { code: string; label: string; question: string; bands?: AxisBand[]; loadBearing?: boolean }[],
): AxesPart {
  return {
    kind: 'axes',
    total: 60,
    axes: axes.map((a) => ({ ...a, max: 10 })),
  };
}

/** Five hard gates, any-fail-kills-it, REWORK override — same shape rationale as scoredAxesOf60. */
function hardGatesRework(gates: { code: string; label: string; test: string }[]): GatesPart {
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
    scoredAxesOf60([
      { code: 'CLARITY', label: 'Clarity', question: 'Can you state it in one sentence with no "somehow"?' },
      { code: 'FRESHNESS', label: 'Freshness', question: 'Does it avoid the first, most obvious version of itself?' },
      { code: 'STAKES', label: 'Stakes', question: 'Is something at risk that a reader will care about?' },
      { code: 'SPECIFICITY', label: 'Specificity', question: 'Is it concrete and particular, or generic?' },
      { code: 'GENERATIVITY', label: 'Generativity', question: 'Does it make more story?' },
      { code: 'TENSION', label: 'Tension', question: 'Is there a real cost, obstacle, or contradiction driving it?' },
    ]),
    hardGatesRework([
      { code: 'G1', label: 'Legible', test: 'Could a stranger restate the idea correctly after reading it once?' },
      { code: 'G2', label: 'Not-the-obvious', test: 'Is it more than the first thing anyone would think of on that prompt?' },
      { code: 'G3', label: 'Wanting', test: 'Does someone want something, for a reason a reader can feel?' },
      { code: 'G4', label: 'Opposition', test: 'Is there genuine resistance, or does the idea get what it wants for free?' },
      { code: 'G5', label: 'Pays-off', test: 'Could this actually resolve into something, or does it only pose a mood?' },
    ]),
    SCORED_MATRIX_BANDS,
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
    scoredAxesOf60([
      { code: 'CLARITY', label: 'Clarity', question: 'Does every sentence parse on the first read, with no backtracking?' },
      { code: 'CONCRETENESS', label: 'Concreteness', question: 'Specific, sensory, particular detail — or abstraction and generality?' },
      { code: 'MOMENTUM', label: 'Momentum', question: 'Does it pull the reader forward, or stall and circle?' },
      { code: 'VOICE', label: 'Voice', question: 'Is there a distinct, consistent, living voice, or is it anonymous?' },
      { code: 'ECONOMY', label: 'Economy', question: 'Is every word earning its place? Does it survive the cut-test?' },
      { code: 'SHOW_TELL', label: 'Show/Tell balance', question: 'Dramatised where it matters, summarised where it should be?' },
    ]),
    hardGatesRework([
      { code: 'G1', label: 'Reads-clean', test: 'Is there any sentence you have to re-read just to parse it? (One is a fail.)' },
      { code: 'G2', label: 'No-cliché-crutch', test: 'Is it leaning on stock phrases to do the emotional work?' },
      { code: 'G3', label: 'Earns-its-length', test: 'Does anything survive only because you\'re attached to it?' },
      { code: 'G4', label: 'Concrete-anchor', test: 'Is there at least one real, specific image, or is it abstraction top to bottom?' },
      { code: 'G5', label: 'Consistent', test: 'Does POV, tense, and tone hold, or does it drift mid-passage?' },
    ]),
    SCORED_MATRIX_BANDS,
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

/** POSSIBILITY + LICENCE — the two of the canonical prompt's 18 fields that `ladder + axes + gates +
 *  bands + register` quietly dropped through v3.1 (design §3.2, the "self-caught silent loss"). Option
 *  text and field content sourced verbatim from weir-scoring-prompt-v2.md's own POSSIBILITY/LICENCE
 *  sections — not paraphrased from the design doc's shorter summary. */
const WEIR_SCIENCE_FIELDS: FieldsPart = {
  kind: 'fields',
  fields: [
    {
      key: 'POSSIBILITY',
      label: 'Possibility',
      options: ['Possible now', 'Engineering only', 'Not under known physics'],
      required: true,
    },
    {
      key: 'LICENCE',
      label: 'Licence',
      options: ['None', 'Derives from existing', 'NEW licence'],
      pointerTo: 'register', // drives the graduation path into the licence ledger — see design §3.2, §3.7
      required: true,
    },
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
    scoredAxesOf60([
      { code: 'ANCHOR', label: 'Anchor', question: 'What real science or established canon does this tie to?' },
      { code: 'MECHANISM', label: 'Mechanism', question: 'Is there an actual mechanism, not just an assertion?' },
      {
        code: 'CONSERVATION',
        label: 'Conservation',
        question: 'Does it respect conservation laws, or does it budget the break?',
        loadBearing: true,
        bands: [
          { min: 2, max: 3, anchor: 'no budget or off by ≥10^10' },
          { min: 6, max: 7, anchor: 'budget attempted, roughly plausible, key term still soft' },
          { min: 9, max: 10, anchor: 'budget closes with stated assumptions and the shortfall/surplus already explains a story constraint' },
        ],
      },
      {
        code: 'COST_LIMIT',
        label: 'Cost & Limit',
        question: 'What does it cost, and what can it not do?',
        loadBearing: true,
        bands: [
          { min: 9, max: 10, anchor: 'all three (limit / cost / counter) answered and at least one has generated (or clearly can generate) a scene' },
        ],
      },
      { code: 'CONSEQUENCE', label: 'Consequence', question: 'What follows from this existing, that the story must now account for?' },
      {
        code: 'FAILURE_MODE',
        label: 'Failure Mode',
        question: 'How does it fail, and is that failure mode used anywhere?',
        bands: [
          { min: 9, max: 10, anchor: 'specific failure with rate and it has already cost the story something (or is designed to)' },
        ],
      },
    ]),
    hardGatesRework([
      { code: 'G1', label: 'Conservation', test: 'Does the budget balance, or is it off by orders of magnitude?' },
      { code: 'G2', label: 'One-Lie', test: 'Is this deriving from an already-spent licence, or minting a new one unnecessarily?' },
      { code: 'G3', label: 'Universality', test: 'Does the rule hold everywhere it should, with no special-cased exception?' },
      { code: 'G4', label: 'Numbers', test: 'Are the actual numbers shown, not just gestured at?' },
      { code: 'G5', label: 'Expert', test: 'Would a domain expert reading this find an error or a declared licence?' },
    ]),
    SCORED_MATRIX_BANDS,
    WEIR_SCIENCE_FIELDS,
    // register(licence ledger) + passes(3) still land in Phase 4 — see the module comment above.
  ],
  // Verbatim from weir-scoring-prompt-v2.md's "Rules" section plus its opening-paragraph instruction
  // ("Prefer deriving from an existing root licence over granting a new one") — this is the doc the
  // design's §3.11 example rules list was itself drawn from.
  rules: [
    'Compute; do not gesture.',
    'Never fabricate a paper. If you use a real result, name it. If you compute from first principles, say so.',
    'Far-future fiction may sit at "Not under known physics," but only as a named, derived licence.',
    'If the element fails any gate, the verdict is REWORK even if the total is high.',
    'Prefer deriving from an existing root licence over granting a new one.',
  ],
  // §3.11: "weir-science overrides with canonicalRef... Nothing generated should displace it." This
  // prompt was hardened across three versions (weir-redteam-and-calibrations.md's red-team split by
  // target type, the ledger injection, the anti-fabrication rules, the pipe-separated output format) —
  // see src/lib/craft/prompt.ts's resolvePrompt(), which returns this instead of a generated prompt.
  promptOverride: {
    ref: 'weir-scoring-prompt-v2.md',
    note: 'Canonical v2.1 hardened prompt. Do not generate a replacement from parts[] — use this doc verbatim.',
  },
  publicDefault: true,
};

/* ---------------- Le Guin (Phase 2) ----------------
 *
 * Content sourced verbatim from leguin-coherence-lens.md Parts Three (ladder), Four (axes), Five
 * (gates). Bands are literally the shared SCORED_MATRIX_BANDS constant above, not a copy — the
 * design doc calls the two "byte-identical," so they're the same object, not two objects that happen
 * to agree today and can drift tomorrow. */

const LEGUIN_LADDER: LadderPart = {
  kind: 'ladder',
  tiers: [
    { code: 'C0', label: 'Derived', description: 'Follows by a clear, statable chain from a root fact already established. No cost.' },
    { code: 'C1', label: 'Derivable', description: 'Not yet traced, but a short honest chain exists.' },
    { code: 'C2', label: 'Load-bearing break', description: 'Contradicts what the roots predict — deliberately — and does real work. Named, budgeted, load-bearing.' },
    { code: 'C3', label: 'Free-floating', description: 'Present, plausible-sounding, connected to nothing — portable to a different species unchanged.' },
    { code: 'C4', label: 'Import', description: 'Twenty-first-century Earth wearing a costume, with no reason it should recur here.', banned: true },
  ],
};

/** design §4's "Handshake Rule" precondition, verbatim message. Warn-only per §3.6 — every framework
 *  doc in the corpus insists on "flashlight, not recipe," and this app never blocks. */
const LEGUIN_HANDSHAKE_RULE: Precondition = {
  when: '!weirPassComplete',
  severity: 'warn',
  message: 'The Handshake Rule: Le Guin inherits its roots from the Weir species/world pass. Run Weir first.',
  rationaleRef: 'leguin-coherence-lens.md Part Six (Derivation Order) and Part Nine (interlock with Weir)',
};

export const LEGUIN: CraftSystem = {
  id: 'leguin',
  name: 'Le Guin Coherence Lens',
  version: '1.0.0',
  source: 'builtin',
  category: 'matrix',
  failable: true,
  group: 'leguin',
  question: 'Does everything this people does follow from what it is?',
  target: { shape: 'element', types: ['species', 'culture', 'world'] },
  output: 'verdict',
  parts: [
    LEGUIN_LADDER,
    scoredAxesOf60([
      { code: 'EMB', label: 'Embodiment', question: 'Do food, movement, gesture, craft, art and tools follow from the actual body and senses?' },
      { code: 'ENV', label: 'Environment', question: 'Do customs follow from the real scarcities, dangers, and rhythms of where they live?' },
      { code: 'SPE', label: 'Speech', question: 'Does the language follow from what their bodies can produce and what their society needs to say — and hide?' },
      { code: 'BEL', label: 'Belief', question: 'Do religion, myth, and taboo grow from what this species would actually fear, mourn, fail to perceive, and fail to control?' },
      { code: 'SOC', label: 'Social structure', question: 'Do family, hierarchy, property, and law derive from reproduction, lifespan, and resource pressure?' },
      { code: 'INT', label: 'Interior', question: 'Do thought patterns, time-sense, number base, aesthetics, and values match their senses and cognition rather than ours?' },
    ]),
    hardGatesRework([
      { code: 'G1', label: 'Therefore', test: 'Does every major cultural fact trace to a root (body, world, history) by a stated chain?' },
      { code: 'G2', label: 'But', test: 'Is any trait that breaks the derived pattern named as a break and doing real work?' },
      { code: 'G3', label: 'No-Human-Default', test: 'Is anything identical to Earth human culture justified by a shared constraint, or flagged?' },
      { code: 'G4', label: 'Echo', test: 'Do the species’ one or two core facts surface in at least three unrelated domains?' },
      { code: 'G5', label: 'Schism', test: 'Does the culture contain at least one real internal disagreement with consequences?' },
    ]),
    SCORED_MATRIX_BANDS,
    // register(culture ledger) + passes(Derive/Red-team/Reconcile) land in Phase 4, same reasoning
    // as weir-science's deferred fields/passes/register in Phase 1 — see the module comment above.
  ],
  publicDefault: true,
  applicability: [LEGUIN_HANDSHAKE_RULE],
};

/* ---------------- Sanderson Character Mixing Board (Phase 3) ----------------
 *
 * design §1.6: the shipped book-level P/R/C + trajectory view (src/components/views/Matrix.svelte,
 * rendered by matrixBody()/trajectoryBody() in src/lib/render/engine.js) IS Sanderson's Character
 * Mixing Board, already built — it was just never registered or named as such. This entry doesn't
 * add scoring logic; the scores already live on `Arc.scores` in schema.ts (proactivity/relatability/
 * capability, ported straight from that field). Absorbing it — registering this entry and renaming
 * the nav tab away from "Matrix" — is what frees "matrix" as a name, per design §1.6: "the collision
 * dissolves because the view was misnamed, not the category."
 *
 * LENS, not MATRIX: sanderson-framework.md Part 1 never fails a character on the sliders — "the most
 * important thing is that the sliders move," not that they clear a threshold. `axes.total` is
 * intentionally omitted (design §3.2: "axes.total optional — one part type serves both Weir's scored
 * /60 and Sanderson's descriptive sliders"), so this is `output: 'profile'`, no bands, no gates. */

export const SANDERSON_BOARD: CraftSystem = {
  id: 'sanderson-board',
  name: 'Sanderson Character Mixing Board',
  version: '1.0.0',
  source: 'builtin',
  category: 'lens',
  failable: false,
  group: 'sanderson',
  question: 'What is this character, and does it have depth?',
  target: { shape: 'element', types: ['character'] },
  output: 'profile',
  parts: [
    {
      kind: 'axes',
      // no `total` — descriptive, no verdict. See the module comment above.
      axes: [
        { code: 'PROACTIVITY', label: 'Proactivity', question: 'Does the character drive the plot rather than react to it?', max: 10 },
        { code: 'RELATABILITY', label: 'Relatability', question: 'How much does the reader empathise with or enjoy this character?', max: 10 },
        { code: 'CAPABILITY', label: 'Capability', question: 'What can this character actually do — skill, competence, capacity to effect change?', max: 10 },
      ],
    },
  ],
  publicDefault: true,
};

export const BUILTIN_SYSTEMS: readonly CraftSystem[] = [WEIR_IDEA, WEIR_PROSE, WEIR_SCIENCE, LEGUIN, SANDERSON_BOARD];

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
 *  hardcoded lenses. Five entries across three groups (`weir`, `leguin`, `sanderson`) as of Phase 3 —
 *  still small enough to eyeball, but the grouping exists now precisely so it doesn't need
 *  retrofitting once the count climbs toward the full seventeen. */
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
