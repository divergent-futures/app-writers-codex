/* Writer's Codex — Weir Matrix API (score + history).
 *
 * POST /api/weir/score  — store one scoring run. The card content (tier, axes, gates, fix) arrives
 *   from the client — either parsed from a paste-back (copy-paste fallback, no LLM key needed) or,
 *   in a future step, produced server-side by an LLM binding. Either way the server recomputes
 *   total and verdict from axes + gates via the shared module and never trusts client copies.
 * GET  /api/weir/history?project_id=…&target_id=… — newest-first score history for one entity
 *   (or the project's recent runs when target_id is omitted).
 *
 * Rows are append-only — every run is stored, never overwritten; history is the retention feature
 * (writers-codex-weir-module.md §9). Writes stamp the same per-user rev counter as sync push, so a
 * score taken on one device shows up on the peer's next pull like any other row.
 */

import type { Context } from 'hono';
import type { Env, Vars } from './index';
import { nextRev } from './sync';
import { totalOf, validateAxes, validateGates, verdictFor, WEIR_MODES } from '../src/lib/weir/verdict';
import type { GateResult, WeirMode } from '../src/lib/weir/verdict';

type Ctx = Context<{ Bindings: Env; Variables: Vars }>;

interface ScoreIn {
  id?: string;
  project_id: string;
  mode: WeirMode;
  target_type?: 'prose' | 'worldbuilding' | 'character' | 'freeform';
  target_id?: string;
  title?: string;
  tier?: string;
  axes: Record<string, number>;
  gates: Record<string, GateResult>;
  fix?: string;
  created_at?: number;
}

export async function handleWeirScore(c: Ctx): Promise<Response> {
  const userId = c.get('userId');
  const body = (await c.req.json().catch(() => null)) as ScoreIn | null;
  if (!body) return c.json({ error: 'invalid body' }, 400);

  if (!body.project_id || typeof body.project_id !== 'string') {
    return c.json({ error: 'project_id required' }, 400);
  }
  if (!WEIR_MODES.includes(body.mode)) {
    return c.json({ error: `mode must be one of: ${WEIR_MODES.join(', ')}` }, 400);
  }
  const axesErr = validateAxes(body.axes);
  if (axesErr) return c.json({ error: axesErr }, 400);
  const gatesErr = validateGates(body.gates);
  if (gatesErr) return c.json({ error: gatesErr }, 400);

  // Server-side truth: total and verdict are always recomputed, never taken from the client.
  const total = totalOf(body.axes);
  const verdict = verdictFor(total, body.gates);

  const id = body.id && typeof body.id === 'string' ? body.id : crypto.randomUUID();
  const now = Date.now();
  const createdAt = Number.isFinite(body.created_at) ? Number(body.created_at) : now;

  const db = c.env.DB;
  const rev = await nextRev(db, userId);

  await db
    .prepare(
      `INSERT INTO weir_scores
         (user_id,id,project_id,mode,target_type,target_id,title,tier,axes,total,gates,verdict,fix,created_at,updated_at,deleted,rev)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,0,?16)
       ON CONFLICT(user_id,id) DO UPDATE SET
         mode=excluded.mode, target_type=excluded.target_type, target_id=excluded.target_id,
         title=excluded.title, tier=excluded.tier, axes=excluded.axes, total=excluded.total,
         gates=excluded.gates, verdict=excluded.verdict, fix=excluded.fix,
         updated_at=excluded.updated_at, rev=excluded.rev
       WHERE excluded.updated_at >= weir_scores.updated_at`,
    )
    .bind(
      userId,
      id,
      body.project_id,
      body.mode,
      body.target_type ?? null,
      body.target_id ?? null,
      body.title ?? null,
      body.tier ?? null,
      JSON.stringify(body.axes),
      total,
      JSON.stringify(body.gates),
      verdict,
      body.fix ?? null,
      createdAt,
      now,
      rev,
    )
    .run();

  return c.json({ id, total, verdict, rev });
}

export async function handleWeirHistory(c: Ctx): Promise<Response> {
  const userId = c.get('userId');
  const projectId = c.req.query('project_id');
  const targetId = c.req.query('target_id');
  if (!projectId) return c.json({ error: 'project_id required' }, 400);

  const db = c.env.DB;
  const base =
    'SELECT id,project_id,mode,target_type,target_id,title,tier,axes,total,gates,verdict,fix,created_at FROM weir_scores WHERE user_id=?1 AND project_id=?2 AND deleted=0';
  const stmt = targetId
    ? db.prepare(`${base} AND target_id=?3 ORDER BY created_at DESC LIMIT 50`).bind(userId, projectId, targetId)
    : db.prepare(`${base} ORDER BY created_at DESC LIMIT 50`).bind(userId, projectId);

  const rows = await stmt.all();
  const scores = (rows.results as Array<Record<string, unknown>>).map((r) => ({
    ...r,
    axes: JSON.parse(String(r.axes)),
    gates: JSON.parse(String(r.gates)),
  }));
  return c.json({ scores });
}
