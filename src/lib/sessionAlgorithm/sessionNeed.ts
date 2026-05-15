/**
 * Phase B — pre-keystone `computeModuleSessionNeed` formula.
 *
 * Originally this file shipped a two-layer Phase B prototype: a pure
 * formula (`computeModuleSessionNeed`) that produced a per-module
 * "today's slice" of attempts + time, plus an async loader
 * (`computeSessionNeedByModule`) that ran the formula against
 * Dexie-loaded goals + attempt counts.
 *
 * Phase B Step 5 introduced the full keystone in
 * `moduleWeeklyNeed.ts` with a weekly-remaining shape; Step 6 routed
 * the allocator through it; Step 7 routed the GoalsNeedTodayScreen
 * through it and retired the async loader (which had no remaining
 * callers once dailyGoalNeed.ts was deleted).
 *
 * What stays:
 *   · `computeModuleSessionNeed` — the pure "today's slice" formula,
 *     kept for the fixture test suite that pins its derivation (the
 *     formula itself stays useful as documentation of how today's
 *     slice falls out of the weekly-remaining shape, and the design
 *     doc references its variables by name).
 *   · `ModuleSessionNeed` / `ModuleSessionNeedInput` — same; the
 *     legacy `buildBlockTimeNeeds` in sessionGenerator.ts still
 *     types its argument against them (its own test pins it). Both
 *     are dead-in-production post-Step-6 and a follow-up cleanup
 *     can remove them.
 *   · `TIME_PER_ATTEMPT_SECONDS` — re-exported from
 *     timePerAttempt.ts so existing importers of `./sessionNeed`
 *     (WeeklyPlan.tsx) keep working.
 *   · `calendarDaysRemainingInWeek` — small calendar helper, no
 *     dependencies, harmless to keep.
 */

import { TIME_PER_ATTEMPT_SECONDS } from './timePerAttempt';

// ---------------------------------------------------------------------
// Time-per-attempt seeds
// ---------------------------------------------------------------------
//
// The seed table moved to the canonical timePerAttempt.ts in Phase B
// Step 1 — re-exported here unchanged so existing importers of
// './sessionNeed' (WeeklyPlan.tsx) keep working without a path change.

export { TIME_PER_ATTEMPT_SECONDS };

// ---------------------------------------------------------------------
// Pure formula
// ---------------------------------------------------------------------

export interface ModuleSessionNeedInput {
  /** Weekly attempt target for this module (from the confirmed
   *  weekly Goal record's targetValue). */
  weeklyTarget: number;
  /** Attempts already logged this module this week. */
  attemptsSoFarThisWeek: number;
  /** Days/week the user has committed to practising — the global
   *  practice-consistency goal's targetValue. 0 when no consistency
   *  goal is active; the formula degrades gracefully (see the
   *  zero-consistency branch below). */
  consistencyTargetDays: number;
  /** Whole calendar days left in the week, today inclusive (1–7).
   *  Sunday = 7, Saturday = 1. Caps potential_sessions_left so the
   *  planner never assumes more sessions than days remain. */
  calendarDaysRemainingInWeek: number;
  /** Seed (or, later, rolling-average) seconds per attempt. */
  timePerAttemptSeconds: number;
}

export interface ModuleSessionNeed {
  /** Attempts today's session should target for this module.
   *  0 in over-practice mode. Rounded UP — round-up keeps the user
   *  on pace rather than letting fractional drift accumulate. */
  attemptsToday: number;
  /** Time today's session needs for this module, in seconds.
   *  Always `attemptsToday × timePerAttemptSeconds` so the
   *  plain-English breakdown ("N attempts × Ms each") is exact. */
  timeNeededSeconds: number;
  /** True when the weekly target is already met
   *  (attempts_remaining ≤ 0). Callers route over-practice modules
   *  into the 60/30/10 review mix instead of a time block. */
  isOverPractice: boolean;
}

/**
 * Phase B formula — produces a "today's slice" of attempts + time
 * for a single module. Pure: every input is a number, output is
 * deterministic.
 *
 *   1. attempts_remaining = weekly_target − attempts_so_far
 *   2. fractional_days_completed = attempts_so_far ÷ daily_target
 *        where daily_target = weekly_target ÷ consistency_target_days
 *   3. potential_sessions_left =
 *        min( max(consistency_target − fractional_days_completed, 1),
 *             calendar_days_remaining )
 *   4. attempts_today = ceil(attempts_remaining ÷ potential_sessions_left)
 *   5. time_needed = attempts_today × time_per_attempt_seconds
 *
 * Edge handling:
 *   · attempts_remaining ≤ 0  → over-practice; attemptsToday + time 0.
 *   · consistency_target ≤ 0  → no cadence to measure against;
 *       daily_target + fractional_days collapse to 0, so
 *       potential_sessions_left floors at 1 (capped by calendar) —
 *       the honest "you'd need it all today" answer rather than a
 *       NaN from dividing by zero.
 *   · calendar_days_remaining is clamped to ≥ 1 defensively even
 *       though prior callers always passed 1–7.
 *
 * Kept post-Step-7 for its fixture tests + as documentation of how
 * the design doc's "today's slice" math falls out of the weekly-
 * remaining shape the keystone returns. No production consumer.
 */
export function computeModuleSessionNeed(
  input: ModuleSessionNeedInput,
): ModuleSessionNeed {
  const {
    weeklyTarget,
    attemptsSoFarThisWeek,
    consistencyTargetDays,
    calendarDaysRemainingInWeek,
    timePerAttemptSeconds,
  } = input;

  // Step 1 — attempts remaining this week.
  const attemptsRemaining = weeklyTarget - attemptsSoFarThisWeek;

  // Over-practice: the weekly target is already met. No time block —
  // the caller swaps in the 60/30/10 review mix.
  if (attemptsRemaining <= 0) {
    return { attemptsToday: 0, timeNeededSeconds: 0, isOverPractice: true };
  }

  // Step 2 — fractional sessions completed.
  // daily_target = weekly_target ÷ consistency_target_days. When the
  // consistency target is missing/zero there's no per-day cadence to
  // measure progress against, so both daily_target and the fraction
  // collapse to 0 — the formula then treats every prior attempt as
  // un-paced and leaves potential_sessions_left at its floor of 1.
  const dailyTarget = consistencyTargetDays > 0
    ? weeklyTarget / consistencyTargetDays
    : 0;
  const fractionalDaysCompleted = dailyTarget > 0
    ? attemptsSoFarThisWeek / dailyTarget
    : 0;

  // Step 3 — potential sessions left, floored at 1 and capped by the
  // calendar. The floor stops a near-complete cadence from dividing
  // attempts_today by a tiny fraction; the cap stops the planner
  // from spreading work across more sessions than days remain.
  const calendarCap = Math.max(calendarDaysRemainingInWeek, 1);
  const potentialSessionsLeft = Math.min(
    Math.max(consistencyTargetDays - fractionalDaysCompleted, 1),
    calendarCap,
  );

  // Step 4 — attempts today, rounded up to stay on pace.
  const attemptsToday = Math.ceil(attemptsRemaining / potentialSessionsLeft);

  // Step 5 — time the session needs for this module.
  const timeNeededSeconds = attemptsToday * timePerAttemptSeconds;

  return { attemptsToday, timeNeededSeconds, isOverPractice: false };
}

// ---------------------------------------------------------------------
// Calendar helper
// ---------------------------------------------------------------------

/**
 * Whole calendar days left in the week, today inclusive. Sunday → 7,
 * Saturday → 1. Mirrors the Sunday-anchored week shape the rest of
 * the goals layer uses (startOfWeekLocal / endOfWeekLocal).
 */
export function calendarDaysRemainingInWeek(now: number): number {
  const dow = new Date(now).getDay(); // 0 = Sunday … 6 = Saturday
  return 7 - dow;
}
