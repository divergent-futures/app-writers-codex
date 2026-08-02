/* Writer's Codex — image API (R2 bytes + D1 metadata).
 *
 * Each photo is stored twice in R2, under one entity:
 *   thumbnail  `{userId}/{projectId}/{entityId}`         640 px — syncs to every device eagerly
 *   full size  `{userId}/{projectId}/{entityId}#full`    2000 px — fetched only when someone looks
 * The variant is chosen with `?variant=full`; no parameter means the thumbnail, which keeps the
 * path identical to what earlier clients already used, so nothing already uploaded is orphaned.
 *
 * The D1 `images` row is metadata only (r2_key, caption, updated_at, deleted, rev) and describes the
 * entity, not the variant — so only the thumbnail write bumps the rev. That is on purpose: the
 * thumbnail is the thing peers need to be told about, and the full copy is discovered on demand.
 * A peer asking for a full copy that never made it up simply gets a 404 and keeps the thumbnail.
 *
 * GET is authenticated (same-origin fetch carries the Access cookie). The client caches what it
 * downloads locally, so a photo is only ever fetched once per device.
 */

import type { Context } from 'hono';
import type { Env, Vars } from './index';
import { nextRev } from './sync';

type Ctx = Context<{ Bindings: Env; Variables: Vars }>;

type Variant = 'thumb' | 'full';

/** `#` cannot appear in a Codex slot key ("character:john"), so it can never collide with a real id. */
const r2Key = (userId: string, projectId: string, entityId: string, variant: Variant) =>
  `${userId}/${projectId}/${entityId}${variant === 'full' ? '#full' : ''}`;

const variantOf = (c: Ctx): Variant => (c.req.query('variant') === 'full' ? 'full' : 'thumb');

/** R2 is optional until the account has it enabled (see wrangler.jsonc). 503 = "photo sync not
 *  available yet" — the client treats this as "keep the photo local for now", not as a failure, and
 *  leaves it queued so it uploads by itself the moment R2 is switched on. */
const noR2 = (c: Ctx) => c.json({ error: 'photo sync not enabled on this deployment yet' }, 503);

export async function handleImagePut(c: Ctx): Promise<Response> {
  const r2 = c.env.IMAGES;
  if (!r2) return noR2(c);
  const userId = c.get('userId');
  const projectId = c.req.param('projectId');
  const entityId = c.req.param('entityId');
  if (!projectId || !entityId) return c.json({ error: 'bad path' }, 400);
  const variant = variantOf(c);
  const caption = c.req.query('caption') ?? null;
  const key = r2Key(userId, projectId, entityId, variant);

  const body = await c.req.arrayBuffer();
  if (!body || body.byteLength === 0) return c.json({ error: 'empty body' }, 400);
  const contentType = c.req.header('Content-Type') || 'image/webp';
  await r2.put(key, body, { httpMetadata: { contentType } });

  // The full-size copy is an extra object hanging off an entity that already has a metadata row.
  // Writing a row (and burning a rev) for it would tell every peer to re-examine a photo whose
  // thumbnail has not changed, for no benefit.
  if (variant === 'full') return c.json({ r2_key: key, variant });

  const rev = await nextRev(c.env.DB, userId);
  const now = Date.now();
  await c.env.DB.prepare(
    `INSERT INTO images (user_id,project_id,entity_id,r2_key,caption,updated_at,deleted,rev) VALUES (?1,?2,?3,?4,?5,?6,0,?7)
     ON CONFLICT(user_id,project_id,entity_id) DO UPDATE SET
       r2_key=excluded.r2_key, caption=excluded.caption, updated_at=excluded.updated_at, deleted=0, rev=excluded.rev`,
  )
    .bind(userId, projectId, entityId, key, caption, now, rev)
    .run();

  return c.json({ r2_key: key, variant, rev, updated_at: now });
}

export async function handleImageGet(c: Ctx): Promise<Response> {
  const r2 = c.env.IMAGES;
  if (!r2) return noR2(c);
  const userId = c.get('userId');
  const projectId = c.req.param('projectId');
  const entityId = c.req.param('entityId');
  if (!projectId || !entityId) return c.json({ error: 'bad path' }, 400);
  const key = r2Key(userId, projectId, entityId, variantOf(c));
  const obj = await r2.get(key);
  // 404 is a normal answer for ?variant=full: not every photo has one (small originals don't), and
  // one may not have finished uploading yet. The client falls back to the thumbnail.
  if (!obj) return c.json({ error: 'not found' }, 404);
  const headers = new Headers();
  headers.set('Content-Type', obj.httpMetadata?.contentType || 'image/webp');
  headers.set('Cache-Control', 'private, max-age=31536000, immutable');
  headers.set('ETag', obj.httpEtag);
  return new Response(obj.body, { headers });
}

export async function handleImageDelete(c: Ctx): Promise<Response> {
  const r2 = c.env.IMAGES;
  if (!r2) return noR2(c);
  const userId = c.get('userId');
  const projectId = c.req.param('projectId');
  const entityId = c.req.param('entityId');
  if (!projectId || !entityId) return c.json({ error: 'bad path' }, 400);
  const key = r2Key(userId, projectId, entityId, 'thumb');

  // Both variants go. Removing a photo means removing the photo, not half of it.
  await r2.delete([key, r2Key(userId, projectId, entityId, 'full')]).catch(() => {});
  const rev = await nextRev(c.env.DB, userId);
  const now = Date.now();
  // Keep a tombstone row so the delete propagates to the peer on its next pull.
  await c.env.DB.prepare(
    `INSERT INTO images (user_id,project_id,entity_id,r2_key,caption,updated_at,deleted,rev) VALUES (?1,?2,?3,?4,NULL,?5,1,?6)
     ON CONFLICT(user_id,project_id,entity_id) DO UPDATE SET deleted=1, updated_at=excluded.updated_at, rev=excluded.rev`,
  )
    .bind(userId, projectId, entityId, key, now, rev)
    .run();

  return c.json({ deleted: true, rev });
}
