import { db } from '../../../lib/db';

const MODULE_ID = 'chord-recognition';

/**
 * One-time migration for chord-recognition attempts.
 *
 * Pre-build the chord-recognition quiz only ever played root position;
 * attempts logged itemIds like 'maj', 'dom7'. The polish-sprint
 * inversion-training build moves to a canonical 'maj:0' / 'maj:1'
 * shape so per-inversion accuracy can be computed by simple filter.
 *
 * This walks every legacy chord-recognition attempt and rewrites
 * itemId to append ':0' (every legacy attempt was root by definition).
 * Idempotent — attempts whose itemId already contains a colon are
 * skipped, so the function no-ops once the migration has run.
 *
 * Wired from ChordRecognition.tsx mount alongside seedChordQualities.
 * If the user never opens chord recognition the migration never runs,
 * which is fine — the read-side normalizeAttemptItemId fallback covers
 * any path that touches legacy data before the migration.
 */
export async function migrateChordRecognitionInversionItemIds(): Promise<void> {
  const legacy = await db.attempts
    .where('moduleId').equals(MODULE_ID)
    .filter((a) => !a.itemId.includes(':'))
    .toArray();
  if (legacy.length === 0) return;

  await db.transaction('rw', db.attempts, async () => {
    for (const a of legacy) {
      if (a.id === undefined) continue; // safety
      await db.attempts.update(a.id, { itemId: `${a.itemId}:0` });
    }
  });
}
