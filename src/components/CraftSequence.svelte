<script lang="ts">
  /* The Craft Registry — Parker–Stone stage runner: the "annotated joints + dead run" renderer
   * design §3.9's table names for `sequenceMetric` + `spanLocator` systems (Phase 7). Same copy-paste
   * discipline as WeirWorkshop.svelte and CraftGenerator.svelte: paste the material, copy the
   * generated prompt, run it in your own AI, paste the reply back. See src/lib/craft/sequence.ts for
   * the parsing, density/ratio computation, and dead-run location this component is a thin UI over,
   * and src/lib/craft/prompt.ts's `sequenceMetricSection`/`spanLocatorSection` for how the prompt
   * itself is generated from the registered system's own declared parts.
   *
   * Not hardcoded to parker-stone: it runs whatever registered system declares a `sequenceMetric`
   * part (today, only parker-stone — see the module comment on src/lib/craft/registry.ts's
   * PARKER_STONE entry for why the engine underneath isn't written as if that will always be true).
   */
  import { app } from '../lib/stores/app.svelte';
  import { listCraftRuns, putCraftRun } from '../lib/db';
  import { resolveRunPrivacy } from '../lib/craft/privacy';
  import { resolvePrompt } from '../lib/craft/prompt';
  import { listSystems } from '../lib/craft/registry';
  import {
    bandsPartOf,
    computeMetric,
    computeSecondaryRatio,
    locateLongestDeadRun,
    parseSequenceResult,
    sequenceMetricPartOf,
    spanLocatorPartOf,
    validateJoints,
    verdictFor,
    type SequenceCard,
  } from '../lib/craft/sequence';
  import type { CraftRun, CraftSystem } from '../lib/craft/types';

  const SEQUENCE_SYSTEMS: CraftSystem[] = listSystems().filter((s) => sequenceMetricPartOf(s));
  const system = SEQUENCE_SYSTEMS[0];
  const metricPart = sequenceMetricPartOf(system)!;
  const bandsPart = bandsPartOf(system)!;
  // spanLocatorPartOf(system) is asserted present by registration (parker-stone always pairs the
  // two) but not otherwise read here — locateLongestDeadRun reads dead-ness off metricPart directly.
  void spanLocatorPartOf(system);

  const VERDICT_COLOR: Record<string, 'green' | 'amber' | 'red'> = {
    ACCEPT: 'green',
    USABLE: 'amber',
    REWRITE: 'red',
    CUT: 'red',
  };

  let open = $state(false);
  let title = $state('');
  let input = $state('');
  let pasted = $state('');
  let card = $state<SequenceCard | null>(null);
  let parseError = $state<string | null>(null);
  let copied = $state(false);
  let saved = $state(false);
  let history = $state<CraftRun[]>([]);

  const metric = $derived(card ? computeMetric(card.joints, metricPart) : null);
  const span = $derived(card ? locateLongestDeadRun(card.joints, metricPart) : null);
  const ratio = $derived(card ? computeSecondaryRatio(card.joints, metricPart) : null);
  const verdict = $derived(metric ? verdictFor(metric.density, bandsPart) : null);

  async function toggle() {
    open = !open;
    if (open) await refreshHistory();
  }

  async function refreshHistory() {
    if (!app.active) {
      history = [];
      return;
    }
    const all = await listCraftRuns(app.active.id);
    history = all.filter((r) => r.systemId === system.id);
  }

  function fullPrompt(): string {
    const resolved = resolvePrompt(system);
    const base = resolved.source === 'generated' ? resolved.text : `(Using canonical prompt: ${resolved.ref}${resolved.note ? ' — ' + resolved.note : ''})`;
    return `${base}\n\n**THE MATERIAL**\n${input}`;
  }

  async function copyPrompt() {
    const text = fullPrompt();
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      window.prompt('Copy the prompt below:', text);
    }
  }

  function parse() {
    saved = false;
    const r = parseSequenceResult(pasted);
    if (!r.ok) {
      card = null;
      parseError = r.error;
      return;
    }
    const jointsErr = validateJoints(r.card.joints, metricPart);
    if (jointsErr) {
      card = null;
      parseError = jointsErr;
      return;
    }
    card = r.card;
    parseError = null;
  }

  async function save() {
    if (!card || !metric || !verdict || !app.active) return;
    const run: CraftRun = {
      id: crypto.randomUUID(),
      projectId: app.active.id,
      systemId: system.id,
      systemVersion: system.version,
      targetType: null,
      targetId: null,
      title: title.trim() || `${system.name} — ${new Date().toLocaleDateString()}`,
      results: {
        metric,
        spans: span ? [span] : [],
        verdict,
        notes: card.fix,
      },
      passRuns: [],
      fix: card.fix ?? '',
      isPublic: resolveRunPrivacy(system),
      createdAt: Date.now(),
    };
    await putCraftRun(run);
    saved = true;
    await refreshHistory();
  }

  function reset() {
    title = '';
    input = '';
    pasted = '';
    card = null;
    parseError = null;
    saved = false;
  }

  function jointLabel(code: string): string {
    return metricPart.joints.find((j) => j.code === code)?.label ?? code;
  }
  function jointAlive(code: string): boolean {
    return metricPart.joints.find((j) => j.code === code)?.alive ?? false;
  }
  function inDeadSpan(jointIndex: number): boolean {
    return !!span && jointIndex >= span.startIndex && jointIndex <= span.endIndex;
  }
</script>

<button class="seq-fab" onclick={toggle} title="Parker–Stone Sequence">🔗 Sequence</button>

{#if open}
  <div class="panel">
    <div class="head">
      <strong>{system.name}</strong>
      <button class="x" onclick={toggle}>✕</button>
    </div>
    <p class="q">{system.question}</p>

    <label class="lbl" for="seq-title">Label (optional)</label>
    <input id="seq-title" type="text" bind:value={title} placeholder="What sequence is this?" />

    <label class="lbl" for="seq-input">The material</label>
    <textarea id="seq-input" rows="6" bind:value={input} placeholder="Paste the outline, beat sheet, chapter, scene, passage, or derivation…"></textarea>

    <div class="row">
      <button class="btn" onclick={copyPrompt} disabled={!input.trim()}>{copied ? 'Copied ✓' : 'Copy prompt'}</button>
      <span class="hint">Run it in your own AI, then paste the result:</span>
    </div>

    <textarea rows="5" bind:value={pasted} placeholder="Paste the AI's full reply here…"></textarea>
    <div class="row">
      <button class="btn" onclick={parse} disabled={!pasted.trim()}>Parse result</button>
      {#if parseError}<span class="err">{parseError}</span>{/if}
      {#if card}<button class="btn" onclick={reset}>Start over</button>{/if}
    </div>

    {#if card && metric && verdict}
      <div class="card">
        <div class="cardhead">
          <span class="density">density {metric.density.toFixed(2)}</span>
          {#if ratio}<span class="ratio">{ratio.label} {ratio.a}:{ratio.b}</span>{/if}
          <span class="verdict {VERDICT_COLOR[verdict] ?? 'amber'}">⟶ {verdict}</span>
        </div>

        {#if span}
          <div class="spanbadge">⚠ longest dead run: beats {span.startIndex + 1}–{span.endIndex + 2} — this is the repair priority</div>
        {:else}
          <div class="spanok">No dead run found — every joint is alive.</div>
        {/if}

        <div class="joints">
          {#each card.beats as beat, i (i)}
            <div class="beat">{i + 1}. {beat}</div>
            {#if i < card.joints.length}
              <div
                class="joint"
                class:alive={jointAlive(card.joints[i])}
                class:dead={!jointAlive(card.joints[i])}
                class:inspan={inDeadSpan(i)}
              >
                {jointLabel(card.joints[i])}
              </div>
            {/if}
          {/each}
        </div>

        {#if card.fix}
          <div class="fix"><strong>The one fix</strong><br />{card.fix}</div>
        {/if}

        <div class="row">
          <button class="btn" onclick={save} disabled={saved || !app.active}>{saved ? 'Saved ✓' : 'Save run'}</button>
          {#if !app.active}<span class="hint">Open a project to save.</span>{/if}
        </div>
      </div>
    {/if}

    {#if history.length}
      <div class="hist">
        <strong>History — {app.active?.name}</strong>
        {#each history.slice(0, 8) as h (h.id)}
          <div class="histrow">
            <span class="verdict {VERDICT_COLOR[h.results.verdict ?? ''] ?? 'amber'}">{h.results.verdict}</span>
            <span class="histdensity">{h.results.metric ? h.results.metric.density.toFixed(2) : '—'}</span>
            <span class="histtitle">{h.title}</span>
            <span class="histdate">{new Date(h.createdAt).toLocaleDateString()}</span>
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  /* Stacked above CraftGenerator's fab (right:1rem, bottom:4.4rem) by the same 3.4rem gap the Weir
   * → Generators stack already uses. */
  .seq-fab {
    position: fixed;
    right: 1rem;
    bottom: 7.8rem;
    z-index: 40;
    padding: 0.4rem 0.7rem;
    border-radius: 999px;
    border: 1px solid var(--border, #444);
    background: var(--panel, #1c1c1e);
    color: inherit;
    cursor: pointer;
  }
  .panel {
    position: fixed;
    right: 1rem;
    bottom: 10.2rem;
    z-index: 41;
    width: min(34rem, calc(100vw - 2rem));
    max-height: min(75vh, 48rem);
    overflow-y: auto;
    padding: 0.9rem;
    border-radius: 0.6rem;
    border: 1px solid var(--border, #444);
    background: var(--panel, #1c1c1e);
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.45);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .head { display: flex; justify-content: space-between; align-items: center; }
  .x { background: none; border: none; color: inherit; cursor: pointer; font-size: 1rem; }
  .lbl { font-size: 0.75rem; color: var(--muted, #999); }
  .q { margin: 0; font-size: 0.8rem; color: var(--muted, #999); font-style: italic; }
  input, textarea {
    width: 100%;
    box-sizing: border-box;
    background: var(--bg, #111);
    color: inherit;
    border: 1px solid var(--border, #444);
    border-radius: 0.4rem;
    padding: 0.4rem;
    font: inherit;
  }
  .row { display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap; }
  .btn {
    padding: 0.35rem 0.7rem;
    border-radius: 0.4rem;
    border: 1px solid var(--border, #444);
    background: transparent;
    color: inherit;
    cursor: pointer;
  }
  .btn:disabled { opacity: 0.45; cursor: default; }
  .hint { font-size: 0.75rem; color: var(--muted, #999); }
  .err { font-size: 0.75rem; color: #e05d5d; }
  .card { border: 1px solid var(--border, #444); border-radius: 0.5rem; padding: 0.6rem; display: flex; flex-direction: column; gap: 0.5rem; }
  .cardhead { display: flex; gap: 0.8rem; align-items: baseline; flex-wrap: wrap; }
  .density { font-weight: 600; }
  .ratio { color: var(--muted, #999); font-size: 0.85rem; }
  .verdict { font-weight: 700; }
  .verdict.green { color: #4caf7d; }
  .verdict.amber { color: #d9a441; }
  .verdict.red { color: #e05d5d; }
  .spanbadge { font-size: 0.8rem; color: #d9a441; }
  .spanok { font-size: 0.8rem; color: var(--muted, #999); }
  .joints { display: flex; flex-direction: column; gap: 0.15rem; }
  .beat { font-size: 0.85rem; line-height: 1.35; }
  .joint {
    align-self: flex-start;
    margin: 0.1rem 0 0.1rem 1.1rem;
    padding: 0.05rem 0.5rem;
    border-radius: 999px;
    font-size: 0.72rem;
    font-weight: 600;
    border: 1px solid var(--border, #444);
  }
  .joint.alive { color: #4caf7d; border-color: #4caf7d; }
  .joint.dead { color: #e05d5d; border-color: #e05d5d; }
  .joint.inspan { background: rgba(224, 93, 93, 0.18); }
  .fix { font-size: 0.82rem; line-height: 1.35; }
  .hist { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.78rem; border-top: 1px solid var(--border, #444); padding-top: 0.5rem; }
  .histrow { display: flex; gap: 0.6rem; align-items: baseline; }
  .histdensity { color: var(--muted, #999); }
  .histtitle { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .histdate { color: var(--muted, #999); }
</style>
