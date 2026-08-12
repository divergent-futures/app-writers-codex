<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from './lib/stores/app.svelte';
  import { sync } from './lib/sync.svelte';
  import { DEMO, SYNC_ENABLED } from './lib/mode';
  import Codex from './components/Codex.svelte';
  import SyncStatus from './components/SyncStatus.svelte';
  import WeirWorkshop from './components/WeirWorkshop.svelte';
  import CraftGenerator from './components/CraftGenerator.svelte';
  import DemoBanner from './components/DemoBanner.svelte';

  let ready = $state(false);

  onMount(async () => {
    if (DEMO) document.body.classList.add('demo-mode');
    await app.init();
    ready = true;
    // Cloud sync is additive and fails soft — start it after the local app is up; never block boot
    // on it. Off entirely unless this deployment opted in, and never in the read-only demo.
    if (SYNC_ENABLED) void sync.start();
  });
</script>

{#if DEMO}
  <DemoBanner />
{/if}

{#if ready}
  <Codex />
  {#if SYNC_ENABLED}
    <SyncStatus />
  {/if}
  {#if !DEMO}
    <WeirWorkshop />
    <CraftGenerator />
  {/if}
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

  /* The demo bar is fixed to the top — keep it off the app's first row. */
  :global(body.demo-mode) {
    padding-top: 42px;
  }

  @media (max-width: 760px) {
    :global(body.demo-mode) {
      padding-top: 62px;
    }
  }
</style>
