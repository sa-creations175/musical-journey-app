-- ============================================================
-- Musical Journey App — 006: Weekly overrides
-- ============================================================
--
-- Per-week override of the user's global practice-consistency target
-- (days/week). One row per Sunday-anchored week. When present, the
-- Phase B today's-slice formula uses `available_days` in place of the
-- global consistency goal value for that week's calculations. The
-- consistency goal itself is NOT modified — this is a weekly-only
-- override that affects pacing for a short / heavy week.
--
-- Schema mirrors the Dexie WeeklyOverride row: id is the weekStart
-- epoch ms stringified, week_start carries the same value as a
-- bigint for server-side range queries, available_days is the user's
-- adjusted day count (1–7).
--
-- Follows the existing pattern from 003/004/005: id/user_id composite
-- primary key, top-level columns for indexed values, everything else
-- in `data` JSONB. RLS + 4 policies + updated_at trigger installed via
-- `install_user_scoped_table` from 001.
-- ============================================================

-- ------------------------------------------------------------
-- weekly_overrides
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS weekly_overrides (
  id              TEXT NOT NULL,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start      BIGINT NOT NULL,
  available_days  INTEGER NOT NULL,
  data            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS weekly_overrides_user_week_idx
  ON weekly_overrides (user_id, week_start);
SELECT install_user_scoped_table('weekly_overrides');

-- ============================================================
-- Done.
-- ============================================================
