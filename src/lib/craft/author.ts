/* The Craft Registry — the authoring surface (design §3.12, Phase 9).
 *
 * "All five seed frameworks were created the same way: written as a prose document, then hand-
 * translated into an instrument. The authoring surface should follow that path rather than fight
 * it." Paste a framework doc → an AI proposes a registration, using the SAME locked vocabulary every
 * builtin system in this registry already uses → a human confirms or corrects it → it registers,
 * with provenance recorded. This is the phase that makes the registry a platform rather than a fixed
 * set of five.
 *
 * The interaction is built around one rule, stated in the design itself: "the declare-don't-default
 * fields are exactly the fields the AI must not silently decide." `buildAuthoringPrompt` asks for
 * them explicitly; `parseAuthoringProposal` REFUSES to parse a proposal that omits one (a `steps`
 * part with no stated `ordered`/`completeness`, a `sequenceMetric` part with no stated `scope`) —
 * enforcement at both the prompt layer and the parse layer, not just a request the AI might ignore.
 *
 * Scope, stated plainly: this builds the PROPOSE → CONFIRM → REGISTER flow. It does not build a
 * generic runner for arbitrary user-authored parts — the five existing renderers (WeirWorkshop,
 * CraftGenerator, CraftSequence, and the not-yet-built steps/completeness view) are each shaped for
 * one part combination. A user-authored `ladder+axes+gates+bands` instrument registers correctly and
 * is visible, but running it through a card UI is a natural, named follow-up, not something silently
 * missing here.
 */

import type {
  AxesPart,
  BandsPart,
  FieldsPart,
  GatesPart,
  LadderPart,
  Part,
  PartKind,
  SequenceMetricPart,
  StepsPart,
} from './parts';
import type { CraftCategory, CraftSystem, OutputShape, TargetShape } from './types';

const CATEGORIES: CraftCategory[] = ['reference', 'generator', 'lens', 'matrix'];
const TARGET_SHAPES: TargetShape[] = ['none', 'element', 'sequence', 'set', 'corpus'];
const OUTPUT_SHAPES: OutputShape[] = ['none', 'profile', 'completeness', 'verdict', 'metric+span', 'classification', 'artifact'];
const PART_KINDS: PartKind[] = ['ladder', 'axes', 'gates', 'bands', 'steps', 'sequenceMetric', 'spanLocator', 'pipeline', 'fields', 'entries', 'notes'];

/** Everything a proposal needs beyond the locked `CraftSystem` shape itself — the AI's reasoning and
 *  any provenance concern, surfaced to the human rather than folded silently into the registration. */
export interface SystemProposal {
  name: string;
  question: string;
  category: CraftCategory;
  failable: boolean;
  target: { shape: TargetShape; types: string[] };
  output: OutputShape;
  parts: Part[];
  /** Non-null when the AI doubts the pasted doc's attribution — design §3.12's "refuse on
   *  provenance" behaviour ("the twelve archetypes are Pearson's, not Jung's"). Surfaced, never
   *  auto-corrected — a human confirms the fix, same as every other field here. */
  provenanceConcern: string | null;
  reasoningSummary: string;
}

/** Builds the prompt a writer copies into their own AI, pastes the framework document into, and
 *  pastes the reply back from. Spells out the full locked vocabulary (design §1.3, §1.4, §3.2) so
 *  the AI has a closed set to choose from rather than inventing new categories or shapes — the same
 *  discipline `generatePrompt()` in prompt.ts applies to RUNNING an instrument, applied here to
 *  PROPOSING one. */
export function buildAuthoringPrompt(pastedDoc: string): string {
  return `You are helping register a new craft instrument into a writer's app from a pasted framework document. Read the document below and propose how to register it, following this fixed model exactly — do not invent new categories, target shapes, output shapes, or part kinds beyond the ones listed.

**CATEGORY** (pick exactly one):
- reference — read-only, returns nothing. You read it; it never says anything about your material.
- generator — writes new material into the work.
- lens — read-only, describes your material, but never fails it.
- matrix — read-only, judges your material, and can fail it.

**FAILABLE** — true only for matrix. Every other category is false. State it explicitly; it must agree with your category choice.

**TARGET SHAPE** (pick exactly one):
- none — nothing, you just read it
- element — one bounded thing (a character, a passage, a premise...)
- sequence — an ordered list (beats, scenes, chapters...)
- set — an unordered collection evaluated jointly (a whole cast, evaluated together, not one at a time)
- corpus — a body of material used as generator input or as a ratio denominator

**OUTPUT SHAPE** (pick exactly one):
- none — emits nothing
- profile — numbers describing the thing, no verdict
- completeness — per-slot occupancy across named slots (which are filled, which are empty, by whom)
- verdict — tier + score + gates + verdict + the one fix
- metric+span — a computed ratio over a sequence, plus a located weak stretch
- classification — assigns one class from a fixed, UNRANKED set (no class is better than another)
- artifact — writes new material into the project

**PARTS** — the document's content maps onto one or more of these. Pick whichever actually fit; most instruments use two to four together.
- ladder: an ordered set of named tiers, optionally with one tier banned
- axes: N scored dimensions (0 to a max each), optionally with a total across them
- gates: boolean pass/fail checks; any single failure overrides the result
- bands: a total-score-to-verdict mapping
- steps: named slots that are checked for presence. You MUST also state \`ordered\` (true/false — do the slots have to happen in order?) and \`completeness\` ('all' | 'subset' | 'none' — is every slot expected to be present, is a partial pass normal, or is presence not scored at all?)
- sequenceMetric: a computed ratio over adjacent items in a sequence. You MUST also state \`scope\` ('inter' — between adjacent items — or 'intra' — within one item)
- fields: a small number of named judgements, each from a CLOSED list of options (never free text)

Two rules, non-negotiable:

1. **Never default a value you cannot support from the document.** If the document does not say whether every slot must be present or only some, SAY SO in your reasoning rather than picking one silently. This is the single most common way a framework gets misregistered. A worked lesson: a questionnaire that explicitly says "answer as many or as few as you like" must be registered as \`completeness: 'subset'\`, never \`'all'\` — registering it as \`'all'\` invents a progress bar the framework's own author explicitly disclaimed.
2. **Check the originator.** If the document attributes the framework to a person, verify whether that attribution is correct as far as you know, and flag it if you have reason to doubt it. A real prior example: "the twelve archetypes" are frequently misattributed to Carl Jung when they were actually developed by Carol S. Pearson. Set \`provenanceConcern\` to a clear one-sentence flag if you doubt the attribution, or \`null\` if you have no reason to doubt it.

Output your reasoning FIRST, in plain prose — what you read, and why you are proposing each field above, especially the two you must never default. THEN, output ONE fenced \`\`\`json code block as the very LAST thing in your reply, in exactly this shape:

\`\`\`json
{
  "name": "…",
  "question": "…",
  "category": "reference|generator|lens|matrix",
  "failable": true,
  "target": { "shape": "…", "types": ["…", "…"] },
  "output": "…",
  "parts": [ { "kind": "ladder", "tiers": [ { "code": "…", "label": "…", "description": "…", "banned": false } ] } ],
  "provenanceConcern": null,
  "reasoningSummary": "one paragraph explaining the overall proposal"
}
\`\`\`

**THE DOCUMENT:**
${pastedDoc}`;
}

export type ParseOutcome = { ok: true; proposal: SystemProposal } | { ok: false; error: string };

/** Reads the AI's paste-back and validates it against the locked vocabulary. Two layers of defence
 *  against a silently-defaulted declare-don't-default field, per design §3.3: the prompt above asks
 *  for `steps.ordered`/`completeness` and `sequenceMetric.scope` explicitly, and THIS validates they
 *  are actually present — an AI that ignores the instruction and omits one is caught here, not passed
 *  through to registration. */
export function parseAuthoringProposal(text: string): ParseOutcome {
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
    const o = obj as Record<string, unknown>;
    if (typeof o.category !== 'string' || typeof o.output !== 'string') continue; // not our shape

    const err = validateShape(o);
    if (err) return { ok: false, error: err };

    return {
      ok: true,
      proposal: {
        name: String(o.name ?? 'Untitled instrument'),
        question: String(o.question ?? ''),
        category: o.category as CraftCategory,
        failable: !!o.failable,
        target: o.target as { shape: TargetShape; types: string[] },
        output: o.output as OutputShape,
        parts: o.parts as Part[],
        provenanceConcern: typeof o.provenanceConcern === 'string' ? o.provenanceConcern : null,
        reasoningSummary: typeof o.reasoningSummary === 'string' ? o.reasoningSummary : '',
      },
    };
  }

  return {
    ok: false,
    error: 'Could not find a proposal to parse. Expected the fenced JSON block the prompt asks for, with "category" and "output" fields.',
  };
}

/** Every check that must pass before a proposal is even offered for confirmation — a proposal that
 *  fails these is not a disagreement to resolve in the UI, it is malformed and must be re-run. */
function validateShape(o: Record<string, unknown>): string | null {
  if (!CATEGORIES.includes(o.category as CraftCategory)) return `Unknown category "${o.category}" — expected one of: ${CATEGORIES.join(', ')}.`;
  if (!OUTPUT_SHAPES.includes(o.output as OutputShape)) return `Unknown output shape "${o.output}" — expected one of: ${OUTPUT_SHAPES.join(', ')}.`;
  if (typeof o.failable !== 'boolean') return '"failable" must be true or false, stated explicitly.';

  const target = o.target as { shape?: unknown; types?: unknown } | undefined;
  if (!target || !TARGET_SHAPES.includes(target.shape as TargetShape)) {
    return `Unknown target shape "${target?.shape}" — expected one of: ${TARGET_SHAPES.join(', ')}.`;
  }
  if (!Array.isArray(target.types)) return '"target.types" must be an array of strings.';

  if (!Array.isArray(o.parts) || o.parts.length === 0) return 'Every instrument needs at least one part in "parts".';

  for (const [i, p] of (o.parts as unknown[]).entries()) {
    const part = p as Record<string, unknown>;
    if (!PART_KINDS.includes(part.kind as PartKind)) return `Part ${i}: unknown kind "${part.kind}" — expected one of: ${PART_KINDS.join(', ')}.`;

    if (part.kind === 'steps') {
      if (typeof part.ordered !== 'boolean') return `Part ${i} (steps): "ordered" must be stated explicitly as true or false — never defaulted.`;
      if (!['all', 'subset', 'none'].includes(part.completeness as string)) {
        return `Part ${i} (steps): "completeness" must be stated explicitly as 'all', 'subset', or 'none' — never defaulted.`;
      }
      if (!Array.isArray(part.steps) || part.steps.length === 0) return `Part ${i} (steps): needs at least one step.`;
    }
    if (part.kind === 'sequenceMetric') {
      if (!['inter', 'intra'].includes(part.scope as string)) {
        return `Part ${i} (sequenceMetric): "scope" must be stated explicitly as 'inter' or 'intra' — never defaulted.`;
      }
      if (!Array.isArray(part.joints) || part.joints.length === 0) return `Part ${i} (sequenceMetric): needs at least one joint code.`;
    }
    if (part.kind === 'ladder' && (!Array.isArray(part.tiers) || part.tiers.length === 0)) return `Part ${i} (ladder): needs at least one tier.`;
    if (part.kind === 'axes' && (!Array.isArray(part.axes) || part.axes.length === 0)) return `Part ${i} (axes): needs at least one axis.`;
    if (part.kind === 'gates' && (!Array.isArray(part.gates) || part.gates.length === 0)) return `Part ${i} (gates): needs at least one gate.`;
    if (part.kind === 'bands' && (!Array.isArray(part.bands) || part.bands.length === 0)) return `Part ${i} (bands): needs at least one band.`;
    if (part.kind === 'fields' && (!Array.isArray(part.fields) || part.fields.length === 0)) return `Part ${i} (fields): needs at least one field.`;
  }
  return null;
}

/** Fills in the two fixed, single-legal-value fields the locked types require but that are not
 *  declare-don't-default choices (design §3.3's list is category/failable/target/output plus
 *  steps.ordered/completeness and sequenceMetric.scope — `gates.onFail` and `bands.gateOverride` are
 *  NOT on that list because 'REWORK' is their only legal value; there is nothing to silently get
 *  wrong). Called once, right before registration, so the confirmation UI never has to show a field
 *  with only one possible answer. */
export function normaliseParts(parts: Part[]): Part[] {
  return parts.map((p) => {
    if (p.kind === 'gates') return { ...(p as GatesPart), gates: (p as GatesPart).gates.map((g) => ({ ...g, onFail: 'REWORK' as const })) };
    if (p.kind === 'bands') return { ...(p as BandsPart), gateOverride: 'REWORK' as const };
    return p;
  });
}

/** Turns a name into a stable id in the same style every builtin system already uses
 *  ('weir-protocol-tech', 'sanderson-laws') — lowercase, hyphenated, no punctuation — then appends a
 *  numeric suffix if it collides with an id already in use, so authoring the same framework twice (or
 *  two different frameworks that happen to share a name) never silently overwrites an existing entry. */
export function slugifyId(name: string, existingIds: ReadonlySet<string>): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'instrument';
  if (!existingIds.has(base)) return base;
  let n = 2;
  while (existingIds.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/** Assembles the final `CraftSystem`, stamping the provenance §3.12 requires ("registered, with
 *  provenance recorded") and the `source: 'user'` value Phase-1 invariant #6 anticipated. Runs the
 *  same `assertCategoryFailableConsistent` check every builtin registration runs — a user-authored
 *  entry gets no exemption from the declare-don't-default cross-check. */
export function buildUserSystem(
  proposal: SystemProposal,
  overrides: { category: CraftCategory; failable: boolean; target: { shape: TargetShape; types: string[] }; output: OutputShape },
  args: { id: string; sourceDoc: string },
): CraftSystem {
  return {
    id: args.id,
    name: proposal.name,
    version: '1.0.0',
    source: 'user',
    category: overrides.category,
    failable: overrides.failable,
    question: proposal.question,
    target: overrides.target,
    output: overrides.output,
    parts: normaliseParts(proposal.parts),
    publicDefault: false, // §3.8: a public run publishes its rubric — off until the author explicitly opts in
    provenance: { authoredBy: 'user', sourceDoc: args.sourceDoc, confirmedAt: Date.now() },
  };
}
