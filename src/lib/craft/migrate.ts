/* The Craft Registry — Weir migration (design §3.5, §3.13; HANDOFF Part 3 invariant #5).
 *
 * Migrates existing `WeirScoreRecord` rows (src/lib/db.ts, the `weir` IndexedDB store) into the new
 * `CraftRun` shape, non-destructively — the source `weir` store and everything that reads it
 * (WeirWorkshop.svelte, entity badges) is untouched, so this is a pure additive backfill and Phase 1
 * stays "no user-visible change."
 *
 * `systemId = 'weir-' + mode` — confirmed compatible at the Phase-0 repo read (HANDOFF Part 2): there
 * is no unique mode-per-record constraint today, and there was never meant to be one. `systemId` is a
 * tag, not a row key; each row keeps its own existing `id`. Many rows legitimately share a `systemId`
 * because scoring is append-only history, not one-row-per-mode.
 */

import type { WeirScoreRecord } from '../db';
import type { AxisResult, CraftRun, GateResultEntry } from './types';

/** The date writers-codex-weir-module.md's v1.1.1 REWORK-collision fix shipped (changelog:
 *  "2026-07-31 (v1.1.1) — Verdict vocabulary collision fixed: REWORK is now reserved exclusively for
 *  gate failures."). Before this instant REWORK could also mean a low score; after it, only a gate
 *  failure. Every run stored before this boundary means something different from every run stored
 *  after (design §3.13). The changelog records a date, not a time of day — this uses 2026-07-31T00:00
 *  UTC as a conservative boundary. If a specific row's exact placement relative to the real deploy
 *  moment ever matters, verify it by hand rather than trusting this constant to the minute. */
export const WEIR_V1_1_1_RELEASED_AT = Date.UTC(2026, 6, 31); // month is 0-indexed: 6 = July

/** Rows created before the boundary get '1.0.0' (pre-fix semantics); at/after get '1.1.1' (the
 *  clean mapping — the only mapping the current `verdictFor()` in src/lib/weir/verdict.ts
 *  implements). This is a version STAMP for display and history-segmentation purposes; it does not
 *  and cannot retroactively recompute what a pre-fix verdict "should" have been. */
export function systemVersionForWeirRow(createdAt: number): string {
  return createdAt < WEIR_V1_1_1_RELEASED_AT ? '1.0.0' : '1.1.1';
}

export function weirModeToSystemId(mode: WeirScoreRecord['mode']): string {
  return `weir-${mode}`;
}

/** Pure, side-effect-free — safe to unit test without IndexedDB, and safe to call from the `db.ts`
 *  upgrade transaction. */
export function migrateWeirScoreToCraftRun(rec: WeirScoreRecord): CraftRun {
  const axes: Record<string, AxisResult> = {};
  for (const [code, score] of Object.entries(rec.axes)) axes[code] = { score, reason: '' };

  const gates: Record<string, GateResultEntry> = {};
  for (const [code, result] of Object.entries(rec.gates)) gates[code] = { pass: result === 'PASS', reason: '' };

  return {
    id: rec.id,
    projectId: rec.projectId,
    systemId: weirModeToSystemId(rec.mode),
    systemVersion: systemVersionForWeirRow(rec.createdAt),
    targetType: rec.targetType ?? null,
    targetId: rec.targetId ?? null,
    title: rec.title ?? '',
    results: {
      tier: rec.tier,
      axes,
      total: rec.total,
      gates,
      verdict: rec.verdict,
      // steps / fields intentionally absent: this row never had them, and invariant #3/#4 only
      // requires the SLOT to exist on CraftRunResults (it does, see types.ts), not that every row
      // populate it.
    },
    passRuns: [], // invariant #4 — structural, empty; this row predates pass tracking entirely
    fix: rec.fix ?? '',
    // WeirScoreRecord never carried a publicity flag, so there is nothing to migrate honestly other
    // than "closed by default" — a migrated row is never silently made public. If TJ wants any
    // historical run made public, that is a deliberate per-run action after migration, per §3.8.
    isPublic: false,
    createdAt: rec.createdAt,
  };
}
