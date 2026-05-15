/**
 * Phase 3 Step 2c — Pace-based urgency for coverage goals.
 *
 * Per PHASE3_READY_DESIGN_DOC Part 2:
 *
 *   Expected coverage = (days elapsed / total days) × total items
 *   Actual   coverage = getCoverageCount(metric)
 *   Deficit          = expected − actual
 *   Ratio            = actual / expected
 *
 * Below 1.0 means behind pace; above 1.0 means ahead. Same formula
 * for weekly / monthly / yearly — different time windows, identical
 * math. The function is pure: actual coverage is supplied as input
 * rather than fetched, so callers can decide where the numerator
 * comes from (live spacingState query for the algorithm,
 * goal.currentValue for snapshots, fixture data for tests).
 *
 * The output `factor` is a multiplicative boost that 2d weighting
 * applies on top of goal alignment. Mapping:
 *
 *   ratio ≥ 1.50         → 1.00  (well ahead — no extra push)
 *   1.00 ≤ ratio < 1.50  → 1.05  (slightly ahead — ambient)
 *   0.85 ≤ ratio < 1.00  → 1.20  (slightly behind — gentle catch-up)
 *   0.50 ≤ ratio < 0.85  → 1.60  (behind — clear urgency)
 *   ratio < 0.50         → 2.00  (significantly behind — capped)
 *
 * All thresholds are tunable constants. Calibrated from intuition;
 * real use will inform refinements. The 0.85 boundary intentionally
 * matches AT_RISK_RATIO from the goals/progress.ts feasibility model
 * so a goal flagged at_risk in the goal row also starts to bias the
 * algorithm. The cap at 2.0 prevents a single very-behind yearly
 * goal from dominating session generation.
 */

export const PACE_AHEAD_THRESHOLD = 1.5;
export const PACE_ON_PACE_THRESHOLD = 1.0;
export const PACE_AT_RISK_THRESHOLD = 0.85;
export const PACE_BEHIND_THRESHOLD = 0.5;

/** Boost multipliers per band. Edit these alone to recalibrate. */
export const PACE_FACTOR_WELL_AHEAD = 1.0;
export const PACE_FACTOR_AHEAD = 1.05;
export const PACE_FACTOR_AT_RISK = 1.2;
export const PACE_FACTOR_BEHIND = 1.6;
export const PACE_FACTOR_SIGNIFICANTLY_BEHIND = 2.0;

/** Phase B Step 9b — carryover backlog factor. Items in the backlog
 *  (uncovered from a previous month, not yet in this month's scope)
 *  get a modest lift so they surface above bare yearly-anchor pool
 *  items but stay below current monthly-scope items. Sits between
 *  AHEAD (1.05, "barely lifted") and AT_RISK (1.2, "real urgency")
 *  by design — backlog is "still on the user's mind" without being
 *  a present commitment. */
export const PACE_FACTOR_CARRYOVER_BACKLOG = 1.15;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface PaceInput {
  /** Period start (ms). */
  startDate: number;
  /** Period end (ms). */
  targetDate: number;
  /** Total items the goal targets (the denominator). */
  totalItems: number;
  /** Items actually covered so far (the numerator). */
  actualCoverage: number;
  /** Reference time. Defaults to Date.now() in async callers; tests
   *  pass a fixed value. */
  now: number;
}

export type PaceBand =
  | 'well-ahead'
  | 'ahead'
  | 'at-risk'
  | 'behind'
  | 'significantly-behind';

export interface PaceResult {
  expected: number;
  actual: number;
  deficit: number;
  /** actual / expected. `Infinity` when expected is 0 (period not
   *  started yet, or 0-item target); the algorithm treats this as
   *  ahead of pace. */
  ratio: number;
  band: PaceBand;
  /** Multiplicative weighting factor. 1.0 = no extra push. */
  factor: number;
  /** Fraction of period elapsed [0, 1]. Useful for "Why this plan?"
   *  reasoning text ("3 weeks left in the year"). */
  periodElapsedFraction: number;
}

/**
 * Compute pace metrics for a coverage goal at instant `now`.
 *
 * Edge cases:
 *   - now <= startDate: 0 days elapsed, expected = 0, deficit = -actual
 *     (any progress is "ahead"), ratio = +Infinity if actual > 0
 *     else NaN-handled to 1.
 *   - now >= targetDate: 100% expected; ratio relative to full target.
 *   - totalItems = 0: ratio = 1 (vacuously on pace).
 *   - targetDate <= startDate: zero-length period; expected = totalItems
 *     immediately; ratio reflects whether actual covers the target.
 */
export function paceForCoverageGoal(input: PaceInput): PaceResult {
  const { startDate, targetDate, totalItems, actualCoverage, now } = input;

  // Period elapsed fraction, clamped [0, 1].
  const periodLength = Math.max(0, targetDate - startDate);
  const elapsed = Math.max(0, Math.min(now, targetDate) - startDate);
  const periodElapsedFraction = periodLength === 0 ? 1 : elapsed / periodLength;

  const expected =
    totalItems <= 0
      ? 0
      : periodElapsedFraction * totalItems;
  const deficit = expected - actualCoverage;

  // Ratio handling — guard against division by zero.
  let ratio: number;
  if (totalItems <= 0) {
    ratio = 1;
  } else if (expected === 0) {
    // Period hasn't started or zero-length; any progress is ahead.
    ratio = actualCoverage > 0 ? Number.POSITIVE_INFINITY : 1;
  } else {
    ratio = actualCoverage / expected;
  }

  return {
    expected,
    actual: actualCoverage,
    deficit,
    ratio,
    band: bandForRatio(ratio),
    factor: factorForRatio(ratio),
    periodElapsedFraction,
  };
}

export function bandForRatio(ratio: number): PaceBand {
  if (!Number.isFinite(ratio) || ratio >= PACE_AHEAD_THRESHOLD) return 'well-ahead';
  if (ratio >= PACE_ON_PACE_THRESHOLD) return 'ahead';
  if (ratio >= PACE_AT_RISK_THRESHOLD) return 'at-risk';
  if (ratio >= PACE_BEHIND_THRESHOLD) return 'behind';
  return 'significantly-behind';
}

export function factorForRatio(ratio: number): number {
  switch (bandForRatio(ratio)) {
    case 'well-ahead':           return PACE_FACTOR_WELL_AHEAD;
    case 'ahead':                return PACE_FACTOR_AHEAD;
    case 'at-risk':              return PACE_FACTOR_AT_RISK;
    case 'behind':               return PACE_FACTOR_BEHIND;
    case 'significantly-behind': return PACE_FACTOR_SIGNIFICANTLY_BEHIND;
  }
}

/** Days elapsed in the period, floored. Convenience for reasoning
 *  text. */
export function daysElapsed(startDate: number, now: number): number {
  return Math.max(0, Math.floor((now - startDate) / MS_PER_DAY));
}

/** Days remaining (today counts as remaining). 0 when past the
 *  target date. */
export function daysRemaining(targetDate: number, now: number): number {
  if (now >= targetDate) return 0;
  return Math.max(0, Math.ceil((targetDate - now) / MS_PER_DAY));
}
