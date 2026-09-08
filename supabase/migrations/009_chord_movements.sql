-- ============================================================
-- Musical Journey App — 009: Chord movements
-- ============================================================
--
-- A chord movement is a captured chord move with a rhythm and pressed
-- voicings — a 3-to-6 walk-up heard on YouTube, say. It is NOT a song
-- and must never be counted where songs are counted, which is why it
-- has its own table rather than a flag on `songs`. See
-- docs/CHORD_MOVEMENTS_DECISIONS.md, ruling 1.
--
-- Schema mirrors the Dexie ChordMovement row: `id` is a client-minted
-- uuid, `updated_at` carries the ordering the list reads, and
-- everything else — name, description, key, time signature, the chord
-- placements with their voicings, the playback BPM and the bass
-- balance — rides in the `data` JSONB blob.
--
-- ONLY WHAT IS QUERIED SERVER-SIDE IS A COLUMN. Nothing filters
-- movements by name or key today, so nothing is lifted out; the sync
-- layer's own comment sets that rule and this follows it.
--
-- Follows the existing pattern from 003/004/005/006/008: id/user_id
-- composite primary key, top-level columns for indexed values,
-- everything else in `data` JSONB. RLS + 4 policies + updated_at
-- trigger installed via `install_user_scoped_table` from 001.
--
-- MUST BE APPLIED BEFORE THE CLIENT PUSHES ONE. A push to a missing
-- table fails the drain batch and returns early, stalling the queue for
-- every other table too — the same warning 008_attempts.sql carries.
-- ============================================================

-- ------------------------------------------------------------
-- chord_movements
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chord_movements (
  id          TEXT NOT NULL,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);
SELECT install_user_scoped_table('chord_movements');

-- ============================================================
-- Done.
-- ============================================================
