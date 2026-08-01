<script lang="ts">
  /* Weir Matrix — standalone Workshop panel (writers-codex-weir-module.md §10).
   *
   * Copy-paste fallback path (build note 4): pick a mode, paste material, copy the full prompt into
   * your own AI, paste the result back, get the parsed verdict card, save it to the score history.
   * Saved scores live in IndexedDB and ride the outbox/sync engine like any other record. Inline
   * on-entity scoring, badges, and the history sparkline come after this path is proven.
   */
  import { app } from '../lib/stores/app.svelte';
  import { listWeirScores, putWeirScore, type WeirScoreRecord } from '../lib/db';
  import { buildPrompt } from '../lib/weir/prompts';
  import { parseWeirResult, type ParsedCard } from '../lib/weir/parse';
  import { totalOf, verdictFor, VERDICT_COLOR, type Verdict, type WeirMode } from '../lib/weir/verdict';

  let open = $state(false);
  let mode = $state<WeirMode>('prose');
  let title = $state('');
  let input = $state('');
  let ledger = $state('');
  let pasted = $state('');
  let card = $state<ParsedCard | null>(null);
  let parseError = $state<string | null>(null);
  let copied = $state(false);
  let saved = $state(false);
  let history = $state<WeirScoreRecord[]>([]);

  const total = $derived(card ? totalOf(card.axes) : 0);
  const verdict = $derived<Verdict | null>(card ? verdictFor(total, card.gates) : null);

  async function toggle() {
    open = !open;
    if (open) await refreshHistory();
  }

  async function refreshHistory() {
    history = app.active ? await listWeirScores(app.active.id) : [];
  }

  async function copyPrompt() {
    const text = buildPrompt(mode, input, mode === 'science' ? ledger : undefined);
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      // Clipboard API unavailable (http, permissions) — show the prompt for manual copy.
      window.prompt('Copy the prompt below:', text);
    }
  }

  function parse() {
    saved = false;
    const r = parseWeirResult(pasted);
    if (r.ok) {
      card = r.card;
      parseError = null;
    } else {
      card = null;
      parseError = r.error;
    }
  }

  async function save() {
    if (!card || !verdict || !app.active) return;
    const rec: WeirScoreRecord = {
      id: crypto.randomUUID(),
      projectId: app.active.id,
      mode,
      targetType: 'freeform',
      title: title.trim() || input.trim().slice(0, 60) || 'Untitled run',
      tier: card.tier,
      axes: card.axes,
      total,
      gates: card.gates,
      verdict,
      fix: card.fix,
      createdAt: Date.now(),
    };
    await putWeirScore(rec);
    saved = true;
    await refreshHistory();
  }

  function reset() {
    pasted = '';
    card = null;
    parseError = null;
    saved = false;
  }
</script>

<button class="weir-fab" onclick={toggle} title="Weir Matrix workshop">⚖ Weir</button>

{#if open}
  <div class="panel">
    <div class="head">
      <strong>Weir Matrix · Workshop</strong>
      <button class="x" onclick={toggle}>✕</button>
    </div>

    <div class="modes">
      {#each ['idea', 'prose', 'science'] as m (m)}
        <button class:active={mode === m} onclick={() => { mode = m as WeirMode; reset(); }}>
          {m === 'idea' ? 'Idea' : m === 'prose' ? 'Prose' : 'Science'}
        </button>
      {/each}
    </div>

    <label class="lbl" for="weir-title">Label (optional)</label>
    <input id="weir-title" type="text" bind:value={title} placeholder="What is being scored?" />

    <label class="lbl" for="weir-input">The material</label>
    <textarea id="weir-input" rows="6" bind:value={input} placeholder={mode === 'idea' ? 'Paste the premise, concept, or thread…' : mode === 'prose' ? 'Paste the passage…' : 'Paste the science element…'}></textarea>

    {#if mode === 'science'}
      <label class="lbl" for="weir-ledger">Project licence ledger (optional — paste Active Roots / Candidates)</label>
      <textarea id="weir-ledger" rows="3" bind:value={ledger} placeholder="Empty = scored with no declared roots."></textarea>
    {/if}

    <div class="row">
      <button class="btn" onclick={copyPrompt} disabled={!input.trim()}>{copied ? 'Copied ✓' : 'Copy prompt'}</button>
      <span class="hint">Run it in your own AI, then paste the result:</span>
    </div>

    <textarea rows="5" bind:value={pasted} placeholder="Paste the AI's full reply here…"></textarea>
    <div class="row">
      <button class="btn" onclick={parse} disabled={!pasted.trim()}>Parse result</button>
      {#if parseError}<span class="err">{parseError}</span>{/if}
    </div>

    {#if card && verdict}
      <div class="card">
        <div class="cardhead">
          {#if card.tier}<span class="tier">{card.tier}</span>{/if}
          <span class="score">{total} / 60</span>
          <span class="verdict {VERDICT_COLOR[verdict]}">⟶ {verdict}</span>
        </div>
        <div class="axes">
          {#each Object.entries(card.axes) as [k, v] (k)}<span>{k} {v}</span>{/each}
        </div>
        <div class="gates">
          {#each Object.entries(card.gates) as [k, v] (k)}
            <span class={v === 'FAIL' ? 'fail' : 'pass'}>{k}: {v}</span>
          {/each}
        </div>
        {#if card.fix}
          <div class="fix"><strong>The one fix</strong><br />{card.fix}</div>
        {/if}
        <div class="row">
          <button class="btn" onclick={save} disabled={saved || !app.active}>{saved ? 'Saved ✓' : 'Save score'}</button>
          {#if !app.active}<span class="hint">Open a project to save scores.</span>{/if}
        </div>
      </div>
    {/if}

    {#if history.length}
      <div class="hist">
        <strong>History — {app.active?.name}</strong>
        {#each history.slice(0, 12) as h (h.id)}
          <div class="histrow">
            <span class="verdict {VERDICT_COLOR[h.verdict]}">{h.verdict}</span>
            <span class="score">{h.total}</span>
            <span class="histtitle">{h.title ?? '—'}</span>
            <span class="histdate">{new Date(h.createdAt).toLocaleDateString()}</span>
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  /* Right-hand corner: the sync pill owns bottom-left. */
  .weir-fab {
    position: fixed;
    right: 1rem;
    bottom: 1rem;
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
    bottom: 3.4rem;
    z-index: 41;
    width: min(30rem, calc(100vw - 2rem));
    max-height: min(75vh, 44rem);
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
  .modes { display: flex; gap: 0.4rem; }
  .modes button {
    flex: 1;
    padding: 0.3rem;
    border-radius: 0.4rem;
    border: 1px solid var(--border, #444);
    background: transparent;
    color: inherit;
    cursor: pointer;
  }
  .modes button.active { background: var(--accent, #4a6da7); border-color: var(--accent, #4a6da7); }
  .lbl { font-size: 0.75rem; color: var(--muted, #999); }
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
  .card { border: 1px solid var(--border, #444); border-radius: 0.5rem; padding: 0.6rem; display: flex; flex-direction: column; gap: 0.45rem; }
  .cardhead { display: flex; gap: 0.7rem; align-items: baseline; }
  .tier { font-weight: 600; }
  .score { color: var(--muted, #999); }
  .verdict { font-weight: 700; }
  .verdict.green { color: #4caf7d; }
  .verdict.amber { color: #d9a441; }
  .verdict.red { color: #e05d5d; }
  .axes, .gates { display: flex; flex-wrap: wrap; gap: 0.3rem 0.8rem; font-size: 0.78rem; }
  .gates .fail { color: #e05d5d; font-weight: 600; }
  .gates .pass { color: var(--muted, #999); }
  .fix { font-size: 0.82rem; line-height: 1.35; }
  .hist { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.78rem; border-top: 1px solid var(--border, #444); padding-top: 0.5rem; }
  .histrow { display: flex; gap: 0.6rem; align-items: baseline; }
  .histtitle { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .histdate { color: var(--muted, #999); }
</style>
