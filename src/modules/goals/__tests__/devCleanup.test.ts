// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, type Goal, type GoalScope, type GoalStatus } from '../../../lib/db';
import { deleteShortHorizonGoals } from '../devCleanup';

const NOW = 1_700_000_000_000;
const ONE_DAY = 24 * 60 * 60 * 1000;

function goal(partial: Partial<Goal> & { scope: GoalScope }): Goal {
  return {
    id: `g-${Math.random().toString(36).slice(2, 8)}`,
    description: 'test',
    targetMetric: null,
    targetValue: null,
    targetUnit: null,
    currentValue: 0,
    contextTag: 'mixed',
    relatedModules: ['harmonic-fluency'],
    relatedItems: [],
    startDate: NOW,
    targetDate: NOW + 30 * ONE_DAY,
    status: 'active',
    parentGoalId: null,
    contributesNumericallyToParent: false,
    isUmbrella: false,
    lastEngagedAt: null,
    ...partial,
  };
}

describe('deleteShortHorizonGoals', () => {
  beforeEach(async () => {
    await db.goals.clear();
  });

  it('deletes monthly and weekly goals', async () => {
    await db.goals.bulkAdd([
      goal({ id: 'm1', scope: 'monthly' }),
      goal({ id: 'w1', scope: 'weekly' }),
    ]);
    const result = await deleteShortHorizonGoals();
    expect(result).toEqual({ deleted: 2, byScope: { monthly: 1, weekly: 1 } });
    expect(await db.goals.count()).toBe(0);
  });

  it('preserves yearly, quarterly, 2-3 year, and lifetime goals', async () => {
    await db.goals.bulkAdd([
      goal({ id: 'y',  scope: 'yearly' }),
      goal({ id: 'q',  scope: 'quarterly' }),
      goal({ id: '23', scope: 'two_to_three_year' }),
      goal({ id: 'lt', scope: 'lifetime' }),
      goal({ id: 'm',  scope: 'monthly' }),
      goal({ id: 'w',  scope: 'weekly' }),
    ]);
    const result = await deleteShortHorizonGoals();
    expect(result.deleted).toBe(2);
    const remaining = await db.goals.toArray();
    expect(remaining.map(g => g.id).sort()).toEqual(['23', 'lt', 'q', 'y']);
  });

  it('deletes monthly umbrellas AND their child rows (which inherit scope=monthly)', async () => {
    await db.goals.bulkAdd([
      goal({
        id: 'umbrella',
        scope: 'monthly',
        isUmbrella: true,
        parentGoalId: 'yearly-anchor',
      }),
      goal({
        id: 'child-coverage',
        scope: 'monthly',
        isUmbrella: false,
        parentGoalId: 'umbrella',
      }),
      goal({
        id: 'child-accuracy',
        scope: 'monthly',
        isUmbrella: false,
        parentGoalId: 'umbrella',
      }),
      goal({
        id: 'yearly-anchor',
        scope: 'yearly',
        isUmbrella: true,
        parentGoalId: null,
      }),
    ]);
    const result = await deleteShortHorizonGoals();
    expect(result.deleted).toBe(3);
    const remaining = await db.goals.toArray();
    expect(remaining.map(g => g.id)).toEqual(['yearly-anchor']);
  });

  it('is idempotent — second run on a clean db is a no-op', async () => {
    await db.goals.add(goal({ id: 'm1', scope: 'monthly' }));
    const first = await deleteShortHorizonGoals();
    const second = await deleteShortHorizonGoals();
    expect(first.deleted).toBe(1);
    expect(second).toEqual({ deleted: 0, byScope: { monthly: 0, weekly: 0 } });
  });

  it('deletes monthly/weekly regardless of status (paused, completed, abandoned still go)', async () => {
    const statuses: GoalStatus[] = ['active', 'paused', 'completed', 'abandoned'];
    await db.goals.bulkAdd(
      statuses.map((s, i) => goal({ id: `m-${i}`, scope: 'monthly', status: s })),
    );
    const result = await deleteShortHorizonGoals();
    expect(result).toEqual({ deleted: 4, byScope: { monthly: 4, weekly: 0 } });
    expect(await db.goals.count()).toBe(0);
  });
});
