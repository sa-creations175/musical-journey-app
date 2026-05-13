// @vitest-environment jsdom
/**
 * Tests for loadConfirmedPlanForWeek — the parent-linkage +
 * date-overlap query that powers the "This week's challenge"
 * confirmed-plan detection in by-timeframe Goals.
 *
 * The query needs to recognize confirmed-plan rows regardless of
 * which code path saved them:
 *
 *   · Path A — WeeklyPlan.handleConfirm: startDate = exact Sunday
 *     midnight epoch (startOfWeekLocal). Strict equality matches.
 *
 *   · Path B — GoalCreationFlow weekly create (parented to a
 *     monthly goal): startDate = Date.now() at save, which is
 *     mid-week / mid-second. Strict equality fails; date-overlap
 *     catches it.
 *
 * Negative cases the query rejects:
 *   · standalone weekly (no parent) — independent commitment, not
 *     the derived-from-monthly plan
 *   · weekly parented to a yearly anchor (not monthly)
 *   · weekly parented to a monthly goal that's archived / abandoned
 *   · weekly whose window doesn't overlap this week
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, type Goal } from '../../../lib/db';
import {
  endOfWeekLocal,
  loadConfirmedPlanForWeek,
  startOfWeekLocal,
} from '../weeklyPlanData';

const SUNDAY_NOON = new Date(2026, 4, 10, 12, 0, 0, 0).getTime(); // 2026-05-10 Sunday
const WEEK_START = startOfWeekLocal(SUNDAY_NOON);
const WEEK_END = endOfWeekLocal(WEEK_START);

function mkGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: `g-${Math.random().toString(36).slice(2, 10)}`,
    scope: 'weekly',
    description: '',
    targetMetric: null,
    targetValue: 1,
    targetUnit: 'attempts',
    currentValue: 0,
    contextTag: null,
    relatedModules: [],
    relatedItems: [],
    startDate: WEEK_START,
    targetDate: WEEK_END,
    status: 'active',
    parentGoalId: null,
    contributesNumericallyToParent: false,
    isUmbrella: false,
    lastEngagedAt: null,
    ...overrides,
  };
}

beforeEach(async () => {
  await db.goals.clear();
});

describe('loadConfirmedPlanForWeek', () => {
  it('returns empty when no goals exist', async () => {
    expect(await loadConfirmedPlanForWeek(WEEK_START, WEEK_END)).toEqual([]);
  });

  it('Path A — WeeklyPlan.handleConfirm: startDate = Sunday midnight, monthly parent → included', async () => {
    const monthly = mkGoal({
      id: 'm1',
      scope: 'monthly',
      startDate: WEEK_START - 7 * 86_400_000,
      targetDate: WEEK_END + 21 * 86_400_000,
    });
    const weekly = mkGoal({
      id: 'w1',
      scope: 'weekly',
      startDate: WEEK_START, // exact Sunday midnight
      targetDate: WEEK_END,
      parentGoalId: 'm1',
    });
    await db.goals.bulkAdd([monthly, weekly]);

    const result = await loadConfirmedPlanForWeek(WEEK_START, WEEK_END);
    expect(result.map(g => g.id)).toEqual(['w1']);
  });

  it('Path B — GoalCreationFlow: startDate = mid-week timestamp, monthly parent → included', async () => {
    const monthly = mkGoal({
      id: 'm2',
      scope: 'monthly',
      startDate: WEEK_START - 7 * 86_400_000,
      targetDate: WEEK_END + 21 * 86_400_000,
    });
    // Wednesday 14:32:08.435 PM — a typical mid-week save.
    const wednesday = new Date(2026, 4, 13, 14, 32, 8, 435).getTime();
    const weekly = mkGoal({
      id: 'w2',
      scope: 'weekly',
      startDate: wednesday,
      targetDate: WEEK_END,
      parentGoalId: 'm2',
    });
    await db.goals.bulkAdd([monthly, weekly]);

    const result = await loadConfirmedPlanForWeek(WEEK_START, WEEK_END);
    expect(result.map(g => g.id)).toEqual(['w2']);
  });

  it('standalone weekly (parentGoalId null) → excluded', async () => {
    await db.goals.add(
      mkGoal({ id: 'w-solo', parentGoalId: null }),
    );
    expect(await loadConfirmedPlanForWeek(WEEK_START, WEEK_END)).toEqual([]);
  });

  it('weekly parented to a yearly anchor (not monthly) → excluded', async () => {
    const yearly = mkGoal({
      id: 'y1',
      scope: 'yearly',
      isUmbrella: true,
    });
    const weekly = mkGoal({ id: 'w-y', parentGoalId: 'y1' });
    await db.goals.bulkAdd([yearly, weekly]);

    expect(await loadConfirmedPlanForWeek(WEEK_START, WEEK_END)).toEqual([]);
  });

  it('weekly whose monthly parent is abandoned → excluded', async () => {
    const monthly = mkGoal({
      id: 'm-abandoned',
      scope: 'monthly',
      status: 'abandoned',
    });
    const weekly = mkGoal({
      id: 'w-orphan',
      parentGoalId: 'm-abandoned',
    });
    await db.goals.bulkAdd([monthly, weekly]);

    expect(await loadConfirmedPlanForWeek(WEEK_START, WEEK_END)).toEqual([]);
  });

  it('weekly from a prior week (no overlap with this week) → excluded', async () => {
    const monthly = mkGoal({ id: 'm-old', scope: 'monthly' });
    const lastWeekStart = WEEK_START - 7 * 86_400_000;
    const lastWeekEnd = WEEK_START - 1;
    const weekly = mkGoal({
      id: 'w-last',
      startDate: lastWeekStart,
      targetDate: lastWeekEnd,
      parentGoalId: 'm-old',
    });
    await db.goals.bulkAdd([monthly, weekly]);

    expect(await loadConfirmedPlanForWeek(WEEK_START, WEEK_END)).toEqual([]);
  });

  it('weekly with status="abandoned" → excluded even if parent is active monthly', async () => {
    const monthly = mkGoal({ id: 'm-live', scope: 'monthly' });
    const weekly = mkGoal({
      id: 'w-abandoned',
      parentGoalId: 'm-live',
      status: 'abandoned',
    });
    await db.goals.bulkAdd([monthly, weekly]);

    expect(await loadConfirmedPlanForWeek(WEEK_START, WEEK_END)).toEqual([]);
  });

  it('returns multiple weeklies when more than one monthly child overlaps this week', async () => {
    const monthlyA = mkGoal({ id: 'm-a', scope: 'monthly' });
    const monthlyB = mkGoal({ id: 'm-b', scope: 'monthly' });
    const weeklyA = mkGoal({ id: 'w-a', parentGoalId: 'm-a' });
    // A Path-B-style mid-week weekly parented to a different monthly.
    const friday = new Date(2026, 4, 15, 9, 11, 47, 0).getTime();
    const weeklyB = mkGoal({
      id: 'w-b',
      startDate: friday,
      targetDate: WEEK_END,
      parentGoalId: 'm-b',
    });
    await db.goals.bulkAdd([monthlyA, monthlyB, weeklyA, weeklyB]);

    const result = await loadConfirmedPlanForWeek(WEEK_START, WEEK_END);
    expect(result.map(g => g.id).sort()).toEqual(['w-a', 'w-b']);
  });
});
