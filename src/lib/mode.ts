/* Writer's Codex — runtime modes.
 *
 * One build, three ways of being reached:
 *
 *  1. Normal      — the app as shipped. Local-first, fully editable.
 *  2. Demo (/try) — a read-only tour of the bundled Sherlock Holmes example, for the website's
 *                   "try it before you install it" link. Nothing can be created, edited, imported
 *                   or deleted, so a visitor can click through every view without leaving anything
 *                   behind or wondering whether they've just put real work somewhere they can't
 *                   find it. Uses its own IndexedDB database, so it can never touch, seed into, or
 *                   overwrite a real library on the same origin.
 *  3. Sync on     — cloud sync, off unless a deployment opts in (see SYNC_ENABLED).
 *
 * Both flags are resolved once, at module load, from things that cannot change mid-session.
 */

/** True when this page was opened as the read-only demo: `/try` (any trailing slash) or `?try`. */
function detectDemo(): boolean {
  if (typeof location === 'undefined') return false;
  const path = location.pathname.replace(/\/+$/, '').toLowerCase();
  if (path === '/try' || path.endsWith('/try')) return true;
  return new URLSearchParams(location.search).has('try');
}

export const DEMO = detectDemo();

/**
 * Whether to start the sync engine at all.
 *
 * Note this is NOT "does this deployment have sync" — that question answers itself at runtime by
 * probing `/api/auth/me` (see `backendAvailable` in sync.svelte.ts), so a build with no Worker
 * behind it goes quiet on its own with nothing to configure. Deliberately not a build flag:
 * both deployments run the same command, and a flag either of them could forget to set is a flag
 * that will eventually be forgotten.
 *
 * The only thing switched off here is sync inside the read-only demo, where there is by
 * definition nothing to sync.
 */
export const SYNC_ENABLED = !DEMO;

/** Where the demo sends people who want the real, editable thing. */
export const REAL_APP_URL = '/';
