// @vitest-environment jsdom
/**
 * Unit tests for the weekly-derivation month gate.
 *
 * Two pure layers under test:
 *   · monthMembership — the SINGLE owning-month predicate shared by
 *     PlanMonthBanner and the derivation gate. Pins: real (non-carry-
 *     over) monthly detection, window-overlap membership, and the
 *     "month M has real goals" existence check.
 *   · derivationMonth — resolveDerivationMonth's priority order and the
 *     majority-of-week (4+ days) rule, plus weekDaysInMonth.
 *
 * Scenario anchor: the boundary week of Sun Jun 28 – Sat Jul 4, 2026.
 * Three of its days are in June, four in July, so July holds the
 * majority — the exact case the feature targets.
 *
 * jsdom env: the Goal type transitively pulls db.ts (touches window).
 */
import { describe, it, expect } from 'vitest';
import type { Goal } from '../../../lib/db';
import { monthBoundary, nextMonthBoundary } from '../carryover';
import { CARRYOVER_DESCRIPTION_PREFIX } from '../carryoverAccept';
import {
  goalOverlapsMonth,
  isRealMonthlyGoal,
  monthHasRealMonthlyGoals,
} from '../monthMembership';
import {
  derivationMonthBounds,
  resolveDerivationMonth,
  weekDaysInMonth,
} from '../derivationMonth';
import { daysLeftInMonth } from '../NextMonthGoalBanner';

// Sun Jun 28 2026, 00:00 local — verified a Sunday.
const WEEK_START = new Date(2026, 5, 28, 0, 0, 0, 0).getTime();
// A day inside the boundary week, in June (Mon Jun 29).
const TODAY_JUNE = new Date(2026, 5, 29, 12, 0, 0, 0).getTime();

const JUNE = monthBoundary(TODAY_JUNE);
const JULY = nextMonthBoundary(TODAY_JUNE);

function goal(overrides: Partial<Goal>): Goal {
  return {
    id: 't',
    scope: 'monthly',
    description: '',
    contextTag: null,
    relatedModules: [],
    startDate: JUNE.start,
    targetDate: JUNE.end,
    status: 'active',
    parentGoalId: null,
    isUmbrella: false,
    relatedItems: [],
    contributesNumericallyToParent: false,
    lastEngagedAt: null,
    currentValue: 0,
    targetMetric: null,
    targetValue: null,
    targetUnit: null,
    ...overrides,
  } as Goal;
}

describe('monthMembership', () => {
  it('isRealMonthlyGoal: active non-carryover monthly is real', () => {
    expect(isRealMonthlyGoal(goal({}))).toBe(true);
  });

  it('isRealMonthlyGoal: carry-over stub is NOT a real plan', () => {
    expect(
      isRealMonthlyGoal(goal({ description: `${CARRYOVER_DESCRIPTION_PREFIX} leftover` })),
    ).toBe(false);
  });

  it('isRealMonthlyGoal: weekly / non-active are excluded', () => {
    expect(isRealMonthlyGoal(goal({ scope: 'weekly' }))).toBe(false);
    expect(isRealMonthlyGoal(goal({ status: 'completed' }))).toBe(false);
  });

  it('goalOverlapsMonth: a June goal overlaps June, not July', () => {
    const g = goal({ startDate: JUNE.start, targetDate: JUNE.end });
    expect(goalOverlapsMonth(g, JUNE)).toBe(true);
    expect(goalOverlapsMonth(g, JULY)).toBe(false);
  });

  it('goalOverlapsMonth: a boundary-spanning goal overlaps both', () => {
    const g = goal({
      startDate: new Date(2026, 5, 20).getTime(),
      targetDate: new Date(2026, 6, 10).getTime(),
    });
    expect(goalOverlapsMonth(g, JUNE)).toBe(true);
    expect(goalOverlapsMonth(g, JULY)).toBe(true);
  });

  it('monthHasRealMonthlyGoals: true only when a real goal overlaps M', () => {
    const juneGoal = goal({ startDate: JUNE.start, targetDate: JUNE.end });
    expect(monthHasRealMonthlyGoals([juneGoal], JUNE)).toBe(true);
    // Same goal does not make July "planned".
    expect(monthHasRealMonthlyGoals([juneGoal], JULY)).toBe(false);
  });

  it('monthHasRealMonthlyGoals: a carry-over stub does NOT count', () => {
    const stub = goal({
      description: `${CARRYOVER_DESCRIPTION_PREFIX} x`,
      startDate: JULY.start,
      targetDate: JULY.end,
    });
    expect(monthHasRealMonthlyGoals([stub], JULY)).toBe(false);
  });
});

describe('weekDaysInMonth', () => {
  it('splits the Jun28–Jul4 week as 3 June / 4 July', () => {
    expect(weekDaysInMonth(WEEK_START, JUNE)).toBe(3);
    expect(weekDaysInMonth(WEEK_START, JULY)).toBe(4);
  });

  it('a fully-in-month week counts all 7', () => {
    const midJune = new Date(2026, 5, 7, 0, 0, 0, 0).getTime(); // Sun Jun 7
    expect(weekDaysInMonth(midJune, JUNE)).toBe(7);
    expect(weekDaysInMonth(midJune, JULY)).toBe(0);
  });
});

describe('resolveDerivationMonth', () => {
  it('1. explicit override true → next (even without majority/goals)', () => {
    expect(resolveDerivationMonth(TODAY_JUNE, WEEK_START, true, false)).toBe('next');
  });

  it('2. next goals exist + majority of week in next month → next', () => {
    expect(resolveDerivationMonth(TODAY_JUNE, WEEK_START, undefined, true)).toBe('next');
  });

  it('2. next goals exist but week majority still current → current', () => {
    const midJune = new Date(2026, 5, 7, 0, 0, 0, 0).getTime(); // 7 days in June
    expect(resolveDerivationMonth(TODAY_JUNE, midJune, undefined, true)).toBe('current');
  });

  it('3. majority in next month but NO next goals → current', () => {
    expect(resolveDerivationMonth(TODAY_JUNE, WEEK_START, undefined, false)).toBe('current');
  });

  it('explicit false override falls through to the majority rule', () => {
    expect(resolveDerivationMonth(TODAY_JUNE, WEEK_START, false, true)).toBe('next');
    expect(resolveDerivationMonth(TODAY_JUNE, WEEK_START, false, false)).toBe('current');
  });
});

describe('derivationMonthBounds', () => {
  it('maps current → this month, next → next month', () => {
    expect(derivationMonthBounds(TODAY_JUNE, 'current')).toEqual(JUNE);
    expect(derivationMonthBounds(TODAY_JUNE, 'next')).toEqual(JULY);
  });
});

describe('daysLeftInMonth (next-month banner trigger)', () => {
  it('counts today through the last day of the month', () => {
    expect(daysLeftInMonth(new Date(2026, 5, 30, 12).getTime())).toBe(1);
    expect(daysLeftInMonth(new Date(2026, 5, 24, 12).getTime())).toBe(7);
    expect(daysLeftInMonth(new Date(2026, 5, 23, 12).getTime())).toBe(8);
  });

  it('the last-7-days window is Jun 24 onward (<= 7)', () => {
    expect(daysLeftInMonth(new Date(2026, 5, 24, 12).getTime()) <= 7).toBe(true);
    expect(daysLeftInMonth(new Date(2026, 5, 23, 12).getTime()) <= 7).toBe(false);
  });
});
