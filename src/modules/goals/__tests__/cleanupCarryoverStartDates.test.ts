// @vitest-environment jsdom
/**
 * cleanupCarryoverGoalStartDatesIfNeeded — re-anchor pre-fix carry-over
 * monthly goals to their week start.
 *
 * Carry-over stubs created before the fix carried startDate=now (mid-
 * week), which made weeklyDerivation prorate their first week's target.
 * This sweep moves startDate to the Sunday of its week so derivation
 * uses the even-split reset-clean branch. Only carry-over-prefixed
 * active monthlies are touched; everything else is left alone.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, type Goal } from '../../../lib/db';
import { cleanupCarryoverGoalStartDatesIfNeeded } from '../cleanup';
import { startOfWeekLocal } from '../weeklyPlanData';
import { CARRYOVER_DESCRIPTION_PREFIX } from '../carryoverAccept';

// Mon June 1 2026 09:00 — mid-week relative to its Sunday (May 31).
const MIDWEEK = new Date(2026, 5, 1, 9, 0, 0).getTime();
const JUNE_END = new Date(2026, 5, 30, 23, 59, 59, 999).getTime();

function mkGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'g',
    scope: 'monthly',
    description: `${CARRYOVER_DESCRIPTION_PREFIX} — 202 items`,
    targetMetric: 'harmonic_fluency_coverage_at_acquired',
    targetValue: 202,
    targetUnit: 'cards',
    currentValue: 0,
    contextTag: null,
    relatedModules: ['harmonic-fluency'],
    relatedItems: [],
    startDate: MIDWEEK,
    targetDate: JUNE_END,
    status: 'active',
    parentGoalId: null,
    contributesNumericallyToParent: false,
    isUmbrella: false,
    lastEngagedAt: null,
    ...overrides,
  };
}

describe('cleanupCarryoverGoalStartDatesIfNeeded', () => {
  beforeEach(async () => {
    await db.goals.clear();
  });

  it('re-anchors a mid-week carry-over goal to its week start', async () => {
    await db.goals.add(mkGoal({ id: 'carry' }));
    await cleanupCarryoverGoalStartDatesIfNeeded();
    const after = await db.goals.get('carry');
    expect(after!.startDate).toBe(startOfWeekLocal(MIDWEEK));
    expect(after!.startDate).toBeLessThan(MIDWEEK);
  });

  it('leaves non-carry-over goals untouched', async () => {
    await db.goals.add(
      mkGoal({ id: 'normal', description: 'Harmonic Fluency — 20 cards' }),
    );
    await cleanupCarryoverGoalStartDatesIfNeeded();
    const after = await db.goals.get('normal');
    expect(after!.startDate).toBe(MIDWEEK);
  });

  it('leaves already week-aligned carry-over goals untouched (idempotent)', async () => {
    const aligned = startOfWeekLocal(MIDWEEK);
    await db.goals.add(mkGoal({ id: 'carry', startDate: aligned }));
    await cleanupCarryoverGoalStartDatesIfNeeded();
    await cleanupCarryoverGoalStartDatesIfNeeded();
    const after = await db.goals.get('carry');
    expect(after!.startDate).toBe(aligned);
  });

  it('ignores non-monthly and inactive carry-over goals', async () => {
    await db.goals.bulkAdd([
      mkGoal({ id: 'weekly', scope: 'weekly' }),
      mkGoal({ id: 'completed', status: 'completed' }),
    ]);
    await cleanupCarryoverGoalStartDatesIfNeeded();
    expect((await db.goals.get('weekly'))!.startDate).toBe(MIDWEEK);
    expect((await db.goals.get('completed'))!.startDate).toBe(MIDWEEK);
  });
});
