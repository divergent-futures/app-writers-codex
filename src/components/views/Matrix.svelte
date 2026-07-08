<script lang="ts">
  import { untrack } from 'svelte';
  import * as E from '../../lib/render/engine.js';
  import { app } from '../../lib/stores/app.svelte';
  import type { Book } from '../../lib/schema';

  let { rev }: { rev: number } = $props();

  let mode = $state<'books' | 'traj'>('books');
  let selected = $state<string[]>([]);
  let lastPid = '';

  const books = $derived.by<Book[]>(() => {
    rev;
    return ((E.data().books || []) as Book[]).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  });

  // default-select the first book only when the PROJECT changes — not on every edit/save.
  // Keyed on rev (re-runs after each data load) but the reset guard reads the project id untracked,
  // so an in-project save keeps the user's book selection + Trajectory mode.
  $effect(() => {
    rev;
    const pid = untrack(() => app.active?.id ?? '');
    if (pid !== lastPid) {
      lastPid = pid;
      selected = books[0] ? [books[0].id] : [];
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
