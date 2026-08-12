/* The Craft Registry — register rows (design §3.7, Phase 4: "Registers first-class + passes. Weir G2
 * reads the ledger; pass 3 writes the graduation.")
 *
 * A RegisterDef (types.ts, attached to a CraftSystem via `system.register`) is SCHEMA: the column
 * list, the closed status vocabulary, the id-prefix convention, the root budget, which gates read it.
 * A RegisterRow (types.ts, new at Phase 4) is DATA: one row of that schema, scoped to a project —
 * "schema is global; rows are per-project data" (§3.7). This file is the read/write logic over rows:
 * assigning the next display id, checking the root budget, building the data block a gate prompt
 * injects, and recording a graduation from a completed run's pass 3. Persistence itself (IndexedDB)
 * lives in db.ts, same split as craft/migrate.ts vs db.ts for runs.
 *
 * Two behaviours this file exists to make real, per §3.7:
 *   1. "Gates read the register." Weir G2 must consult active roots and candidates before granting a
 *      NEW licence — buildGateDataBlock() is the "injected data block" the design calls for, in place
 *      of the prompt-only instruction the canonical prompt currently relies on to do this by hand.
 *   2. "Verdicts graduate into it." graduateFromRun() is where pass 3's `writesTo: 'register'` becomes
 *      an actual row, stamped with the run that produced it.
 */

import type { CraftRun, RegisterDef, RegisterRow } from './types';

/** §3.7's `idPrefix` comment reads `'L' roots, 'C' candidates` on a single string field. Read
 *  literally: `idPrefix` names the prefix for a register's ROOT/confirmed rows (Weir: 'L', Le Guin:
 *  'R' — see registry.ts) — 'C' for candidates is a second, universal convention shared by every
 *  register, not a per-register value, so it's hardcoded here rather than added as a second RegisterDef
 *  field. (Contrast with `promptOverride` in types.ts, which needed a new field because nothing in the
 *  locked interface covered it at all — here something does; it just carries two roles by convention.) */
const CANDIDATE_PREFIX = 'C';

function prefixFor(def: RegisterDef, status: string): string {
  return status === 'Candidate' ? CANDIDATE_PREFIX : def.idPrefix;
}

/** Next free display id for a new row of the given status — 'L3' if L1 and L2 already exist, 'C1' if
 *  no candidate has been added yet. Roots and candidates number independently (each counts only rows
 *  already carrying its own prefix), matching cosmos-licence-ledger.md's live L1/L2 + C1..C12 shape. */
export function nextRegisterRowId(existingRows: RegisterRow[], def: RegisterDef, status: string): string {
  const prefix = prefixFor(def, status);
  const used = existingRows
    .map((r) => r.values.id)
    .filter((id): id is string => typeof id === 'string' && id.startsWith(prefix))
    .map((id) => Number.parseInt(id.slice(prefix.length), 10))
    .filter((n) => Number.isFinite(n));
  const next = (used.length ? Math.max(...used) : 0) + 1;
  return `${prefix}${next}`;
}

function ordinalSuffix(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return 'st';
  if (n % 10 === 2 && n % 100 !== 12) return 'nd';
  if (n % 10 === 3 && n % 100 !== 13) return 'rd';
  return 'th';
}

/** §3.7: "Weir: 3-5 roots; candidates don't count." Advisory, not a refusal — every framework doc in
 *  the corpus insists this app warns rather than blocks (§3.6's "flashlight, not a recipe"), and
 *  whether a 6th root is really needed is exactly the judgement call the writer makes, not the app.
 *  Returns null when there's no budget declared (Le Guin's culture register has none), when the new
 *  row's status isn't one the budget counts (§3.7: "candidates don't count"), or when adding it
 *  wouldn't exceed the max — otherwise a message to surface, never a throw. */
export function checkRegisterBudget(existingRows: RegisterRow[], def: RegisterDef, newRowStatus: string): string | null {
  const budget = def.budget;
  if (!budget) return null;
  if (!budget.counts.includes(newRowStatus)) return null;
  const countedNow = existingRows.filter((r) => budget.counts.includes(r.status)).length;
  const wouldBe = countedNow + 1;
  if (wouldBe > budget.max) {
    return (
      `This would be the ${wouldBe}${ordinalSuffix(wouldBe)} row counted against "${def.label}"'s budget of ` +
      `${budget.max}. Prefer deriving from an existing row over adding a new one.`
    );
  }
  return null;
}

/** §3.7: "Today a prompt instruction; in the app an injected data block — more reliable and testable."
 *  Renders every row a gate in `def.readableByGates` needs to see before it runs: active (non-Closed,
 *  non-Parked) rows and every candidate, one line each, using whichever columns the register actually
 *  declares — generic over weir-science's ten-column licence ledger and Le Guin's four-column culture
 *  ledger alike, not hardcoded to either. */
export function buildGateDataBlock(existingRows: RegisterRow[], def: RegisterDef): string {
  const relevant = existingRows.filter((r) => r.status !== 'Closed' && r.status !== 'Parked');
  if (!relevant.length) return `${def.label}: empty. No existing rows to derive from or check against.`;
  const contentCols = def.columns.filter((c) => c.key !== 'id' && c.key !== 'status');
  const lines = relevant.map((r) => {
    const id = r.values.id ?? '?';
    const body = contentCols.map((c) => `${c.label}: ${r.values[c.key] ?? '—'}`).join(' · ');
    return `- ${id} [${r.status}] ${body}`;
  });
  return `${def.label.toUpperCase()}:\n${lines.join('\n')}`;
}

/** Constructs a new row (not yet persisted — callers write it via db.ts's `putRegisterRow`). Status and
 *  values are required from the caller, never inferred: which bucket a row lands in (Accepted vs
 *  Candidate vs Needs rework) is exactly the human judgement call §3.3's declare-don't-default contract
 *  exists to keep out of silent app defaults — and every source doc writes pass 3 ("Reconcile and
 *  record") as a human step, not an autograded one. */
export function buildRegisterRow(args: {
  id: string;
  projectId: string;
  systemId: string;
  def: RegisterDef;
  status: string;
  values: Record<string, string>;
  existingRows: RegisterRow[];
  sourceRunId?: string;
  now: number;
}): RegisterRow {
  const displayId = args.values.id ?? nextRegisterRowId(args.existingRows, args.def, args.status);
  return {
    id: args.id,
    projectId: args.projectId,
    registerId: args.def.id,
    systemId: args.systemId,
    status: args.status,
    values: { ...args.values, id: displayId },
    sourceRunId: args.sourceRunId,
    createdAt: args.now,
    updatedAt: args.now,
  };
}

/** §3.7 rule 2 / §3.10's "pass 3 ... writesTo: 'register'" — the graduation path itself. A thin wrapper
 *  over `buildRegisterRow` that stamps provenance back to the run whose pass-3 reconciliation produced
 *  it, so any ledger row can always be traced to the score that justified it.
 *
 *  Deliberately does NOT parse `run.passRuns`' free-text pass-3 output into a row automatically — that
 *  output is prose from an AI red-team/reconcile pass, and turning prose into a licence-ledger row by
 *  regex is exactly the kind of silent, unconfirmed write §3.3 exists to prevent (and exactly the
 *  "human confirms" step §3.12 calls the feature, not friction to remove). A future run-execution UI
 *  calls this once a human has read pass 3's output and decided what belongs in the ledger. */
export function graduateFromRun(args: {
  rowId: string;
  run: Pick<CraftRun, 'id' | 'projectId' | 'systemId'>;
  def: RegisterDef;
  status: string;
  values: Record<string, string>;
  existingRows: RegisterRow[];
  now: number;
}): RegisterRow {
  return buildRegisterRow({
    id: args.rowId,
    projectId: args.run.projectId,
    systemId: args.run.systemId,
    def: args.def,
    status: args.status,
    values: args.values,
    existingRows: args.existingRows,
    sourceRunId: args.run.id,
    now: args.now,
  });
}
