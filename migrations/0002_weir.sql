-- Writer's Codex — Weir Matrix score history (see writers-codex-weir-module.md §9, adapted).
--
-- The module spec's schema is extended with the house sync columns (user_id scope, updated_at
-- client clock, deleted tombstone, server-assigned rev) so weir_scores rides the existing
-- outbox/pull engine as a peer of projects / prose / worldbuilding / images. Rows are append-only
-- in practice — every scoring run is stored, never overwritten; the per-entity score history is
-- the retention feature. Last-write-wins is therefore harmless here.

CREATE TABLE IF NOT EXISTS weir_scores (
  user_id     TEXT    NOT NULL,
  id          TEXT    NOT NULL,
  project_id  TEXT    NOT NULL,
  mode        TEXT    NOT NULL,          -- 'idea' | 'prose' | 'science'
  target_type TEXT,                      -- 'prose' | 'worldbuilding' | 'character' | 'freeform'
  target_id   TEXT,                      -- scored entity id, or NULL for pasted freeform
  title       TEXT,                      -- label for the score card
  tier        TEXT,                      -- e.g. 'P3', 'I2', 'T3'
  axes        TEXT    NOT NULL,          -- JSON: { axisName: 0-10, ... }
  total       INTEGER NOT NULL,          -- sum of axes, /60
  gates       TEXT    NOT NULL,          -- JSON: { gateName: 'PASS' | 'FAIL', ... }
  verdict     TEXT    NOT NULL,          -- 'ACCEPT' | 'USABLE' | 'REWORK' | 'REWRITE' | 'CUT'
  fix         TEXT,                      -- the one highest-leverage fix
  created_at  INTEGER NOT NULL,          -- ms epoch, when the run happened
  updated_at  INTEGER NOT NULL,          -- ms epoch, client wall clock (LWW key, house pattern)
  deleted     INTEGER NOT NULL DEFAULT 0,
  rev         INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS idx_weir_rev    ON weir_scores (user_id, rev);
CREATE INDEX IF NOT EXISTS idx_weir_target ON weir_scores (user_id, project_id, target_id, created_at);
