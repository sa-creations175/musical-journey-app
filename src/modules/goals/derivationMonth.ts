import { monthBoundary, nextMonthBoundary, type MonthBoundary } from './carryover';

/**
 * Which month's monthly goals feed a week's plan derivation.
 *
 *   'current' — the calendar month of `today` (the existing behaviour).
 *   'next'    — the month immediately after `today`'s month.
 *
 * Only diverges from 'current' in the boundary week at month-end, and
 * only once next-month goals have been set. See resolveDerivationMonth.
 */
export type DerivationMonth = 'current' | 'next';

/**
 * How many of the 7 days starting at `weekStart` (Sunday) fall within
 * month M. Each day is sampled at local noon so a DST transition can't
 * push a day into the wrong month.
 */
export function weekDaysInMonth(weekStart: number, bounds: MonthBoundary): number {
  let count = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + i);
    const t = d.getTime();
    if (t >= bounds.start && t <= bounds.end) count++;
  }
  return count;
}

/**
 * Pure decision: which month should weekly-plan derivation draw its
 * monthly goals from?
 *
 * Priority:
 *   1. Explicit per-week override (useNextMonthGoals === true) → 'next'.
 *   2. Else, if next-month goals exist AND the majority (4+) of this
 *      week's days fall in next month → 'next'.
 *   3. Otherwise → 'current' (existing behaviour).
 *
 * `nextMonthGoalsExist` MUST be computed with the shared
 * monthHasRealMonthlyGoals predicate against nextMonthBoundary(today),
 * so this gate and the "Plan your month" banner agree on what counts
 * as a real plan for a month.
 */
export function resolveDerivationMonth(
  today: number,
  weekStart: number,
  useNextMonthGoalsOverride: boolean | undefined,
  nextMonthGoalsExist: boolean,
): DerivationMonth {
  if (useNextMonthGoalsOverride === true) return 'next';
  if (nextMonthGoalsExist && weekDaysInMonth(weekStart, nextMonthBoundary(today)) >= 4) {
    return 'next';
  }
  return 'current';
}

/** Month boundary to use as the derivation source for `resolved`. */
export function derivationMonthBounds(
  today: number,
  resolved: DerivationMonth,
): MonthBoundary {
  return resolved === 'next' ? nextMonthBoundary(today) : monthBoundary(today);
}
