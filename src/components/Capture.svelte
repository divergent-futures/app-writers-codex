<script lang="ts">
  import { app } from '../lib/stores/app.svelte';

  let open = $state(false);
  let kind = $state<'note' | 'idea' | 'character' | 'world'>('note');
  let text = $state('');
  let saving = $state(false);
  let justSaved = $state(false);
  let field = $state<HTMLTextAreaElement>();

  const KINDS: [typeof kind, string][] = [
    ['note', 'Note'],
    ['idea', 'Idea'],
    ['character', 'Character'],
    ['world', 'World'],
  ];

  function openSheet() {
    open = true;
    justSaved = false;
    queueMicrotask(() => field?.focus());
  }
  async function save() {
    if (!text.trim() || saving) return;
    saving = true;
    await app.capture(kind, text);
    saving = false;
    text = '';
    justSaved = true;
    field?.focus();
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') open = false;
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save();
  }
</script>

<button class="fab" onclick={openSheet} title="Quick capture" aria-label="Quick capture">+</button>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="capwrap" onclick={(e) => { if (e.target === e.currentTarget) open = false; }}>
    <div class="capsheet" role="dialog" aria-label="Quick capture">
      <div class="row" style="margin-bottom:10px">
        <b>Quick capture</b>
        <span class="spacer"></span>
        <button class="link" onclick={() => (open = false)}>Close</button>
      </div>
      <div class="mbtns" style="margin-bottom:10px">
        {#each KINDS as [k, label]}
          <button class="mbtn" class:on={kind === k} onclick={() => (kind = k)}>{label}</button>
        {/each}
      </div>
      <textarea
        bind:this={field}
        bind:value={text}
        onkeydown={onKey}
        placeholder={kind === 'note' || kind === 'idea' ? 'Jot the thought…' : `Name of the ${kind}…`}
      ></textarea>
      <div class="row" style="margin-top:10px">
        {#if justSaved}<span class="muted" style="font-size:12.5px">Saved to your project ✓</span>{/if}
        <span class="spacer"></span>
        <button class="btn primary" onclick={save} disabled={!text.trim() || saving}>
          {saving ? 'Saving…' : 'Capture'}
        </button>
      </div>
      <div class="muted" style="font-size:11.5px;margin-top:8px">
        {kind === 'character' || kind === 'world'
          ? `Adds a ${kind} you can flesh out later.`
          : 'Lands in Notes as an inbox item to organise later.'} · ⌘/Ctrl+Enter to save.
      </div>
    </div>
  </div>
{/if}

<style>
  .fab {
    position: fixed;
    right: 20px;
    bottom: 20px;
    z-index: 40;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    border: none;
    background: var(--accent);
    color: #0c0f16;
    font-size: 30px;
    font-weight: 600;
    line-height: 1;
    cursor: pointer;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  }
  .fab:hover { filter: brightness(1.06); }
  .capwrap {
    position: fixed;
    inset: 0;
    z-index: 45;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding: 16px;
  }
  .capsheet {
    width: 100%;
    max-width: 480px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 16px 18px;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
    margin-bottom: 6vh;
  }
  .capsheet textarea {
    width: 100%;
    min-height: 90px;
    background: var(--panel2);
    color: var(--ink);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 10px 12px;
    font: inherit;
    resize: vertical;
    outline: none;
  }
  .capsheet textarea:focus { border-color: var(--accent); }
  @media (min-width: 761px) {
    .capwrap { align-items: center; }
    .capsheet { margin-bottom: 0; }
  }
</style>
