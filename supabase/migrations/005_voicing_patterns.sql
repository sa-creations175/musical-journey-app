-- ============================================================
-- Musical Journey App — 005: Voicing patterns (voicing carousel)
-- ============================================================
--
-- One table backing the lead-sheet voicing carousel — see
-- docs/VOICING_CAROUSEL_DESIGN.md. A voicing_pattern is a reusable
-- voicing shape for a chord quality (offsets = absolute semitones
-- above the root, with hand), stored in the `data` JSONB column.
--
-- IMPORTANT — system vs user rows:
--   The app seeds a fixed catalog of ~67 SYSTEM patterns from code on
--   every device (src/modules/shapes-and-patterns/seedVoicingPatterns.ts).
--   Those rows carry isSystem:true and are NEVER synced — the sync layer
--   skips them at the enqueue boundary (src/lib/sync/engine.ts). So this
--   table only ever holds USER-saved patterns (isSystem:false). The
--   column shape still mirrors a full pattern so a user row round-trips
--   cleanly through data JSONB.
--
-- Follows the existing pattern from 003/004: id/user_id composite
-- primary key, top-level columns for the values we index/query on
-- server-side (quality_id), everything else in `data` JSONB. RLS +
-- 4 policies + updated_at trigger installed via
-- `install_user_scoped_table` from 001.
-- ============================================================

-- ------------------------------------------------------------
-- voicing_patterns
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS voicing_patterns (
  id              TEXT NOT NULL,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quality_id      TEXT NOT NULL,
  data            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS voicing_patterns_user_quality_idx
  ON voicing_patterns (user_id, quality_id);
SELECT install_user_scoped_table('voicing_patterns');

-- ============================================================
-- Done.
-- ============================================================
