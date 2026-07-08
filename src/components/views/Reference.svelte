<script lang="ts">
  import * as E from '../../lib/render/engine.js';
  import type { ReferenceCollection } from '../../lib/schema';

  let { rev }: { rev: number } = $props();

  let kind = $state('all');
  let query = $state('');
  let cat = $state('');

  const hasData = $derived.by(() => {
    rev;
    return E.refHasData();
  });
  const collections = $derived.by<ReferenceCollection[]>(() => {
    rev;
    return (E.refCollections() || []) as ReferenceCollection[];
  });
  const catOptions = $derived.by(() => {
    rev;
    return E.refCatsOptions(kind);
  });
  const body = $derived.by(() => {
    rev;
    return E.refBody(kind, query, cat);
  });

  function pickKind(k: string) {
    kind = k;
    cat = ''; // category list is scoped to the kind
  }
</script>

{#if !hasData}
  <p class="empty">No reference library loaded in this project.</p>
{:else}
  <div class="legend">
    Your whole reference — tropes, tech, science, authors, craft, and more. Filter here, or search
    from the top bar while you write.
  </div>
  <div class="mbtns" style="flex-wrap:wrap">
    <button class="mbtn" class:on={kind === 'all'} onclick={() => pickKind('all')}>All <span class="refcount">{E.refCount('all')}</span></button>
    {#each collections as c (c.id)}
      <button class="mbtn" class:on={kind === c.id} onclick={() => pickKind(c.id)}>{c.label} <span class="refcount">{E.refCount(c.id)}</span></button>
    {/each}
  </div>
  <div class="refctl">
    <input class="cfilter" bind:value={query} placeholder="Search the reference…" autocomplete="off" style="margin:0;max-width:320px" />
    <select class="refsel pick" bind:value={cat}>
      {@html catOptions}
    </select>
  </div>
  {@html body}
{/if}
