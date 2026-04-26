import { db, type ProficiencyDefinition } from '../../lib/db';
import { whenSyncReady } from '../../lib/sync/syncReady';

/** Module-level in-flight guard — second concurrent caller awaits the
 *  same in-flight promise instead of starting a parallel seed. Mirrors
 *  the pattern in seedRepertoireIfNeeded / seedProductionIfNeeded. */
let seedInFlight: Promise<void> | null = null;

/**
 * Canonical proficiency vocabulary, used everywhere the app surfaces
 * a mastery level: Goals, Song Repertoire, Skills Catalogue, Practice
 * Sessions. Sixteen rows across three vocabularies, expanded in
 * sub-phase 3 step 4 (April 25, 2026):
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
 *     The skill bands themselves don't get computed in Phase 1 —
 *     spacing state populates in Phase 2 and the band derivation
 *     lives there. These rows exist now so goal-creation level
 *     pickers can offer the vocabulary.
 *
 *   song scope (5 levels) — Song Repertoire stage progression.
 *     Reordered in this commit so cross-key precedes internalized:
 *     a song isn't truly internalized until it's been worked across
 *     keys. The companion source of truth lives in
 *     src/modules/repertoire/stage.ts (STAGES array, taglines,
 *     guidance, badge colors).
 *
 *   production scope (5 levels) — Production lessons. Mirrors song
 *     vocabulary except cross-key becomes cross-context (concepts
 *     applied across other lessons / songs / videos / genres rather
 *     than across musical keys).
 *
 * Multi-word level identifiers use kebab-case (cross-key,
 * cross-context) to match the existing RepertoireStage convention.
 *
 * Some levels (learning, comfortable, internalized, maintenance) are
 * shared across multiple scopes. The (scope, level) pair is the
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

  // ----- Song scope (5 rows) — reordered cross-key 4→3, internalized 3→4 -----
  {
    id: 'prof-song-learning',
    level: 'learning',
    scope: 'song',
    shortLabel: 'Just starting',
    description: 'Working through the basics, requires constant reference.',
    example: 'Reading the chord chart for "Mirror" while playing.',
    displayOrder: 1,
  },
  {
    id: 'prof-song-comfortable',
    level: 'comfortable',
    scope: 'song',
    shortLabel: 'Can play it through',
    description: 'Plays without stumbling in original key, no reference needed.',
    example: 'Playing "Mirror" cleanly start to finish in C.',
    displayOrder: 2,
  },
  {
    id: 'prof-song-cross-key',
    level: 'cross-key',
    scope: 'song',
    shortLabel: 'Transposable',
    description: 'Can play across multiple keys (still working it across them).',
    example: 'Playing "Mirror" in F, G, and A on demand.',
    displayOrder: 3,
  },
  {
    id: 'prof-song-internalized',
    level: 'internalized',
    scope: 'song',
    shortLabel: 'Memorized and felt',
    description: 'Plays from memory, expressively, in any key — the song is yours.',
    example: 'Playing "Mirror" by heart with feeling, any key requested.',
    displayOrder: 4,
  },
  {
    id: 'prof-song-maintenance',
    level: 'maintenance',
    scope: 'song',
    shortLabel: 'Solid, refresh occasionally',
    description: 'Internalized; revisit periodically.',
    example: '"Mirror" in active repertoire indefinitely.',
    displayOrder: 5,
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
 * Seed the per-user proficiency_definitions table with the 16
 * canonical rows if (and only if) any are missing.
 *
 * Lifecycle-aware: awaits whenSyncReady() before writing. Without
 * that, seed writes can land in local Dexie before the sync layer
 * is registered, leaving the cloud copy empty and getting wiped by
 * the next replace-mode pull. See the April 2026 seeder fix for
 * the underlying lesson.
 *
 * Idempotent: existing rows are preserved; only missing rows are
 * added. Re-runs are safe — the user's data isn't touched once
 * seeded.
 *
 * If you need to reseed after editing PROFICIENCY_SEED in dev,
 * delete the affected rows from the proficiencyDefinitions table
 * and call this function again. There's no auto-update for
 * already-seeded rows whose content drifted.
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

  const missing = PROFICIENCY_SEED.filter(p => !existingIds.has(p.id));
  if (missing.length === 0) return;

  await db.proficiencyDefinitions.bulkPut(missing);
}
