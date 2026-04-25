import { db, type ProficiencyDefinition } from '../../lib/db';
import { whenSyncReady } from '../../lib/sync/syncReady';

/** Module-level in-flight guard — second concurrent caller awaits the
 *  same in-flight promise instead of starting a parallel seed. Mirrors
 *  the pattern in seedRepertoireIfNeeded / seedProductionIfNeeded. */
let seedInFlight: Promise<void> | null = null;

/**
 * Canonical proficiency vocabulary, used everywhere in the app that
 * surfaces a mastery level: Goals, Song Repertoire, Skills Catalogue,
 * and Practice Sessions. Five rows, song-scoped (skill / concept
 * scopes will be added in later phases when those surfaces start
 * referencing the canonical definitions).
 *
 * Seeded once per user; the rows are identical across users. We
 * mirror the rest of the codebase's user-scoped table convention
 * rather than maintaining a separate "global" pathway.
 */
const PROFICIENCY_SEED: ProficiencyDefinition[] = [
  {
    id: 'prof-song-learning',
    level: 'learning',
    scope: 'song',
    shortLabel: 'Just starting',
    description: 'Working through basics, requires constant reference',
    example: 'Reading the chord chart for "Mirror" while playing',
    displayOrder: 1,
  },
  {
    id: 'prof-song-comfortable',
    level: 'comfortable',
    scope: 'song',
    shortLabel: 'Can play it through',
    description: 'Plays without stumbling in original key, no reference needed',
    example: 'Playing "Mirror" cleanly start to finish in C',
    displayOrder: 2,
  },
  {
    id: 'prof-song-internalized',
    level: 'internalized',
    scope: 'song',
    shortLabel: 'Memorized and felt',
    description: 'Plays from memory, expressively, in native key',
    example: 'Playing "Mirror" by heart with feeling',
    displayOrder: 3,
  },
  {
    id: 'prof-song-cross-key',
    level: 'cross_key',
    scope: 'song',
    shortLabel: 'Transposable',
    description: 'Can play in multiple keys without re-learning',
    example: 'Playing "Mirror" in F, G, and A on demand',
    displayOrder: 4,
  },
  {
    id: 'prof-song-maintenance',
    level: 'maintenance',
    scope: 'song',
    shortLabel: 'Solid, just refresh occasionally',
    description: 'Internalized + Cross-key; revisit periodically',
    example: '"Mirror" in active repertoire indefinitely',
    displayOrder: 5,
  },
];

/**
 * Seed the per-user proficiency_definitions table with the five
 * canonical levels if (and only if) any are missing.
 *
 * Lifecycle-aware: awaits whenSyncReady() before writing. Without
 * that, seed writes can land in local Dexie before the sync layer
 * is registered, leaving the cloud copy empty and getting wiped by
 * the next replace-mode pull. See the April 2026 seeder fix for
 * the underlying lesson.
 *
 * Idempotent: existing rows are preserved; only missing levels are
 * added. The user-edited fields (which Phase 1 doesn't expose) will
 * still be respected once those edits become possible.
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
