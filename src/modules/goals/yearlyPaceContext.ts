/**
 * Phase B Step 9c — yearly anchor context for the goal-creation /
 * monthly-review surfaces.
 *
 * Wraps the four numbers the suggestions panel renders alongside the
 * progression suggestion:
 *
 *   yearlyPaceMonthly   = (yearlyTotal - coveredSoFar) / monthsRemaining
 *   timePerDayMinutes   = (monthlyTarget × minPerAttempt) / consistencyDays
 *   consequencePct      = (projectedYearEnd / yearlyTotal) × 100
 *   affirmative         = currentTargetVsAnchor >= yearlyPaceMonthly
 *
 * The math is intentionally cheap and dependency-light — the UI re-
 * renders this on every keystroke when the user edits a target value,
 * so we don't want a Dexie hit per render. The async loader feeds in
 * the four DB-derived inputs (yearly anchor, current coverage,
 * consistency target, current monthly goal scope) once.
 *
 * Honest framing — every number describes "where things stand," not
 * a guarantee. The doc's phrasing: "the suggestion delivers a
 * concrete progression step TOWARD yearly pace, not a claim to hit
 * it. Honest gap shown alongside the suggestion."
 */

import type { GoalFlowModuleId } from './goalVocabulary';
import type { Goal } from '../../lib/db';
import { minutesPerAttemptForModule } from '../../lib/sessionAlgorithm/moduleWeeklyNeed';

// =====================================================================
// Types
// =====================================================================

/**
 * Pure inputs the math consumes. Async loaders + tests construct this
 * shape and pass it in; nothing here touches Dexie or the clock.
 */
export interface YearlyPaceInputs {
  moduleId: GoalFlowModuleId;
  /** Active yearly anchor for `moduleId`. Null when none — the
   *  `computeYearlyPaceContext` helper returns a `kind: 'hidden'`
   *  result and the UI hides the suggestion panel entirely. */
  yearlyAnchor: Goal | null;
  /** Items already covered (acquired+) across the yearly anchor's
   *  scope, as of `today`. Used as the numerator in the
   *  "yearly_total − covered_so_far" recompute. */
  coveredSoFar: number;
  /** The monthly goal currently being created or reviewed. Null when
   *  the user hasn't selected a goal yet; the panel still shows
   *  yearly pace, but the "current scope target" line collapses to
   *  zero and the affirmative-state check resolves to false. */
  currentMonthlyGoal: Goal | null;
  /** Items covered within the CURRENT MONTHLY GOAL'S scope (NOT the
   *  yearly anchor's). UI uses this as the "x covered / target"
   *  numerator on the panel. */
  currentMonthlyCovered: number;
  /** practice_days_per_cadence target — number of practice days per
   *  week. 0 when no consistency goal is active; time-per-day math
   *  returns null. */
  consistencyTargetDays: number;
  /** Reference clock — caller-supplied so tests can pin a stable
   *  "today" without mocking Date.now(). */
  today: number;
}

/**
 * The panel's display data, or 'hidden' when no yearly anchor exists.
 * Numbers are produced rounded for the canonical surfaces (whole
 * units for items, integer % for the consequence pill), and the raw
 * non-integer values stay on the result for any consumer that wants
 * them.
 */
export type YearlyPaceContext =
  | { kind: 'hidden'; reason: 'no-yearly-anchor' }
  | {
      kind: 'visible';
      /** Reference to the anchor that produced the context — surfaces
       *  the name + target in the UI ("…of yearly anchor target of
       *  143"). */
      yearlyAnchor: Goal;
      /** Pre-rounded yearly anchor target — straight pass-through of
       *  `yearlyAnchor.targetValue`. */
      yearlyTotal: number;
      /** Same as `inputs.coveredSoFar`, surfaced on the result for the
       *  "covered so far" line. */
      coveredSoFar: number;
      /** Calendar months remaining in the current year, INCLUSIVE of
       *  the current month (the user can still practice this month).
       *  Range: 1..12. */
      monthsRemainingInYear: number;
      /** Per-month recommended cover count to land on `yearlyTotal`
       *  by Dec 31 at current `coveredSoFar`. Floor at 0 when the
       *  user is already at or past the anchor. */
      yearlyPaceMonthly: number;
      /** Target on the currently-being-edited monthly goal —
       *  `currentMonthlyGoal.targetValue` or 0 when no goal is
       *  selected yet. */
      currentScopeTarget: number;
      /** Coverage already counted within the current monthly goal's
       *  scope. The UI shows "Y of N covered" on the panel. */
      currentScopeCovered: number;
      /** `(currentScopeTarget × minPerAttempt) / consistencyDays`
       *  rounded to one decimal. Null when consistencyTargetDays is
       *  0 — UI hides the time-context line in that case. */
      timePerDayMinutes: number | null;
      /** Days/week from the consistency goal (passed through for the
       *  UI's "~X min/day across N practice days" sentence). */
      consistencyTargetDays: number;
      /** "If you keep this monthly target, you'll cover P% of the
       *  yearly anchor by Dec 31." Rounded to integer percent for
       *  display; range clamped to 0..200 (capped above 200 so a
       *  goal with current_target > yearly_pace doesn't render a
       *  comically large number). */
      consequencePct: number;
      /** True when the current monthly target meets or beats the
       *  yearly pace. UI flips the panel into the affirmative
       *  "On track for yearly pace this month" state and drops the
       *  progression suggestion. */
      affirmative: boolean;
    };

// =====================================================================
// Pure math
// =====================================================================

const MS_PER_DAY = 86_400_000;

/**
 * Calendar months remaining in the current year INCLUDING the
 * current month — so January reads as 12, December reads as 1. The
 * design doc's pace formula divides by this; a December monthly
 * goal still has one full month to act, so the divisor is 1, not 0.
 */
export function monthsRemainingInYear(today: number): number {
  const d = new Date(today);
  return 12 - d.getMonth();
}

/** Rounds to one decimal for time-context display. */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function computeYearlyPaceContext(
  inputs: YearlyPaceInputs,
): YearlyPaceContext {
  const { yearlyAnchor } = inputs;
  if (!yearlyAnchor) {
    return { kind: 'hidden', reason: 'no-yearly-anchor' };
  }

  // Goal.targetValue is nullable in the schema (umbrellas, drafts);
  // for a yearly anchor we expect a number — fall back to 0 so the
  // panel still renders the structure without crashing. A 0-target
  // anchor reads "everything covered already" via the projection
  // math, which is the right honest reading for that edge case.
  const yearlyTotal = yearlyAnchor.targetValue ?? 0;
  const monthsRem = monthsRemainingInYear(inputs.today);
  const remainingItems = Math.max(0, yearlyTotal - inputs.coveredSoFar);
  // monthsRem is bounded to 1..12 by the helper, so no divide-by-zero
  // case; floor at 0 so an over-anchored user doesn't see negatives.
  const yearlyPaceMonthly = remainingItems / monthsRem;

  const currentScopeTarget = inputs.currentMonthlyGoal?.targetValue ?? 0;
  const currentScopeCovered = inputs.currentMonthlyCovered;

  // Time-per-day math. consistencyDays=0 → no consistency goal yet
  // → UI hides the line. Use minutes-per-attempt for THIS module.
  const minPerAttempt = minutesPerAttemptForModule(inputs.moduleId);
  const timePerDayMinutes = inputs.consistencyTargetDays > 0
    ? round1((currentScopeTarget * minPerAttempt) / inputs.consistencyTargetDays)
    : null;

  // Consequence projection — if the user holds this monthly target
  // for the rest of the year, how much of the yearly anchor lands?
  // covered_so_far + (currentTarget × monthsRem) / yearlyTotal, capped
  // at 200% so an ambitious user doesn't see 4000%.
  const projectedYearEnd = inputs.coveredSoFar + currentScopeTarget * monthsRem;
  const rawPct = yearlyTotal > 0
    ? (projectedYearEnd / yearlyTotal) * 100
    : 0;
  const consequencePct = Math.min(200, Math.max(0, Math.round(rawPct)));

  const affirmative = currentScopeTarget >= yearlyPaceMonthly && yearlyPaceMonthly > 0;

  return {
    kind: 'visible',
    yearlyAnchor,
    yearlyTotal,
    coveredSoFar: inputs.coveredSoFar,
    monthsRemainingInYear: monthsRem,
    yearlyPaceMonthly,
    currentScopeTarget,
    currentScopeCovered,
    timePerDayMinutes,
    consistencyTargetDays: inputs.consistencyTargetDays,
    consequencePct,
    affirmative,
  };
}

// =====================================================================
// Async loader
// =====================================================================

/**
 * Pull every Dexie input the pure math wants. Mirrors the
 * `loadConsistencyTargetDays` pattern from Step 7b — one async
 * function, four parallel reads, hand off to the pure helper.
 *
 * Kept separate from the React layer so tests can drive it without
 * a renderer.
 */
import { db } from '../../lib/db';
import { findAnchorGoalForModule } from './anchorLookup';
import { getEffectiveCoverageCount, getCoverageCount } from './progress';
import { isCoverageMetric, isCoverageSpecificMetric } from './coverageMetrics';

const CONSISTENCY_METRIC = 'practice_days_per_cadence';

async function loadConsistencyTargetDays(now: number): Promise<number> {
  // Mirrors the goalsNeedToday loader so we don't introduce a
  // second source of truth for "which goal sets the cadence?".
  const goals = await db.goals.toArray();
  const consistencyGoal = goals.find(
    g =>
      g.status === 'active'
      && g.targetMetric === CONSISTENCY_METRIC
      && g.startDate <= now
      && g.targetDate >= now,
  );
  return consistencyGoal?.targetValue ?? 0;
}

/**
 * Yearly anchor coverage count. Yearly anchors don't carry a metric
 * + sub-area in the goals-table sense (they're stored as umbrellas
 * with `targetMetric: null` and per-dimension children); the simplest
 * honest reading for "coveredSoFar" is the OVERALL coverage count
 * for the anchor's module — which is what the yearly-anchor screen
 * already shows. The async loader walks the goal's relatedModules to
 * pick the right overall metric.
 */
async function loadYearlyAnchorCoverage(anchor: Goal): Promise<number> {
  // The anchor row's own targetMetric points at the overall metric
  // for SOME yearly anchors (the single-dimension case). When it's
  // a real coverage metric, route through getCoverageCount; otherwise
  // (umbrella with no metric, or a non-coverage metric) fall back
  // to 0 — the panel still renders, the "covered so far" line just
  // reads 0 and the user can still pick a monthly target.
  const metric = anchor.targetMetric;
  if (!metric || !isCoverageMetric(metric)) return 0;
  return getCoverageCount(
    metric,
    isCoverageSpecificMetric(metric) ? anchor.targetUnit : null,
  );
}

/** Load the pure-input bundle for a moduleId / target-unit pair.
 *  `currentMonthlyGoal` is the draft / saved goal the user is
 *  editing — the caller supplies it (the GoalCreationFlow holds the
 *  draft in React state, not Dexie). */
export async function loadYearlyPaceInputs(args: {
  moduleId: GoalFlowModuleId;
  currentMonthlyGoal: Goal | null;
  today: number;
}): Promise<YearlyPaceInputs> {
  const { moduleId, currentMonthlyGoal, today } = args;
  const [yearlyAnchor, consistencyTargetDays] = await Promise.all([
    findAnchorGoalForModule(moduleId),
    loadConsistencyTargetDays(today),
  ]);

  const [coveredSoFar, currentMonthlyCovered] = await Promise.all([
    yearlyAnchor ? loadYearlyAnchorCoverage(yearlyAnchor) : Promise.resolve(0),
    currentMonthlyGoal
      ? getEffectiveCoverageCount(currentMonthlyGoal)
      : Promise.resolve(0),
  ]);

  return {
    moduleId,
    yearlyAnchor,
    coveredSoFar,
    currentMonthlyGoal,
    currentMonthlyCovered,
    consistencyTargetDays,
    today,
  };
}

/** Convenience: one-shot async wrapper that produces the
 *  YearlyPaceContext directly. The UI's typical entry point. */
export async function loadYearlyPaceContext(args: {
  moduleId: GoalFlowModuleId;
  currentMonthlyGoal: Goal | null;
  today?: number;
}): Promise<YearlyPaceContext> {
  const inputs = await loadYearlyPaceInputs({
    moduleId: args.moduleId,
    currentMonthlyGoal: args.currentMonthlyGoal,
    today: args.today ?? Date.now(),
  });
  return computeYearlyPaceContext(inputs);
}

// MS_PER_DAY exported for tests that want to construct timestamps
// without re-deriving the constant.
export const __TEST_MS_PER_DAY = MS_PER_DAY;
