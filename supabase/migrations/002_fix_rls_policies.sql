-- ============================================================
-- Fix: grant table privileges to the `authenticated` role
-- ============================================================
--
-- The initial migration (001_initial_schema.sql) created tables and
-- installed RLS policies via `install_user_scoped_table()`. The
-- policies themselves are correct — SELECT/INSERT/UPDATE/DELETE are
-- each gated on `auth.uid() = user_id`. Verified.
--
-- What was missing: table-level GRANTs to the `authenticated` role.
--
-- Postgres checks privileges in two stages:
--   1. Role-level GRANT on the table (SELECT/INSERT/UPDATE/DELETE).
--   2. If granted, THEN the row-level security policies run.
--
-- When tables are created via the Supabase dashboard UI, Supabase
-- auto-GRANTs on the `authenticated` role. When created via raw SQL
-- (as we did in 001), only the owner role (postgres) gets privileges;
-- `authenticated` gets nothing.
--
-- Symptom: SQL client returns HTTP 403 with:
--   `permission denied for table <name>` (error code 42501)
-- — NOT the RLS-rejection message `new row violates row-level
-- security policy`. That's how we know grants are the issue, not RLS.
--
-- This migration is idempotent. Safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- Grant table privileges to `authenticated` (signed-in users).
-- `anon` intentionally gets NOTHING — anonymous users have no rows
-- of their own, and RLS would reject them anyway.
-- ------------------------------------------------------------
DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    -- Ear-training
    'intervals',
    'chord_qualities',
    'chord_shapes',
    'progression_associations',
    'mode_associations',
    'interval_descriptions',
    'flashcard_states',
    -- Attempts + daily summaries
    'attempts',
    'daily_summaries',
    -- Repertoire
    'songs',
    'song_sections',
    'song_chords',
    'song_practice_log',
    'song_cross_key_progress',
    'want_to_learn',
    -- Session log
    'sessions',
    -- Shapes & Patterns
    'drill_skills',
    'drill_types',
    'drill_sessions',
    'creative_sessions',
    -- Legacy production counters
    'logic_skills',
    'producer_stats',
    'quiz_stats',
    -- Production module
    'production_lessons',
    'production_lesson_sessions',
    'glossary_term_states',
    'reference_tracks',
    'lesson_reference_tracks',
    -- Skills catalogue + harmonic diary
    'skill_annotations',
    'harmonic_diary_entries',
    -- User prefs
    'user_prefs'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated',
      tbl
    );
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- Default privileges for future tables.
--
-- Sets the default so any table created in the public schema
-- FROM NOW ON automatically gets the same grants. Prevents this
-- exact issue from recurring the next time we add a table via SQL.
--
-- `ALTER DEFAULT PRIVILEGES` applies only to objects created after
-- this statement runs — existing tables were handled by the loop
-- above.
-- ------------------------------------------------------------
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

-- ------------------------------------------------------------
-- Re-apply RLS setup on every table as a safety net.
--
-- `install_user_scoped_table()` from migration 001 is idempotent —
-- it uses DROP POLICY IF EXISTS + CREATE POLICY, and ALTER TABLE
-- ENABLE RLS is a no-op when already enabled. Running it again
-- guarantees all tables have the expected policies even if the
-- first migration partially errored.
-- ------------------------------------------------------------
DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'intervals', 'chord_qualities', 'chord_shapes',
    'progression_associations', 'mode_associations', 'interval_descriptions',
    'flashcard_states', 'attempts', 'daily_summaries',
    'songs', 'song_sections', 'song_chords', 'song_practice_log',
    'song_cross_key_progress', 'want_to_learn', 'sessions',
    'drill_skills', 'drill_types', 'drill_sessions', 'creative_sessions',
    'logic_skills', 'producer_stats', 'quiz_stats',
    'production_lessons', 'production_lesson_sessions',
    'glossary_term_states', 'reference_tracks', 'lesson_reference_tracks',
    'skill_annotations', 'harmonic_diary_entries', 'user_prefs'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    PERFORM install_user_scoped_table(tbl);
  END LOOP;
END $$;

-- ============================================================
-- Done.
-- ============================================================
