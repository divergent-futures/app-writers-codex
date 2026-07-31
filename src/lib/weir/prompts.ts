/* Weir Matrix — mode prompts (writers-codex-weir-module.md §8).
 *
 * Copy-paste fallback path: with no LLM key configured, the Workshop shows the mode's full prompt
 * for the writer to run in their own AI, then parses the pasted result (see parse.ts). To make the
 * paste-back parseable regardless of how the AI formats its prose, every prompt ends by requiring a
 * fenced ```json block as the last thing in the reply — a small addition to the spec's reference
 * prompts, purely for round-tripping.
 *
 * Science mode is the canonical v2.1 prompt (weir-scoring-prompt-v2.md) with the licence-ledger
 * block injected per project at build time — the Cosmos L1/L2 roots are NOT hardcoded here; a
 * project with no ledger gets a neutral placeholder (module handoff constraint).
 */

import type { WeirMode } from './verdict';

const JSON_TAIL = `

FINALLY — after everything above, output ONE fenced json code block as the very LAST thing in your reply, in exactly this shape (axis values are numbers 0-10; gate values are "PASS" or "FAIL"):

\`\`\`json
{ "tier": "…", "axes": { "AxisName": 0 }, "gates": { "GateName": "PASS" }, "fix": "…" }
\`\`\``;

const IDEA_PROMPT = `Score the following story idea against the Weir Matrix (Idea mode) and return a verdict. Be an honest editor, not an encourager — find the load-bearing weakness and name it. Do not flatter.

TIER: I0 Vibe (a mood, not yet an idea) / I1 Familiar (known shape, no fresh turn) / I2 Turned (known shape with one genuine fresh angle) / I3 Distinctive (original and load-bearing) / I4 Overloaded (too many ideas; split or prune).

SIX AXES, 0-10 each: Clarity (statable in one sentence with no "somehow") · Freshness (avoids the first, most obvious version of itself) · Stakes (something at risk a reader will care about) · Specificity (concrete and particular, not generic) · Generativity (does it MAKE more story — scenes, conflicts, questions?) · Tension (a real cost, obstacle, or contradiction — two forces that can't both win).

FIVE GATES, PASS/FAIL (any FAIL → REWORK): Legible (a stranger could restate it correctly after one read) · Not-the-obvious (more than the first thing anyone would think of) · Wanting (someone wants something, for a reason a reader can feel) · Opposition (genuine resistance, not a free win) · Pays-off (could actually resolve into something, not just pose a mood).

Return, in order: Tier · the six axis scores with a ≤10-word reason each · total /60 · each gate PASS/FAIL with a one-line reason · VERDICT (REWORK on any gate fail; otherwise ACCEPT ≥48 / USABLE 36-47 / REWRITE 24-35 / CUT <24) · then THE ONE FIX — the single highest-leverage change, specific to this idea, in 2-3 sentences. Prefer a fix that tightens what's there over one that adds more.

THE IDEA:
{{INPUT}}${JSON_TAIL}`;

const PROSE_PROMPT = `Score the following passage against the Weir Matrix (Prose mode) and return a verdict. Be an honest editor, not an encourager — find the load-bearing weakness and name it. Do not flatter.

TIER: P0 Placeholder / P1 Functional / P2 Clean / P3 Alive / P4 Overwrought-or-Murky.

SIX AXES, 0-10: Clarity · Concreteness · Momentum · Voice · Economy · Show/Tell balance.

FIVE GATES, PASS/FAIL (any FAIL → REWORK): Reads-clean · No-cliché-crutch · Earns-its-length · Concrete-anchor · Consistent (POV/tense/tone).

Return, in order: Tier · the six axis scores with a ≤10-word reason each · total /60 · each gate PASS/FAIL with a one-line reason · VERDICT (using the clean mapping: REWORK on any gate fail; otherwise ACCEPT ≥48 / USABLE 36-47 / REWRITE 24-35 / CUT <24) · then THE ONE FIX — the single highest-leverage change, specific to this passage, in 2-3 sentences. Prefer a fix that tightens what's there over one that adds more.

THE PASSAGE:
{{INPUT}}${JSON_TAIL}`;

const NO_LEDGER_BLOCK = `**Current root licences:** none — this project has no licence ledger loaded. Treat every root impossibility as potentially NEW and judge G2 One-Lie accordingly: a new root must be justified at universe level or refused.`;

const SCIENCE_PROMPT = `Score the following story element against the Weir Process and return **one matrix-ready row**. Be an honest, adversarial editor. Do not flatter. Compute at least one real order-of-magnitude number. Prefer deriving from an existing root licence over granting a new one.

{{LICENCE_BLOCK}}

**TIER**
Pick exactly one: T0 Established / T1 Extrapolated / T2 Speculative-consistent / T3 Declared licence / T4 Hand-wave.

**SIX AXES (0-10 each)**
1. Anchor — real scientific referent?
2. Mechanism — causal chain in 3-5 steps, no "somehow"?
3. Conservation — do energy/mass/momentum/information budgets balance **with numbers**? (Load-bearing)
4. Cost & Limit — what it cannot do / what it costs / what defeats it? (Load-bearing)
5. Consequence — second- and third-order effects on world, economy, biology, politics?
6. Failure Mode — how it breaks, ideally with a rate; has it already cost the story something?

**Calibration anchors (use these to stay consistent):**
- Conservation 2-3: no budget or off by ≥10^10.
- Conservation 6-7: budget attempted, roughly plausible, key term still soft.
- Conservation 9-10: budget closes with stated assumptions **and** the shortfall/surplus already explains a story constraint.
- Cost & Limit 9-10: all three (limit / cost / counter) answered **and** at least one has generated (or clearly can generate) a scene.
- Failure Mode 9-10: specific failure with rate **and** it has already cost the story something (or is designed to).

**FIVE GATES (any single FAIL → REWORK regardless of score)**
- G1 Conservation: no free energy/mass/information; entanglement cannot signal; FTL requires declared preferred frame or equivalent.
- G2 One-Lie: does it need a **NEW** root impossibility? Check against the licence block above. If yes, justify at universe level or refuse.
- G3 Universality: why does this not trivially solve the other major problems in the story? Name the reason.
- G4 Numbers: give at least one explicit order-of-magnitude figure (J, W, K, kg, m, s, Sv…). Show the calculation or first-principles basis.
- G5 Expert: would the domain expert find an undeclared error or a properly declared licence?

**POSSIBILITY**
Possible now / Engineering only / Not under known physics.

**LICENCE**
None / Derives from existing (name which) / NEW licence (name the law it breaks and why it cannot derive from the roots above).

**VERDICT MAPPING (clean, no collision)**
- Any gate FAIL → **REWORK** (regardless of total)
- All gates PASS and total ≥ 48 → **ACCEPT**
- All gates PASS and total 36-47 → **USABLE**
- All gates PASS and total 24-35 → **REWRITE**
- All gates PASS and total < 24 → **CUT**

**OUTPUT FORMAT — return EXACTLY in this order, pipe-separated:**

Element | Domain | Tier | Anchor | Mechanism | Conservation | Cost&Limit | Consequence | FailureMode | G1 | G2 | G3 | G4 | G5 | Possibility | Licence | DerivesFrom | Highest-leverage fix

Then, **below the row**, in plain prose:

1. The single highest-leverage fix (2-4 sentences). Prefer a fix that derives from an existing licence or tightens the existing mechanism over adding new capability.
2. The explicit calculation or number you used for Conservation / G4 (show working).
3. Any Protocol notes if the element is a species or culture (dominant sensory channel for the medium, technological asymmetry, what kills them / what they cannot perceive).
4. The verdict under the clean mapping above, and whether the element can be re-scored after the recommended fix.

**Rules**
- Compute; do not gesture.
- Never fabricate a paper. If you use a real result, name it. If you compute from first principles, say so.
- Far-future fiction may sit at "Not under known physics," but only as a **named, derived** licence.
- If the element fails any gate, the verdict is REWORK even if the total is high.

**THE ELEMENT TO SCORE:**
{{INPUT}}${JSON_TAIL}`;

/** Build the full copy-paste prompt for a mode. `ledger` is the per-project licence block for
 *  Science mode (markdown, pasted or project-derived); omitted/empty → neutral no-ledger block. */
export function buildPrompt(mode: WeirMode, input: string, ledger?: string): string {
  const text = input.trim() || '[paste your material here]';
  if (mode === 'idea') return IDEA_PROMPT.replace('{{INPUT}}', text);
  if (mode === 'prose') return PROSE_PROMPT.replace('{{INPUT}}', text);
  const block = ledger?.trim()
    ? `**Current root licences (project licence ledger):**\n${ledger.trim()}`
    : NO_LEDGER_BLOCK;
  return SCIENCE_PROMPT.replace('{{LICENCE_BLOCK}}', block).replace('{{INPUT}}', text);
}
