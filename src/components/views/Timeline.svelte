<script lang="ts">
  import * as E from '../../lib/render/engine.js';
  import type { Track } from '../../lib/schema';

  let { rev }: { rev: number } = $props();

  // filter is 'all' | 'list' | string[] (selected track ids)
  let mode = $state<'all' | 'list' | 'tracks'>('all');
  let selected = $state<string[]>([]);

  const tracks = $derived.by<Track[]>(() => {
    rev;
    return (E.data().tracks || []) as Track[];
  });
  const body = $derived.by(() => {
    rev;
    if (mode === 'list') return E.tlList();
    if (mode === 'tracks') return E.tlSpread(selected);
    return E.tlSpread('all');
  });

  function toggleTrack(id: string) {
    mode = 'tracks';
    selected = selected.includes(id) ? selected.filter((t) => t !== id) : [...selected, id];
  }
</script>

<div class="legend">
  Each line is a <b>track</b> — a world or creature's own journey. Pick one to follow it alone, or
  <b>All tracks</b> to watch them braid. A ⟡ knot marks a beat where a track crosses another. Scroll
  sideways to read across time.
</div>
<div class="mbtns" style="flex-wrap:wrap">
  <button class="mbtn" class:on={mode === 'all'} onclick={() => (mode = 'all')}>All tracks</button>
  {#each tracks as t (t.id)}
    <button class="mbtn" class:on={mode === 'tracks' && selected.includes(t.id)} onclick={() => toggleTrack(t.id)}>{t.name}</button>
  {/each}
  <span class="bgroupsep">|</span>
  <button class="mbtn" onclick={() => { mode = 'tracks'; selected = []; }}>Clear</button>
  <button class="mbtn" class:on={mode === 'list'} onclick={() => (mode = 'list')}>List</button>
</div>
{@html body}
