<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import * as E from '../../lib/render/engine.js';
  import type { Book, Chapter } from '../../lib/schema';
  import { app } from '../../lib/stores/app.svelte';
  import { DEMO } from '../../lib/mode';
  import { getProse, putProse } from '../../lib/db';

  let {
    rev,
    target = '',
    onProseChange,
    onTargetConsumed,
  }: { rev: number; target?: string; onProseChange?: () => void; onTargetConsumed?: () => void } = $props();

  let book = $state('');
  let chapter = $state('');
  let prose = $state('');
  let proseChapter = ''; // which chapter `prose` was loaded for

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

  const firstChapterOf = (bookId: string) =>
    ((E.data().chapters || []) as Chapter[])
      .filter((c) => c.book === bookId)
      .sort((x, y) => (x.order || 0) - (y.order || 0))[0];

  // Default-select first book/chapter only when the PROJECT changes (untracked id read), so a
  // rev bump from an edit/save never snaps the writer off the chapter they're on.
  let lastPid = '';
  $effect(() => {
    rev;
    const pid = untrack(() => app.active?.id ?? '');
    if (pid !== lastPid) {
      lastPid = pid;
      const b = books[0];
      book = b ? b.id : '';
      const first = book ? firstChapterOf(book) : undefined;
      chapter = first ? first.id : '';
    }
  });

  // Apply a resume target exactly once when it arrives, then tell the parent to clear it.
  let lastTarget = '';
  $effect(() => {
    const tgt = target;
    if (!tgt) { lastTarget = ''; return; }
    if (tgt === lastTarget) return;
    lastTarget = tgt;
    const ch = ((E.data().chapters || []) as Chapter[]).find((c) => c.id === tgt);
    if (ch) { book = ch.book; chapter = ch.id; }
    onTargetConsumed?.();
  });

  // ---- prose autosave (per-chapter; never drops a pending save on chapter/project switch) ----
  let pending: { pid: string; cid: string; text: string } | null = null;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  function commitPending() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    if (!pending) return;
    const p = pending;
    pending = null;
    putProse(p.pid, p.cid, p.text).then(() => onProseChange?.());
  }
  function onProseInput() {
    const pid = app.active?.id;
    const cid = proseChapter;
    if (!pid || !cid) return;
    pending = { pid, cid, text: prose };
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(commitPending, 600);
  }
  onDestroy(commitPending);

  // Load prose when the chapter changes — flush the previous chapter's pending save first, and
  // guard against out-of-order resolution overwriting a newer chapter's prose.
  $effect(() => {
    const pid = app.active?.id;
    const cid = chapter;
    commitPending();
    if (!pid || !cid) {
      prose = '';
      proseChapter = '';
      return;
    }
    getProse(pid, cid).then((md) => {
      if (app.active?.id === pid && chapter === cid) {
        prose = md;
        proseChapter = cid;
      }
    });
  });

  function onBook(e: Event) {
    book = (e.target as HTMLSelectElement).value;
    const first = firstChapterOf(book);
    chapter = first ? first.id : '';
  }
  function onRailClick(e: MouseEvent) {
    const it = (e.target as HTMLElement).closest('[data-wch]');
    if (it) chapter = it.getAttribute('data-wch') || '';
  }

  // project-scoped parking note (browser-local scratch, like the prototype)
  const parkKey = $derived(`wc_${app.active?.id ?? ''}_park_${chapter}`);
  let park = $state('');
  $effect(() => {
    const k = parkKey;
    try { park = localStorage.getItem(k) || ''; } catch { park = ''; }
  });
  function onParkInput() {
    try { localStorage.setItem(parkKey, park); } catch { /* ignore */ }
    if (chapter) {
      try { localStorage.setItem(`wc_${app.active?.id ?? ''}_lastChapter`, chapter); } catch { /* ignore */ }
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
          {#if DEMO}
            <!-- Read-only tour: show the writing cockpit exactly as it is, but with nothing to type
                 into. The point is to let someone see how drafting works, not to collect their words
                 somewhere they'd never find them again. -->
            <div class="wh">Draft — read-only in this demo</div>
            <div class="proseinput demoprose">{prose || 'This chapter has no draft in the example world.'}</div>
          {:else}
            <div class="wh">Draft (autosaves to this device)</div>
            <textarea class="proseinput" bind:value={prose} oninput={onProseInput} placeholder="Write the chapter here. Markdown-ish; saved locally as you type."></textarea>
            <div class="wh" style="margin-top:12px">Where I'm leaving off — saved in this browser</div>
            <textarea class="scratch wpark" bind:value={park} oninput={onParkInput} placeholder="Jot where you stopped and the next move."></textarea>
          {/if}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  /* The demo's stand-in for the draft textarea: same frame, same typography, but it's a plain
     block of text with nowhere to type. Preserves the manuscript's own line breaks. */
  .demoprose {
    white-space: pre-wrap;
    overflow-y: auto;
    max-height: 60vh;
    resize: none;
    opacity: 0.92;
  }
</style>
