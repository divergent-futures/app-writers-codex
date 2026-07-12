<script lang="ts">
  import { app } from '../lib/stores/app.svelte';
  import { exportProjectToFile } from '../lib/export';

  let busy = $state(false);
  let fileInput: HTMLInputElement;

  async function onPick(e: Event) {
    const id = (e.target as HTMLSelectElement).value;
    if (id) await app.switchTo(id);
  }

  async function newEmpty() {
    const name = prompt('Name your new world:', 'Untitled world');
    if (name === null) return;
    busy = true;
    await app.newEmptyProject(name.trim() || 'Untitled world');
    busy = false;
  }

  async function loadSample() {
    busy = true;
    try {
      await app.loadSampleWorld();
    } catch (err) {
      alert('Could not load the example world: ' + (err as Error).message);
    }
    busy = false;
  }

  async function loadPrivate() {
    busy = true;
    try {
      await app.loadPrivateSample();
    } catch (err) {
      alert('Could not load the private sample: ' + (err as Error).message);
    }
    busy = false;
  }

  async function removeCurrent() {
    if (!app.active) return;
    const name = app.active.name;
    if (!confirm(`Delete "${name}"? This removes it from this device. This can't be undone here.`)) return;
    busy = true;
    await app.remove(app.active.id);
    busy = false;
  }

  async function exportCurrent() {
    if (!app.active) return;
    busy = true;
    try {
      await exportProjectToFile(app.active.id);
    } catch (err) {
      alert('Export failed: ' + (err as Error).message);
    }
    busy = false;
  }

  async function onImportFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    busy = true;
    try {
      const results = await app.importFile(file);
      const total = results.reduce((n, r) => n + r.warnings.length, 0);
      alert(`Imported ${results.length} project(s).` + (total ? ` ${total} validation warning(s).` : ' No warnings.'));
    } catch (err) {
      alert('Import failed: ' + (err as Error).message);
    }
    busy = false;
    (e.target as HTMLInputElement).value = '';
  }
</script>

<div class="switcher row">
  <select class="pick" onchange={onPick} value={app.active?.id ?? ''} disabled={busy}>
    {#each app.projects as p (p.id)}
      <option value={p.id}>{p.name}</option>
    {/each}
  </select>
  <button class="btn" onclick={newEmpty} disabled={busy}>+ New</button>
  {#if app.hasExampleWorld}
    <button class="btn" onclick={loadSample} disabled={busy}>Load example</button>
  {/if}
  {#if app.hasPrivateSample}
    <button class="btn" onclick={loadPrivate} disabled={busy}>Load Cosmos (private)</button>
  {/if}
  <button class="btn" onclick={exportCurrent} disabled={busy || !app.active}>Export…</button>
  <button class="btn" onclick={() => fileInput.click()} disabled={busy}>Import…</button>
  <button class="btn danger" onclick={removeCurrent} disabled={busy || !app.active}>Delete…</button>
  <input
    bind:this={fileInput}
    type="file"
    accept="application/json,.json"
    onchange={onImportFile}
    style="display:none"
  />
</div>

<style>
  .switcher { gap: 8px; }
  .btn.danger { color: var(--bad); border-color: var(--bad); }
  .btn.danger:hover { background: color-mix(in srgb, var(--bad) 15%, transparent); }
</style>
