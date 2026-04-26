import { db, type ProficiencyDefinition } from '../../lib/db';
import { whenSyncReady } from '../../lib/sync/syncReady';

/** Module-level in-flight guard — second concurrent caller awaits the
 *  same in-flight promise instead of starting a parallel seed. Mirrors
 *  the pattern in seedRepertoireIfNeeded / seedProductionIfNeeded. */
let seedInFlight: Promise<void> | null = null;

/**
 * Canonical proficiency vocabulary, used everywhere the app surfaces
 * a mastery level: Goals, Song Repertoire, Skills Catalogue, Practice
 * Sessions. Nineteen rows across four scopes after the Phase 1
 * song-goal addendum (April 26, 2026):
 *
 *   skill scope (6 levels) — for measured-accuracy modules. Bands
 *     map to recent-attempt accuracy:
 *       planting    < 50%   First contact; building the representations
 *       sprouting   50–65%  Familiar but not yet stable
 *       branching   65–80%  Right more than wrong; getting dependable
 *       rooted      80–94%  Consistent across varied contexts
 *       seasoned    95%+    Internalized, automatic, freed up for flow
 *       maintenance (post)  Earned; refresh occasionally
 *
 *     Phase 1 sub-phase 6 audit (April 26, 2026): these garden-
 *     vocabulary labels are seeded today but NOT yet rendered by
 *     the skill-bearing surfaces. Skills Catalogue (SkillsGrid /
 *     SkillDetailPanel) and the ear-training fluency trackers
 *     still render the legacy Tier vocabulary (mastered / fluent /
 *     developing / needsWork / stale / untouched) from
 *     src/lib/tier.ts. The two vocabularies measure the same thing
 *     with different labels and slightly different breakpoints.
 *     The Goals form's `items_at_level` level dropdown is the only
 *     Phase 1 surface that renders these garden labels.
 *
 *     Reconciliation is deferred to Phase 2, when acquisition-stage
 *     detection (Q8) and spacing-state population start consuming
 *     the band thresholds directly — at that point the migration
 *     gets a single owner (the Phase 2 algorithm code) instead of
 *     being a labeling-only churn pass on the existing surfaces.
 *     See the header comment in src/lib/tier.ts for the full
 *     surface list and migration plan.
 *
 *   song scope (5 levels) — whole-song progression for goal
 *     targeting. Phase 1 song-goal addendum vocabulary:
 *       learning      Working through sections in the original key
 *       comfortable   Every section in the original key feels solid
 *                     individually
 *       solid         Whole song proven end-to-end at tempo in the
 *                     original key
 *       cross_key     Extending into keys beyond the original
 *       internalized  Solid across multiple keys, lived with
 *
 *     No Maintenance row — Maintenance is a user-declared intent,
 *     not a proficiency level (handled via a separate intent toggle
 *     deferred to Phase 1.5). The legacy `RepertoireStage` type in
 *     src/lib/db.ts still uses kebab `cross-key` for song-stage
 *     tracking in the repertoire module; that vocabulary is reworked
 *     wholesale in the Song Progression Redesign (Phase 1.5).
 *
 *   song_key scope (3 levels) — per-key progression for a single
 *     song (Phase 1 song-goal addendum):
 *       learning      Some sections comfortable, others still building
 *       comfortable   Every section in this key is comfortable
 *       solid         Whole song proven 3× clean at tempo in this key
 *
 *     No Maintenance row.
 *
 *   production scope (5 levels) — Production lessons. Mirrors song
 *     vocabulary except cross-key becomes cross-context (concepts
 *     applied across other lessons / songs / videos / genres rather
 *     than across musical keys). Maintenance retained — this scope
 *     is unchanged by the song-goal addendum.
 *
 * Identifier conventions: skill levels are single words; song and
 * song_key levels use snake_case for multi-word values (`cross_key`)
 * per the addendum; production keeps kebab `cross-context` until a
 * future harmonization pass.
 *
 * Some levels are shared across scopes (learning, comfortable, solid,
 * internalized, maintenance). The (scope, level) pair is the
 * canonical key — the same level identifier in different scopes
 * points to a different definition row with its own description and
 * example. Rows are seeded once per user (matching the pattern of
 * every other table in this codebase); the rows are identical
 * across users.
 */
const PROFICIENCY_SEED: ProficiencyDefinition[] = [
  // ----- Skill scope (6 rows) -----
  {
    id: 'prof-skill-planting',
    level: 'planting',
    scope: 'skill',
    shortLabel: 'First contact',
    description: 'Just encountering it; building the representations.',
    example: 'Recent accuracy under 50%.',
    displayOrder: 1,
  },
  {
    id: 'prof-skill-sprouting',
    level: 'sprouting',
    scope: 'skill',
    shortLabel: 'Recognizing sometimes',
    description: 'Familiar but not yet stable; right ~50–65% of the time.',
    example: 'Recent accuracy 50–65%.',
    displayOrder: 2,
  },
  {
    id: 'prof-skill-branching',
    level: 'branching',
    scope: 'skill',
    shortLabel: 'Forming and consolidating',
    description: 'Right more than wrong (~65–80%); getting more dependable.',
    example: 'Recent accuracy 65–80%.',
    displayOrder: 3,
  },
  {
    id: 'prof-skill-rooted',
    level: 'rooted',
    scope: 'skill',
    shortLabel: 'Reasonably fluent',
    description: 'Consistent across varied contexts (~80–94%); still attended.',
    example: 'Recent accuracy 80–94%.',
    displayOrder: 4,
  },
  {
    id: 'prof-skill-seasoned',
    level: 'seasoned',
    scope: 'skill',
    shortLabel: 'Internalized, automatic',
    description: 'Second nature (~95%+); doesn’t require thought, freed up for creative flow.',
    example: 'Recent accuracy 95% or higher.',
    displayOrder: 5,
  },
  {
    id: 'prof-skill-maintenance',
    level: 'maintenance',
    scope: 'skill',
    shortLabel: 'Earned, refresh occasionally',
    description: 'At Seasoned and stable; revisit periodically to retain.',
    example: 'Sustained at Seasoned over time.',
    displayOrder: 6,
  },

  // ----- Song scope (5 rows) — Phase 1 song-goal addendum vocabulary -----
  {
    id: 'prof-song-learning',
    level: 'learning',
    scope: 'song',
    shortLabel: 'Just getting started',
    description: 'Working through sections in the original key — not yet comfortable with all of them.',
    example: 'Reading the chord chart for "Mirror" while playing some sections.',
    displayOrder: 1,
  },
  {
    id: 'prof-song-comfortable',
    level: 'comfortable',
    scope: 'song',
    shortLabel: 'Sections under your fingers',
    description: 'Every section of the original key feels comfortable individually.',
    example: 'Each section of "Mirror" plays cleanly on its own in C.',
    displayOrder: 2,
  },
  {
    id: 'prof-song-solid',
    level: 'solid',
    scope: 'song',
    shortLabel: 'Proven end-to-end',
    description: 'Played the whole song through cleanly, multiple times, at tempo, in the original key.',
    example: 'Playing "Mirror" start to finish at tempo in C, three times in a row.',
    displayOrder: 3,
  },
  {
    id: 'prof-song-cross_key',
    level: 'cross_key',
    scope: 'song',
    shortLabel: 'Taking it further',
    description: 'Extending the song into new keys beyond the original.',
    example: 'Working "Mirror" in F and G after Solid in C.',
    displayOrder: 4,
  },
  {
    id: 'prof-song-internalized',
    level: 'internalized',
    scope: 'song',
    shortLabel: 'Truly yours',
    description: 'Solid across multiple keys, and lived with long enough that it plays from somewhere deeper than memory.',
    example: '"Mirror" plays itself in any requested key, expressively, from feel.',
    displayOrder: 5,
  },

  // ----- Song-key scope (3 rows) — Phase 1 song-goal addendum (per-key progression) -----
  {
    id: 'prof-song_key-learning',
    level: 'learning',
    scope: 'song_key',
    shortLabel: 'Working on it',
    description: 'Some sections are comfortable, others still being built.',
    example: 'In F: chorus feels good, bridge still uncertain.',
    displayOrder: 1,
  },
  {
    id: 'prof-song_key-comfortable',
    level: 'comfortable',
    scope: 'song_key',
    shortLabel: 'Sections done',
    description: 'Every section in this key is comfortable individually.',
    example: 'Every section of "Mirror" plays cleanly on its own in F.',
    displayOrder: 2,
  },
  {
    id: 'prof-song_key-solid',
    level: 'solid',
    scope: 'song_key',
    shortLabel: 'Whole song proven',
    description: 'Played the full song through cleanly, 3 times in a row, at tempo, in this key.',
    example: '"Mirror" start to finish at tempo in F, three times back-to-back.',
    displayOrder: 3,
  },

  // ----- Production scope (5 rows) -----
  {
    id: 'prof-production-learning',
    level: 'learning',
    scope: 'production',
    shortLabel: 'Just starting',
    description: 'Working through the lesson; concepts are new.',
    example: 'First read of a vocal-comp lesson.',
    displayOrder: 1,
  },
  {
    id: 'prof-production-comfortable',
    level: 'comfortable',
    scope: 'production',
    shortLabel: 'Got the basics',
    description: 'Read it through; can explain at a surface level.',
    example: 'Could summarize the lesson to a friend.',
    displayOrder: 2,
  },
  {
    id: 'prof-production-cross-context',
    level: 'cross-context',
    scope: 'production',
    shortLabel: 'Applies across contexts',
    description: 'Recognizing/applying concepts across other lessons, songs, videos, genres.',
    example: 'Spotting the same compression move in three different productions.',
    displayOrder: 3,
  },
  {
    id: 'prof-production-internalized',
    level: 'internalized',
    scope: 'production',
    shortLabel: 'Part of how you think',
    description: 'Concepts are part of how you think about audio; vocabulary is natural.',
    example: 'Reaching for the right move without consciously deciding.',
    displayOrder: 4,
  },
  {
    id: 'prof-production-maintenance',
    level: 'maintenance',
    scope: 'production',
    shortLabel: 'Solid, refresh occasionally',
    description: 'Solid foundation; revisit if specifics fade.',
    example: 'Returning to refresh details every few months.',
    displayOrder: 5,
  },
];

/**
 * Reconcile the per-user proficiency_definitions table to match the
 * canonical PROFICIENCY_SEED. Three jobs in one pass:
 *
 *   1. Insert seed rows that don't yet exist (first-run seeding).
 *   2. Update seed rows whose content has drifted (copy edits or
 *      identifier changes propagate without manual intervention).
 *   3. Delete rows that are no longer in the seed (e.g. the
 *      `prof-song-maintenance` and `prof-song-cross-key` rows
 *      removed by the Phase 1 song-goal addendum, April 26, 2026).
 *
 * Lifecycle-aware: awaits whenSyncReady() before writing so the
 * reconciliation flows through the Dexie sync hooks to Supabase.
 * Without that, seed writes can land in local Dexie before the sync
 * layer is registered, leaving the cloud copy empty and getting
 * wiped by the next replace-mode pull (see the April 2026 seeder
 * fix for the underlying lesson).
 *
 * Idempotent: re-running with the same seed is a no-op when the
 * table already matches. The function is safe to call on every
 * Goals mount.
 *
 * Sync semantics: bulkPut triggers Dexie's `creating` / `updating`
 * hooks; bulkDelete triggers `deleting`. Both enqueue cloud
 * operations via src/lib/sync/hooks.ts, so the reconciliation
 * propagates to Supabase on the next sync.
 *
 * The proficiencyDefinitions table is per-user and read-only from
 * the user's perspective — the seed is the source of truth. There
 * are no user-authored rows to preserve.
 */
export async function seedProficiencyDefinitionsIfNeeded(): Promise<void> {
  if (seedInFlight) return seedInFlight;
  seedInFlight = (async () => {
    try {
      await runProficiencySeed();
    } finally {
      seedInFlight = null;
    }
  })();
  return seedInFlight;
}

async function runProficiencySeed(): Promise<void> {
  await whenSyncReady();

  const existing = await db.proficiencyDefinitions.toArray();
  const existingIds = new Set(existing.map(p => p.id));
  const seedIds = new Set(PROFICIENCY_SEED.map(p => p.id));

  const obsoleteIds = [...existingIds].filter(id => !seedIds.has(id));
  if (obsoleteIds.length > 0) {
    await db.proficiencyDefinitions.bulkDelete(obsoleteIds);
  }

  // bulkPut is unconditional — it covers both first-run inserts and
  // content updates for already-seeded rows. The cost is one cloud
  // upsert per row on every mount where content has drifted, which
  // is rare; the alternative (diff-and-update) adds complexity for
  // little gain on a 19-row table.
  await db.proficiencyDefinitions.bulkPut(PROFICIENCY_SEED);
}
