/**
 * Per-goal pace classification for the Goals by-module view.
 *
 * Different goal flavors get different pace surfaces:
 *
 *   · Coverage goals (any timeframe) — colored pill via existing
 *     `paceForCoverageGoal` logic (items acquired vs pro-rated
 *     target across the goal's window).
 *
 *   · Attempts / sessions / lessons goals (any timeframe) — colored
 *     pill via the same `paceForCoverageGoal` math, with the
 *     numerator pulled from getWeeklyAttempts (current-week actuals
 *     for weekly goals; goal.currentValue for monthly+).
 *
 *   · Consistency / days goals — NO colored pill. The user said
 *     "days practiced is secondary to coverage progress" — caller
 *     renders a muted "X of Y days" text count instead, using
 *     `getDaysWithActivity` for X.
 *
 *   · Mastery goals — same as coverage (items at solid/internalized
 *     vs pro-rated target).
 *
 * `paceForCoverageGoal` itself uses a 5-band classification
 * (well-ahead / ahead / at-risk / behind / significantly-behind).
 * The by-module pill folds those into the 3-color band the spec
 * calls for:
 *
 *   green  — well-ahead or ahead (ratio >= 1.0)
 *   amber  — at-risk            (0.85 ≤ ratio < 1.0)
 *   red    — behind or significantly-behind (ratio < 0.85)
 *
 * The 0.85 boundary intentionally matches the AT_RISK_RATIO that
 * powers the existing FeasibilityPill — same threshold, different
 * visual language. The user's spec mentions a 0.8 boundary; we
 * use 0.85 (the existing pace library's at-risk threshold) so the
 * pace pill, the algorithm's behind-pace boost, and the goal-row
 * feasibility pill stay in lockstep. Tunable if a future
 * calibration pass wants to split them.
 */
import type { Goal } from '../../lib/db';
import {
  bandForRatio,
  paceForCoverageGoal,
  type PaceBand,
} from '../../lib/sessionAlgorithm/pace';

/** 3-color pace band the by-module view renders as a pill. */
export type GoalPaceColor = 'green' | 'amber' | 'red';

/** Whether a goal gets a colored pace pill at all. Consistency /
 *  days goals intentionally don't — they render a muted "X of Y
 *  days" text count instead. */
export function goalHasPacePill(goal: Goal): boolean {
  const metric = goal.targetMetric;
  if (!metric) return false;
  // Consistency days metrics (new): `*_days_per_cadence` —
  // including practice-consistency's umbrella metric.
  if (metric.includes('_days_per_')) return false;
  if (metric.startsWith('practice_')) return false;
  // Legacy minutes / hours metrics also don't fit the pro-rated
  // "items acquired" framing cleanly — and the user's "Y of N
  // days" muted text isn't right for them either. Hide the pill
  // and let the row show only the time estimate.
  if (metric.includes('_minutes_per_')) return false;
  if (metric.includes('_hours_per_')) return false;
  // Legacy sessions-per-cadence: defunct as of the days redesign
  // but may still exist on older goals. Skip the pill — those
  // goals get re-classified the first time the user edits them.
  if (metric.includes('_sessions_per_')) return false;
  return true;
}

/** Map the 5-band pace classifier to the 3-color pill the
 *  by-module view renders. */
export function paceColorForBand(band: PaceBand): GoalPaceColor {
  switch (band) {
    case 'well-ahead':
    case 'ahead':
      return 'green';
    case 'at-risk':
      return 'amber';
    case 'behind':
    case 'significantly-behind':
      return 'red';
  }
}

/** Classification result for a single goal's pace pill. */
export type GoalPaceResult =
  | { kind: 'pill'; color: GoalPaceColor; band: PaceBand; ratio: number }
  | { kind: 'no-pill' };

/**
 * Compute the pace classification for `goal` given the actual
 * numerator (coverage count, attempts, or lessons).
 *
 * Returns `{ kind: 'no-pill' }` when:
 *   · The goal type doesn't get a pill (consistency / days /
 *     hours / minutes / legacy sessions).
 *   · The goal has no positive targetValue (no denominator to pace
 *     against).
 *
 * For weekly goals, the caller passes the current-week actuals
 * for the goal's module (from `getWeeklyAttempts`). For
 * coverage / mastery goals over longer windows, the caller passes
 * `goal.currentValue`. Either way, the same pro-rated math
 * applies — the period is the goal's own window.
 */
export function classifyGoalPace(args: {
  goal: Goal;
  actual: number;
  now: number;
}): GoalPaceResult {
  const { goal, actual, now } = args;
  if (!goalHasPacePill(goal)) return { kind: 'no-pill' };
  if (goal.targetValue == null || goal.targetValue <= 0) {
    return { kind: 'no-pill' };
  }
  const result = paceForCoverageGoal({
    startDate: goal.startDate,
    targetDate: goal.targetDate,
    totalItems: goal.targetValue,
    actualCoverage: actual,
    now,
  });
  const band = bandForRatio(result.ratio);
  return {
    kind: 'pill',
    color: paceColorForBand(band),
    band,
    ratio: result.ratio,
  };
}

/** True when the goal's metric counts days of practice rather
 *  than items / attempts / lessons. Caller renders a muted
 *  "X of Y days" text count for these. */
export function isDaysConsistencyGoal(goal: Goal): boolean {
  const metric = goal.targetMetric;
  if (!metric) return false;
  return metric.includes('_days_per_') || metric.startsWith('practice_');
}
