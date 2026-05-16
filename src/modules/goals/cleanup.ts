import { db } from '../../lib/db';

/**
 * Two cleanups in one pass:
 *
 *   (1) Repertoire goals used to be auto-tagged with
 *       `contextTag: 'keys'` because the original `contextForModule`
 *       rule assumed all repertoire practice required a physical
 *       keyboard. The polish-sprint context-filter rules treat
 *       repertoire as study-anywhere — chord-progression study works
 *       on phone or laptop without keys — so the default was relaxed
 *       to `null` (no context restriction).
 *
 *   (2) The `'mixed'` context value was removed entirely (it was a
 *       zombie type-union value that behaved identically to `'keys'`
 *       and was never shown in the picker). Any existing goal rows
 *       carrying `contextTag: 'mixed'` are migrated to `null` —
 *       semantically equivalent to the original intent of
 *       "applies in any context."
 *
 * For users who created repertoire goals before either change, the
 * legacy tag would cause the goal-context-tag intersection filter
 * to either drop the goal under non-keys contexts (case 1) or
 * carry an invalid type-narrowed value (case 2). This migration
 * relaxes both in place.
 *
 * Match criteria:
 *   (1) `contextTag === 'keys'` AND `relatedModules` includes
 *       'repertoire' — narrow check so we don't relax tags on
 *       non-repertoire goals the user explicitly tagged 'keys'.
 *   (2) `contextTag === 'mixed'` (any module) — the value is
 *       no longer a valid PracticeSessionContext.
 *
 * Idempotent — no-ops once the data is migrated.
 */
export async function cleanupRepertoireGoalContextIfNeeded(): Promise<void> {
  const candidates = await db.goals
    .where('status')
    .anyOf('active', 'paused')
    .toArray();

  const toMigrate = candidates.filter(g => {
    // Case 2: any legacy 'mixed' tag — cast through unknown because
    // 'mixed' is no longer a valid PracticeSessionContext at the
    // type level.
    if (g.contextTag as unknown === 'mixed') return true;
    // Case 1: keys-tagged repertoire goals.
    return (
      g.contextTag === 'keys' &&
      Array.isArray(g.relatedModules) &&
      g.relatedModules.includes('repertoire')
    );
  });

  if (toMigrate.length === 0) return;

  await db.transaction('rw', [db.goals], async () => {
    for (const goal of toMigrate) {
      await db.goals.update(goal.id, { contextTag: null });
    }
  });
}
