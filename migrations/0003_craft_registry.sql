-- Writer's Codex — Craft Registry schema (see claude/craft-registry-design-2026-08-11.md §3.4, §3.5,
-- §3.13, and claude/HANDOFF-craft-registry-build.md Part 3, invariant #6).
--
-- PHASE 1 STATUS: schema only. Neither table is read or written by worker/*.ts yet — there is no
-- `worker/craft.ts`, and worker/sync.ts's pull/push do not mention either table. This migration exists
-- so `craft_systems` is a syncing table FROM Phase 1 (the invariant), even though nothing wires it to
-- a live sync path until a later phase. Do not `wrangler d1 migrations apply` this against the remote
-- database as part of ordinary Phase 1 work without confirming with TJ first — that's a live schema
-- change to production D1, which is a bigger step than "no user-visible change" implies for the rest
-- of Phase 1's client-side work.
--
-- Column shape mirrors weir_scores (migrations/0002_weir.sql): user_id scope, updated_at (client LWW
-- clock), deleted tombstone, server-assigned rev — so both tables can ride the existing outbox/pull
-- engine as peers of projects/prose/worldbuilding/images/weir_scores, per design §3.13:
--
--   SYNCS   craft_systems  where source = 'user'      <- peer of runs and entities
--           craft_runs
--           register_rows                              (not created here — Phase 4, §3.7)
--
--   SHIPS   craft_systems  where source = 'builtin'    <- ships with the app code, never syncs
--   PACK    craft_systems  where source = 'pack'       <- resolved from the pack file
--
-- Builtin rows (weir-idea, weir-prose, weir-science as of Phase 1) are NOT inserted into this table —
-- they live as the static TS records in src/lib/craft/registry.ts and are never written to D1. Only
-- `source = 'user'` and `source = 'pack'` rows are ever expected to occupy craft_systems in practice;
-- the CHECK constraint below still allows 'builtin' to be stored, in case a future phase wants to seed
-- the client's pack cache or an admin view from the same table rather than duplicating the enum.

CREATE TABLE IF NOT EXISTS craft_systems (
  user_id      TEXT    NOT NULL,
  id           TEXT    NOT NULL,             -- 'leguin' | 'weir-science' | a user-authored slug
  name         TEXT    NOT NULL,
  version      TEXT    NOT NULL,             -- semver — see design §3.13
  source       TEXT    NOT NULL CHECK (source IN ('builtin', 'pack', 'user')),
  category     TEXT    NOT NULL CHECK (category IN ('reference', 'generator', 'lens', 'matrix')),
  failable     INTEGER NOT NULL,             -- 0/1, cross-checked against category at write time (app-side)
  "group"      TEXT,
  question     TEXT    NOT NULL,
  target       TEXT    NOT NULL,             -- JSON: { shape, types, scales? }
  output       TEXT    NOT NULL,
  parts        TEXT    NOT NULL,             -- JSON: Part[]
  passes       TEXT,                         -- JSON: Pass[] | null
  rules        TEXT,                         -- JSON: string[] | null
  register_def TEXT,                         -- JSON: RegisterDef | null
  public_default   INTEGER NOT NULL DEFAULT 0,
  hard_locked_private INTEGER NOT NULL DEFAULT 0,
  applicability TEXT,                        -- JSON: Precondition[] | null
  provenance    TEXT,                        -- JSON: { authoredBy, sourceDoc?, confirmedAt? } | null
  status       TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),  -- §3.13 deletion/pinning
  updated_at   INTEGER NOT NULL,
  deleted      INTEGER NOT NULL DEFAULT 0,
  rev          INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS idx_craft_systems_rev ON craft_systems (user_id, rev);

CREATE TABLE IF NOT EXISTS craft_runs (
  user_id         TEXT    NOT NULL,
  id              TEXT    NOT NULL,
  project_id      TEXT    NOT NULL,
  system_id       TEXT    NOT NULL,
  system_version  TEXT    NOT NULL,          -- stamped at write time — see design §3.13 history segmentation
  target_type     TEXT,
  target_id       TEXT,
  target_ids      TEXT,                      -- JSON: string[] | null — `set` targets
  title           TEXT,
  scale           TEXT,
  results         TEXT    NOT NULL,          -- JSON: CraftRunResults (tier/axes/gates/verdict/steps/metric/...)
  pass_runs       TEXT    NOT NULL DEFAULT '[]',  -- JSON: PassRun[] — invariant #4, structural from row one
  fix             TEXT,
  is_public       INTEGER NOT NULL DEFAULT 0,     -- resolved server-side truth mirrors src/lib/craft/privacy.ts
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  deleted         INTEGER NOT NULL DEFAULT 0,
  rev             INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS idx_craft_runs_rev    ON craft_runs (user_id, rev);
CREATE INDEX IF NOT EXISTS idx_craft_runs_target ON craft_runs (user_id, project_id, target_id, created_at);
