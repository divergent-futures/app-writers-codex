<script lang="ts">
  import * as E from '../../lib/render/engine.js';
  import type { ReferenceCollection, ReferencePackInfo } from '../../lib/schema';
  import {
    listPacks, ensurePack, refetchPack, removePack, fetchManifest,
    getHiddenPackIds, setHiddenPackIds, type PackChoice,
  } from '../../lib/packs';

  let { rev, onPacksChange }: { rev: number; onPacksChange: () => Promise<void> } = $props();

  let kind = $state('all');
  let query = $state('');
  let cat = $state('');

  /* The library. Packs are fetched on demand and cached in IndexedDB rather than bundled — all
   * twelve would be 9.2 MB in the JS bundle, which a phone would pay on first load to read one.
   * Everything downloaded is merged into one reference set (see lib/packs.ts) and filtered here by
   * the pack buttons, so two genres' tropes can sit side by side. What is switched OFF is what gets
   * remembered, in localStorage rather than on the project: filtering the reference while you write
   * is a reading choice, not an edit to the book, and must never dirty the sync outbox. */
  let choices = $state<PackChoice[]>([]);
  let hidden = $state<string[]>(getHiddenPackIds());
  let busy = $state('');
  let problem = $state('');
  let note = $state('');
  let confirming = $state('');

  $effect(() => {
    rev; // re-read after a hydrate: that is when versions get backfilled off the merged set
    listPacks().then((c) => (choices = c));
  });

  const loaded = $derived.by<ReferencePackInfo[]>(() => {
    rev;
    return E.refPacks() as ReferencePackInfo[];
  });
  const visible = $derived(loaded.filter((p) => !hidden.includes(p.id)).map((p) => p.id));

  function persist(next: string[]) {
    hidden = next;
    setHiddenPackIds(next);
  }
  function togglePack(id: string) {
    persist(hidden.includes(id) ? hidden.filter((x) => x !== id) : [...hidden, id]);
  }
  const showAll = () => persist([]);
  const showNone = () => persist(loaded.map((p) => p.id));

  /* ---- the library panel: download, update, remove ---- */

  interface Row {
    id: string; label: string; entryCount: number; approxSizeKB?: number;
    cached: boolean; version: string | null; latest: string | null; updatable: boolean; builtin: boolean;
  }

  /* Manifest rows and loaded packs are two different truths and both matter: offline the manifest is
   * empty, and the packs already downloaded are perfectly usable and must still be listed. */
  const rows = $derived.by<Row[]>(() => {
    const by = new Map<string, Row>();
    for (const p of loaded)
      by.set(p.id, {
        id: p.id, label: p.label, entryCount: p.entryCount,
        cached: !p.builtin, version: p.packVersion ?? null, latest: null, updatable: false, builtin: !!p.builtin,
      });
    for (const c of choices) {
      const r = by.get(c.id);
      if (r) {
        r.label = c.label; r.approxSizeKB = c.approxSizeKB; r.latest = c.packVersion;
        r.updatable = c.updatable && !r.builtin; r.version = r.version ?? c.cachedVersion;
      } else {
        by.set(c.id, {
          id: c.id, label: c.label, entryCount: c.entryCount, approxSizeKB: c.approxSizeKB,
          cached: false, version: null, latest: c.packVersion, updatable: false, builtin: false,
        });
      }
    }
    return [...by.values()].sort((a, b) => (a.cached === b.cached ? a.label.localeCompare(b.label) : a.cached ? -1 : 1));
  });

  function size(kb?: number) {
    if (!kb) return '';
    return kb >= 1024 ? `${Math.round((kb / 1024) * 10) / 10} MB` : `${Math.round(kb)} KB`;
  }

  async function after() {
    await onPacksChange(); // re-hydrate in place — a reload would drop the reader back on the dashboard
    choices = await listPacks();
  }
  const clear = () => { problem = ''; note = ''; confirming = ''; };

  async function download(id: string) {
    clear(); busy = id;
    const p = await ensurePack(id);
    busy = '';
    if (!p) { problem = 'That pack could not be reached. It stays available once downloaded — try again on a connection.'; return; }
    note = `${p.name || id} downloaded — ${(p.entries || []).length} entries${p.packVersion ? `, v${p.packVersion}` : ''}.`;
    await after();
  }

  /* Every one of these says what it did, and an update that changed nothing says THAT. A button that
   * reports only failure looks identical, from the outside, to a button that is broken. */
  async function update(id: string) {
    const was = rows.find((r) => r.id === id)?.version || null;
    const wanted = rows.find((r) => r.id === id)?.latest || null;
    clear(); busy = id;
    const p = await refetchPack(id);
    busy = '';
    if (!p) { problem = 'The update could not be fetched. Your downloaded copy is untouched.'; return; }
    const now = p.packVersion || null;
    const n = (p.entries || []).length;
    if (wanted && now && now !== wanted) {
      problem = `The library still returned v${now} rather than v${wanted}. That is a stale copy in the CDN's edge cache, not your app — try again in a few minutes.`;
    } else if (was && now && was === now) {
      note = `${p.name || id} was already current at v${now} — ${n} entries.`;
    } else {
      note = `${p.name || id} updated${was ? ` from v${was}` : ''}${now ? ` to v${now}` : ''} — now ${n} entries.`;
    }
    await after();
  }

  /* The manifest is fetched once per page load and memoised, so without this the app cannot learn
   * about a pack published while it was open — and the reader has no way to ask. */
  async function checkForUpdates() {
    clear(); busy = '*';
    await fetchManifest(true);
    choices = await listPacks();
    busy = '';
    const behind = choices.filter((c) => c.updatable);
    const fresh = choices.filter((c) => !c.cached);
    note = behind.length
      ? `${behind.length} pack${behind.length === 1 ? '' : 's'} behind: ${behind.map((c) => c.label).join(', ')}.`
      : fresh.length
        ? `Everything downloaded is current. ${fresh.length} more available to download.`
        : 'Everything is current.';
  }


  /* One press for a fresh device: refresh the index, download every pack not yet on this device,
   * and update every pack the index says is behind. Says exactly what it did (and skipped), so a
   * pack that failed is named rather than silently missing. TJ asked for this 2026-09-03. */
  async function downloadOrUpdateAll() {
    clear(); busy = '*';
    await fetchManifest(true);
    choices = await listPacks();
    const todo = choices.filter((c) => !c.cached || c.updatable);
    if (!todo.length) { busy = ''; note = 'Everything is downloaded and current.'; return; }
    const got: string[] = []; const upd: string[] = []; const failed: string[] = [];
    for (const c of todo) {
      const p = c.cached ? await refetchPack(c.id) : await ensurePack(c.id);
      if (!p) failed.push(c.label);
      else if (c.cached) upd.push(`${c.label} v${p.packVersion ?? '?'}`);
      else got.push(`${c.label} (${(p.entries || []).length})`);
    }
    busy = '';
    const parts: string[] = [];
    if (got.length) parts.push(`downloaded ${got.join(', ')}`);
    if (upd.length) parts.push(`updated ${upd.join(', ')}`);
    note = parts.length ? parts.join('; ') + '.' : '';
    if (failed.length) problem = `Could not fetch: ${failed.join(', ')}. Try again on a connection.`;
    await after();
  }

  async function drop(id: string) {
    const label = rows.find((r) => r.id === id)?.label || id;
    clear(); busy = id;
    await removePack(id);
    persist(hidden.filter((x) => x !== id));
    busy = '';
    note = `${label} removed. Download it again any time — nothing you wrote lives in a pack.`;
    await after();
  }

  /* ---- the reference itself ---- */

  const hasData = $derived.by(() => {
    rev;
    return E.refHasData();
  });
  const collections = $derived.by<ReferenceCollection[]>(() => {
    rev;
    return (E.refCollections(visible) || []) as ReferenceCollection[];
  });
  const catOptions = $derived.by(() => {
    rev;
    return E.refCatsOptions(kind, visible);
  });
  const body = $derived.by(() => {
    rev;
    return E.refBody(kind, query, cat, visible);
  });

  // switching a pack off can take the selected collection with it — don't leave a dead filter on
  $effect(() => {
    if (kind !== 'all' && !collections.some((c) => c.id === kind)) { kind = 'all'; cat = ''; }
  });

  function pickKind(k: string) {
    kind = k;
    cat = ''; // category list is scoped to the kind
  }
</script>

{#if loaded.length}
  <div class="mbtns packbar">
    <button class="mbtn" class:on={visible.length === loaded.length} onclick={showAll}>All packs</button>
    {#if loaded.length > 1}
      <button class="mbtn" class:on={visible.length === 0} onclick={showNone}>None</button>
    {/if}
    {#each loaded as p (p.id)}
      <button class="mbtn" class:on={!hidden.includes(p.id)} onclick={() => togglePack(p.id)}>
        {p.label} <span class="refcount">{p.entryCount}</span>
      </button>
    {/each}
  </div>
{/if}

<details class="packmgr">
  <summary>Manage packs <span class="refcount">{loaded.length} in your library</span></summary>
  <div class="packacts" style="padding:8px 0">
    <button class="pbtn go" onclick={downloadOrUpdateAll} disabled={busy === '*'}>
      {busy === '*' ? 'Working…' : 'Download / update all'}
    </button>
    <button class="pbtn" onclick={checkForUpdates} disabled={busy === '*'}>
      {busy === '*' ? 'Checking…' : 'Check for updates'}
    </button>
  </div>
  {#if problem}<p class="packmsg bad">{problem}</p>{/if}
  {#if note}<p class="packmsg">{note}</p>{/if}
  {#if !rows.length}
    <p class="empty">No packs, and the library index could not be reached. Try again on a connection.</p>
  {/if}
  {#each rows as r (r.id)}
    <div class="packrow">
      <div>
        <b>{r.label}</b>
        <span class="refcount">
          {r.entryCount} entries{r.approxSizeKB ? ` · ${size(r.approxSizeKB)}` : ''}{r.version ? ` · v${r.version}` : ''}
        </span>
        {#if r.builtin}<span class="refcat">built in</span>
        {:else if r.updatable}<span class="refcat">v{r.latest} available</span>{/if}
      </div>
      <div class="packacts">
        {#if busy === r.id}
          <span class="refcount">working…</span>
        {:else if r.builtin}
          <span class="refcount">bundled with the app</span>
        {:else if !r.cached}
          <button class="pbtn" onclick={() => download(r.id)}>Download</button>
        {:else}
          {#if r.latest}
            <button class="pbtn" class:go={r.updatable} onclick={() => update(r.id)}>
              {r.updatable ? `Update to v${r.latest}` : 'Re-download'}
            </button>
          {/if}
          {#if confirming === r.id}
            <button class="pbtn warn" onclick={() => drop(r.id)}>Remove for good?</button>
            <button class="pbtn" onclick={() => (confirming = '')}>Keep</button>
          {:else}
            <button class="pbtn" onclick={() => (confirming = r.id)}>Remove</button>
          {/if}
        {/if}
      </div>
    </div>
  {/each}
</details>

{#if !hasData}
  <p class="empty">No reference library loaded. Open <b>Manage packs</b> above and download one.</p>
{:else if !visible.length}
  <p class="empty">Every pack is switched off. Turn one back on above, or press <b>All packs</b>.</p>
{:else}
  <div class="legend">
    Your whole reference — tropes, tech, science, authors, craft, and more. Filter here, or search
    from the top bar while you write.
  </div>
  <div class="mbtns" style="flex-wrap:wrap">
    <button class="mbtn" class:on={kind === 'all'} onclick={() => pickKind('all')}>All <span class="refcount">{E.refCount('all', visible)}</span></button>
    {#each collections as c (c.id)}
      <button class="mbtn" class:on={kind === c.id} onclick={() => pickKind(c.id)}>{c.label} <span class="refcount">{E.refCount(c.id, visible)}</span></button>
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
