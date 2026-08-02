<script lang="ts">
  /* Cloud-sync status (Phase 2). Self-contained, mounted once at the app root next to <Codex>.
   * Does not touch any existing view/editor.
   *
   * WHY THIS IS LOUD WHEN DISCONNECTED
   * This used to be a 12px pill in the extreme bottom-left corner, dark on dark. On a device that had
   * never been connected, the entire library silently wasn't there and nothing on screen said so —
   * you had to already know to look in that corner. A device with no key now gets a full-width bar
   * across the top of the app that cannot be missed, and the key form opens as a centred dialog
   * rather than a small popover glued to the corner.
   *
   * Once connected it collapses back to the quiet corner pill, which is the right weight for a thing
   * that normally just says "Synced". Clicking the pill opens the details panel — status, what failed
   * in the server's own words, and anything too large to sync.
   */
  import { sync } from '../lib/sync.svelte';

  const LABEL: Record<string, string> = {
    off: 'Sync off',
    checking: 'Checking…',
    syncing: 'Syncing…',
    synced: 'Synced',
    offline: 'Offline',
    error: 'Sync problem',
  };

  /** Disconnected = no key stored on this device. That is the case the banner exists for. */
  let disconnected = $derived(!sync.hasKey && !sync.signedIn);

  let showForm = $state(false);
  let showDetails = $state(false);
  let keyInput = $state('');
  let busy = $state(false);
  let error = $state<string | null>(null);

  /* Push the app down so the banner never covers the first row of the interface. Cleaned up the
   * moment the device connects. */
  $effect(() => {
    if (typeof document === 'undefined') return;
    document.body.style.paddingTop = disconnected ? '46px' : '';
    return () => {
      document.body.style.paddingTop = '';
    };
  });

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (busy) return;
    busy = true;
    error = null;
    const r = await sync.setKey(keyInput);
    busy = false;
    if (r.ok) {
      keyInput = '';
      showForm = false;
    } else {
      error = r.error;
    }
  }

  function ago(t: number | null): string {
    if (!t) return 'not yet';
    const s = Math.round((Date.now() - t) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    return `${Math.round(s / 3600)} h ago`;
  }
</script>

{#if disconnected}
  <!-- Unmissable, because the alternative is a writer staring at a library that looks empty. -->
  <div class="banner" role="status">
    <span class="warn" aria-hidden="true">●</span>
    <span class="banner-text">
      <strong>This device isn't connected to your library yet.</strong>
      Your books live in the cloud — connect once and they appear here.
    </span>
    <button class="banner-go" type="button" onclick={() => (showForm = true)}>Connect this device</button>
  </div>
{/if}

{#if showForm}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="scrim" onclick={() => { showForm = false; error = null; }}></div>
  <div class="dialog" role="dialog" aria-modal="true" aria-label="Connect this device">
    <form onsubmit={submit}>
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
        <button class="ghost" type="button" onclick={() => { showForm = false; error = null; }}>Cancel</button>
      </div>
      <button class="link" type="button" onclick={() => sync.signIn()}>
        Or sign in with Cloudflare Access
      </button>
    </form>
  </div>
{/if}

<div class="wrap">
  {#if showDetails && !disconnected}
    <div class="details">
      <div class="title">
        {LABEL[sync.status] ?? 'Sync'}
        <button class="x" type="button" onclick={() => (showDetails = false)} aria-label="Close">×</button>
      </div>
      <div class="line">Last synced: {ago(sync.lastSyncedAt)}</div>
      {#if sync.pending > 0}
        <div class="line">{sync.pending} change{sync.pending === 1 ? '' : 's'} waiting to upload.</div>
      {/if}
      {#if sync.lastError}
        <div class="err">{sync.lastError}</div>
      {/if}
      {#if sync.blocked.length}
        <div class="line blocked">
          <strong>Too large to sync — kept on this device only:</strong>
          <ul>
            {#each sync.blocked as b (b.key)}
              <li>{b.label} <span class="dim">({Math.round(b.bytes / 1024).toLocaleString('en-GB')} KB)</span></li>
            {/each}
          </ul>
          This does not stop anything else syncing.
        </div>
      {/if}
      <div class="row">
        <button class="go" type="button" onclick={() => sync.syncNow()} disabled={sync.status === 'syncing'}>
          Sync now
        </button>
        <button class="ghost" type="button" onclick={() => { sync.forgetKey(); showDetails = false; }}>
          Disconnect
        </button>
      </div>
    </div>
  {/if}

  {#if disconnected}
    <button class="pill signin" onclick={() => (showForm = true)} title="Connect this device to sync">
      <span class="dot off"></span> Connect sync
    </button>
  {:else}
    <button
      class="pill"
      onclick={() => (showDetails = !showDetails)}
      title={sync.email ? `Signed in as ${sync.email}` : 'Sync'}
    >
      <span class="dot {sync.status}"></span>
      {LABEL[sync.status] ?? 'Sync'}
      {#if sync.pending > 0 && sync.status !== 'syncing'}<span class="badge">{sync.pending}</span>{/if}
    </button>
  {/if}
</div>

<style>
  /* ---- disconnected banner ---- */
  .banner {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 70;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    box-sizing: border-box;
    background: linear-gradient(180deg, #2a3550, #1d2436);
    border-bottom: 1px solid var(--accent, #6ea8fe);
    color: var(--fg, #e6e9ef);
    font-size: 13px;
    line-height: 1.35;
    box-shadow: 0 4px 18px rgba(0, 0, 0, 0.35);
  }
  .banner .warn {
    color: #d9a441;
    font-size: 11px;
    flex: none;
  }
  .banner-text {
    flex: 1 1 auto;
    min-width: 0;
  }
  .banner-text strong {
    font-weight: 600;
  }
  .banner-go {
    flex: none;
    font: inherit;
    font-weight: 600;
    background: var(--accent, #6ea8fe);
    color: #06101f;
    border: 1px solid var(--accent, #6ea8fe);
    border-radius: 6px;
    padding: 6px 14px;
    cursor: pointer;
  }
  .banner-go:hover {
    filter: brightness(1.08);
  }
  @media (max-width: 560px) {
    .banner {
      flex-wrap: wrap;
      font-size: 12px;
    }
    .banner-go {
      width: 100%;
      padding: 8px 14px;
    }
  }

  /* ---- key dialog ---- */
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 80;
    background: rgba(4, 6, 10, 0.6);
  }
  .dialog {
    position: fixed;
    z-index: 81;
    top: 20vh;
    left: 50%;
    transform: translateX(-50%);
    width: min(24rem, calc(100vw - 24px));
    box-sizing: border-box;
    padding: 16px;
    border-radius: 12px;
    background: var(--panel, #171a21);
    border: 1px solid var(--line, #262b36);
    box-shadow: 0 18px 60px rgba(0, 0, 0, 0.6);
    font-size: 13px;
    color: var(--fg, #e6e9ef);
  }
  .dialog form {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  /* ---- corner pill ---- */
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

  /* ---- details panel ---- */
  .details {
    width: min(22rem, calc(100vw - 24px));
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
  .details .line {
    color: var(--muted, #9aa4b2);
    line-height: 1.45;
  }
  .details ul {
    margin: 4px 0 4px 0;
    padding-left: 18px;
  }
  .details .dim {
    opacity: 0.7;
  }
  .blocked strong {
    color: var(--fg, #e6e9ef);
    font-weight: 600;
  }
  .x {
    float: right;
    font: inherit;
    font-size: 16px;
    line-height: 1;
    background: none;
    border: none;
    color: var(--muted, #9aa4b2);
    cursor: pointer;
    padding: 0 2px;
  }

  .title {
    font-weight: 600;
  }
  .blurb {
    margin: 0;
    color: var(--muted, #9aa4b2);
    line-height: 1.4;
  }
  .dialog input {
    width: 100%;
    box-sizing: border-box;
    font: inherit;
    color: inherit;
    background: var(--bg, #0f1116);
    border: 1px solid var(--line, #262b36);
    border-radius: 6px;
    padding: 9px 10px;
  }
  .dialog input:focus {
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
