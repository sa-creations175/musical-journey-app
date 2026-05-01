/**
 * Phase 3 Step 2j — Abundance trigger detection.
 *
 * Per Part 7 of the design doc:
 *   Trigger: user is ahead of pace, has cleared the queue for the
 *   day, or the algorithm finds nothing urgently due.
 *
 * When the trigger fires, Step 8's three-path choice screen replaces
 * the standard proposal. This module is the pure detection layer —
 * the path-card UI itself lands in Step 8b.
 *
 * Three reasons map onto three observable signals:
 *
 *   queue-cleared   — candidate pool is empty after weighting +
 *                     filtering. Nothing's strictly due. Strongest
 *                     signal; takes precedence over the others.
 *
 *   ahead-of-pace   — every active measurable goal has pace ratio
 *                     ≥ 1.0 (on or ahead of the straight-line
 *                     trajectory). Honest about abundance: the user
 *                     is genuinely doing well, not just having a
 *                     quiet day.
 *
 *   nothing-urgent  — there's a small pool with no high-weight
 *                     standouts AND the user has already practiced
 *                     today. Don't fire on a cold-start morning;
 *                     do fire on a low-activity evening session
 *                     after the day's work is done.
 *
 * Pure function. Inputs come from upstream: 2a–2d for the candidate
 * pool + weights, 2c for pace ratios, the input questionnaire / day
 * context for earlier-sessions count.
 */

/** Top item weight below which we consider the pool to lack urgency.
 *  At weight 1.0 there's no goal-alignment lift; below 1.5 means the
 *  highest-pull item isn't pulling hard. */
export const NOTHING_URGENT_WEIGHT_THRESHOLD = 1.5;

/** Pool size at or under which we consider the queue thin enough for
 *  the nothing-urgent signal. Tunable. */
export const NOTHING_URGENT_POOL_THRESHOLD = 3;

export type AbundanceReason = 'queue-cleared' | 'ahead-of-pace' | 'nothing-urgent';

export interface AbundanceInput {
  /** Number of candidate items after weighting + filtering. */
  candidatePoolSize: number;
  /** Top item's weight — drives the nothing-urgent threshold check.
   *  Pass 0 when the pool is empty. */
  topItemWeight: number;
  /** Pace ratios across active measurable goals. Empty array means
   *  the user has no measurable goals — ahead-of-pace can't fire. */
  goalPaceRatios: ReadonlyArray<number>;
  /** Sessions logged earlier today; gates the nothing-urgent
   *  signal so cold-start mornings stay in the standard flow. */
  earlierSessionsToday: number;
}

export interface AbundanceResult {
  triggered: boolean;
  reason: AbundanceReason | null;
}

/**
 * Detect whether the abundance flow should fire. Returns a
 * triggered/false answer plus a reason for the "Why this plan?"
 * panel and the three-path framing copy.
 *
 * Order of precedence: queue-cleared > ahead-of-pace > nothing-urgent.
 * Stops at the first match.
 */
export function detectAbundance(input: AbundanceInput): AbundanceResult {
  const { candidatePoolSize, topItemWeight, goalPaceRatios, earlierSessionsToday } = input;

  if (candidatePoolSize === 0) {
    return { triggered: true, reason: 'queue-cleared' };
  }

  if (goalPaceRatios.length > 0 && goalPaceRatios.every(r => r >= 1.0)) {
    return { triggered: true, reason: 'ahead-of-pace' };
  }

  if (
    earlierSessionsToday > 0 &&
    candidatePoolSize <= NOTHING_URGENT_POOL_THRESHOLD &&
    topItemWeight < NOTHING_URGENT_WEIGHT_THRESHOLD
  ) {
    return { triggered: true, reason: 'nothing-urgent' };
  }

  return { triggered: false, reason: null };
}

/**
 * Convenience predicate when the caller only needs the boolean.
 * Routes through detectAbundance; equivalent to detectAbundance(input).triggered.
 */
export function shouldFireAbundanceFlow(input: AbundanceInput): boolean {
  return detectAbundance(input).triggered;
}
