import { db } from '../../lib/db';

/**
 * One-time cleanup: repertoire goals used to be auto-tagged with
 * `contextTag: 'keys'` because the original `contextForModule` rule
 * assumed all repertoire practice required a physical keyboard. The
 * polish-sprint context-filter rules treat repertoire as
 * study-anywhere — chord-progression study works on phone or laptop
 * without keys — so the default was relaxed to 'mixed'.
 *
 * For users who created repertoire goals before that change, the
 * legacy 'keys' tag would cause the new goal-context-tag intersection
 * filter to drop those goals from candidate proposals under non-keys
 * context. This migration relaxes any such rows in place.
 *
 * Match criteria: `contextTag === 'keys'` AND `relatedModules`
 * includes 'repertoire'. The check on relatedModules ensures we don't
 * accidentally relax tags on goals that the user explicitly tagged
 * 'keys' for non-repertoire reasons.
 *
 * Idempotent — no-ops once the data is migrated.
 */
export async function cleanupRepertoireGoalContextIfNeeded(): Promise<void> {
  const candidates = await db.goals
    .where('status')
    .anyOf('active', 'paused')
    .toArray();

  const toMigrate = candidates.filter(
    g =>
      g.contextTag === 'keys' &&
      Array.isArray(g.relatedModules) &&
      g.relatedModules.includes('repertoire'),
  );

  if (toMigrate.length === 0) return;

  await db.transaction('rw', [db.goals], async () => {
    for (const goal of toMigrate) {
      await db.goals.update(goal.id, { contextTag: 'mixed' });
    }
  });
}
