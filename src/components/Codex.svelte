<script lang="ts">
  import { tick } from 'svelte';
  import { app } from '../lib/stores/app.svelte';
  import * as E from '../lib/render/engine.js';
  import { hydrate } from '../lib/render/hydrate';
  import { setImageProject, hydrateImages, handleImageClick } from '../lib/images';
  import ProjectSwitcher from './ProjectSwitcher.svelte';
  import Capture from './Capture.svelte';
  import EntityEditor from './EntityEditor.svelte';
  import CharacterEditor from './CharacterEditor.svelte';
  import { isEditable } from '../lib/edit';
  import { DEMO } from '../lib/mode';
  import { COLLECTION_KEYS } from '../lib/schema';
  import Characters from './views/Characters.svelte';
  import Timeline from './views/Timeline.svelte';
  import CharacterBoard from './views/Matrix.svelte'; // file not yet renamed — see craft-registry-phase3 build log
  import WebGraph from './views/WebGraph.svelte';
  import Reference from './views/Reference.svelte';
  import Write from './views/Write.svelte';

  const VIEWS: [string, string][] = [
    ['dashboard', 'Dashboard'], ['loops', 'Open loops'], ['timeline', 'Timeline'], ['characters', 'Characters'],
    ['books', 'Books'], ['board', 'Character Board'], ['web', 'Web'], ['lessons', 'Lessons'], ['themes', 'Themes'],
    ['faiths', 'Faiths'], ['pantheon', 'Pantheon'], ['threads', 'Threads'], ['worlds', 'Worlds'], ['outline', 'Outline'],
    ['write', 'Write'], ['notes', 'Notes'], ['research', 'Research'], ['reading', 'Reading'], ['reference', 'Reference'],
  ];

  let view = $state('dashboard');
  let rev = $state(0);
  let ready = $state(false);
  let query = $state('');
  let searchOpen = $state(false);
  let detailType = $state('');
  let detailId = $state('');
  let editing = $state(false);
  let writeTarget = $state('');
  let idx: any[] = $state([]);

  // The drawer content is DERIVED from the open entity + rev, so an edit/save (which bumps rev)
  // auto-refreshes the drawer — no manual re-render, and a deleted entity resolves to '' (closes).
  const detail = $derived.by(() => {
    rev;
    return detailType && detailId ? E.detailHTML(detailType, detailId) : '';
  });

  let hostEl: HTMLElement;
  let drawerEl = $state<HTMLElement | null>(null);

  let rehydrateSeq = 0;
  async function rehydrate() {
    const a = app.active;
    if (!a) return;
    const token = ++rehydrateSeq; // sequence guard: a newer call supersedes this one
    const hy = await hydrate(a.id, a.data);
    if (token !== rehydrateSeq) return; // stale (project switched / re-saved mid-flight) — drop it
    E.setData(hy);
    setImageProject(a.id);
    idx = E.buildSearchIndex();
    rev++;
    ready = true;
  }

  // rebuild the hydrated render data whenever the active project (or its updatedAt) changes
  $effect(() => {
    const id = app.active?.id;
    if ([id, app.active?.updatedAt].length && id) void rehydrate();
  });

  // close transient UI (drawer, editor, search) when the project itself changes
  let lastActiveId = '';
  $effect(() => {
    const id = app.active?.id ?? '';
    if (id !== lastActiveId) {
      lastActiveId = id;
      closeDetail();
      editing = false;
      searchOpen = false;
    }
  });

  // hydrate photo slots after each render pass
  $effect(() => {
    if ([view, rev].length) tick().then(() => { if (hostEl) hydrateImages(hostEl); });
  });
  $effect(() => {
    if ([detail].length) tick().then(() => { if (drawerEl) hydrateImages(drawerEl); });
  });

  const results = $derived.by(() => {
    rev;
    return query.trim() ? E.searchResults(idx, query) : '';
  });

  // dashboard runtime (resume card) — project-scoped browser-local memory
  const dashRt = $derived.by(() => {
    rev;
    const pid = app.active?.id ?? '';
    let last = '';
    try {
      last = localStorage.getItem(`wc_${pid}_lastChapter`) || '';
    } catch {
      /* ignore */
    }
    let park = '';
    if (last) {
      try {
        park = localStorage.getItem(`wc_${pid}_park_${last}`) || '';
      } catch {
        /* ignore */
      }
    }
    return { lastChapter: last, lastPark: park };
  });

  // static views rendered from the engine (interactive ones are dedicated components)
  const staticHtml = $derived.by(() => {
    rev;
    switch (view) {
      case 'dashboard': return E.vDashboard(dashRt);
      case 'loops': return E.vLoops();
      case 'books': return E.vBooks();
      case 'lessons': return E.vLessons();
      case 'themes': return E.vThemes();
      case 'faiths': return E.vFaiths();
      case 'pantheon': return E.vPantheon();
      case 'threads': return E.vThreads();
      case 'worlds': return E.vWorlds();
      case 'outline': return E.vOutline();
      case 'notes': return E.vNotes();
      case 'research': return E.vResearch();
      case 'reading': return E.vReading();
      default: return '';
    }
  });

  const titleOf = (v: string) => VIEWS.find((x) => x[0] === v)?.[1] ?? '';

  // first-run onboarding: show a welcome until the project has content or the user dismisses it
  const isEmptyProject = $derived.by(() => {
    rev;
    const d = app.active?.data;
    return d ? COLLECTION_KEYS.every((k) => (d[k]?.length ?? 0) === 0) : false;
  });
  let welcomeDismissed = $state(false);

  async function loadExample() {
    try {
      await app.loadSampleWorld();
    } catch (e) {
      alert('No example world is bundled in this build. Start blank and use + to capture your first idea.');
    }
  }

  async function loadPrivateSample() {
    try {
      await app.loadPrivateSample();
    } catch (e) {
      alert('No private sample is bundled in this build.');
    }
  }

  async function onHostClick(e: MouseEvent) {
    if (await handleImageClick(e)) return;
    const t = e.target as HTMLElement;
    const goto = t.closest('[data-goto]');
    if (goto) { view = (goto as HTMLElement).dataset.goto || 'dashboard'; return; }
    const res = t.closest('[data-resume]');
    if (res) { writeTarget = res.getAttribute('data-resume') || ''; view = 'write'; return; }
    const det = t.closest('[data-detail]');
    if (det) {
      const raw = det.getAttribute('data-detail') || '';
      const i = raw.indexOf(':');
      if (i > 0) {
        detailType = raw.slice(0, i);
        detailId = raw.slice(i + 1); // `detail` derives from these + rev
      }
      searchOpen = false;
      return;
    }
  }

  function closeDetail() {
    detailType = '';
    detailId = '';
  }
  // save() bumps updatedAt -> the rehydrate effect runs -> rev++ -> the derived drawer refreshes.
  function afterEdit() {
    /* drawer auto-refreshes reactively; nothing to do */
  }
  function afterDelete() {
    closeDetail();
  }

  function onWindowClick(e: MouseEvent) {
    // close the search dropdown when clicking anywhere outside the search box
    if (searchOpen && !(e.target as HTMLElement).closest('.searchwrap')) searchOpen = false;
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') { if (!editing) closeDetail(); searchOpen = false; }
    if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement?.tagName) || '')) {
      e.preventDefault();
      (document.getElementById('codex-search') as HTMLInputElement)?.focus();
    }
  }

  // Notes scratch (project-scoped)
  const scratchKey = $derived(`wc_${app.active?.id ?? ''}_scratch`);
  let scratch = $state('');
  $effect(() => {
    const k = scratchKey;
    try { scratch = localStorage.getItem(k) || ''; } catch { scratch = ''; }
  });
  function onScratch() {
    try { localStorage.setItem(scratchKey, scratch); } catch { /* ignore */ }
  }
</script>

<svelte:window onkeydown={onKey} onclick={onWindowClick} />

<header>
  <h1>Writer’s Codex</h1>
  <div class="searchwrap">
    <input
      id="codex-search"
      bind:value={query}
      oninput={() => (searchOpen = true)}
      onfocus={() => (searchOpen = !!query.trim())}
      placeholder="Search everything…  ( / )"
      autocomplete="off"
    />
    {#if searchOpen && query.trim()}
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div id="results" class="on" onclick={onHostClick}>
        {@html results}
      </div>
    {/if}
  </div>
  <ProjectSwitcher />
</header>

<nav class="mainnav">
  {#each VIEWS as [id, label] (id)}
    <button class:on={view === id} onclick={() => (view = id)}>{label}</button>
  {/each}
</nav>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions, a11y_no_noninteractive_element_interactions -->
<main bind:this={hostEl} onclick={onHostClick}>
  {#if !ready}
    <p class="muted">Loading…</p>
  {:else}
    {#if isEmptyProject && !welcomeDismissed && view === 'dashboard' && !DEMO}
      <div class="callout welcome">
        <b>Welcome to Writer’s Codex.</b> This is your world — it starts empty and lives entirely on
        this device. Tap the <b>+</b> button (bottom-right) to capture a character or idea{#if app.hasExampleWorld}, or explore a fully-built example first{/if}.
        <div class="row" style="margin-top:10px;gap:8px">
          {#if app.hasExampleWorld}
            <button class="btn primary" onclick={loadExample}>Load the example world</button>
          {/if}
          {#if app.hasPrivateSample}
            <button class="btn primary" onclick={loadPrivateSample}>Load Cosmos (private)</button>
          {/if}
          <button class="btn" onclick={() => (welcomeDismissed = true)}>Start blank</button>
        </div>
      </div>
    {/if}
    {#if view !== 'dashboard'}<h2 class="viewtitle">{titleOf(view)}</h2>{/if}

    {#if view === 'timeline'}
      <Timeline {rev} />
    {:else if view === 'characters'}
      <Characters {rev} />
    {:else if view === 'board'}
      <CharacterBoard {rev} />
    {:else if view === 'web'}
      <WebGraph {rev} />
    {:else if view === 'reference'}
      <Reference {rev} />
    {:else if view === 'write'}
      <Write {rev} target={writeTarget} onProseChange={rehydrate} onTargetConsumed={() => (writeTarget = '')} />
    {:else if view === 'notes'}
      {#if !DEMO}
        <div class="callout warn">
          <b>Quick scratch</b> — saved in this browser only.
          <textarea class="scratch" bind:value={scratch} oninput={onScratch} placeholder="Jot anything…"></textarea>
        </div>
      {/if}
      {@html staticHtml}
    {:else}
      {@html staticHtml}
    {/if}
  {/if}
</main>

<Capture />

{#if detail}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="overlay on" onclick={(e) => { if (e.target === e.currentTarget) closeDetail(); }}>
    <div class="modal">
      <button class="mclose" onclick={closeDetail} aria-label="Close">×</button>
      {#if isEditable(detailType) && !DEMO}
        <div class="drawertools">
          <button class="btn" onclick={() => (editing = true)}>Edit</button>
        </div>
      {/if}
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div class="mcontent" bind:this={drawerEl} onclick={onHostClick}>
        {@html detail}
      </div>
    </div>
  </div>
{/if}

{#if editing && detailType === 'character'}
  <CharacterEditor
    id={detailId}
    onClose={() => (editing = false)}
    onSaved={afterEdit}
    onDeleted={afterDelete}
  />
{:else if editing && isEditable(detailType)}
  <EntityEditor
    type={detailType}
    id={detailId}
    onClose={() => (editing = false)}
    onSaved={afterEdit}
    onDeleted={afterDelete}
  />
{/if}

<style>
  .mainnav {
    position: sticky;
    top: 57px;
    z-index: 15;
    background: var(--bg);
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    padding: 10px 24px;
    border-bottom: 1px solid var(--line);
  }
  .viewtitle { margin-bottom: 14px; }
  .drawertools { position: absolute; top: 12px; left: 16px; z-index: 2; }
  .drawertools .btn { padding: 5px 12px; font-size: 12.5px; }
  @media (max-width: 760px) {
    .mainnav {
      top: 0;
      position: static;
      padding: 10px 14px;
      flex-wrap: nowrap;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }
    .mainnav button { white-space: nowrap; flex: 0 0 auto; }
  }
</style>
