<script lang="ts">
  /* The Craft Registry — Generators stage runner (design §3.9's Workshop pattern, generalised to
   * `pipeline` systems; Phase 6). Same copy-paste discipline as WeirWorkshop.svelte: pick a stage,
   * copy its prompt, run it in your own AI, paste the result back — but walking a multi-stage
   * derivation instead of a single scoring pass. See src/lib/craft/pipeline.ts for the prompt
   * assembly, staleness, and artifact-building logic this component is a thin UI over.
   *
   * Scoping note (see the Phase 6 build log for the full reasoning): a generated stage's output is
   * kept on the CraftRun itself (`results.notes`), not yet written into a real worldbuilding entity.
   * `results.artifacts[].ref` is a same-run placeholder (`stage-N`), not yet a cross-store pointer —
   * wiring an entity picker so a generator's output actually lands in `worldbuilding` (§3.5's
   * "artifacts[] ... an artifact inherits the privacy of its destination") is future work. Nothing
   * generated here is lost; it just isn't filed into an entity automatically yet.
   */
  import { app } from '../lib/stores/app.svelte';
  import { listCraftRuns, putCraftRun } from '../lib/db';
  import { resolveRunPrivacy } from '../lib/craft/privacy';
  import { pipelinePartOf, buildStagePrompt, staleAfterEdit, buildArtifacts } from '../lib/craft/pipeline';
  import { WEIR_PROTOCOL_TECH, WEIR_PROTOCOL_WORLD, WEIR_PROTOCOL_SPECIES, WEIR_PROTOCOL_CULTURE, LEGUIN_DERIVATION } from '../lib/craft/registry';
  import type { CraftRun, CraftSystem } from '../lib/craft/types';
  import type { PipelineStage } from '../lib/craft/parts';

  const GENERATORS: CraftSystem[] = [WEIR_PROTOCOL_TECH, WEIR_PROTOCOL_WORLD, WEIR_PROTOCOL_SPECIES, WEIR_PROTOCOL_CULTURE, LEGUIN_DERIVATION];

  let open = $state(false);
  let systemId = $state(GENERATORS[0].id);
  let title = $state('');
  let outputs = $state<Record<number, string>>({});
  let staleNs = $state<Set<number>>(new Set());
  let currentN = $state(1);
  let copiedN = $state<number | null>(null);
  let saved = $state(false);
  let history = $state<CraftRun[]>([]);

  const system = $derived(GENERATORS.find((g) => g.id === systemId)!);
  const stages = $derived<PipelineStage[]>(pipelinePartOf(system)?.stages ?? []);
  const currentStage = $derived(stages.find((s) => s.n === currentN) ?? stages[0]);
  const filledCount = $derived(Object.values(outputs).filter((v) => v?.trim()).length);

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
    history = all.filter((r) => r.systemId === systemId);
  }

  function switchSystem(id: string) {
    systemId = id;
    resetRun();
    void refreshHistory();
  }

  function resetRun() {
    title = '';
    outputs = {};
    staleNs = new Set();
    currentN = 1;
    saved = false;
  }

  async function copyPrompt(stage: PipelineStage) {
    const text = buildStagePrompt(stages, stage, outputs);
    try {
      await navigator.clipboard.writeText(text);
      copiedN = stage.n;
      setTimeout(() => (copiedN = null), 1500);
    } catch {
      window.prompt('Copy the prompt below:', text);
    }
  }

  function setOutput(n: number, text: string) {
    outputs = { ...outputs, [n]: text };
    // Editing this stage clears its own stale flag (addressed) and marks later filled stages stale,
    // if this stage is one whose edits cascade forward — see pipeline.ts's staleAfterEdit.
    const next = new Set(staleNs);
    next.delete(n);
    const filledNs = new Set(Object.keys(outputs).map(Number).filter((k) => outputs[k]?.trim()));
    for (const s of staleAfterEdit(stages, n, filledNs)) next.add(s);
    staleNs = next;
    saved = false;
  }

  function goto(n: number) {
    if (n >= 1 && n <= stages.length) currentN = n;
  }

  async function save() {
    if (!app.active || !filledCount) return;
    const artifacts = buildArtifacts(stages, outputs, staleNs);
    const notes = stages
      .filter((s) => outputs[s.n]?.trim())
      .map((s) => `## Stage ${s.n} — ${s.name}\n\n${outputs[s.n]}`)
      .join('\n\n---\n\n');
    const run: CraftRun = {
      id: crypto.randomUUID(),
      projectId: app.active.id,
      systemId: system.id,
      systemVersion: system.version,
      targetType: null,
      targetId: null,
      title: title.trim() || `${system.name} — ${new Date().toLocaleDateString()}`,
      results: { artifacts, notes },
      passRuns: [],
      fix: '',
      isPublic: resolveRunPrivacy(system),
      createdAt: Date.now(),
    };
    await putCraftRun(run);
    saved = true;
    await refreshHistory();
  }
</script>

<button class="gen-fab" onclick={toggle} title="Craft Generators">🛠 Generators</button>

{#if open}
  <div class="panel">
    <div class="head">
      <strong>Craft Generators · Stage Runner</strong>
      <button class="x" onclick={toggle}>✕</button>
    </div>

    <label class="lbl" for="gen-system">Protocol</label>
    <select id="gen-system" value={systemId} onchange={(e) => switchSystem((e.target as HTMLSelectElement).value)}>
      {#each GENERATORS as g (g.id)}
        <option value={g.id}>{g.name}</option>
      {/each}
    </select>
    <p class="q">{system.question}</p>

    <label class="lbl" for="gen-title">Label (optional)</label>
    <input id="gen-title" type="text" bind:value={title} placeholder="What is being derived?" />

    <div class="stagebar">
      {#each stages as s (s.n)}
        <button class:on={s.n === currentN} class:filled={!!outputs[s.n]?.trim()} class:stale={staleNs.has(s.n)} onclick={() => goto(s.n)} title={s.name}>
          {s.n}
        </button>
      {/each}
    </div>

    {#if currentStage}
      <div class="stage">
        <div class="stagehead">
          <strong>{currentStage.n}. {currentStage.name}</strong>
          {#if staleNs.has(currentStage.n)}<span class="stalebadge">⚠ stale — an earlier stage changed</span>{/if}
        </div>
        <div class="row">
          <button class="btn" onclick={() => copyPrompt(currentStage)}>{copiedN === currentStage.n ? 'Copied ✓' : 'Copy prompt'}</button>
          <span class="hint">Run it in your own AI, then paste the result:</span>
        </div>
        <textarea
          rows="6"
          value={outputs[currentStage.n] ?? ''}
          oninput={(e) => setOutput(currentStage.n, (e.target as HTMLTextAreaElement).value)}
          placeholder="Paste the AI's reply for this stage…"
        ></textarea>
        <div class="row">
          <button class="btn" onclick={() => goto(currentStage.n - 1)} disabled={currentStage.n <= 1}>← Prev stage</button>
          <button class="btn" onclick={() => goto(currentStage.n + 1)} disabled={currentStage.n >= stages.length}>Next stage →</button>
        </div>
      </div>
    {/if}

    <div class="row">
      <button class="btn" onclick={save} disabled={saved || !filledCount || !app.active}>{saved ? 'Saved ✓' : `Save run (${filledCount}/${stages.length} stages)`}</button>
      {#if !app.active}<span class="hint">Open a project to save.</span>{/if}
    </div>

    {#if history.length}
      <div class="hist">
        <strong>History — {app.active?.name}</strong>
        {#each history.slice(0, 8) as h (h.id)}
          <div class="histrow">
            <span class="histtitle">{h.title}</span>
            <span class="histcount">{h.results.artifacts?.length ?? 0} stages</span>
            <span class="histdate">{new Date(h.createdAt).toLocaleDateString()}</span>
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  /* Stacked above the Weir fab (right:1rem, bottom:1rem) rather than sharing bottom-left with the
   * sync pill (see WeirWorkshop.svelte's own comment on that). */
  .gen-fab {
    position: fixed;
    right: 1rem;
    bottom: 4.4rem;
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
    bottom: 6.8rem;
    z-index: 41;
    width: min(32rem, calc(100vw - 2rem));
    max-height: min(75vh, 46rem);
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
  select, input, textarea {
    width: 100%;
    box-sizing: border-box;
    background: var(--bg, #111);
    color: inherit;
    border: 1px solid var(--border, #444);
    border-radius: 0.4rem;
    padding: 0.4rem;
    font: inherit;
  }
  .stagebar { display: flex; flex-wrap: wrap; gap: 0.3rem; }
  .stagebar button {
    width: 1.9rem;
    height: 1.9rem;
    border-radius: 0.35rem;
    border: 1px solid var(--border, #444);
    background: transparent;
    color: inherit;
    cursor: pointer;
    font-size: 0.78rem;
  }
  .stagebar button.filled { border-color: #4caf7d; }
  .stagebar button.stale { border-color: #d9a441; }
  .stagebar button.on { background: var(--accent, #4a6da7); border-color: var(--accent, #4a6da7); }
  .stage { border: 1px solid var(--border, #444); border-radius: 0.5rem; padding: 0.6rem; display: flex; flex-direction: column; gap: 0.45rem; }
  .stagehead { display: flex; gap: 0.6rem; align-items: baseline; flex-wrap: wrap; }
  .stalebadge { font-size: 0.72rem; color: #d9a441; }
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
  .hist { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.78rem; border-top: 1px solid var(--border, #444); padding-top: 0.5rem; }
  .histrow { display: flex; gap: 0.6rem; align-items: baseline; }
  .histtitle { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .histcount, .histdate { color: var(--muted, #999); }
</style>
