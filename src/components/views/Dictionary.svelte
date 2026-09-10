<!--
  The writer's dictionary.

  Built for a stated purpose (TJ, 2026-09-09): "it's more to slowly teach me more grammar and
  increase my vocabulary." So this view leads with the USAGE EXAMPLE — the part that teaches — keeps
  a trail of what has been looked up, and makes every synonym, broader and narrower word a link, so
  one look-up can wander into five. It is a place to read, not only a place to check.

  The data is downloaded on demand and stored per first letter; see src/lib/dictionary.ts for why it
  is never loaded whole.
-->
<script lang="ts">
  import {
    dictionaryStatus, downloadDictionary, removeDictionary, lookup, startingWith,
    type DictionaryStatus, type DictionaryEntry,
  } from '../../lib/dictionary';
  import { getMeta, setMeta } from '../../lib/db';

  let status = $state<DictionaryStatus | null>(null);
  let busy = $state(false);
  let progress = $state('');
  let error = $state('');
  let query = $state('');
  let matches = $state<string[]>([]);
  let entry = $state<DictionaryEntry | null>(null);
  let recent = $state<string[]>([]);
  let searchTimer: ReturnType<typeof setTimeout> | null = null;

  const MB = (b: number) => (b / 1e6).toFixed(1) + ' MB';

  $effect(() => {
    dictionaryStatus().then((s) => (status = s));
    getMeta<string[]>('dictRecent').then((r) => (recent = r ?? []));
  });

  async function download() {
    busy = true; error = '';
    const res = await downloadDictionary((done, total, label) => {
      progress = `${done} of ${total}${label && label !== 'starting' ? ` — ${label}` : ''}`;
    });
    busy = false; progress = '';
    if (!res.ok) error = res.error ?? 'Download failed.';
    status = await dictionaryStatus();
  }

  async function remove() {
    await removeDictionary(status?.index?.language ?? 'en');
    entry = null; matches = []; query = '';
    status = await dictionaryStatus();
  }

  function onType() {
    entry = null;
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      matches = query.trim().length ? await startingWith(query) : [];
    }, 120);
  }

  async function open(word: string) {
    const found = await lookup(word);
    if (!found) { error = `“${word}” is not in the dictionary.`; return; }
    error = ''; entry = found; matches = []; query = found.word;
    recent = [found.word, ...recent.filter((w) => w !== found.word)].slice(0, 12);
    setMeta('dictRecent', recent);
  }

  function onSubmit(e: Event) {
    e.preventDefault();
    if (query.trim()) open(matches[0] ?? query.trim());
  }
  const exText = (x: string | { t: string; q: string }) => (typeof x === 'string' ? x : x.t);
  const exFrom = (x: string | { t: string; q: string }) => (typeof x === 'string' ? '' : x.q);
</script>

{#if status && !status.available}
  <p class="empty">This build doesn't include a dictionary yet.</p>
{:else if status && !status.downloaded}
  <div class="callout warn">
    <b>{status.index?.label ?? 'Dictionary'} — {MB(status.index?.totalBytes ?? 0)}</b>
    <p class="dsub">
      {status.index?.headwords.toLocaleString()} words, {status.index?.headwordsWithExample.toLocaleString()}
      of them with a sentence showing the word in use. Downloaded once, then it works offline.
      {#if status.have > 0}<br />Partly downloaded — {status.have} of {status.total} parts. Carrying on won't re-fetch what's here.{/if}
    </p>
    <button class="btn" onclick={download} disabled={busy}>
      {busy ? `Downloading… ${progress}` : status.have > 0 ? 'Resume download' : 'Download the dictionary'}
    </button>
  </div>
{/if}

{#if status?.downloaded}
  <form class="dsearch" onsubmit={onSubmit}>
    <input class="cfilter" bind:value={query} oninput={onType} placeholder="Look up a word…" autocomplete="off" autocapitalize="off" spellcheck="false" />
  </form>

  {#if recent.length && !entry}
    <div class="drecent">
      <span class="mlabel">Looked up</span>
      {#each recent as w}<button class="dchip" onclick={() => open(w)}>{w}</button>{/each}
    </div>
  {/if}

  {#if matches.length}
    <div class="drecent">
      {#each matches as w}<button class="dchip" onclick={() => open(w)}>{w}</button>{/each}
    </div>
  {/if}
{/if}

{#if error}<p class="empty">{error}</p>{/if}

{#if entry}
  <div class="dword">{entry.word}</div>
  {#each entry.senses as s}
    <div class="dsense">
      <div class="dhead"><span class="dpos">{s.p}</span>{s.d}</div>
      {#if s.x?.length}
        {#each s.x as x}
          <div class="dex">“{exText(x)}”{#if exFrom(x)}<span class="dq"> — {exFrom(x)}</span>{/if}</div>
        {/each}
      {/if}
      {#if s.s?.length}
        <div class="drow"><span class="mlabel">Also</span>{#each s.s as w}<button class="dchip" onclick={() => open(w)}>{w}</button>{/each}</div>
      {/if}
      {#if s.b?.length}
        <div class="drow"><span class="mlabel">Broader</span>{#each s.b as w}<button class="dchip" onclick={() => open(w)}>{w}</button>{/each}</div>
      {/if}
      {#if s.n?.length}
        <div class="drow"><span class="mlabel">Narrower</span>{#each s.n as w}<button class="dchip" onclick={() => open(w)}>{w}</button>{/each}</div>
      {/if}
    </div>
  {/each}
{/if}

{#if status?.downloaded && status.index}
  <!-- CC BY requires the credit to travel with the data; read from the manifest so a future
       language carries its own line rather than inheriting English's. -->
  <div class="dfoot">
    {status.index.attribution} · built {status.index.built} ·
    {MB(status.index.totalBytes)} stored on this device ·
    <button class="dlink" onclick={remove}>remove</button>
  </div>
{/if}

<style>
  .dsub { font-size: 13px; color: var(--muted); margin: 6px 0 10px; line-height: 1.5; }
  .dsearch { margin-bottom: 6px; }
  .drecent { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 6px 0 16px; }
  .dchip {
    background: var(--panel2); border: 1px solid var(--line); color: var(--accent);
    font-size: 12.5px; padding: 4px 10px; border-radius: 20px; cursor: pointer;
  }
  .dchip:hover { border-color: var(--accent); color: var(--ink); }
  .dword { font-size: 27px; font-weight: 700; margin: 10px 0 14px; }
  .dsense { border-left: 2px solid var(--line); padding: 2px 0 2px 14px; margin: 0 0 18px; }
  .dhead { font-size: 15px; color: #d4d8e0; line-height: 1.5; }
  .dpos {
    display: inline-block; font-size: 10.5px; text-transform: uppercase; letter-spacing: .05em;
    color: var(--accent2); margin-right: 9px; vertical-align: 1px;
  }
  /* the example is the reason this view exists — it reads, it does not just sit in a list */
  .dex { font: italic 15px/1.6 Georgia, "Times New Roman", serif; color: var(--ink); margin: 8px 0 0; }
  .dq { font-style: normal; font-size: 12px; color: var(--muted); }
  .drow { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 9px; }
  .dfoot { font-size: 11.5px; color: var(--muted); margin-top: 28px; border-top: 1px solid var(--line); padding-top: 10px; }
  .dlink { background: none; border: none; color: var(--muted); text-decoration: underline; cursor: pointer; font: inherit; padding: 0; }
  .dlink:hover { color: var(--bad); }
</style>
