-- ============================================================
-- Musical Journey App — 003: Practice Sessions + Goals (Phase 1)
-- ============================================================
--
-- Eight new tables introducing the Goals layer and the foundation
-- for the Practice Sessions module. Per the April 25, 2026 design
-- review (docs/PRACTICE_SESSIONS_DESIGN_3.md):
--
--   - practice_sessions has NO `mode` column. Modes (focus /
--     acquisition) were collapsed in the design review — they
--     emerge from goals + spacing state, not user-declared
--     toggles. The lighter `session_intent` lives in the JSONB
--     data column.
--
--   - vacation_periods has NO `spacing_paused` column. Decay
--     continues during vacation (truth-honoring); only goal
--     target dates are affected (handled by the welcome-back UI
--     in Phase 7).
--
--   - goals.scope has no 'daily' value. Daily intent is generated
--     by the algorithm in Phase 3+, not stored as a goal entity.
--
--   - last_engaged_at columns are BIGINT (epoch ms), matching
--     the Dexie `lastEngagedAt: number` field directly. This
--     avoids ms↔timestamp conversion at the sync boundary. Older
--     tables (songs, drill_skills, production_lessons) declared
--     the column TIMESTAMPTZ but never wired it through topLevel
--     sync, so the convention is in transition; new tables that
--     actually populate the field use BIGINT.
--
--   - proficiency_definitions is per-user (the five rows are
--     identical across users). Matches every other user-scoped
--     table in this schema; seeded from the client per user via
--     the lifecycle-aware seeder pattern.
--
--   - day_profiles.expected_sessions JSONB keys are
--     morning / midday / evening (canonical, matching
--     practice_sessions.time_of_day). UI labels may read
--     "Afternoon" but the data key is `midday`.
--
-- All tables use the standard install_user_scoped_table helper
-- from 001_initial_schema.sql for RLS + 4 policies + updated_at
-- trigger.
-- ============================================================

-- ------------------------------------------------------------
-- practice_sessions
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS practice_sessions (
  id                TEXT NOT NULL,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at        BIGINT,
  last_engaged_at   BIGINT,
  data              JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS practice_sessions_user_started_idx
  ON practice_sessions (user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS practice_sessions_user_updated_idx
  ON practice_sessions (user_id, updated_at DESC);
SELECT install_user_scoped_table('practice_sessions');

-- ------------------------------------------------------------
-- practice_blocks
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS practice_blocks (
  id              TEXT NOT NULL,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id      TEXT NOT NULL,
  data            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS practice_blocks_user_session_idx
  ON practice_blocks (user_id, session_id);
SELECT install_user_scoped_table('practice_blocks');

-- ------------------------------------------------------------
-- goals
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS goals (
  id                TEXT NOT NULL,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope             TEXT,
  status            TEXT,
  parent_goal_id    TEXT,
  target_date       BIGINT,
  last_engaged_at   BIGINT,
  data              JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS goals_user_scope_status_idx
  ON goals (user_id, scope, status);
CREATE INDEX IF NOT EXISTS goals_user_parent_idx
  ON goals (user_id, parent_goal_id);
CREATE INDEX IF NOT EXISTS goals_user_target_idx
  ON goals (user_id, target_date);
SELECT install_user_scoped_table('goals');

-- ------------------------------------------------------------
-- day_profiles
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS day_profiles (
  id              TEXT NOT NULL,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name            TEXT,
  data            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS day_profiles_user_name_idx
  ON day_profiles (user_id, name);
SELECT install_user_scoped_table('day_profiles');

-- ------------------------------------------------------------
-- vacation_periods
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vacation_periods (
  id              TEXT NOT NULL,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  start_date      BIGINT,
  end_date        BIGINT,
  data            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS vacation_periods_user_range_idx
  ON vacation_periods (user_id, start_date, end_date);
SELECT install_user_scoped_table('vacation_periods');

-- ------------------------------------------------------------
-- proficiency_definitions (per-user; same content across users)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS proficiency_definitions (
  id              TEXT NOT NULL,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  level           TEXT,
  display_order   INTEGER,
  data            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS proficiency_definitions_user_order_idx
  ON proficiency_definitions (user_id, display_order);
SELECT install_user_scoped_table('proficiency_definitions');

-- ------------------------------------------------------------
-- spacing_state
-- ------------------------------------------------------------
-- Schema in Phase 1; populated at scale + acquisition_stage
-- detection logic in Phase 2.
CREATE TABLE IF NOT EXISTS spacing_state (
  id                  TEXT NOT NULL,
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_ref            TEXT,
  module_ref          TEXT,
  next_due_at         BIGINT,
  acquisition_stage   TEXT,
  data                JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS spacing_state_user_module_item_idx
  ON spacing_state (user_id, module_ref, item_ref);
CREATE INDEX IF NOT EXISTS spacing_state_user_due_idx
  ON spacing_state (user_id, next_due_at);
CREATE INDEX IF NOT EXISTS spacing_state_user_stage_idx
  ON spacing_state (user_id, acquisition_stage);
SELECT install_user_scoped_table('spacing_state');

-- ------------------------------------------------------------
-- prompts (centralized orchestration)
-- ------------------------------------------------------------
-- Phase 1 fires only the "set goals" nudge user-visibly, plus
-- simple banners for vacation_return / end_of_month events. The
-- rich UIs ship in Phase 7. Settings prompt-management UI also
-- ships in Phase 7.
CREATE TABLE IF NOT EXISTS prompts (
  id              TEXT NOT NULL,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prompt_type     TEXT,
  tier            TEXT,
  surface         TEXT,
  status          TEXT,
  expires_at      BIGINT,
  data            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS prompts_user_status_tier_idx
  ON prompts (user_id, status, tier);
CREATE INDEX IF NOT EXISTS prompts_user_expires_idx
  ON prompts (user_id, expires_at);
CREATE INDEX IF NOT EXISTS prompts_user_type_idx
  ON prompts (user_id, prompt_type);
SELECT install_user_scoped_table('prompts');

-- ============================================================
-- Done.
-- ============================================================
