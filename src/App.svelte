<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from './lib/stores/app.svelte';
  import Codex from './components/Codex.svelte';

  let ready = $state(false);

  onMount(async () => {
    await app.init();
    ready = true;
  });
</script>

{#if ready}
  <Codex />
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
