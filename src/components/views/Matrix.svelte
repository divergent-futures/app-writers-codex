<script lang="ts">
  import * as E from '../../lib/render/engine.js';
  import type { Book } from '../../lib/schema';

  let { rev }: { rev: number } = $props();

  let mode = $state<'books' | 'traj'>('books');
  let selected = $state<string[]>([]);
  let inited = -1;

  const books = $derived.by<Book[]>(() => {
    rev;
    return ((E.data().books || []) as Book[]).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  });

  // default-select the first book whenever the project changes
  $effect(() => {
    if (inited !== rev) {
      inited = rev;
      const first = books[0];
      selected = first ? [first.id] : [];
      mode = 'books';
    }
  });

  const saga = $derived(books.filter((b) => !b.branch));
  const branch = $derived(books.filter((b) => b.branch));
  const body = $derived.by(() => {
    rev;
    return mode === 'traj' ? E.trajectoryBody() : E.matrixBody(selected);
  });

  function toggle(id: string) {
    mode = 'books';
    selected = selected.includes(id) ? selected.filter((b) => b !== id) : [...selected, id];
  }
  function label(b: Book) {
    return (b.title || '').split(' — ')[0];
  }
</script>

<div class="legend">
  Pick one or more books. <span class="sw" style="background:var(--good)"></span>8–10 ·
  <span class="sw" style="background:var(--warn)"></span>5.5–8 ·
  <span class="sw" style="background:var(--bad)"></span>under 5.5. A flag, not a verdict.
</div>
<div class="mbtns" style="flex-wrap:wrap">
  {#each saga as b (b.id)}
    <button class="mbtn" class:on={mode === 'books' && selected.includes(b.id)} onclick={() => toggle(b.id)}>{label(b)}</button>
  {/each}
  {#if branch.length}
    <span class="bgroupsep">Branches</span>
    {#each branch as b (b.id)}
      <button class="mbtn" class:on={mode === 'books' && selected.includes(b.id)} onclick={() => toggle(b.id)}>{label(b)}</button>
    {/each}
  {/if}
  <span class="bgroupsep">|</span>
  <button class="mbtn" onclick={() => { mode = 'books'; selected = books.map((b) => b.id); }}>All</button>
  <button class="mbtn" onclick={() => { mode = 'books'; selected = []; }}>Clear</button>
  <button class="mbtn" class:on={mode === 'traj'} onclick={() => (mode = 'traj')}>Trajectory</button>
</div>
{@html body}
