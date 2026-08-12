/* The Craft Registry — sequence-metric execution logic (design §3.2's `sequenceMetric` +
 * `spanLocator` parts, §5, Phase 7).
 *
 * A `sequenceMetric` + `spanLocator` system (parker-stone is the only one in the seed set) is a
 * MATRIX with no ladder, no axes, no gates: "one computed ratio over adjacent joints... and a span
 * locator" (design §2). The writer pastes an outline, beat sheet, or passage; their own AI reads it
 * as an ordered list of items and writes the one HONEST connective between each adjacent pair —
 * THEREFORE / BUT / AND_THEN, per parker-stone-causal-density.md's own three-word vocabulary. This
 * file is the copy-paste round-trip logic for that: parsing the paste-back, computing density (and
 * any declared secondary ratio) from the system's OWN declared joint codes (not hardcoded to
 * parker-stone's vocabulary — see `validateJoints`), and locating the longest dead run.
 *
 * Two things the design is explicit must not be lost (§5):
 *   1. "The span is the deliverable" — a density number without the located dead run is worse than
 *      not running the test at all. `locateLongestDeadRun` always runs, never gated on density.
 *   2. "The second number is independent" — density 1.0 with an all-therefore, no-but sequence is
 *      "a flawless boring machine." `computeMetric` always returns therefore/but/andThen counts
 *      alongside density so the UI can show both, never density alone.
 */

import type { Band, BandsPart, SequenceMetricPart, SpanLocatorPart } from './parts';
import type { CraftSystem, MetricResult, SpanResult } from './types';

export function sequenceMetricPartOf(system: CraftSystem): SequenceMetricPart | undefined {
  return system.parts.find((p): p is SequenceMetricPart => p.kind === 'sequenceMetric');
}

export function spanLocatorPartOf(system: CraftSystem): SpanLocatorPart | undefined {
  return system.parts.find((p): p is SpanLocatorPart => p.kind === 'spanLocator');
}

export function bandsPartOf(system: CraftSystem): BandsPart | undefined {
  return system.parts.find((p): p is BandsPart => p.kind === 'bands');
}

export interface SequenceCard {
  /** The items in order, exactly as the AI listed them back (beats, scenes, sentences, facts...). */
  beats: string[];
  /** One fewer entry than `beats` — the honest connective between each adjacent pair. Raw codes as
   *  the AI wrote them (upper-cased, spaces/hyphens normalised to underscores); not yet validated
   *  against a specific system's declared joint codes — see `validateJoints`. */
  joints: string[];
  fix?: string;
}

export type ParseOutcome = { ok: true; card: SequenceCard } | { ok: false; error: string };

/** Accepts whatever the writer's own AI returned and extracts `{beats, joints, fix}` from the
 *  trailing fenced JSON block the generated prompt requires (see prompt.ts's `generatePrompt` —
 *  appends this tail whenever a system declares a `sequenceMetric` part). Same two-strategy shape as
 *  `src/lib/weir/parse.ts`'s `tryJsonBlock`: try every fenced block last-to-first, then a bare
 *  trailing object, so a paste that lost its fence markers still round-trips. */
export function parseSequenceResult(text: string): ParseOutcome {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: 'Paste the AI result first.' };

  const blocks = [...trimmed.matchAll(/```(?:json)?\s*\n([\s\S]*?)```/gi)].map((m) => m[1]);
  const bare = trimmed.match(/\{[\s\S]*\}\s*$/)?.[0];
  const candidates = [...blocks.reverse(), ...(bare ? [bare] : [])];

  for (const raw of candidates) {
    let obj: unknown;
    try {
      obj = JSON.parse(raw);
    } catch {
      continue;
    }
    if (!obj || typeof obj !== 'object') continue;
    const o = obj as { beats?: unknown; joints?: unknown; fix?: unknown };
    if (!Array.isArray(o.beats) || !Array.isArray(o.joints)) continue;

    const beats = o.beats.map((b) => String(b));
    // Normalise "Therefore", "and-then", "and then" etc. to the code shape the registry declares
    // ("THEREFORE", "AND_THEN") — the AI is asked for exact codes but paste-back text is never fully
    // reliable, and this costs nothing to tolerate.
    const joints = o.joints.map((j) => String(j).trim().toUpperCase().replace(/[\s-]+/g, '_'));

    if (beats.length < 2) return { ok: false, error: 'Need at least two beats for there to be a joint between them.' };
    if (joints.length !== beats.length - 1) {
      return { ok: false, error: `Expected ${beats.length - 1} joints for ${beats.length} beats (one between each adjacent pair), got ${joints.length}.` };
    }
    return { ok: true, card: { beats, joints, fix: typeof o.fix === 'string' ? o.fix : undefined } };
  }

  return {
    ok: false,
    error: 'Could not find a result to parse. Expected the fenced JSON block the prompt asks for, with "beats" and "joints" arrays.',
  };
}

/** Checks every parsed joint against the system's OWN declared codes (design's "declare, don't
 *  hardcode" spirit — this engine is not parker-stone-specific even though parker-stone is the only
 *  system that exercises it today). Returns a human-readable error, or null if every joint is known. */
export function validateJoints(joints: string[], part: SequenceMetricPart): string | null {
  const known = new Set(part.joints.map((j) => j.code));
  const bad = joints.find((j) => !known.has(j));
  return bad ? `Unknown joint code "${bad}" — expected one of: ${[...known].join(', ')}.` : null;
}

/** Density = alive ÷ total (design's `formula:'alive/total'`), computed from the system's OWN
 *  `alive` flags per joint — not a hardcoded THEREFORE/BUT-are-good assumption. The `therefore` /
 *  `but` / `andThen` counts on the return value are what `CraftRunResults.metric` (§3.5, locked)
 *  names literally — that shape is parker-stone's own vocabulary baked into the locked run record,
 *  so populating it by those exact codes is following the design, not re-introducing a shortcut. A
 *  future sequenceMetric system with different joint codes still gets a correct `density`; its own
 *  therefore/but/andThen breakdown would need `results.metric` to widen, which is a design question,
 *  not an engine one. */
export function computeMetric(joints: string[], part: SequenceMetricPart): MetricResult {
  const aliveCodes = new Set(part.joints.filter((j) => j.alive).map((j) => j.code));
  const alive = joints.filter((j) => aliveCodes.has(j)).length;
  const total = joints.length;
  return {
    density: total > 0 ? alive / total : 0,
    therefore: joints.filter((j) => j === 'THEREFORE').length,
    but: joints.filter((j) => j === 'BUT').length,
    andThen: joints.filter((j) => j === 'AND_THEN').length,
  };
}

/** The secondary ratio a `sequenceMetric.secondary` declares (design §5's "the second number is
 *  independent" — therefore : but for parker-stone). Returns null when the part declares none, or
 *  when the denominator side never occurred (an undefined ratio, not a divide-by-zero NaN). */
export function computeSecondaryRatio(joints: string[], part: SequenceMetricPart): { label: string; a: number; b: number } | null {
  if (!part.secondary) return null;
  const [codeA, codeB] = part.secondary.ratioOf;
  const a = joints.filter((j) => j === codeA).length;
  const b = joints.filter((j) => j === codeB).length;
  return { label: part.secondary.label, a, b };
}

/** "Always find the longest consecutive run of dead joints first; that run is the repair priority,
 *  regardless of the overall average" (parker-stone-causal-density.md, quoted in design §5). Indices
 *  are into the JOINTS array (0-based) — a run spanning joint indices [start, end] connects beats
 *  [start, end+1] inclusive. Returns null when there is no dead joint at all (a 1.0-density run has
 *  nothing to locate, and the UI should say so rather than render an empty span). Which codes count
 *  as "dead" is read from the part's own `alive:false` joints, per `spanLocator.of:'dead'` — not
 *  hardcoded to AND_THEN, for the same reuse reason `computeMetric`'s density calc isn't hardcoded. */
export function locateLongestDeadRun(joints: string[], metricPart: SequenceMetricPart): SpanResult | null {
  const deadCodes = new Set(metricPart.joints.filter((j) => !j.alive).map((j) => j.code));
  let bestStart = -1;
  let bestLen = 0;
  let curStart = -1;
  let curLen = 0;
  for (let i = 0; i < joints.length; i++) {
    if (deadCodes.has(joints[i])) {
      if (curLen === 0) curStart = i;
      curLen++;
      if (curLen > bestLen) {
        bestLen = curLen;
        bestStart = curStart;
      }
    } else {
      curLen = 0;
    }
  }
  if (bestLen === 0) return null;
  return { startIndex: bestStart, endIndex: bestStart + bestLen - 1, kind: 'dead-run' };
}

/** Applies a `bands` part to a computed density, same "any gate fail overrides, otherwise banded by
 *  total" shape every scored matrix in the registry already uses — except parker-stone has no gates
 *  part, so `gateOverride` is structurally present (BandsPart's locked shape requires it) but never
 *  reachable here; this function simply never triggers it. Returns null if density falls in no
 *  declared band (shouldn't happen with parker-stone's own 0.00-1.00 four-band cover, but a
 *  user-authored bands part might leave a gap — declare-don't-default extends to band coverage). */
export function verdictFor(density: number, bandsPart: BandsPart): Band['verdict'] | null {
  const band = bandsPart.bands.find((b) => density >= b.min && density <= b.max);
  return band?.verdict ?? null;
}
