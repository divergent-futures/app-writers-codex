/* Weir Matrix — paste-back result parser (copy-paste fallback path).
 *
 * Accepts whatever the writer's own AI returned and extracts the card fields. Two strategies,
 * tried in order:
 *   1. The fenced ```json block every mode prompt requires as the last thing in the reply.
 *   2. The Science mode 18-field pipe row (Element | Domain | Tier | six axes | five gates | …),
 *      for results produced with the raw v2.1 prompt (no JSON tail).
 * Returns the parsed card or a human-readable error for the Workshop to display.
 */

import { validateAxes, validateGates, type GateResult } from './verdict';

export interface ParsedCard {
  tier?: string;
  axes: Record<string, number>;
  gates: Record<string, GateResult>;
  fix?: string;
}

export type ParseOutcome = { ok: true; card: ParsedCard } | { ok: false; error: string };

const SCIENCE_AXES = ['Anchor', 'Mechanism', 'Conservation', 'Cost & Limit', 'Consequence', 'Failure Mode'];
const SCIENCE_GATES = ['G1 Conservation', 'G2 One-Lie', 'G3 Universality', 'G4 Numbers', 'G5 Expert'];

export function parseWeirResult(text: string): ParseOutcome {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: 'Paste the AI result first.' };

  const fromJson = tryJsonBlock(trimmed);
  if (fromJson) return fromJson;

  const fromRow = tryScienceRow(trimmed);
  if (fromRow) return fromRow;

  return {
    ok: false,
    error:
      'Could not find a result to parse. Expected either the fenced JSON block the prompt asks for, or a Science-mode pipe row (18 "|"-separated fields).',
  };
}

/* -------- strategy 1: last fenced JSON block -------- */

function tryJsonBlock(text: string): ParseOutcome | null {
  const blocks = [...text.matchAll(/```(?:json)?\s*\n([\s\S]*?)```/gi)].map((m) => m[1]);
  // Also accept a bare trailing JSON object if no fence survived the copy.
  const bare = text.match(/\{[\s\S]*\}\s*$/)?.[0];
  const candidates = [...blocks.reverse(), ...(bare ? [bare] : [])];

  for (const raw of candidates) {
    let obj: unknown;
    try {
      obj = JSON.parse(raw);
    } catch {
      continue;
    }
    if (!obj || typeof obj !== 'object') continue;
    const o = obj as { tier?: unknown; axes?: unknown; gates?: unknown; fix?: unknown };
    if (o.axes === undefined && o.gates === undefined) continue;

    const gates = normaliseGates(o.gates);
    const axes = normaliseAxes(o.axes);
    const axesErr = validateAxes(axes);
    if (axesErr) return { ok: false, error: `Parsed the JSON block, but: ${axesErr}` };
    const gatesErr = validateGates(gates);
    if (gatesErr) return { ok: false, error: `Parsed the JSON block, but: ${gatesErr}` };
    return {
      ok: true,
      card: {
        tier: typeof o.tier === 'string' ? o.tier : undefined,
        axes,
        gates,
        fix: typeof o.fix === 'string' ? o.fix : undefined,
      },
    };
  }
  return null;
}

/* -------- strategy 2: Science-mode pipe row -------- */

function tryScienceRow(text: string): ParseOutcome | null {
  // The row is the line with the most pipes; needs at least 17 separators for 18 fields.
  const line = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => (l.match(/\|/g)?.length ?? 0) >= 17)
    // skip the prompt's own format-spec line if it was pasted back
    .filter((l) => !/^Element \| Domain \| Tier \| Anchor/i.test(l))
    .sort((a, b) => (b.match(/\|/g)?.length ?? 0) - (a.match(/\|/g)?.length ?? 0))[0];
  if (!line) return null;

  const f = line.split('|').map((s) => s.trim());
  if (f.length < 18) return null;

  const axes: Record<string, number> = {};
  for (let i = 0; i < 6; i++) {
    const n = Number(f[3 + i]);
    if (!Number.isFinite(n)) return { ok: false, error: `Pipe row axis "${SCIENCE_AXES[i]}" is not a number ("${f[3 + i]}").` };
    axes[SCIENCE_AXES[i]] = n;
  }
  const gates: Record<string, GateResult> = {};
  for (let i = 0; i < 5; i++) {
    const v = f[9 + i].toUpperCase();
    gates[SCIENCE_GATES[i]] = v.startsWith('P') ? 'PASS' : 'FAIL';
  }

  const axesErr = validateAxes(axes);
  if (axesErr) return { ok: false, error: `Parsed the pipe row, but: ${axesErr}` };

  return {
    ok: true,
    card: { tier: f[2] || undefined, axes, gates, fix: f[17] || undefined },
  };
}

/* -------- normalisers -------- */

function normaliseAxes(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = typeof val === 'number' ? val : Number(val);
    }
  }
  return out;
}

function normaliseGates(v: unknown): Record<string, GateResult> {
  const out: Record<string, GateResult> = {};
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      const s = String(val).toUpperCase();
      out[k] = s.startsWith('P') || s === 'TRUE' || s === 'OK' ? 'PASS' : 'FAIL';
    }
  }
  return out;
}
