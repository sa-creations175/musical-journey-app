import { db } from '../../lib/db';
import { CARRYOVER_DESCRIPTION_PREFIX } from './carryoverAccept';
import { startOfWeekLocal } from './weeklyPlanData';

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

/**
 * Re-anchor existing carry-over monthly goals to their week start.
 *
 * Carry-over stubs created before the fix carried `startDate: now`
 * (the acceptance moment), which falls mid-week. weeklyDerivation
 * then treated them as mid-week-created goals and prorated the first
 * week's target off `now` — a 202-item HF carry-over derived 349
 * attempts instead of the even ~404/week split. New stubs now anchor
 * at `startOfWeekLocal(now)`; this sweep brings already-created stubs
 * in line so a re-plan derives the correct weekly target.
 *
 * Match criteria: active monthly goals whose description starts with
 * the carry-over prefix AND whose startDate is not already week-
 * aligned. Re-anchoring moves startDate back at most 6 days — before
 * the goal's own first week — so it routes through the reset-clean
 * "remaining ÷ weeks" branch every week. Idempotent: a second run
 * finds startDate already at the week boundary and no-ops.
 *
 * Note: a frozen weekly goal that was already CONFIRMED off the old
 * startDate keeps its stale target until the user re-plans — this
 * sweep fixes the derivation source, not previously-saved slices.
 */
export async function cleanupCarryoverGoalStartDatesIfNeeded(): Promise<void> {
  const candidates = await db.goals
    .where('status')
    .equals('active')
    .toArray();

  const toFix = candidates.filter(
    g =>
      g.scope === 'monthly' &&
      !g.isUmbrella &&
      g.description.startsWith(CARRYOVER_DESCRIPTION_PREFIX) &&
      startOfWeekLocal(g.startDate) !== g.startDate,
  );

  if (toFix.length === 0) return;

  await db.transaction('rw', [db.goals], async () => {
    for (const goal of toFix) {
      await db.goals.update(goal.id, {
        startDate: startOfWeekLocal(goal.startDate),
      });
    }
  });
}
