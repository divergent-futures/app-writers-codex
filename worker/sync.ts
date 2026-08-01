/* Writer's Codex — sync API (pull / push).
 *
 * The client keeps a single scalar cursor: the highest server `rev` it has pulled. Pull returns every
 * row for the user with rev > since, across projects / prose / worldbuilding / images / weir_scores
 * (images are metadata only — bytes move through worker/images.ts). Push atomically bumps the user's
 * rev, stamps all written rows with it, and applies each row under last-write-wins on the client
 * `updated_at`.
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
interface WeirIn {
  id: string;
  project_id: string;
  mode: string;
  target_type?: string | null;
  target_id?: string | null;
  title?: string | null;
  tier?: string | null;
  axes?: unknown;
  total?: number;
  gates?: unknown;
  verdict?: string;
  fix?: string | null;
  created_at?: number;
  updated_at: number;
  deleted?: boolean | number;
}

const del = (v: boolean | number | undefined): number => (v ? 1 : 0);

/** Normalise a client timestamp for storage.
 *
 *  This must NOT be `x | 0`. Bitwise ops in JS coerce to *signed 32-bit*, and a millisecond epoch
 *  needs 41 bits — `Date.now() | 0` gives a negative number that wraps roughly every 49.7 days. Since
 *  every upsert below is guarded by `WHERE excluded.updated_at >= <table>.updated_at`, a truncated
 *  timestamp makes last-write-wins effectively random and silently drops real edits. Keep full
 *  precision; D1 INTEGER columns are 64-bit and hold an epoch fine. */
const ts = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : 0;
};

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

  const [projects, prose, wb, images, weir, state] = await db.batch([
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
    db
      .prepare(
        'SELECT id,project_id,mode,target_type,target_id,title,tier,axes,total,gates,verdict,fix,created_at,updated_at,deleted FROM weir_scores WHERE user_id=?1 AND rev>?2',
      )
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
  const weirRows = (weir.results as Array<Record<string, unknown>>).map((r) => ({
    ...r,
    axes: JSON.parse((r.axes as string) || '{}'),
    gates: JSON.parse((r.gates as string) || '{}'),
  }));

  return c.json({
    rev,
    projects: projRows,
    prose: prose.results,
    worldbuilding: wb.results,
    images: images.results,
    weir: weirRows,
  });
}

/* ---------------- push ---------------- */

export async function handlePush(c: Ctx): Promise<Response> {
  const userId = c.get('userId');
  const body = (await c.req.json().catch(() => null)) as {
    projects?: ProjectIn[];
    prose?: ProseIn[];
    worldbuilding?: WbIn[];
    weir?: WeirIn[];
  } | null;
  if (!body) return c.json({ error: 'invalid body' }, 400);

  const projects = body.projects ?? [];
  const prose = body.prose ?? [];
  const worldbuilding = body.worldbuilding ?? [];
  const weir = body.weir ?? [];
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
        .bind(userId, p.id, p.name ?? '', JSON.stringify(p.data ?? {}), ts(p.updated_at), del(p.deleted), rev),
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
        .bind(userId, p.project_id, p.chapter_id, p.markdown ?? '', ts(p.updated_at), del(p.deleted), rev),
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
        .bind(userId, w.project_id, w.entity_id, w.markdown ?? '', ts(w.updated_at), del(w.deleted), rev),
    );
  }

  for (const s of weir) {
    if (!s?.id || !s?.project_id) continue;
    // Tombstones may arrive without card fields; NOT NULL columns get inert defaults on the marker row.
    stmts.push(
      db
        .prepare(
          `INSERT INTO weir_scores
             (user_id,id,project_id,mode,target_type,target_id,title,tier,axes,total,gates,verdict,fix,created_at,updated_at,deleted,rev)
           VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)
           ON CONFLICT(user_id,id) DO UPDATE SET
             mode=excluded.mode, target_type=excluded.target_type, target_id=excluded.target_id,
             title=excluded.title, tier=excluded.tier, axes=excluded.axes, total=excluded.total,
             gates=excluded.gates, verdict=excluded.verdict, fix=excluded.fix,
             created_at=excluded.created_at, updated_at=excluded.updated_at,
             deleted=excluded.deleted, rev=excluded.rev
           WHERE excluded.updated_at >= weir_scores.updated_at`,
        )
        .bind(
          userId,
          s.id,
          s.project_id,
          s.mode ?? 'idea',
          s.target_type ?? null,
          s.target_id ?? null,
          s.title ?? null,
          s.tier ?? null,
          JSON.stringify(s.axes ?? {}),
          Number.isFinite(s.total) ? Number(s.total) : 0,
          JSON.stringify(s.gates ?? {}),
          s.verdict ?? 'CUT',
          s.fix ?? null,
          s.created_at != null ? ts(s.created_at) : ts(s.updated_at),
          ts(s.updated_at),
          del(s.deleted),
          rev,
        ),
    );
  }

  if (stmts.length) await db.batch(stmts);
  return c.json({ applied: stmts.length, rev });
}
