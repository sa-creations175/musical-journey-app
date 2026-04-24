-- ============================================================
-- Musical Journey App — initial cloud schema
-- ============================================================
--
-- Mirrors every Dexie (IndexedDB) table in the client app, one-to-one.
--
-- Design choices:
--
--   1. Primary key is (user_id, id). The `id` column keeps Dexie's
--      client-generated string id verbatim (e.g. "ref-abc-xyz");
--      pairing it with user_id means two users can coincidentally use
--      the same id (e.g. a content-derived id like "major-3rd") with
--      no collision. RLS prevents cross-user reads either way.
--
--   2. `user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`
--      on every table. Deleting the auth user nukes all their data.
--
--   3. Payload lives in a `data JSONB` column. This matches how Dexie
--      stores rows (plain JS objects) and avoids ~500 lines of
--      camelCase→snake_case column mapping. Top-level columns are
--      reserved for the values we actually query/index on: id,
--      user_id, created_at, updated_at, last_engaged_at, and any
--      natural-key fields that need a UNIQUE constraint.
--
--   4. RLS is enabled on every table with four policies (SELECT,
--      INSERT, UPDATE, DELETE) all scoped to `auth.uid() = user_id`.
--      The `install_user_scoped_table(name)` helper installs the
--      standard bundle in one call.
--
--   5. An `updated_at` BEFORE UPDATE trigger bumps the timestamp on
--      every row change. The sync layer uses this for last-write-wins
--      conflict resolution across devices.
--
-- The user asked for a FRESH START — no data migration. Local backups
-- are preserved as JSON files outside the project folder.
-- ============================================================

-- ------------------------------------------------------------
-- Extensions
-- ------------------------------------------------------------
-- gen_random_uuid() for any table that opts into a UUID id.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------
-- Shared trigger: auto-bump updated_at on every row update.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------
-- Helper: install the standard "per-user owned" bundle on a table —
-- RLS + four policies + updated_at trigger. Idempotent.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION install_user_scoped_table(tbl TEXT)
RETURNS VOID AS $$
BEGIN
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);

  EXECUTE format('DROP POLICY IF EXISTS %I ON %I',
                 tbl || '_select_own', tbl);
  EXECUTE format(
    'CREATE POLICY %I ON %I FOR SELECT USING (auth.uid() = user_id)',
    tbl || '_select_own', tbl
  );

  EXECUTE format('DROP POLICY IF EXISTS %I ON %I',
                 tbl || '_insert_own', tbl);
  EXECUTE format(
    'CREATE POLICY %I ON %I FOR INSERT WITH CHECK (auth.uid() = user_id)',
    tbl || '_insert_own', tbl
  );

  EXECUTE format('DROP POLICY IF EXISTS %I ON %I',
                 tbl || '_update_own', tbl);
  EXECUTE format(
    'CREATE POLICY %I ON %I FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)',
    tbl || '_update_own', tbl
  );

  EXECUTE format('DROP POLICY IF EXISTS %I ON %I',
                 tbl || '_delete_own', tbl);
  EXECUTE format(
    'CREATE POLICY %I ON %I FOR DELETE USING (auth.uid() = user_id)',
    tbl || '_delete_own', tbl
  );

  EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I',
                 'tg_' || tbl || '_updated_at', tbl);
  EXECUTE format(
    'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at()',
    'tg_' || tbl || '_updated_at', tbl
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Ear-training tables
-- ============================================================

-- intervals: per-user counters (ascCorrect/Total, descCorrect/Total)
-- plus optional anchor-song overrides. Seeded per-user from content.
CREATE TABLE IF NOT EXISTS intervals (
  id              TEXT NOT NULL,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS intervals_user_updated_idx
  ON intervals (user_id, updated_at DESC);
SELECT install_user_scoped_table('intervals');

-- chord_qualities
CREATE TABLE IF NOT EXISTS chord_qualities (
  id              TEXT NOT NULL,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS chord_qualities_user_updated_idx
  ON chord_qualities (user_id, updated_at DESC);
SELECT install_user_scoped_table('chord_qualities');

-- chord_shapes (composite on Dexie side: chordId+key+inversion;
-- mirrored via the same synthetic string id the Dexie layer already
-- generates).
CREATE TABLE IF NOT EXISTS chord_shapes (
  id              TEXT NOT NULL,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS chord_shapes_user_updated_idx
  ON chord_shapes (user_id, updated_at DESC);
SELECT install_user_scoped_table('chord_shapes');

-- progression_associations, mode_associations, interval_descriptions:
-- Dexie keys are natural ids (progressionId, modeId, intervalKey).
-- We fold those into the TEXT id column; payload carries the rest.
CREATE TABLE IF NOT EXISTS progression_associations (
  id              TEXT NOT NULL,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS progression_associations_user_updated_idx
  ON progression_associations (user_id, updated_at DESC);
SELECT install_user_scoped_table('progression_associations');

CREATE TABLE IF NOT EXISTS mode_associations (
  id              TEXT NOT NULL,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS mode_associations_user_updated_idx
  ON mode_associations (user_id, updated_at DESC);
SELECT install_user_scoped_table('mode_associations');

CREATE TABLE IF NOT EXISTS interval_descriptions (
  id              TEXT NOT NULL,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS interval_descriptions_user_updated_idx
  ON interval_descriptions (user_id, updated_at DESC);
SELECT install_user_scoped_table('interval_descriptions');

-- flashcard_states: cardId → id. Next-review-date is hot enough to
-- index explicitly (SRS queue query).
CREATE TABLE IF NOT EXISTS flashcard_states (
  id                TEXT NOT NULL,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  next_review_date  BIGINT,
  data              JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS flashcard_states_user_next_idx
  ON flashcard_states (user_id, next_review_date);
CREATE INDEX IF NOT EXISTS flashcard_states_user_updated_idx
  ON flashcard_states (user_id, updated_at DESC);
SELECT install_user_scoped_table('flashcard_states');

-- ============================================================
-- Attempts + daily summaries (cross-module)
-- ============================================================

-- attempts: Dexie used `++id` (auto-increment numeric). Fresh-start
-- migration: the client-side now generates a string uuid for each
-- attempt so the id rountrips as-is.
CREATE TABLE IF NOT EXISTS attempts (
  id              TEXT NOT NULL,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_id       TEXT NOT NULL,
  item_id         TEXT,
  direction       TEXT,
  correct         BOOLEAN,
  timestamp       BIGINT NOT NULL,
  data            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS attempts_user_module_ts_idx
  ON attempts (user_id, module_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS attempts_user_updated_idx
  ON attempts (user_id, updated_at DESC);
SELECT install_user_scoped_table('attempts');

-- daily_summaries: natural composite key is (date, module_id).
-- We give each row a synthetic text id of the form "date:moduleId"
-- for PK simplicity, plus an explicit UNIQUE on the natural fields
-- so upserts-by-natural-key work.
CREATE TABLE IF NOT EXISTS daily_summaries (
  id              TEXT NOT NULL,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date            TEXT NOT NULL,   -- YYYY-MM-DD
  module_id       TEXT NOT NULL,
  data            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id),
  UNIQUE (user_id, date, module_id)
);
CREATE INDEX IF NOT EXISTS daily_summaries_user_date_idx
  ON daily_summaries (user_id, date DESC);
SELECT install_user_scoped_table('daily_summaries');

-- ============================================================
-- Repertoire (songs + sections + chords + logs + cross-key)
-- ============================================================

CREATE TABLE IF NOT EXISTS songs (
  id                TEXT NOT NULL,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  added_date        BIGINT,
  data              JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_engaged_at   TIMESTAMPTZ,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS songs_user_added_idx
  ON songs (user_id, added_date DESC);
CREATE INDEX IF NOT EXISTS songs_user_updated_idx
  ON songs (user_id, updated_at DESC);
SELECT install_user_scoped_table('songs');

CREATE TABLE IF NOT EXISTS song_sections (
  id              TEXT NOT NULL,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  song_id         TEXT NOT NULL,
  data            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS song_sections_user_song_idx
  ON song_sections (user_id, song_id);
SELECT install_user_scoped_table('song_sections');

CREATE TABLE IF NOT EXISTS song_chords (
  id              TEXT NOT NULL,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  song_id         TEXT NOT NULL,
  section_id      TEXT,
  data            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS song_chords_user_song_idx
  ON song_chords (user_id, song_id);
SELECT install_user_scoped_table('song_chords');

CREATE TABLE IF NOT EXISTS song_practice_log (
  id              TEXT NOT NULL,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  song_id         TEXT NOT NULL,
  timestamp       BIGINT NOT NULL,
  data            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS song_practice_log_user_song_ts_idx
  ON song_practice_log (user_id, song_id, timestamp DESC);
SELECT install_user_scoped_table('song_practice_log');

CREATE TABLE IF NOT EXISTS song_cross_key_progress (
  id              TEXT NOT NULL,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  song_id         TEXT NOT NULL,
  section_id      TEXT,
  key_name        TEXT,
  data            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS song_cross_key_progress_user_song_idx
  ON song_cross_key_progress (user_id, song_id);
SELECT install_user_scoped_table('song_cross_key_progress');

CREATE TABLE IF NOT EXISTS want_to_learn (
  id              TEXT NOT NULL,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  added_date      BIGINT,
  data            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS want_to_learn_user_added_idx
  ON want_to_learn (user_id, added_date DESC);
SELECT install_user_scoped_table('want_to_learn');

-- ============================================================
-- Session log (cross-module daily session entries)
-- ============================================================

CREATE TABLE IF NOT EXISTS sessions (
  id              TEXT NOT NULL,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date            BIGINT,
  data            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS sessions_user_date_idx
  ON sessions (user_id, date DESC);
SELECT install_user_scoped_table('sessions');

-- ============================================================
-- Shapes & Patterns (drill skills / types / sessions)
-- ============================================================

CREATE TABLE IF NOT EXISTS drill_skills (
  id                TEXT NOT NULL,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data              JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_engaged_at   TIMESTAMPTZ,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS drill_skills_user_updated_idx
  ON drill_skills (user_id, updated_at DESC);
SELECT install_user_scoped_table('drill_skills');

CREATE TABLE IF NOT EXISTS drill_types (
  id              TEXT NOT NULL,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  skill_id        TEXT NOT NULL,
  data            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS drill_types_user_skill_idx
  ON drill_types (user_id, skill_id);
SELECT install_user_scoped_table('drill_types');

CREATE TABLE IF NOT EXISTS drill_sessions (
  id              TEXT NOT NULL,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  skill_id        TEXT NOT NULL,
  drill_type_id   TEXT,
  timestamp       BIGINT,
  data            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS drill_sessions_user_skill_ts_idx
  ON drill_sessions (user_id, skill_id, timestamp DESC);
SELECT install_user_scoped_table('drill_sessions');

CREATE TABLE IF NOT EXISTS creative_sessions (
  id              TEXT NOT NULL,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  timestamp       BIGINT,
  mode            TEXT,
  data            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS creative_sessions_user_ts_idx
  ON creative_sessions (user_id, timestamp DESC);
SELECT install_user_scoped_table('creative_sessions');

-- ============================================================
-- Logic Pro / production coaching counters (legacy, kept for backup)
-- ============================================================

CREATE TABLE IF NOT EXISTS logic_skills (
  id              TEXT NOT NULL,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);
SELECT install_user_scoped_table('logic_skills');

CREATE TABLE IF NOT EXISTS producer_stats (
  id              TEXT NOT NULL,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);
SELECT install_user_scoped_table('producer_stats');

CREATE TABLE IF NOT EXISTS quiz_stats (
  id              TEXT NOT NULL,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);
SELECT install_user_scoped_table('quiz_stats');

-- ============================================================
-- Production module (lessons / glossary / reference tracks)
-- ============================================================

CREATE TABLE IF NOT EXISTS production_lessons (
  id                TEXT NOT NULL,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  path_id           TEXT,
  data              JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_engaged_at   TIMESTAMPTZ,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS production_lessons_user_path_idx
  ON production_lessons (user_id, path_id);
SELECT install_user_scoped_table('production_lessons');

CREATE TABLE IF NOT EXISTS production_lesson_sessions (
  id              TEXT NOT NULL,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id       TEXT NOT NULL,
  timestamp       BIGINT,
  data            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS production_lesson_sessions_user_lesson_idx
  ON production_lesson_sessions (user_id, lesson_id);
SELECT install_user_scoped_table('production_lesson_sessions');

CREATE TABLE IF NOT EXISTS glossary_term_states (
  id              TEXT NOT NULL,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS glossary_term_states_user_updated_idx
  ON glossary_term_states (user_id, updated_at DESC);
SELECT install_user_scoped_table('glossary_term_states');

CREATE TABLE IF NOT EXISTS reference_tracks (
  id              TEXT NOT NULL,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  added_at        BIGINT,
  data            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS reference_tracks_user_added_idx
  ON reference_tracks (user_id, added_at DESC);
SELECT install_user_scoped_table('reference_tracks');

CREATE TABLE IF NOT EXISTS lesson_reference_tracks (
  id              TEXT NOT NULL,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id       TEXT NOT NULL,
  track_id        TEXT NOT NULL,
  data            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id),
  UNIQUE (user_id, lesson_id, track_id)
);
CREATE INDEX IF NOT EXISTS lesson_reference_tracks_user_lesson_idx
  ON lesson_reference_tracks (user_id, lesson_id);
CREATE INDEX IF NOT EXISTS lesson_reference_tracks_user_track_idx
  ON lesson_reference_tracks (user_id, track_id);
SELECT install_user_scoped_table('lesson_reference_tracks');

-- ============================================================
-- Skills catalogue + harmonic diary
-- ============================================================

CREATE TABLE IF NOT EXISTS skill_annotations (
  id              TEXT NOT NULL,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS skill_annotations_user_updated_idx
  ON skill_annotations (user_id, updated_at DESC);
SELECT install_user_scoped_table('skill_annotations');

CREATE TABLE IF NOT EXISTS harmonic_diary_entries (
  id              TEXT NOT NULL,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  skill_id        TEXT,
  data            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS harmonic_diary_entries_user_skill_idx
  ON harmonic_diary_entries (user_id, skill_id);
SELECT install_user_scoped_table('harmonic_diary_entries');

-- ============================================================
-- User preferences (key/value store — unique per (user_id, key))
-- ============================================================

CREATE TABLE IF NOT EXISTS user_prefs (
  id              TEXT NOT NULL,   -- = the pref `key`
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);
SELECT install_user_scoped_table('user_prefs');

-- ============================================================
-- Done.
-- ============================================================
