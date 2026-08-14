-- ============================================================
-- Musical Journey App — 008: attempts
-- ============================================================
--
-- The last practice table to join sync. It sat out because its Dexie
-- primary key was `++id` auto-increment: two devices both counting
-- from 1 mint colliding ids for entirely different attempts, so
-- last-write-wins would have destroyed one of them on every clash.
-- Dexie v33/v34 moved it to client-generated `att-<uuid>` string ids,
-- which is what makes this table safe to mirror.
--
-- Notes on the shape:
--
--   - `attempts` is an APPEND-ONLY event log. Rows are inserted once
--     and never updated in normal use (the sole exception is the
--     chord-recognition inversion migration, which rewrites itemId in
--     place). Two devices therefore never contend for the same row,
--     and the last-write-wins resolution the sync engine applies has
--     nothing to destroy here — unlike the counter tables still
--     deferred in src/lib/sync/tables.ts.
--
--   - `timestamp` is BIGINT (epoch ms), matching the Dexie field
--     directly and following song_practice_log / drill_sessions.
--     Do NOT map it to TIMESTAMPTZ: the sync layer pushes the raw
--     epoch-ms integer and the upsert would fail.
--
--   - `module_id` rides as a top-level column because every read path
--     filters by it (weeklyAttempts, goal progress, the per-module
--     fluency trackers), and the dashboard read layer will too.
--
--   - The `data` JSONB holds the whole Dexie row, so nothing is lost
--     even though only two fields are promoted to columns.
--
-- Apply this BEFORE adding the table to SYNC_TABLES. A push to a
-- non-existent table fails the whole drain batch and returns early
-- (engine.ts), which would stall the outbound queue for every OTHER
-- table too — not just this one.
-- ============================================================

CREATE TABLE IF NOT EXISTS attempts (
  id              TEXT NOT NULL,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_id       TEXT,
  timestamp       BIGINT,
  data            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);

-- Per-module history, newest first — the shape every module's fluency
-- tracker and the goal-progress accuracy windows ask for.
CREATE INDEX IF NOT EXISTS attempts_user_module_ts_idx
  ON attempts (user_id, module_id, timestamp DESC);

-- Incremental pull. `pullOneTable` now fetches with
-- `.gt('updated_at', watermark)`, and this table will outgrow every
-- other one — it is the only place a missing index on updated_at would
-- actually be felt.
CREATE INDEX IF NOT EXISTS attempts_user_updated_at_idx
  ON attempts (user_id, updated_at);

-- RLS + the four owner-only policies + the updated_at trigger.
SELECT install_user_scoped_table('attempts');
