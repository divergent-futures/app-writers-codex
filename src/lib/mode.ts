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
 * Cloud sync ships OFF.
 *
 * The sync layer exists for a private deployment that has a Worker and a key behind it. On the
 * public build there is no such backend, so leaving it on meant every first-time visitor was met
 * with a full-width "your books live in the cloud — connect this device" bar, directly
 * contradicting the local-first, no-account promise the app is built on, before they had seen a
 * single feature.
 *
 * A deployment that genuinely has the sync Worker turns it back on by building with `VITE_SYNC=1`.
 * The demo never syncs, whatever the build flag says.
 */
export const SYNC_ENABLED = import.meta.env.VITE_SYNC === '1' && !DEMO;

/** Where the demo sends people who want the real, editable thing. */
export const REAL_APP_URL = '/';
