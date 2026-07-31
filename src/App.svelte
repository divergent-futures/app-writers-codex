<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from './lib/stores/app.svelte';
  import { sync } from './lib/sync.svelte';
  import Codex from './components/Codex.svelte';
  import SyncStatus from './components/SyncStatus.svelte';
  import WeirWorkshop from './components/WeirWorkshop.svelte';

  let ready = $state(false);

  onMount(async () => {
    await app.init();
    ready = true;
    // Cloud sync is additive and fails soft — start it after the local app is up; never block boot on it.
    void sync.start();
  });
</script>

{#if ready}
  <Codex />
  <SyncStatus />
  <WeirWorkshop />
{:else}
  <div class="boot">Loading your library…</div>
{/if}

<style>
  .boot {
    display: grid;
    place-items: center;
    height: 100vh;
    color: var(--muted);
    font-style: italic;
  }
</style>
