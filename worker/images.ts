/* Writer's Codex — image API (R2 bytes + D1 metadata).
 *
 * Image bytes live in R2 at `{userId}/{projectId}/{entityId}`; the D1 `images` row is metadata only
 * (r2_key, caption, updated_at, deleted, rev). Writes bump the shared per-user rev so the peer picks
 * the change up on its next pull. entityId looks like "character:john" — Hono decodes the path param.
 *
 * GET is authenticated (same-origin fetch carries the Access cookie). The client fetches bytes on
 * pull and caches them locally as a data URI, so the existing images.ts display path is unchanged.
 */

import type { Context } from 'hono';
import type { Env, Vars } from './index';
import { nextRev } from './sync';

type Ctx = Context<{ Bindings: Env; Variables: Vars }>;

const r2Key = (userId: string, projectId: string, entityId: string) => `${userId}/${projectId}/${entityId}`;

export async function handleImagePut(c: Ctx): Promise<Response> {
  const userId = c.get('userId');
  const projectId = c.req.param('projectId');
  const entityId = c.req.param('entityId');
  if (!projectId || !entityId) return c.json({ error: 'bad path' }, 400);
  const caption = c.req.query('caption') ?? null;
  const key = r2Key(userId, projectId, entityId);

  const body = await c.req.arrayBuffer();
  if (!body || body.byteLength === 0) return c.json({ error: 'empty body' }, 400);
  const contentType = c.req.header('Content-Type') || 'image/webp';
  await c.env.IMAGES.put(key, body, { httpMetadata: { contentType } });

  const rev = await nextRev(c.env.DB, userId);
  const now = Date.now();
  await c.env.DB.prepare(
    `INSERT INTO images (user_id,project_id,entity_id,r2_key,caption,updated_at,deleted,rev) VALUES (?1,?2,?3,?4,?5,?6,0,?7)
     ON CONFLICT(user_id,project_id,entity_id) DO UPDATE SET
       r2_key=excluded.r2_key, caption=excluded.caption, updated_at=excluded.updated_at, deleted=0, rev=excluded.rev`,
  )
    .bind(userId, projectId, entityId, key, caption, now, rev)
    .run();

  return c.json({ r2_key: key, rev, updated_at: now });
}

export async function handleImageGet(c: Ctx): Promise<Response> {
  const userId = c.get('userId');
  const projectId = c.req.param('projectId');
  const entityId = c.req.param('entityId');
  if (!projectId || !entityId) return c.json({ error: 'bad path' }, 400);
  const key = r2Key(userId, projectId, entityId);
  const obj = await c.env.IMAGES.get(key);
  if (!obj) return c.json({ error: 'not found' }, 404);
  const headers = new Headers();
  headers.set('Content-Type', obj.httpMetadata?.contentType || 'image/webp');
  headers.set('Cache-Control', 'private, max-age=31536000, immutable');
  headers.set('ETag', obj.httpEtag);
  return new Response(obj.body, { headers });
}

export async function handleImageDelete(c: Ctx): Promise<Response> {
  const userId = c.get('userId');
  const projectId = c.req.param('projectId');
  const entityId = c.req.param('entityId');
  if (!projectId || !entityId) return c.json({ error: 'bad path' }, 400);
  const key = r2Key(userId, projectId, entityId);

  await c.env.IMAGES.delete(key).catch(() => {});
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
