/* The Craft Registry — pipeline execution logic (design §3.2's `pipeline` part, §1.2, Phase 6).
 *
 * A `pipeline` system (weir-protocol-tech/world/species/culture, leguin-derivation) is a GENERATOR:
 * it writes into the work rather than judging it (§1.1's four-way test). Each stage is one step of a
 * derivation order that has always lived in prose (weir-process.md's four protocols, leguin-coherence-
 * lens.md Part Six) and never had anywhere to run. This file is the copy-paste execution logic — the
 * same "copy prompt, run it in your own AI, paste the result back" discipline WeirWorkshop.svelte
 * already established for scoring, applied to a multi-stage derivation instead of a single pass.
 *
 * No live AI call happens inside the app (same reasoning as WeirWorkshop): this is a local-first app
 * with no server-side model access wired up, and the copy-paste fallback is deliberately the ONE path
 * every instrument in the registry supports, scored or generated.
 */

import type { PipelinePart, PipelineStage } from './parts';
import type { ArtifactResult, CraftSystem } from './types';

/** The one `pipeline` part on a generator system, or undefined if this system has none (every
 *  non-generator system has zero pipeline parts; every Phase 6 generator has exactly one). */
export function pipelinePartOf(system: CraftSystem): PipelinePart | undefined {
  return system.parts.find((p): p is PipelinePart => p.kind === 'pipeline');
}

/** Builds the text to copy for one stage: the stage's own prompt, plus — if `inputsFrom` names earlier
 *  stages — their filled-in outputs, labelled by stage name, so the pasted prompt is self-contained
 *  (the whole point of copy-paste is that nothing besides this text needs to be open elsewhere).
 *  `outputs` is keyed by stage `n`; a referenced stage with no output yet is flagged rather than
 *  silently omitted, since running a stage out of order is exactly what "never invent out of order"
 *  (every protocol doc's own words) warns against. */
export function buildStagePrompt(stages: PipelineStage[], stage: PipelineStage, outputs: Record<number, string>): string {
  const parts: string[] = [stage.prompt];
  for (const n of stage.inputsFrom ?? []) {
    const src = stages.find((s) => s.n === n);
    const label = src ? `Stage ${n} — ${src.name}` : `Stage ${n}`;
    const out = outputs[n];
    parts.push(out ? `\n\n**${label} (already established):**\n${out}` : `\n\n**${label}:** ⚠ not yet run — run this stage first, or paste it in manually.`);
  }
  return parts.join('');
}

/** Which already-filled stages become stale after stage `editedN`'s output changes. A stage's own
 *  `invalidatesDownstream` names whether editing IT invalidates what comes after — so re-running or
 *  editing stage `editedN` marks every LATER stage that already has output as stale, but only if
 *  `editedN` itself carries `invalidatesDownstream: true`. Mirrors §3.5's `ArtifactResult.stale` —
 *  "revising an upstream stage marks every downstream artifact stale rather than leaving silent drift"
 *  (design §3.5). Pure function: caller re-renders whatever UI state depends on the result. */
export function staleAfterEdit(stages: PipelineStage[], editedN: number, filledNs: Set<number>): Set<number> {
  const edited = stages.find((s) => s.n === editedN);
  if (!edited?.invalidatesDownstream) return new Set();
  const stale = new Set<number>();
  for (const n of filledNs) {
    if (n > editedN) stale.add(n);
  }
  return stale;
}

/** Converts a completed (or partially completed) run's stage outputs into `CraftRunResults.artifacts`
 *  (§3.5). One entry per stage that has output; `stale` is read straight from the caller's tracked
 *  stale set rather than recomputed here, since staleness is a property of the RUN's edit history
 *  (which stage was touched, in what order), not something derivable from the outputs alone. Privacy
 *  is NOT decided here — `ArtifactResult` (§3.5) carries no privacy field of its own; the run's
 *  `isPublic` (resolved via privacy.ts's `resolveArtifactPrivacy`, per §3.8's "an artifact inherits
 *  the privacy of its destination") is what governs these artifacts once the run is saved. */
export function buildArtifacts(stages: PipelineStage[], outputs: Record<number, string>, staleNs: Set<number>): ArtifactResult[] {
  return stages
    .filter((s) => outputs[s.n]?.trim())
    .map((s) => ({
      type: s.produces.type,
      destination: s.produces.destination,
      ref: `stage-${s.n}`,
      stale: staleNs.has(s.n),
    }));
}
