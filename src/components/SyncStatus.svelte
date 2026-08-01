<script lang="ts">
  /* Cloud-sync status pill (Phase 2). Self-contained, mounted once at the app root next to <Codex>.
   * Does not touch any existing view/editor.
   *
   * Signed out, it opens a small panel to paste the sync key — one long random secret, the same on
   * every device, entered once per browser and then remembered. Signed in, it collapses back to the
   * status pill. The Cloudflare Access one-time-PIN flow is still available underneath for anyone
   * running that setup instead. */
  import { sync } from '../lib/sync.svelte';

  const LABEL: Record<string, string> = {
    off: 'Sync off',
    checking: 'Checking…',
    syncing: 'Syncing…',
    synced: 'Synced',
    offline: 'Offline',
    error: 'Sync error',
  };

  let showConnect = $derived(sync.status === 'off' && !sync.signedIn);

  let open = $state(false);
  let keyInput = $state('');
  let busy = $state(false);
  let error = $state<string | null>(null);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (busy) return;
    busy = true;
    error = null;
    const r = await sync.setKey(keyInput);
    busy = false;
    if (r.ok) {
      keyInput = '';
      open = false;
    } else {
      error = r.error;
    }
  }
</script>

<div class="wrap">
  {#if open && showConnect}
    <form class="panel" onsubmit={submit}>
      <div class="title">Connect this device</div>
      <p class="blurb">
        Paste your sync key. It's the same key on every device — that's what makes them one library.
      </p>
      <!-- svelte-ignore a11y_autofocus -->
      <input
        type="password"
        bind:value={keyInput}
        placeholder="Sync key"
        autocomplete="off"
        autocapitalize="off"
        autocorrect="off"
        spellcheck="false"
        autofocus
        disabled={busy}
      />
      {#if error}<div class="err">{error}</div>{/if}
      <div class="row">
        <button class="go" type="submit" disabled={busy || !keyInput.trim()}>
          {busy ? 'Checking…' : 'Connect'}
        </button>
        <button class="ghost" type="button" onclick={() => { open = false; error = null; }}>Cancel</button>
      </div>
      <button class="link" type="button" onclick={() => sync.signIn()}>
        Or sign in with Cloudflare Access
      </button>
    </form>
  {/if}

  {#if showConnect}
    <button class="pill signin" onclick={() => (open = !open)} title="Connect this device to sync">
      <span class="dot off"></span> Connect sync
    </button>
  {:else}
    <button
      class="pill"
      onclick={() => sync.syncNow()}
      title={sync.email ? `Signed in as ${sync.email}` : 'Sync'}
      disabled={sync.status === 'syncing'}
    >
      <span class="dot {sync.status}"></span>
      {LABEL[sync.status] ?? 'Sync'}
      {#if sync.pending > 0 && sync.status !== 'syncing'}<span class="badge">{sync.pending}</span>{/if}
    </button>
  {/if}
</div>

<style>
  .wrap {
    position: fixed;
    left: 12px;
    bottom: 12px;
    z-index: 40;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font: inherit;
    font-size: 12px;
    color: var(--muted, #9aa4b2);
    background: var(--panel, #171a21);
    border: 1px solid var(--line, #262b36);
    border-radius: 999px;
    padding: 6px 11px;
    cursor: pointer;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
    transition: color 0.15s, border-color 0.15s;
  }
  .pill:hover:not(:disabled) {
    color: var(--fg, #e6e9ef);
    border-color: var(--accent, #6ea8fe);
  }
  .pill:disabled {
    cursor: default;
    opacity: 0.8;
  }
  .signin {
    color: var(--fg, #e6e9ef);
    border-color: var(--accent, #6ea8fe);
  }
  .panel {
    width: min(20rem, calc(100vw - 24px));
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    border-radius: 10px;
    background: var(--panel, #171a21);
    border: 1px solid var(--line, #262b36);
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.45);
    font-size: 12px;
    color: var(--fg, #e6e9ef);
  }
  .title {
    font-weight: 600;
  }
  .blurb {
    margin: 0;
    color: var(--muted, #9aa4b2);
    line-height: 1.4;
  }
  .panel input {
    width: 100%;
    box-sizing: border-box;
    font: inherit;
    color: inherit;
    background: var(--bg, #0f1116);
    border: 1px solid var(--line, #262b36);
    border-radius: 6px;
    padding: 7px 9px;
  }
  .panel input:focus {
    outline: none;
    border-color: var(--accent, #6ea8fe);
  }
  .err {
    color: #e5544b;
    line-height: 1.4;
  }
  .row {
    display: flex;
    gap: 8px;
  }
  .go,
  .ghost {
    font: inherit;
    border-radius: 6px;
    padding: 6px 12px;
    cursor: pointer;
    border: 1px solid var(--line, #262b36);
  }
  .go {
    background: var(--accent, #6ea8fe);
    border-color: var(--accent, #6ea8fe);
    color: #06101f;
    font-weight: 600;
  }
  .go:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .ghost {
    background: transparent;
    color: var(--muted, #9aa4b2);
  }
  .link {
    font: inherit;
    font-size: 11px;
    background: none;
    border: none;
    padding: 0;
    color: var(--muted, #9aa4b2);
    text-decoration: underline;
    cursor: pointer;
    align-self: flex-start;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--muted, #9aa4b2);
    flex: none;
  }
  .dot.synced {
    background: #46c06b;
  }
  .dot.syncing {
    background: var(--accent, #6ea8fe);
    animation: pulse 1s ease-in-out infinite;
  }
  .dot.offline {
    background: #d9a441;
  }
  .dot.error {
    background: #e5544b;
  }
  .dot.off {
    background: var(--muted, #9aa4b2);
  }
  .badge {
    background: var(--accent, #6ea8fe);
    color: #06101f;
    border-radius: 999px;
    padding: 0 6px;
    font-size: 11px;
    font-weight: 600;
    line-height: 16px;
  }
  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.35;
    }
  }
</style>
