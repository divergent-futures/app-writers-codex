<script lang="ts">
  import * as E from '../../lib/render/engine.js';
  import type { ReferenceCollection } from '../../lib/schema';
  import { listPacks, ensurePack, getActivePackId, setActivePackId, type PackChoice } from '../../lib/packs';

  let { rev }: { rev: number } = $props();

  let kind = $state('all');
  let query = $state('');
  let cat = $state('');

  /* The pack switcher. Packs are fetched on demand and cached in IndexedDB rather than bundled —
   * all twelve would be 9.2 MB in the JS bundle, which a phone would pay on first load to read one.
   * The choice lives in localStorage, not on the project, so switching packs to look something up
   * never dirties the book or the sync outbox. */
  let choices = $state<PackChoice[]>([]);
  let active = $state<string | null>(getActivePackId());
  let busy = $state('');
  let problem = $state('');

  $effect(() => {
    listPacks().then((c) => (choices = c));
  });

  async function choosePack(id: string) {
    problem = '';
    if (!id) {
      setActivePackId(null);
      location.reload(); // everything lives in IndexedDB; a reload loses nothing and re-hydrates
      return;
    }
    const already = choices.find((c) => c.id === id)?.cached;
    busy = already ? 'Loading…' : 'Downloading…';
    const pack = await ensurePack(id);
    busy = '';
    if (!pack) {
      problem = 'That pack could not be reached. It stays available once downloaded — try again on a connection.';
      return;
    }
    setActivePackId(id);
    location.reload();
  }

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

<div class="refctl" style="margin-bottom:10px">
  <select class="refsel pick" value={active ?? ''} onchange={(ev) => choosePack((ev.currentTarget as HTMLSelectElement).value)}>
    <option value="">This project's own pack</option>
    {#each choices as c (c.id)}
      <option value={c.id}>{c.label} · {c.entryCount} entries{c.cached ? ' · downloaded' : c.approxSizeKB ? ` · ${Math.round(c.approxSizeKB / 1024 * 10) / 10} MB` : ''}</option>
    {/each}
  </select>
  {#if busy}<span class="refcount">{busy}</span>{/if}
</div>
{#if problem}<p class="empty">{problem}</p>{/if}

{#if !hasData}
  <p class="empty">No reference library loaded in this project. Pick a pack above to download one.</p>
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
