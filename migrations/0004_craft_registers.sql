-- Writer's Codex — Craft Registry register rows (see claude/craft-registry-design-2026-08-11.md §3.7,
-- §3.13, and claude/HANDOFF-craft-registry-build.md Part 3). Phase 4 build.
--
-- PHASE 4 STATUS: schema only, exactly like migrations/0003_craft_registry.sql's two tables — neither
-- read nor written by worker/*.ts yet. There is still no worker/craft.ts, and worker/sync.ts's
-- pull/push do not mention this table. Do not `wrangler d1 migrations apply` this against the remote
-- database without confirming with TJ first, same caveat as 0003.
--
-- This is the third table §3.13's sync section names and the one 0003's own header comment flagged as
-- deferred:
--
--   SYNCS   craft_systems  where source = 'user'
--           craft_runs
--           register_rows                              <- this table, created here
--
-- Column shape mirrors craft_runs (migrations/0003_craft_registry.sql): user_id scope, updated_at
-- (client LWW clock), deleted tombstone, server-assigned rev — so it can ride the existing
-- outbox/pull engine as a peer once wired, per design §3.13.
--
-- `values` is a flat JSON object of column-key -> string, per RegisterDef.columns (src/lib/craft/
-- types.ts's RegisterRow) — NOT normalised into per-column SQL columns, because the column set is
-- declared per-register (weir-science's ten-column licence ledger vs Le Guin's four-column culture
-- ledger) and, from Phase 9 on, per USER-authored register. A fixed column schema here would defeat
-- the entire point of RegisterDef.columns being data rather than code.
--
-- Schema is global; rows are per-project, per-user data (§3.7). Ships with zero rows — Cosmos licence
-- content must never be hardcoded into the general app build (weir-codex-handoff.md).

CREATE TABLE IF NOT EXISTS register_rows (
  user_id      TEXT    NOT NULL,
  id           TEXT    NOT NULL,
  project_id   TEXT    NOT NULL,
  register_id  TEXT    NOT NULL,             -- 'licence' | 'culture' | a user-authored register id
  system_id    TEXT    NOT NULL,             -- the CraftSystem this register instance belongs to
  status       TEXT    NOT NULL,             -- one of the owning RegisterDef.statusEnum (app-checked)
  values       TEXT    NOT NULL,             -- JSON: Record<string,string> — column key -> value
  source_run_id TEXT,                        -- the CraftRun whose pass-3 reconciliation graduated this
                                              -- row, per design §3.7 rule 2 — null for hand-entered rows
  updated_at   INTEGER NOT NULL,
  deleted      INTEGER NOT NULL DEFAULT 0,
  rev          INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS idx_register_rows_rev      ON register_rows (user_id, rev);
CREATE INDEX IF NOT EXISTS idx_register_rows_register ON register_rows (user_id, project_id, register_id);
