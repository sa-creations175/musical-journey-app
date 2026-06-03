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

/**
 * Orphaned weekly plan slices — weekly goals whose parentGoalId
 * points at a goal that no longer exists.
 *
 * How they happen: this week's plan is confirmed (weekly goals
 * created as children of the then-current monthly goals), then the
 * monthly parents get deleted — month-start "dismiss unrecoverable"
 * sweep, select-mode bulk delete, or a manual row delete. Before
 * June 2026 none of those paths cascaded into weekly children, so
 * the slices survived with dangling pointers.
 *
 * Consequences of a dangling slice: it stops counting as the
 * "confirmed plan" (loadConfirmedPlanForWeek requires an ACTIVE
 * monthly parent), so the planning UI reappears; re-planning then
 * bulkAdds a second set of weekly goals, and the Weekly layer shows
 * every module twice — once in the new plan's summary, once as an
 * orphan row.
 *
 * Both delete paths now cascade monthly → weekly slices
 * (deleteGoalsWithCascade), so new orphans shouldn't appear. This
 * sweep removes orphans that already exist. Deliberately scoped to
 * weekly goals only: that's the documented derived-data relationship;
 * other scopes' parent links are relationships, not derivations.
 *
 * Plain Dexie deletes — the sync layer's 'deleting' hook mirrors
 * each removal to Supabase. Idempotent: no-ops when no orphans exist.
 */
export async function cleanupOrphanedWeeklyGoalsIfNeeded(): Promise<void> {
  const all = await db.goals.toArray();
  const existingIds = new Set(all.map(g => g.id));
  const orphans = all.filter(
    g =>
      g.scope === 'weekly' &&
      g.parentGoalId !== null &&
      !existingIds.has(g.parentGoalId),
  );
  if (orphans.length === 0) return;
  await db.goals.bulkDelete(orphans.map(o => o.id));
}
