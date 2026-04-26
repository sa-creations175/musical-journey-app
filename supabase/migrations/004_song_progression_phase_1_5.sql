-- ============================================================
-- Musical Journey App — 004: Song Progression Redesign (Phase 1.5 step 1)
-- ============================================================
--
-- Six new tables backing the section × key matrix model from
-- docs/SONG_PROGRESSION_DESIGN_3.md. Step 1 is schema only — the
-- migration of existing songs into this model, the matrix UI,
-- run-through logging, and the Practice Sessions algorithm hooks
-- ship in subsequent steps.
--
--   - song_matrix_sections     Tracking unit for cell rollups. The
--                              design doc calls this `songSections`,
--                              but that table name is already taken
--                              in this codebase by the Repertoire
--                              module's lead-sheet layout (lyrics,
--                              phrases, chord arrangements). To
--                              avoid the collision we ship the new
--                              matrix metadata at this name. A
--                              future unification pass may merge
--                              the two; until then they are
--                              deliberately separate concepts at
--                              separate abstraction levels. See
--                              the matching comment in
--                              src/lib/db.ts on SongMatrixSection.
--
--   - song_keys                One row per song per key (12 majors
--                              max). Tracks key-level state and
--                              the lived-with rolling window.
--
--   - song_cells               Section × key intersection rows.
--                              cell_state ∈ empty | learning |
--                              comfortable. The 3-consecutive-clean
--                              gate is encoded in
--                              consecutive_clean_count (kept in the
--                              JSONB data column, not top-level).
--
--   - song_cell_run_throughs   Append-only per-cell attempt log.
--                              Drives cell_state advancement.
--
--   - song_key_run_throughs    Append-only whole-song-test log.
--                              Drives the comfortable → solid
--                              transition at the key level.
--
--   - song_key_engagements     One row per session per key. Lived-
--                              with computation runs on insert.
--
-- All six tables follow the existing pattern from 003: id/user_id
-- composite primary key, top-level columns for the values we
-- actually index/query on server-side, everything else in the
-- `data` JSONB column. RLS + 4 policies + updated_at trigger
-- installed via `install_user_scoped_table` from 001.
--
-- Naming note (`song_cross_key_progress`): the v18 table that
-- tracks per-section cross-key counts is functionally subsumed
-- by song_cells once the matrix UI ships. We're keeping it intact
-- this migration — dropping the old table is a Phase 1.5 cleanup
-- step that requires a data-migration plan and will land later.
-- ============================================================

-- ------------------------------------------------------------
-- song_matrix_sections
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS song_matrix_sections (
  id              TEXT NOT NULL,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  song_id         TEXT NOT NULL,
  display_order   INTEGER,
  is_archived     BOOLEAN NOT NULL DEFAULT FALSE,
  data            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS song_matrix_sections_user_song_order_idx
  ON song_matrix_sections (user_id, song_id, display_order);
CREATE INDEX IF NOT EXISTS song_matrix_sections_user_archived_idx
  ON song_matrix_sections (user_id, is_archived);
SELECT install_user_scoped_table('song_matrix_sections');

-- ------------------------------------------------------------
-- song_keys
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS song_keys (
  id                       TEXT NOT NULL,
  user_id                  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  song_id                  TEXT NOT NULL,
  key_name                 TEXT NOT NULL,
  is_original_key          BOOLEAN NOT NULL DEFAULT FALSE,
  key_state                TEXT NOT NULL,
  solid_decay_state        TEXT,
  is_retest_recommended    BOOLEAN NOT NULL DEFAULT FALSE,
  last_engaged_at          BIGINT,
  data                     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS song_keys_user_song_idx
  ON song_keys (user_id, song_id);
CREATE INDEX IF NOT EXISTS song_keys_user_song_key_idx
  ON song_keys (user_id, song_id, key_name);
CREATE INDEX IF NOT EXISTS song_keys_user_state_idx
  ON song_keys (user_id, key_state);
CREATE INDEX IF NOT EXISTS song_keys_user_decay_idx
  ON song_keys (user_id, solid_decay_state);
SELECT install_user_scoped_table('song_keys');

-- ------------------------------------------------------------
-- song_cells
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS song_cells (
  id                  TEXT NOT NULL,
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  song_id             TEXT NOT NULL,
  section_id          TEXT NOT NULL,
  song_key_id         TEXT NOT NULL,
  cell_state          TEXT NOT NULL,
  last_engaged_at     BIGINT,
  data                JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS song_cells_user_section_key_idx
  ON song_cells (user_id, section_id, song_key_id);
CREATE INDEX IF NOT EXISTS song_cells_user_song_idx
  ON song_cells (user_id, song_id);
CREATE INDEX IF NOT EXISTS song_cells_user_state_idx
  ON song_cells (user_id, cell_state);
SELECT install_user_scoped_table('song_cells');

-- ------------------------------------------------------------
-- song_cell_run_throughs
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS song_cell_run_throughs (
  id              TEXT NOT NULL,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cell_id         TEXT NOT NULL,
  song_id         TEXT NOT NULL,
  section_id      TEXT NOT NULL,
  song_key_id     TEXT NOT NULL,
  was_clean       BOOLEAN NOT NULL,
  data            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS song_cell_run_throughs_user_cell_idx
  ON song_cell_run_throughs (user_id, cell_id, created_at DESC);
CREATE INDEX IF NOT EXISTS song_cell_run_throughs_user_song_idx
  ON song_cell_run_throughs (user_id, song_id, created_at DESC);
SELECT install_user_scoped_table('song_cell_run_throughs');

-- ------------------------------------------------------------
-- song_key_run_throughs
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS song_key_run_throughs (
  id              TEXT NOT NULL,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  song_key_id     TEXT NOT NULL,
  song_id         TEXT NOT NULL,
  was_clean       BOOLEAN NOT NULL,
  is_retest       BOOLEAN NOT NULL DEFAULT FALSE,
  data            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS song_key_run_throughs_user_key_idx
  ON song_key_run_throughs (user_id, song_key_id, created_at DESC);
CREATE INDEX IF NOT EXISTS song_key_run_throughs_user_song_idx
  ON song_key_run_throughs (user_id, song_id, created_at DESC);
SELECT install_user_scoped_table('song_key_run_throughs');

-- ------------------------------------------------------------
-- song_key_engagements
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS song_key_engagements (
  id                       TEXT NOT NULL,
  user_id                  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  song_key_id              TEXT NOT NULL,
  song_id                  TEXT NOT NULL,
  engaged_at               BIGINT NOT NULL,
  practice_session_id      TEXT,
  data                     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS song_key_engagements_user_key_engaged_idx
  ON song_key_engagements (user_id, song_key_id, engaged_at DESC);
CREATE INDEX IF NOT EXISTS song_key_engagements_user_session_idx
  ON song_key_engagements (user_id, practice_session_id);
SELECT install_user_scoped_table('song_key_engagements');

-- ============================================================
-- Done.
-- ============================================================
