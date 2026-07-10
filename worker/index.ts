/* Writer's Codex — Worker API (Phase 2, cloud sync).
 *
 * A thin Hono router mounted at /api/*. It fronts D1 (structured data + markdown) and R2 (image
 * bytes), gated by Cloudflare Access. Everything else on the hostname is served as static assets
 * (the Svelte PWA) — see wrangler.jsonc `run_worker_first: ["/api/*"]`, so this Worker only ever
 * sees /api/* requests; the `*` fallback below is defensive.
 *
 * The app is local-first: this API is an ADDITIVE sync layer. When it's unreachable or the user is
 * signed out, the client just keeps using IndexedDB.
 */

import { Hono } from 'hono';
import { requireAuth } from './auth';
import { handlePull, handlePush } from './sync';
import { handleImageDelete, handleImageGet, handleImagePut } from './images';

export interface Env {
  DB: D1Database;
  IMAGES: R2Bucket;
  ASSETS: Fetcher;
  /** Access team domain, e.g. https://divergentfutures.cloudflareaccess.com (prod only). */
  ACCESS_TEAM_DOMAIN?: string;
  /** Access application AUD tag (prod only). */
  ACCESS_AUD?: string;
  /** Dev-only identity bypass for `wrangler dev` (no Access locally). Never set in prod. */
  DEV_USER?: string;
}

export type Vars = { userId: string; email: string };

const app = new Hono<{ Bindings: Env; Variables: Vars }>();

// Public: liveness probe, no auth. Used by the client to detect the API is reachable.
app.get('/api/health', (c) => c.json({ ok: true, service: 'writers-codex-api' }));

// Proves the caller is signed in and returns their identity. The client hits this to decide whether
// to enable sync; a 401 means "stay local-only".
app.get('/api/auth/me', requireAuth, (c) => c.json({ userId: c.get('userId'), email: c.get('email') }));

// Sign-in landing: the client sends a full-page navigation here. In production this path is covered by
// the Cloudflare Access policy, so the one-time-PIN flow runs first and sets the domain cookie; then we
// bounce back to the app. Only same-origin relative redirects are honoured.
app.get('/api/auth/login', requireAuth, (c) => {
  const r = c.req.query('redirect') || '/';
  return c.redirect(r.startsWith('/') && !r.startsWith('//') ? r : '/');
});

// Sync: pull remote changes since a rev cursor; push a local changeset (LWW on updated_at).
app.post('/api/sync/pull', requireAuth, handlePull);
app.post('/api/sync/push', requireAuth, handlePush);

// Images: bytes in R2, metadata in D1. entityId is like "character:john".
app.put('/api/images/:projectId/:entityId', requireAuth, handleImagePut);
app.get('/api/images/:projectId/:entityId', requireAuth, handleImageGet);
app.delete('/api/images/:projectId/:entityId', requireAuth, handleImageDelete);

// Unmatched routes: JSON 404 for the API; anything else falls back to static assets (defensive —
// run_worker_first only routes /api/* here, but this keeps a stray non-API request serving the SPA).
app.notFound((c) => {
  if (new URL(c.req.url).pathname.startsWith('/api/')) return c.json({ error: 'not found' }, 404);
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
