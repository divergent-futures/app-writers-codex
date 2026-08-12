/* The Craft Registry — system + run records (claude/craft-registry-design-2026-08-11.md §3.3–§3.10).
 *
 * Phase 1 scope (claude/HANDOFF-craft-registry-build.md Part 3): the full CraftSystem and CraftRun
 * shapes land now, even though several fields are only populated starting in later phases. That is
 * deliberate — see the Phase-1 invariants called out inline below. Widening these shapes later would
 * mean migrating every stored run, which is exactly the pain this design exists to avoid.
 */

import type { Part } from './parts';

/* ---------------- applicability (§3.6) ---------------- */

export interface Precondition {
  when: string;
  /** Invariant #2: `severity` exists from day one even though 'warn' is the only value used today.
   *  Adding 'exclusive' later (cross-tradition frameworks that are mutually contradictory rather than
   *  merely mismatched) is then a value, not a migration. Nothing in the seed set triggers it yet. */
  severity: 'warn';
  message: string;
  rationaleRef: string;
}

/* ---------------- registers (§3.7) ---------------- */

export interface RegisterColumn {
  key: string;
  label: string;
  type: string;
}

export interface RegisterDef {
  id: string; // 'licence' | 'culture'
  label: string;
  columns: RegisterColumn[];
  statusEnum: string[]; // Accepted | Needs rework | Parked | Candidate | Closed | Declared error
  idPrefix: string; // 'L' roots, 'C' candidates
  budget?: { max: number; counts: string[] }; // e.g. Weir: 3-5 roots; candidates don't count
  readableByGates: string[]; // ['G2-OneLie', 'G5-Expert']
}

/** One row of a RegisterDef's data (§3.7: "schema is global; rows are per-project data") — Phase 4,
 *  see src/lib/craft/register.ts for the read/write logic this shape supports. Not on the locked §3.4
 *  interface list because RegisterDef (the schema) was locked, not RegisterRow (the data it describes) —
 *  the design names rows only in prose ("§3.13: SYNCS ... register_rows") and in the row template
 *  quoted from weir-process.md Part Twelve. This is that shape, added at Phase 4 build time.
 *
 *  `id` is this record's own storage key (like every other record's `id`). `values.id` is a DIFFERENT
 *  id — the register's own human-facing display id ('L1', 'C3', 'R2', ...), which is declared as an
 *  ordinary column (key:'id') in RegisterDef.columns and assigned by register.ts's
 *  `nextRegisterRowId()`. Keeping them distinct means the display-id scheme (per-register, per-status
 *  prefix + sequence) never has to double as the storage/sync primary key. */
export interface RegisterRow {
  id: string;
  projectId: string;
  registerId: string; // matches the owning RegisterDef.id — 'licence' | 'culture'
  systemId: string; // which CraftSystem's register this row belongs to, e.g. 'weir-science'
  status: string; // one of the owning RegisterDef.statusEnum
  values: Record<string, string>; // column key -> value, per RegisterDef.columns (includes 'id')
  /** The CraftRun whose pass-3 reconciliation produced this row, per §3.7 rule 2 ("verdicts graduate
   *  into it") — absent for rows entered by hand rather than graduated from a run. */
  sourceRunId?: string;
  createdAt: number;
  updatedAt: number;
}

/* ---------------- passes (§3.10) — populated from Phase 4 (weir-science, leguin) ---------------- */

export interface Pass {
  n: number;
  name: string; // 'Derive' | 'Red-team' | 'Reconcile'
  requireDifferentModel?: boolean; // advisory — the app cannot enforce this, only record it
  prompt?: string;
  promptByTargetType?: Record<string, string>;
  writesTo?: 'register';
  optional?: boolean;
}

/* ---------------- the system record (§3.4) ---------------- */

export type CraftCategory = 'reference' | 'generator' | 'lens' | 'matrix';

export type TargetShape = 'none' | 'element' | 'sequence' | 'set' | 'corpus';

export type OutputShape =
  | 'none'
  | 'profile'
  | 'completeness'
  | 'verdict'
  | 'metric+span'
  | 'classification'
  | 'artifact';

export interface CraftSystem {
  id: string; // 'leguin' | 'weir-science' | 'weir-protocol-world'
  name: string;
  /** semver. §3.13: patch/minor are comparable across history; a MAJOR bump segments score history
   *  visibly. The author declares the bump — the app may suggest MAJOR when it detects an axis/gate
   *  change, but must never decide silently (declare-don't-default, §3.3). */
  version: string;
  source: 'builtin' | 'pack' | 'user';
  category: CraftCategory; // REQUIRED — declare-don't-default (§3.3)
  failable: boolean; // REQUIRED — deliberately redundant with `category`, cross-checked at registration
  group?: string; // 'weir' | 'sanderson' | 'leguin'
  question: string; // renders the lens table in cosmos-weir-integration.md from data (§3.4)
  target: {
    shape: TargetShape; // REQUIRED
    types: string[];
    scales?: string[];
  };
  output: OutputShape; // REQUIRED
  parts: Part[];
  /** §3.10 — defaults to one derive pass when absent. Not populated by any Phase-1 entry. */
  passes?: Pass[];
  /** §3.11 — behavioural lines injected into every prompt, alongside whatever the generated scaffold
   *  produces from `parts`. Populated from Phase 3.5 (see src/lib/craft/prompt.ts). */
  rules?: string[];
  /** §3.11's "overridable per instrument" / "canonicalRef" escape hatch. The design doc names this
   *  concept in prose ("weir-science overrides with canonicalRef: 'weir-scoring-prompt-v2.md'") but
   *  does not give it a field on the locked §3.4 CraftSystem interface — this is that field, added at
   *  Phase 3.5 build time. Points at a hardened, hand-tuned prompt doc that should be used INSTEAD OF
   *  the generated scaffold for this instrument; `ref` is a doc name/path, not inlined prompt text
   *  (keeps the registry lean and lets the source doc stay the one place that prompt is edited).
   *  Absent means "use the generated scaffold" — the common case for every future user-authored
   *  instrument, which is the entire point of generation existing at all. */
  promptOverride?: { ref: string; note?: string };
  register?: RegisterDef;
  publicDefault: boolean;
  hardLockedPrivate?: boolean;
  applicability?: Precondition[];
  provenance?: {
    authoredBy: 'builtin' | 'user' | 'pack';
    sourceDoc?: string;
    confirmedAt?: number;
  };
}

/** Registration-time sanity check for the declare-don't-default contract (§3.3): `failable` is
 *  deliberately redundant with `category` so the single most common registration error — a matrix
 *  that forgets it can fail, or a lens that wrongly claims it can — becomes a validation failure
 *  instead of a silent one. Called by the registry when a builtin entry is registered, and intended
 *  to be called from the authoring surface (Phase 9) on every user submission too. */
export function assertCategoryFailableConsistent(system: Pick<CraftSystem, 'id' | 'category' | 'failable'>): void {
  const shouldFail = system.category === 'lens' || system.category === 'matrix';
  const canFail = system.category === 'matrix';
  if (system.category !== 'reference' && system.category !== 'generator' && !shouldFail) return; // unreachable, keeps TS narrow
  if (system.failable !== canFail) {
    throw new Error(
      `craft system "${system.id}": failable=${system.failable} is inconsistent with category="${system.category}" ` +
        `(only 'matrix' can fail; 'reference', 'generator' and 'lens' cannot).`,
    );
  }
}

/* ---------------- the run record (§3.5) ---------------- */

export interface AxisResult {
  score: number;
  reason: string;
}

export interface GateResultEntry {
  pass: boolean;
  reason: string;
}

/** Per-slot occupancy (§1.4/§3.3 `completeness` output) — not a boolean. `filledBy.length`:
 *  0 = gap, 1 = correct (the `element`-target case), >1 = collision, and it names who. */
export interface StepOccupancy {
  filledBy: string[];
  note: string;
}

export interface MetricResult {
  density: number;
  therefore: number;
  but: number;
  andThen: number;
}

export interface SpanResult {
  startIndex: number;
  endIndex: number;
  kind: 'dead-run';
}

export interface ClassificationResult {
  classId: string;
  confidence?: number;
  derived?: Record<string, unknown>;
}

export interface FieldResult {
  value: string;
  pointer?: string;
}

export interface ArtifactResult {
  type: string;
  destination: string;
  ref: string;
  stale: boolean;
}

export interface CraftRunResults {
  tier?: string;
  axes?: Record<string, AxisResult>;
  total?: number;
  gates?: Record<string, GateResultEntry>;
  verdict?: 'ACCEPT' | 'USABLE' | 'REWORK' | 'REWRITE' | 'CUT';
  /** Invariant #3: always `filledBy: string[]` occupancy, never a boolean, from the first row written. */
  steps?: Record<string, StepOccupancy>;
  metric?: MetricResult;
  spans?: SpanResult[];
  classification?: ClassificationResult;
  /** POSSIBILITY, LICENCE, ... — not populated until `weir-science` gets its `fields` part in Phase 3.5,
   *  but the slot exists from Phase 1 (invariant #4) so it is additive-empty now, structural later. */
  fields?: Record<string, FieldResult>;
  artifacts?: ArtifactResult[];
  notes?: string;
}

export interface PassRun {
  n: number;
  model?: string; // what actually ran it, for the separation check (§3.10)
  completedAt: number;
  output: string;
  changedVerdict?: boolean;
}

export interface CraftRun {
  id: string;
  projectId: string;
  systemId: string;
  systemVersion: string;
  targetType: string | null;
  targetId: string | null;
  targetIds?: string[]; // set targets
  title: string;
  scale?: string;
  results: CraftRunResults;
  /** Invariant #4: exists on every row from Phase 1, even though no pass beyond the implicit single
   *  derive pass ships until Phase 4. Empty array, not absent — keeps downstream code from needing an
   *  `?? []` at every read site once passes are real. */
  passRuns: PassRun[];
  fix: string;
  isPublic: boolean;
  createdAt: number;
}
