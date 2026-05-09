import { db } from '../../lib/db';

/**
 * One-shot manual cleanup utility — delete all short-horizon goals
 * (scope === 'monthly' or 'weekly'), preserving every yearly /
 * quarterly / 2–3 year / lifetime goal regardless of module.
 *
 * NOT wired to app boot — intentionally manual so the operator
 * decides when (and whether) to run it. Invoke from the browser
 * console:
 *
 *     await __deleteShortHorizonGoals()
 *
 * The helper logs the goals it's about to delete BEFORE deleting
 * them, so the console reads as a confirmation trail. Returns a
 * summary `{ deleted, byScope }` for the caller / log.
 *
 * Notes:
 *   · Idempotent — running on a clean db is a no-op.
 *   · Status-agnostic by request: deletes monthly/weekly rows in
 *     any status (active, paused, completed, abandoned). The user
 *     phrased it as "all active monthly", but a paused or
 *     abandoned monthly is still a short-horizon goal that
 *     shouldn't survive a "wipe short-horizon goals" pass.
 *     Yearly / quarterly / 2–3 year / lifetime in any status is
 *     left alone.
 *   · Children of monthly umbrellas inherit `scope: 'monthly'` from
 *     the parent's baseFields when persisted, so they're caught by
 *     the same filter and deleted alongside their umbrella.
 *   · Sync hooks fire on bulkDelete the same as on individual
 *     deletes — the deletion propagates to Supabase via the normal
 *     write pipeline.
 */
export async function deleteShortHorizonGoals(): Promise<{
  deleted: number;
  byScope: { monthly: number; weekly: number };
}> {
  const all = await db.goals.toArray();
  const targets = all.filter(g => g.scope === 'monthly' || g.scope === 'weekly');

  const byScope = { monthly: 0, weekly: 0 };
  for (const g of targets) {
    if (g.scope === 'monthly') byScope.monthly++;
    if (g.scope === 'weekly') byScope.weekly++;
  }

  // Pre-delete log so the console captures what was removed.
  // eslint-disable-next-line no-console
  console.log(
    `[deleteShortHorizonGoals] About to delete ${targets.length} goal${
      targets.length === 1 ? '' : 's'
    }`,
    byScope,
  );
  if (targets.length > 0) {
    // eslint-disable-next-line no-console
    console.log(
      '[deleteShortHorizonGoals] Targets:',
      targets.map(g => ({
        id: g.id,
        scope: g.scope,
        description: g.description,
        isUmbrella: g.isUmbrella,
        parentGoalId: g.parentGoalId,
      })),
    );
  }

  if (targets.length === 0) return { deleted: 0, byScope };

  await db.transaction('rw', db.goals, async () => {
    await db.goals.bulkDelete(targets.map(g => g.id));
  });

  // eslint-disable-next-line no-console
  console.log(`[deleteShortHorizonGoals] Done. Deleted ${targets.length}.`);
  return { deleted: targets.length, byScope };
}

// Expose on window so the function is reachable from the browser
// console without needing a module import path. Side-effect import
// from Goals.tsx attaches this once when the goals view first loads.
if (typeof window !== 'undefined') {
  (
    window as unknown as { __deleteShortHorizonGoals?: typeof deleteShortHorizonGoals }
  ).__deleteShortHorizonGoals = deleteShortHorizonGoals;
}
