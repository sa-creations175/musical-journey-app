// @vitest-environment jsdom
/**
 * Orphaned weekly plan slice sweep — cleanupOrphanedWeeklyGoalsIfNeeded.
 *
 * Reproduces the June 2026 duplicate-weekly bug data shape: weekly
 * goals whose parentGoalId points at a monthly goal that was deleted
 * (month-start dismiss / bulk delete before the monthly→weekly
 * cascade existed). The sweep removes them; everything with a live
 * parent or no parent survives.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, type Goal } from '../../../lib/db';
import { cleanupOrphanedWeeklyGoalsIfNeeded } from '../cleanup';

const MAY_END = new Date(2026, 4, 31, 23, 59, 59).getTime();

function mkGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'g',
    scope: 'weekly',
    description: '',
    targetMetric: null,
    targetValue: 62,
    targetUnit: 'attempts',
    currentValue: 0,
    contextTag: null,
    relatedModules: ['shapes-and-patterns'],
    relatedItems: [],
    startDate: new Date(2026, 4, 31).getTime(),
    targetDate: new Date(2026, 5, 6).getTime(),
    status: 'active',
    parentGoalId: null,
    contributesNumericallyToParent: true,
    isUmbrella: false,
    lastEngagedAt: null,
    ...overrides,
  };
}

describe('cleanupOrphanedWeeklyGoalsIfNeeded', () => {
  beforeEach(async () => {
    await db.goals.clear();
  });

  it('deletes weekly goals whose parent no longer exists', async () => {
    await db.goals.bulkAdd([
      // Orphans — parent 'deleted-may-monthly' is not in the table.
      mkGoal({ id: 'orphan-shapes', parentGoalId: 'deleted-may-monthly' }),
      mkGoal({ id: 'orphan-et', parentGoalId: 'deleted-may-monthly' }),
      // Live plan — parent exists.
      mkGoal({
        id: 'june-monthly',
        scope: 'monthly',
        targetMetric: 'shapes_coverage_at_acquired',
        targetDate: new Date(2026, 5, 30).getTime(),
      }),
      mkGoal({ id: 'live-slice', parentGoalId: 'june-monthly' }),
      // Standalone weekly goal — no parent, untouched.
      mkGoal({ id: 'standalone' }),
    ]);

    await cleanupOrphanedWeeklyGoalsIfNeeded();

    const remaining = (await db.goals.toArray()).map(g => g.id).sort();
    expect(remaining).toEqual(['june-monthly', 'live-slice', 'standalone']);
  });

  it('only sweeps weekly scope — dangling pointers on other scopes are left alone', async () => {
    await db.goals.bulkAdd([
      // Monthly goal with a dangling parent pointer (e.g. its yearly
      // anchor was removed) — relationship link, not derived data;
      // must survive.
      mkGoal({
        id: 'monthly-dangling',
        scope: 'monthly',
        targetMetric: 'shapes_coverage_at_acquired',
        parentGoalId: 'gone-anchor',
        targetDate: MAY_END,
      }),
    ]);

    await cleanupOrphanedWeeklyGoalsIfNeeded();

    expect(await db.goals.count()).toBe(1);
  });

  it('is idempotent and no-ops on clean data', async () => {
    await db.goals.bulkAdd([
      mkGoal({
        id: 'monthly',
        scope: 'monthly',
        targetMetric: 'shapes_coverage_at_acquired',
        targetDate: MAY_END,
      }),
      mkGoal({ id: 'slice', parentGoalId: 'monthly' }),
    ]);

    await cleanupOrphanedWeeklyGoalsIfNeeded();
    await cleanupOrphanedWeeklyGoalsIfNeeded();

    expect(await db.goals.count()).toBe(2);
  });
});
