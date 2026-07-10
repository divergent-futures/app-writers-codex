-- Writer's Codex — cloud sync schema (D1).
--
-- Every row is scoped by user_id. Two clocks per row:
--   * updated_at (ms epoch, CLIENT wall clock) — drives last-write-wins on push. Offline-correct:
--     a newer edit wins even if it reaches the server later than a stale one.
--   * rev (INTEGER, SERVER-assigned, monotonic per user) — the PULL cursor. Independent of device
--     clocks, so a laptop/phone clock difference never makes a change invisible to the other device.
-- `deleted = 1` is a tombstone: a delete propagates as a returned row so the peer removes its copy.
--
-- Granularity mirrors the IndexedDB stores exactly (see src/lib/db.ts): one blob row per project,
-- separate rows for prose and worldbuilding markdown, and image metadata (bytes live in R2).

CREATE TABLE IF NOT EXISTS projects (
  user_id    TEXT    NOT NULL,
  id         TEXT    NOT NULL,
  name       TEXT    NOT NULL,
  data       TEXT    NOT NULL,              -- ProjectData JSON blob (~160 KB)
  updated_at INTEGER NOT NULL,
  deleted    INTEGER NOT NULL DEFAULT 0,
  rev        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS idx_projects_rev ON projects (user_id, rev);

CREATE TABLE IF NOT EXISTS prose (
  user_id    TEXT    NOT NULL,
  project_id TEXT    NOT NULL,
  chapter_id TEXT    NOT NULL,
  markdown   TEXT    NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted    INTEGER NOT NULL DEFAULT 0,
  rev        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, project_id, chapter_id)
);
CREATE INDEX IF NOT EXISTS idx_prose_rev ON prose (user_id, rev);

CREATE TABLE IF NOT EXISTS worldbuilding (
  user_id    TEXT    NOT NULL,
  project_id TEXT    NOT NULL,
  entity_id  TEXT    NOT NULL,
  markdown   TEXT    NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted    INTEGER NOT NULL DEFAULT 0,
  rev        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, project_id, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_wb_rev ON worldbuilding (user_id, rev);

CREATE TABLE IF NOT EXISTS images (
  user_id    TEXT    NOT NULL,
  project_id TEXT    NOT NULL,
  entity_id  TEXT    NOT NULL,
  r2_key     TEXT    NOT NULL,              -- {userId}/{projectId}/{entityId} in the IMAGES bucket
  caption    TEXT,
  updated_at INTEGER NOT NULL,
  deleted    INTEGER NOT NULL DEFAULT 0,
  rev        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, project_id, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_images_rev ON images (user_id, rev);

-- Per-user monotonic revision counter. Each push atomically bumps this; the new value stamps every
-- row written in that push and becomes the client's next pull cursor.
CREATE TABLE IF NOT EXISTS sync_state (
  user_id TEXT PRIMARY KEY,
  rev     INTEGER NOT NULL DEFAULT 0
);
