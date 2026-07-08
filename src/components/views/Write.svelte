<script lang="ts">
  import * as E from '../../lib/render/engine.js';
  import type { Book, Chapter } from '../../lib/schema';
  import { app } from '../../lib/stores/app.svelte';
  import { getProse, putProse } from '../../lib/db';

  let { rev, target = '', onProseChange }: { rev: number; target?: string; onProseChange?: () => void } = $props();

  let book = $state('');
  let chapter = $state('');
  let prose = $state('');
  let proseChapter = ''; // which chapter `prose` was loaded for
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  const books = $derived.by<Book[]>(() => {
    rev;
    const chs = (E.data().chapters || []) as Chapter[];
    return ((E.data().books || []) as Book[])
      .slice()
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .filter((b) => chs.some((c) => c.book === b.id));
  });

  const rail = $derived.by(() => {
    rev;
    return book ? E.writeRail(book) : '';
  });
  const cockpit = $derived.by(() => {
    rev;
    return chapter ? E.cockpit(chapter) : '';
  });

  // pick an initial book/chapter when the project changes or a resume target arrives
  let seeded = -1;
  $effect(() => {
    const chs = (E.data().chapters || []) as Chapter[];
    if (target) {
      const ch = chs.find((c) => c.id === target);
      if (ch) {
        book = ch.book;
        chapter = ch.id;
        seeded = rev;
        return;
      }
    }
    if (seeded !== rev) {
      seeded = rev;
      const b = books[0];
      book = b ? b.id : '';
      const first = chs.filter((c) => c.book === book).sort((x, y) => (x.order || 0) - (y.order || 0))[0];
      chapter = first ? first.id : '';
    }
  });

  // load prose whenever the selected chapter changes
  $effect(() => {
    const pid = app.active?.id;
    const cid = chapter;
    if (!pid || !cid) {
      prose = '';
      proseChapter = '';
      return;
    }
    getProse(pid, cid).then((md) => {
      prose = md;
      proseChapter = cid;
    });
  });

  function onBook(e: Event) {
    book = (e.target as HTMLSelectElement).value;
    const chs = (E.data().chapters || []) as Chapter[];
    const first = chs.filter((c) => c.book === book).sort((x, y) => (x.order || 0) - (y.order || 0))[0];
    chapter = first ? first.id : '';
  }
  function onRailClick(e: MouseEvent) {
    const it = (e.target as HTMLElement).closest('[data-wch]');
    if (it) chapter = it.getAttribute('data-wch') || '';
  }
  function onProseInput() {
    const pid = app.active?.id;
    const cid = proseChapter;
    if (!pid || !cid) return;
    if (saveTimer) clearTimeout(saveTimer);
    const text = prose;
    saveTimer = setTimeout(async () => {
      await putProse(pid, cid, text);
      onProseChange?.(); // re-hydrate so word counts/search update
    }, 600);
  }

  // project-scoped parking note (browser-local scratch, like the prototype)
  const parkKey = $derived(`wc_${app.active?.id ?? ''}_park_${chapter}`);
  let park = $state('');
  $effect(() => {
    const k = parkKey;
    try {
      park = localStorage.getItem(k) || '';
    } catch {
      park = '';
    }
  });
  function onParkInput() {
    try {
      localStorage.setItem(parkKey, park);
    } catch {
      /* ignore */
    }
    if (chapter) {
      try {
        localStorage.setItem(`wc_${app.active?.id ?? ''}_lastChapter`, chapter);
      } catch {
        /* ignore */
      }
    }
  }
</script>

{#if !books.length}
  <p class="empty">No books with chapters yet — add chapters to start writing.</p>
{:else}
  <div class="wlayout">
    <div class="wrail">
      <select class="wbooksel pick" value={book} onchange={onBook}>
        {#each books as b (b.id)}
          <option value={b.id}>{(b.title || '').split(' — ')[0]}</option>
        {/each}
      </select>
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div onclick={onRailClick}>{@html rail}</div>
    </div>
    <div class="wbody">
      {@html cockpit}
      {#if chapter}
        <div class="wsec weditor">
          <div class="wh">Draft (autosaves to this device)</div>
          <textarea class="proseinput" bind:value={prose} oninput={onProseInput} placeholder="Write the chapter here. Markdown-ish; saved locally as you type."></textarea>
          <div class="wh" style="margin-top:12px">Where I'm leaving off — saved in this browser</div>
          <textarea class="scratch wpark" bind:value={park} oninput={onParkInput} placeholder="Jot where you stopped and the next move."></textarea>
        </div>
      {/if}
    </div>
  </div>
{/if}
