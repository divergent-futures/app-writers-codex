/* The Craft Registry — the prompt layer (design §3.11, Phase 3.5).
 *
 * "If every instrument needs a hand-engineered prompt, then 'a framework reusing existing parts is
 * data' is only true of the structure, and composition buys less than §3.1 claims." So the prompt is
 * generated — from the same `parts[]` every other piece of the registry already reads — with an
 * escape hatch for instruments (like weir-science) whose prompt has already been hardened by hand and
 * shouldn't be displaced by a generic one.
 *
 * `generatePrompt()` is the floor: a competent prompt for ANY registered system, including one a user
 * authors from scratch in Phase 9, with zero prompt engineering. `resolvePrompt()` is what call sites
 * should actually use — it returns the canonical override when one is declared, and only falls back to
 * generation otherwise. "Generation is the floor, not the ceiling" (§3.11).
 */

import type { AxesPart, BandsPart, FieldsPart, GatesPart, LadderPart, StepsPart } from './parts';
import type { CraftSystem } from './types';

function section(title: string, body: string): string {
  return `**${title}**\n${body}`;
}

function ladderSection(part: LadderPart): string {
  const lines = part.tiers.map((t) => `- ${t.code} ${t.label}${t.banned ? ' (NOT PERMITTED)' : ''}${t.description ? ` — ${t.description}` : ''}`);
  return section('TIER', `Pick exactly one:\n${lines.join('\n')}`);
}

function axesSection(part: AxesPart): string {
  const lines = part.axes.map((a) => {
    const anchors = (a.bands ?? []).map((b) => `  - ${b.min}–${b.max}: ${b.anchor}`).join('\n');
    return `- ${a.label} (0–${a.max}) — ${a.question}${a.loadBearing ? ' [load-bearing]' : ''}${anchors ? `\n${anchors}` : ''}`;
  });
  const totalNote = part.total != null ? `\n\nTotal /${part.total}.` : '\n\n(Descriptive — no total, no verdict. Report each score with a one-line reason.)';
  return section(`${part.axes.length} AXES (0–${part.axes[0]?.max ?? 10} each)`, `${lines.join('\n')}${totalNote}`);
}

function gatesSection(part: GatesPart): string {
  const lines = part.gates.map((g) => `- ${g.label} — ${g.test}`);
  const overrideNote = part.gates.every((g) => g.onFail === 'REWORK') ? '\n\nAny single FAIL → REWORK, regardless of score.' : '';
  return section(`${part.gates.length} GATES`, `${lines.join('\n')}${overrideNote}`);
}

function bandsSection(part: BandsPart): string {
  const lines = part.bands.map((b) => `- ${b.min}${b.max >= 100 ? '+' : `–${b.max}`} → ${b.verdict}`);
  return section('VERDICT MAPPING', `If any gate fails → ${part.gateOverride}, regardless of total. Otherwise, by total:\n${lines.join('\n')}`);
}

function fieldsSection(part: FieldsPart): string {
  const lines = part.fields.map((f) => `- ${f.label}${f.required ? '' : ' (optional)'}: ${f.options.join(' / ')}`);
  return section('FIELDS', lines.join('\n'));
}

function stepsSection(part: StepsPart): string {
  const lines = part.steps.map((s) => `${s.n}. ${s.name}${s.optional ? ' (optional)' : ''} — ${s.prompt}`);
  const note = part.ordered ? 'Walk these in order.' : 'Order does not matter.';
  const completenessNote =
    part.completeness === 'all'
      ? 'All steps are expected to be present.'
      : part.completeness === 'subset'
        ? 'A subset is the normal case — do not treat a partial pass as a failure.'
        : 'Presence is not scored at all here.';
  return section('STEPS', `${note} ${completenessNote}\n${lines.join('\n')}`);
}

/** Renders a competent prompt from `system.parts` alone. This is the floor every registered
 *  instrument gets for free, including ones nobody has hand-tuned. See `resolvePrompt()` below for
 *  the function call sites should actually use. */
export function generatePrompt(system: CraftSystem): string {
  const sections: string[] = [
    `Score the following ${system.target.types.join('/') || 'element'} against ${system.name} — ${system.question} Be an honest, adversarial editor. Do not flatter.`,
  ];

  const has = new Set(system.parts.map((p) => p.kind));

  for (const part of system.parts) {
    if (part.kind === 'ladder') sections.push(ladderSection(part));
    else if (part.kind === 'axes') sections.push(axesSection(part));
    else if (part.kind === 'gates') sections.push(gatesSection(part));
    else if (part.kind === 'bands') sections.push(bandsSection(part));
    else if (part.kind === 'fields') sections.push(fieldsSection(part));
    else if (part.kind === 'steps') sections.push(stepsSection(part));
    // sequenceMetric / spanLocator / pipeline / entries / notes have no generic prose rendering yet —
    // the systems that use them (parker-stone, the generators) aren't registered until Phases 6-7, so
    // there is nothing to prove this against yet. Extend here when one lands, not speculatively now.
  }

  if (system.rules?.length) {
    sections.push(section('RULES', system.rules.map((r) => `- ${r}`).join('\n')));
  }

  // Built from what this system actually has, not a fixed template — a lens with no ladder/gates/
  // fields (sanderson-board) shouldn't be told to report a tier, gate results, or field values that
  // don't exist. Same declare-don't-default spirit as the rest of the model: don't generate boilerplate
  // that implies a shape the instrument doesn't have.
  const outputParts: string[] = [];
  if (has.has('ladder')) outputParts.push('tier');
  if (has.has('axes')) outputParts.push('each axis score with a one-line reason');
  if (has.has('axes') && (system.parts.find((p): p is AxesPart => p.kind === 'axes')?.total != null)) outputParts.push('total');
  if (has.has('gates')) outputParts.push('each gate PASS/FAIL with a one-line reason');
  if (has.has('fields')) outputParts.push('each field value');
  if (has.has('steps')) outputParts.push('each step, present or absent, and who/what fills it');
  outputParts.push(has.has('bands') ? 'VERDICT' : 'a short summary of what this run found');
  outputParts.push('the single highest-leverage fix, specific to this material');

  sections.push(section('OUTPUT FORMAT', `Return, in order: ${outputParts.join(' · ')}.`));

  return sections.join('\n\n');
}

export type ResolvedPrompt =
  | { source: 'canonical'; ref: string; note?: string }
  | { source: 'generated'; text: string };

/** What every call site should actually use. Returns the canonical override when the instrument
 *  declares one (§3.11: "nothing generated should displace it") — otherwise falls back to
 *  `generatePrompt()`. The override case intentionally does NOT return generated text alongside the
 *  ref: the whole point of a canonical prompt is that it lives in its own hardened doc, not as a
 *  second, silently-drifting copy inside app source. */
export function resolvePrompt(system: CraftSystem): ResolvedPrompt {
  if (system.promptOverride) {
    return { source: 'canonical', ref: system.promptOverride.ref, note: system.promptOverride.note };
  }
  return { source: 'generated', text: generatePrompt(system) };
}
