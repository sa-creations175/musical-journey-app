-- ============================================================
-- Musical Journey App — 007: weekly_overrides next-month derivation
-- ============================================================
--
-- Adds support for aligning a week's plan to NEXT month's goals.
--
--   1. use_next_month_goals — when TRUE, the current week's weekly
--      plan derives from next month's monthly goals instead of the
--      current month's. Set by the "Align this week's plan to
--      [Month]?" follow-up after next-month goals are created.
--      Mirrors the Dexie WeeklyOverride.useNextMonthGoals (v29) field.
--
--   2. available_days is relaxed to NULLABLE. A weekly_overrides row
--      can now exist purely to carry use_next_month_goals, with no
--      consistency-days override (available_days = NULL → "follow the
--      global consistency goal"). Previously every row carried an
--      explicit days override, so the column was NOT NULL.
--
-- Both columns also continue to ride in the `data` JSONB blob (the
-- pull path reconstructs rows from `data`), so this migration only
-- affects server-side queryability and the available_days constraint.
-- ============================================================

ALTER TABLE weekly_overrides
  ADD COLUMN IF NOT EXISTS use_next_month_goals BOOLEAN DEFAULT FALSE;

ALTER TABLE weekly_overrides
  ALTER COLUMN available_days DROP NOT NULL;

-- ============================================================
-- Done.
-- ============================================================
