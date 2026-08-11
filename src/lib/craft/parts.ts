/* The Craft Registry — parts (claude/craft-registry-design-2026-08-11.md §3.2, locked v5).
 *
 * An instrument is COMPOSED from parts, not selected from a closed `instrument` enum. A framework
 * reusing existing parts is data; only a genuinely new shape costs code, once, for everyone.
 *
 * Phase 1 ships the four parts the three migrated Weir entries actually use — ladder, axes, gates,
 * bands. The remaining seven (steps, sequenceMetric, spanLocator, pipeline, fields, entries, notes)
 * are declared here now, per the design's locked-vocabulary rationale (cheap now, expensive to
 * retrofit), but nothing in Phase 1 constructs them yet. They arrive with the phases named in the
 * design's §7 table: `steps` in Phase 5 (harmon, sanderson-laws, sanderson-ppp), `sequenceMetric` +
 * `spanLocator` in Phase 7 (parker-stone), `pipeline` in Phase 6 (the Weir/Le Guin generators),
 * `fields` in Phase 3.5 (restoring POSSIBILITY/LICENCE to weir-science).
 */

export type PartKind =
  | 'ladder' // ordered tiers, optional banned top tier
  | 'axes' // n scored dimensions, optional total
  | 'gates' // boolean pass/fail with an any-fail override
  | 'bands' // total -> verdict mapping
  | 'steps' // named slots, presence-checked
  | 'sequenceMetric' // computed ratio over a sequence
  | 'spanLocator' // longest run of a joint class
  | 'pipeline' // ordered stages that PRODUCE artifacts
  | 'fields' // named enum-valued outputs
  | 'entries' // static browsable content
  | 'notes'; // freeform per-run text

export interface LadderTier {
  code: string;
  label: string;
  description?: string;
  banned?: boolean;
}

export interface LadderPart {
  kind: 'ladder';
  tiers: LadderTier[];
}

export interface AxisBand {
  min: number;
  max: number;
  anchor: string;
}

export interface Axis {
  code: string;
  label: string;
  question: string;
  max: number;
  group?: string;
  bands?: AxisBand[];
  /** Le Guin-style depth flag — see design §4. Not used by the seed Weir entries. */
  loadBearing?: boolean;
}

export interface AxesPart {
  kind: 'axes';
  /** Absent => descriptive, no verdict (e.g. Sanderson's sliders). Present => scored, e.g. Weir's /60. */
  total?: number;
  axes: Axis[];
}

export interface Gate {
  code: string;
  label: string;
  test: string;
  onFail: 'REWORK';
}

export interface GatesPart {
  kind: 'gates';
  /** Gates no longer presuppose axes — a gate can run before a `steps` completeness result instead
   *  (Egri's "lacking any of the three dimensions is not a real character" is this shape). */
  runBefore?: 'axes' | 'steps';
  gates: Gate[];
}

export interface Band {
  min: number;
  max: number;
  verdict: 'ACCEPT' | 'USABLE' | 'REWRITE' | 'CUT';
  colour?: string;
}

export interface BandsPart {
  kind: 'bands';
  gateOverride: 'REWORK';
  bands: Band[];
}

export interface Step {
  n: number;
  name: string;
  prompt: string;
  group?: string;
  optional?: boolean;
}

export interface StepsPart {
  kind: 'steps';
  ordered: boolean; // REQUIRED — declare-don't-default (§3.3)
  completeness: 'all' | 'subset' | 'none'; // REQUIRED — declare-don't-default (§3.3)
  steps: Step[];
  scales?: string[];
}

export interface Joint {
  code: string;
  label: string;
  alive: boolean;
}

export interface SequenceMetricPart {
  kind: 'sequenceMetric';
  scope: 'inter' | 'intra'; // REQUIRED — between items, or within one (§3.3)
  joints: Joint[];
  formula: 'alive/total';
  secondary?: { label: string; ratioOf: [string, string] };
}

export interface SpanLocatorPart {
  kind: 'spanLocator';
  find: 'longest-run';
  of: 'dead';
}

export interface PipelineStage {
  n: number;
  name: string;
  prompt: string;
  inputsFrom?: number[]; // earlier stage outputs
  produces: { type: string; destination: string };
  invalidatesDownstream: boolean;
}

export interface PipelinePart {
  kind: 'pipeline';
  stages: PipelineStage[];
}

export interface FieldOption {
  key: string;
  label: string;
  options: string[]; // closed enum — REQUIRED, no free text (§3.2)
  pointerTo?: 'register'; // e.g. LICENCE -> DerivesFrom
  required: boolean;
}

export interface FieldsPart {
  kind: 'fields';
  fields: FieldOption[];
}

export interface EntriesPart {
  kind: 'entries';
  // Static browsable content — shape TBD when the first `reference` entry beyond prose-craft/packs
  // needs one. Not constructed in Phase 1.
}

export interface NotesPart {
  kind: 'notes';
  // Freeform per-run text. Not constructed in Phase 1.
}

export type Part =
  | LadderPart
  | AxesPart
  | GatesPart
  | BandsPart
  | StepsPart
  | SequenceMetricPart
  | SpanLocatorPart
  | PipelinePart
  | FieldsPart
  | EntriesPart
  | NotesPart;
