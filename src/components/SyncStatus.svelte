<script lang="ts">
  /* Cloud-sync status pill (Phase 2). Self-contained, mounted once at the app root next to <Codex>.
   * Does not touch any existing view/editor. Shows sync state and, when signed out, a Sign-in button
   * that kicks off the Cloudflare Access one-time-PIN flow. */
  import { sync } from '../lib/sync.svelte';

  const LABEL: Record<string, string> = {
    off: 'Sync off',
    checking: 'Checking…',
    syncing: 'Syncing…',
    synced: 'Synced',
    offline: 'Offline',
    error: 'Sync error',
  };

  let showSignIn = $derived(sync.status === 'off' && !sync.signedIn);
</script>

<div class="wrap">
  {#if showSignIn}
    <button class="pill signin" onclick={() => sync.signIn()} title="Sign in to sync across your devices">
      <span class="dot off"></span> Sign in to sync
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
