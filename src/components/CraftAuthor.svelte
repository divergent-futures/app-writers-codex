<script lang="ts">
  /* The Craft Registry — the authoring surface (design §3.12, Phase 9): paste a framework document,
   * an AI proposes a registration, you confirm or correct it, it registers. Same copy-paste
   * discipline as every other panel — no live AI call inside the app. See src/lib/craft/author.ts
   * for the prompt, the parser, and the declare-don't-default validation this UI is a thin layer over.
   *
   * Scope note: this builds propose → confirm → register only. A registered user instrument does not
   * yet have its own run UI — that is a natural follow-up (a generic card renderer for arbitrary
   * ladder/axes/gates/bands/steps combinations), not something silently missing here. The instrument
   * IS fully registered and visible; there just isn't a "run it" button attached to it yet.
   */
  import { deleteUserCraftSystem, listUserCraftSystems, putUserCraftSystem } from '../lib/db';
  import { listSystems } from '../lib/craft/registry';
  import {
    buildAuthoringPrompt,
    buildUserSystem,
    parseAuthoringProposal,
    slugifyId,
    type SystemProposal,
  } from '../lib/craft/author';
  import { assertCategoryFailableConsistent } from '../lib/craft/types';
  import type { CraftCategory, CraftSystem, OutputShape, TargetShape } from '../lib/craft/types';
  import type { Part } from '../lib/craft/parts';

  const CATEGORIES: CraftCategory[] = ['reference', 'generator', 'lens', 'matrix'];
  const TARGET_SHAPES: TargetShape[] = ['none', 'element', 'sequence', 'set', 'corpus'];
  const OUTPUT_SHAPES: OutputShape[] = ['none', 'profile', 'completeness', 'verdict', 'metric+span', 'classification', 'artifact'];

  let open = $state(false);
  let pastedDoc = $state('');
  let sourceDoc = $state('');
  let pasted = $state('');
  let proposal = $state<SystemProposal | null>(null);
  let parseError = $state<string | null>(null);
  let copied = $state(false);
  let registerError = $state<string | null>(null);
  let registered = $state(false);
  let existing = $state<CraftSystem[]>([]);

  // Editable fields, seeded from the proposal on parse — the human's confirmation, per §3.12.
  let category = $state<CraftCategory>('lens');
  let failable = $state(false);
  let targetShape = $state<TargetShape>('element');
  let targetTypes = $state('');
  let output = $state<OutputShape>('profile');

  const expectedFailable = $derived(category === 'matrix');
  const failableMismatch = $derived(failable !== expectedFailable);

  async function toggle() {
    open = !open;
    if (open) await refreshExisting();
  }

  async function refreshExisting() {
    existing = await listUserCraftSystems();
  }

  async function copyPrompt() {
    const text = buildAuthoringPrompt(pastedDoc);
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      window.prompt('Copy the prompt below:', text);
    }
  }

  function parse() {
    registered = false;
    registerError = null;
    const r = parseAuthoringProposal(pasted);
    if (!r.ok) {
      proposal = null;
      parseError = r.error;
      return;
    }
    proposal = r.proposal;
    parseError = null;
    category = r.proposal.category;
    failable = r.proposal.failable;
    targetShape = r.proposal.target.shape;
    targetTypes = (r.proposal.target.types ?? []).join(', ');
    output = r.proposal.output;
    if (!sourceDoc.trim()) sourceDoc = r.proposal.name || pastedDoc.trim().slice(0, 60);
  }

  function partSummary(p: Part): string {
    switch (p.kind) {
      case 'ladder':
        return `ladder — ${p.tiers.length} tiers${p.tiers.some((t) => t.banned) ? ' (one banned)' : ''}`;
      case 'axes':
        return `axes — ${p.axes.length} dimensions${p.total != null ? `, total /${p.total}` : ', no total (descriptive)'}`;
      case 'gates':
        return `gates — ${p.gates.length} hard checks`;
      case 'bands':
        return `bands — ${p.bands.length} verdict ranges`;
      case 'steps':
        return `steps — ${p.steps.length} slots, ${p.ordered ? 'ordered' : 'unordered'}, completeness: ${p.completeness}`;
      case 'sequenceMetric':
        return `sequenceMetric — ${p.joints.length} joint codes, scope: ${p.scope}`;
      case 'spanLocator':
        return `spanLocator — finds the longest run of ${p.of} joints`;
      case 'pipeline':
        return `pipeline — ${p.stages.length} stages`;
      case 'fields':
        return `fields — ${p.fields.length} enum-valued judgements`;
      default:
        return p.kind;
    }
  }

  function existingIds(): Set<string> {
    return new Set([...listSystems().map((s) => s.id), ...existing.map((s) => s.id)]);
  }

  async function register() {
    if (!proposal) return;
    registerError = null;
    try {
      assertCategoryFailableConsistent({ id: 'draft', category, failable });
    } catch (e) {
      registerError = e instanceof Error ? e.message : String(e);
      return;
    }
    const types = targetTypes
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    if (!types.length) {
      registerError = 'Target types cannot be empty — name at least one thing this instrument applies to.';
      return;
    }
    // proposal is $state — its nested objects are reactive Proxies, which IndexedDB's structured-clone
    // cannot store directly ("could not be cloned" DataCloneError). $state.snapshot() takes a plain,
    // non-reactive deep copy — the same fix any $state object needs before it can be written to
    // IndexedDB, postMessage'd, or JSON.stringify'd. See Svelte 5's docs on $state.snapshot.
    const plain = $state.snapshot(proposal);
    const id = slugifyId(plain.name, existingIds());
    const system = buildUserSystem(
      plain,
      { category, failable, target: { shape: targetShape, types }, output },
      { id, sourceDoc: sourceDoc.trim() || 'pasted document' },
    );
    await putUserCraftSystem(system);
    registered = true;
    await refreshExisting();
  }

  function reset() {
    pastedDoc = '';
    sourceDoc = '';
    pasted = '';
    proposal = null;
    parseError = null;
    registerError = null;
    registered = false;
  }

  async function remove(id: string) {
    await deleteUserCraftSystem(id);
    await refreshExisting();
  }
</script>

<button class="author-fab" onclick={toggle} title="Author a Craft Instrument">✍ Author</button>

{#if open}
  <div class="panel">
    <div class="head">
      <strong>Craft Registry · Author an instrument</strong>
      <button class="x" onclick={toggle}>✕</button>
    </div>
    <p class="q">Paste a framework document, get a proposed registration, confirm it, and it joins your registry.</p>

    <label class="lbl" for="auth-doc">The framework document</label>
    <textarea id="auth-doc" rows="6" bind:value={pastedDoc} placeholder="Paste the full framework document here…"></textarea>

    <div class="row">
      <button class="btn" onclick={copyPrompt} disabled={!pastedDoc.trim()}>{copied ? 'Copied ✓' : 'Copy prompt'}</button>
      <span class="hint">Run it in your own AI, then paste the result:</span>
    </div>

    <textarea rows="5" bind:value={pasted} placeholder="Paste the AI's full reply here…"></textarea>
    <div class="row">
      <button class="btn" onclick={parse} disabled={!pasted.trim()}>Parse proposal</button>
      {#if parseError}<span class="err">{parseError}</span>{/if}
      {#if proposal}<button class="btn" onclick={reset}>Start over</button>{/if}
    </div>

    {#if proposal}
      <div class="card">
        {#if proposal.provenanceConcern}
          <div class="provwarn">⚠ Provenance flag: {proposal.provenanceConcern}</div>
        {/if}
        {#if proposal.reasoningSummary}
          <p class="reasoning">{proposal.reasoningSummary}</p>
        {/if}

        <label class="lbl" for="auth-name">Name</label>
        <input id="auth-name" type="text" bind:value={proposal.name} />

        <label class="lbl" for="auth-question">Question it answers</label>
        <input id="auth-question" type="text" bind:value={proposal.question} />

        <div class="confirmgrid">
          <div>
            <label class="lbl" for="auth-category">Category ⚠ confirm</label>
            <select id="auth-category" bind:value={category}>
              {#each CATEGORIES as c (c)}<option value={c}>{c}</option>{/each}
            </select>
          </div>
          <div>
            <label class="lbl" for="auth-failable">Failable ⚠ confirm</label>
            <select id="auth-failable" bind:value={failable}>
              <option value={true}>true</option>
              <option value={false}>false</option>
            </select>
          </div>
          <div>
            <label class="lbl" for="auth-shape">Target shape ⚠ confirm</label>
            <select id="auth-shape" bind:value={targetShape}>
              {#each TARGET_SHAPES as s (s)}<option value={s}>{s}</option>{/each}
            </select>
          </div>
          <div>
            <label class="lbl" for="auth-output">Output ⚠ confirm</label>
            <select id="auth-output" bind:value={output}>
              {#each OUTPUT_SHAPES as o (o)}<option value={o}>{o}</option>{/each}
            </select>
          </div>
        </div>
        {#if failableMismatch}
          <div class="warn">⚠ "{category}" instruments are normally failable={expectedFailable}. Fix one of the two before registering.</div>
        {/if}

        <label class="lbl" for="auth-types">Applies to (comma-separated)</label>
        <input id="auth-types" type="text" bind:value={targetTypes} placeholder="character, worldbuilding, scene…" />

        <div class="lbl">Parts ⚠ confirm the declared shape below</div>
        <div class="parts">
          {#each proposal.parts as p, i (i)}
            <div class="part">{partSummary(p)}</div>
          {/each}
        </div>

        <label class="lbl" for="auth-source">Source document (for provenance)</label>
        <input id="auth-source" type="text" bind:value={sourceDoc} placeholder="Title or filename of the pasted document" />

        {#if registerError}<div class="err">{registerError}</div>{/if}
        <div class="row">
          <button class="btn" onclick={register} disabled={registered}>{registered ? 'Registered ✓' : 'Register instrument'}</button>
        </div>
      </div>
    {/if}

    {#if existing.length}
      <div class="hist">
        <strong>Your instruments</strong>
        {#each existing as s (s.id)}
          <div class="histrow">
            <span class="histtitle">{s.name}</span>
            <span class="histmeta">{s.category} · {s.target.shape} · {s.output}</span>
            <span class="histdate">{s.provenance?.confirmedAt ? new Date(s.provenance.confirmedAt).toLocaleDateString() : '—'}</span>
            <button class="rm" onclick={() => remove(s.id)} title="Remove">✕</button>
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  /* Stacked above CraftSequence's fab (right:1rem, bottom:7.8rem) by the same 3.4rem gap the rest of
   * the stack uses. */
  .author-fab {
    position: fixed;
    right: 1rem;
    bottom: 11.2rem;
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
    bottom: 13.6rem;
    z-index: 41;
    width: min(36rem, calc(100vw - 2rem));
    /* This is the fourth panel stacked above the fab row (bottom offset 13.6rem) — sizing max-height
     * off a flat vh percentage the way the earlier three panels do would let it run off the top of
     * the viewport on anything shorter than ~990px tall (13.6rem + 78vh > 100vh below that height),
     * since the offset itself now eats a meaningful share of the viewport. Anchoring to
     * `100vh - bottom-offset - margin` instead keeps a guaranteed gap at the top regardless of
     * window height. */
    max-height: min(calc(100vh - 15.5rem), 44rem);
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
  input, textarea, select {
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
  .card { border: 1px solid var(--border, #444); border-radius: 0.5rem; padding: 0.6rem; display: flex; flex-direction: column; gap: 0.45rem; }
  .provwarn { font-size: 0.8rem; color: #e05d5d; border: 1px solid #e05d5d; border-radius: 0.4rem; padding: 0.4rem; }
  .warn { font-size: 0.78rem; color: #d9a441; }
  .reasoning { margin: 0; font-size: 0.82rem; line-height: 1.4; color: var(--muted, #999); }
  .confirmgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
  .parts { display: flex; flex-direction: column; gap: 0.2rem; }
  .part { font-size: 0.78rem; border: 1px solid var(--border, #444); border-radius: 0.35rem; padding: 0.25rem 0.5rem; }
  .hist { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.78rem; border-top: 1px solid var(--border, #444); padding-top: 0.5rem; }
  .histrow { display: flex; gap: 0.6rem; align-items: baseline; }
  .histtitle { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .histmeta, .histdate { color: var(--muted, #999); }
  .rm { background: none; border: none; color: #e05d5d; cursor: pointer; font-size: 0.85rem; }
</style>
