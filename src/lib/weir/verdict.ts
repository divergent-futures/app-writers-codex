/* Weir Matrix — shared verdict logic (writers-codex-weir-module.md §3).
 *
 * THE single implementation of the gate-override + score-band mapping. Imported by both the client
 * (verdict card, entity badge) and the Worker (server-side recompute on POST /api/weir/score — the
 * server never trusts a client-supplied verdict). Do not re-implement this per mode or per surface;
 * the whole point is that Idea, Prose, and Science share one mapping.
 *
 * Pure TS, no DOM and no Workers types, so it type-checks in both tsconfig worlds.
 */

export type WeirMode = 'idea' | 'prose' | 'science';
export type GateResult = 'PASS' | 'FAIL';
export type Verdict = 'ACCEPT' | 'USABLE' | 'REWORK' | 'REWRITE' | 'CUT';

/** Clean mapping (v1.1.1): REWORK is reserved exclusively for gate failures. */
export function verdictFor(total: number, gates: Record<string, GateResult>): Verdict {
  if (Object.values(gates).some((g) => g === 'FAIL')) return 'REWORK';
  if (total >= 48) return 'ACCEPT';
  if (total >= 36) return 'USABLE';
  if (total >= 24) return 'REWRITE';
  return 'CUT';
}

/** Sum of the six axis scores. Tolerates a partial axes object (missing axes count 0). */
export function totalOf(axes: Record<string, number>): number {
  return Object.values(axes).reduce((n, v) => n + (Number.isFinite(v) ? v : 0), 0);
}

/** Badge colour per the spec: ACCEPT green · USABLE amber · REWORK / REWRITE / CUT red. */
export const VERDICT_COLOR: Record<Verdict, 'green' | 'amber' | 'red'> = {
  ACCEPT: 'green',
  USABLE: 'amber',
  REWORK: 'red',
  REWRITE: 'red',
  CUT: 'red',
};

export const WEIR_MODES: readonly WeirMode[] = ['idea', 'prose', 'science'] as const;

/** Validate an axes object: every value a finite number in 0..10. Returns an error string or null. */
export function validateAxes(axes: unknown): string | null {
  if (!axes || typeof axes !== 'object' || Array.isArray(axes)) return 'axes must be an object';
  const entries = Object.entries(axes as Record<string, unknown>);
  if (entries.length === 0) return 'axes must not be empty';
  for (const [k, v] of entries) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 10) {
      return `axis "${k}" must be a number 0-10`;
    }
  }
  return null;
}

/** Validate a gates object: every value 'PASS' | 'FAIL'. Returns an error string or null. */
export function validateGates(gates: unknown): string | null {
  if (!gates || typeof gates !== 'object' || Array.isArray(gates)) return 'gates must be an object';
  const entries = Object.entries(gates as Record<string, unknown>);
  if (entries.length === 0) return 'gates must not be empty';
  for (const [k, v] of entries) {
    if (v !== 'PASS' && v !== 'FAIL') return `gate "${k}" must be 'PASS' or 'FAIL'`;
  }
  return null;
}
