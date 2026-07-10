/* Writer's Codex — sync API (pull / push).
 *
 * The client keeps a single scalar cursor: the highest server `rev` it has pulled. Pull returns every
 * row for the user with rev > since, across projects / prose / worldbuilding / images (images are
 * metadata only — bytes move through worker/images.ts). Push atomically bumps the user's rev, stamps
 * all written rows with it, and applies each row under last-write-wins on the client `updated_at`.
 *
 * Images are NOT accepted in push here: image create/update/delete goes through the dedicated image
 * endpoints (bytes + metadata together). Pull still returns image rows so the client knows what to fetch.
 */

import type { Context } from 'hono';
import type { Env, Vars } from './index';

type Ctx = Context<{ Bindings: Env; Variables: Vars }>;

interface ProjectIn {
  id: string;
  name: string;
  data: unknown;
  updated_at: number;
  deleted?: boolean | number;
}
interface ProseIn {
  project_id: string;
  chapter_id: string;
  markdown: string;
  updated_at: number;
  deleted?: boolean | number;
}
interface WbIn {
  project_id: string;
  entity_id: string;
  markdown: string;
  updated_at: number;
  deleted?: boolean | number;
}

const del = (v: boolean | number | undefined): number => (v ? 1 : 0);

/** Atomically claim the next per-user revision. Shared by push and the image endpoints so every
 *  write — data or image — advances the same cursor and shows up on the peer's next pull. */
export async function nextRev(db: D1Database, userId: string): Promise<number> {
  const r = await db
    .prepare('INSERT INTO sync_state (user_id, rev) VALUES (?1, 1) ON CONFLICT(user_id) DO UPDATE SET rev = rev + 1 RETURNING rev')
    .bind(userId)
    .first<{ rev: number }>();
  return r?.rev ?? 1;
}

/* ---------------- pull ---------------- */

export async function handlePull(c: Ctx): Promise<Response> {
  const userId = c.get('userId');
  const body = (await c.req.json().catch(() => ({}))) as { since?: number };
  const since = Number.isFinite(body.since) ? Number(body.since) : 0;
  const db = c.env.DB;

  const [projects, prose, wb, images, state] = await db.batch([
    db.prepare('SELECT id,name,data,updated_at,deleted FROM projects WHERE user_id=?1 AND rev>?2').bind(userId, since),
    db
      .prepare('SELECT project_id,chapter_id,markdown,updated_at,deleted FROM prose WHERE user_id=?1 AND rev>?2')
      .bind(userId, since),
    db
      .prepare('SELECT project_id,entity_id,markdown,updated_at,deleted FROM worldbuilding WHERE user_id=?1 AND rev>?2')
      .bind(userId, since),
    db
      .prepare('SELECT project_id,entity_id,r2_key,caption,updated_at,deleted FROM images WHERE user_id=?1 AND rev>?2')
      .bind(userId, since),
    db.prepare('SELECT rev FROM sync_state WHERE user_id=?1').bind(userId),
  ]);

  const rev = (state.results?.[0] as { rev: number } | undefined)?.rev ?? since;
  const projRows = (projects.results as Array<Record<string, unknown>>).map((r) => ({
    id: r.id,
    name: r.name,
    data: JSON.parse(r.data as string),
    updated_at: r.updated_at,
    deleted: r.deleted,
  }));

  return c.json({
    rev,
    projects: projRows,
    prose: prose.results,
    worldbuilding: wb.results,
    images: images.results,
  });
}

/* ---------------- push ---------------- */

export async function handlePush(c: Ctx): Promise<Response> {
  const userId = c.get('userId');
  const body = (await c.req.json().catch(() => null)) as {
    projects?: ProjectIn[];
    prose?: ProseIn[];
    worldbuilding?: WbIn[];
  } | null;
  if (!body) return c.json({ error: 'invalid body' }, 400);

  const projects = body.projects ?? [];
  const prose = body.prose ?? [];
  const worldbuilding = body.worldbuilding ?? [];
  const db = c.env.DB;

  // Atomically claim the next per-user rev; every row in this push is stamped with it.
  const rev = await nextRev(db, userId);

  const stmts: D1PreparedStatement[] = [];

  for (const p of projects) {
    if (!p?.id) continue;
    stmts.push(
      db
        .prepare(
          `INSERT INTO projects (user_id,id,name,data,updated_at,deleted,rev) VALUES (?1,?2,?3,?4,?5,?6,?7)
           ON CONFLICT(user_id,id) DO UPDATE SET
             name=excluded.name, data=excluded.data, updated_at=excluded.updated_at,
             deleted=excluded.deleted, rev=excluded.rev
           WHERE excluded.updated_at >= projects.updated_at`,
        )
        .bind(userId, p.id, p.name ?? '', JSON.stringify(p.data ?? {}), p.updated_at | 0, del(p.deleted), rev),
    );
  }

  for (const p of prose) {
    if (!p?.project_id || !p?.chapter_id) continue;
    stmts.push(
      db
        .prepare(
          `INSERT INTO prose (user_id,project_id,chapter_id,markdown,updated_at,deleted,rev) VALUES (?1,?2,?3,?4,?5,?6,?7)
           ON CONFLICT(user_id,project_id,chapter_id) DO UPDATE SET
             markdown=excluded.markdown, updated_at=excluded.updated_at, deleted=excluded.deleted, rev=excluded.rev
           WHERE excluded.updated_at >= prose.updated_at`,
        )
        .bind(userId, p.project_id, p.chapter_id, p.markdown ?? '', p.updated_at | 0, del(p.deleted), rev),
    );
  }

  for (const w of worldbuilding) {
    if (!w?.project_id || !w?.entity_id) continue;
    stmts.push(
      db
        .prepare(
          `INSERT INTO worldbuilding (user_id,project_id,entity_id,markdown,updated_at,deleted,rev) VALUES (?1,?2,?3,?4,?5,?6,?7)
           ON CONFLICT(user_id,project_id,entity_id) DO UPDATE SET
             markdown=excluded.markdown, updated_at=excluded.updated_at, deleted=excluded.deleted, rev=excluded.rev
           WHERE excluded.updated_at >= worldbuilding.updated_at`,
        )
        .bind(userId, w.project_id, w.entity_id, w.markdown ?? '', w.updated_at | 0, del(w.deleted), rev),
    );
  }

  if (stmts.length) await db.batch(stmts);
  return c.json({ applied: stmts.length, rev });
}
