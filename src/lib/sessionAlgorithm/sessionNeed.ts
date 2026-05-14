/**
 * Phase B — Goal-pace-driven session planning.
 *
 * The session planner historically allocated fixed time slices from
 * MEMORY_TYPE_DURATIONS with no connection to the user's coverage
 * goals. Phase B works backwards from goal-pace: how many attempts
 * does today's session need to keep the weekly target on track, and
 * how much time does that many attempts cost?
 *
 * Two layers, same as the rest of sessionAlgorithm/:
 *
 *   computeModuleSessionNeed(input)   — pure formula, fixture-tested.
 *   computeSessionNeedByModule(now)   — async loader; pulls the
 *                                       weekly Goal records, the
 *                                       global practice-consistency
 *                                       target, and per-module
 *                                       attempts-so-far, then runs
 *                                       the pure formula per module.
 *
 * Scope (this pass): Harmonic Fluency + Ear Training only — the two
 * modules whose attempt data is clean (one db.attempts row per
 * answer). S&P, Repertoire, and Production join once their
 * attempt-counting gaps are closed (see
 * docs/PHASE_B_SESSION_PLANNING_DESIGN.md review notes).
 *
 * Modules with no active weekly coverage goal are simply absent
 * from the result map — callers fall back to MEMORY_TYPE_DURATIONS
 * for those, exactly as before Phase B.
 */

import { db } from '../db';
import type { GoalFlowModuleId } from '../../modules/goals/goalVocabulary';
import { getWeeklyAttempts } from '../weeklyAttempts';
import { startOfWeekLocal, endOfWeekLocal } from '../../modules/goals/weeklyPlanData';

// ---------------------------------------------------------------------
// Time-per-attempt seeds
// ---------------------------------------------------------------------

/**
 * Conservative per-attempt seconds. Phase B design table — replace
 * with rolling averages once ≥20 sessions of real per-attempt data
 * exist per module (the `targetSeconds` / block-timing capture
 * landed May 2026; calibration is weeks out).
 *
 * Only the in-scope modules are listed. Adding a module here is the
 * one-line change that brings it into Phase B planning — but only
 * after its attempt-counting path is verified clean.
 */
export const TIME_PER_ATTEMPT_SECONDS: Readonly<
  Record<'harmonic-fluency' | 'ear-training', number>
> = {
  'harmonic-fluency': 30,
  'ear-training':     30,
};

/** Modules Phase B currently plans for. Anything not in this list
 *  falls through to the legacy MEMORY_TYPE_DURATIONS path. */
export const PHASE_B_MODULES: ReadonlyArray<keyof typeof TIME_PER_ATTEMPT_SECONDS> = [
  'harmonic-fluency',
  'ear-training',
];

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
 * Phase B formula. Pure — every input is a number, output is
 * deterministic. See docs/PHASE_B_SESSION_PLANNING_DESIGN.md
 * "The Formula" for the canonical derivation.
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
 *       though the loader always passes 1–7.
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

// ---------------------------------------------------------------------
// Async loader
// ---------------------------------------------------------------------

/** Weekly Goal records carry `targetMetric: null` once confirmed
 *  (see WeeklyPlan.handleConfirm) — they're identified by scope +
 *  relatedModules + targetUnit instead. Coverage weekly slices use
 *  the 'attempts' unit; consistency slices use 'days' / 'sessions'. */
const WEEKLY_COVERAGE_UNIT = 'attempts';

/** Monthly metric for the global practice-consistency goal. Its
 *  targetValue is the days/week cadence that anchors
 *  potential_sessions_left for every module. */
const PRACTICE_CONSISTENCY_METRIC = 'practice_days_per_cadence';

/**
 * Load the per-module session need for `now`. Returns a map keyed by
 * GoalFlowModuleId — only modules with an active weekly coverage
 * goal appear. Callers treat an absent module as "no Phase B data,
 * fall back to MEMORY_TYPE_DURATIONS".
 *
 * One getWeeklyAttempts call per in-scope module that has a weekly
 * goal. The global practice-consistency target is read once.
 */
export async function computeSessionNeedByModule(
  now: number = Date.now(),
): Promise<Map<GoalFlowModuleId, ModuleSessionNeed>> {
  const weekStart = startOfWeekLocal(now);
  const weekEnd = endOfWeekLocal(weekStart);
  const daysRemaining = calendarDaysRemainingInWeek(now);

  const allGoals = await db.goals.toArray();

  // Global practice-consistency target → consistency_target_days.
  // The doc treats Practice Consistency as the shared denominator;
  // a module-specific *_days_per_cadence goal is NOT used here on
  // purpose — the cadence that paces the week is the global one.
  const consistencyGoal = allGoals.find(
    g =>
      g.status === 'active' &&
      g.targetMetric === PRACTICE_CONSISTENCY_METRIC,
  );
  const consistencyTargetDays = consistencyGoal?.targetValue ?? 0;

  // Active weekly coverage slices for the in-scope modules.
  const weeklyCoverageGoals = allGoals.filter(
    g =>
      g.scope === 'weekly' &&
      g.status === 'active' &&
      g.startDate <= now &&
      g.targetDate >= now &&
      g.targetUnit === WEEKLY_COVERAGE_UNIT &&
      (g.targetValue ?? 0) > 0 &&
      isPhaseBModule(g.relatedModules[0]),
  );

  const out = new Map<GoalFlowModuleId, ModuleSessionNeed>();

  for (const goal of weeklyCoverageGoals) {
    const moduleId = goal.relatedModules[0] as keyof typeof TIME_PER_ATTEMPT_SECONDS;
    const attemptsSoFarThisWeek = await getWeeklyAttempts(
      moduleId,
      weekStart,
      weekEnd,
    );
    const need = computeModuleSessionNeed({
      weeklyTarget: goal.targetValue ?? 0,
      attemptsSoFarThisWeek,
      consistencyTargetDays,
      calendarDaysRemainingInWeek: daysRemaining,
      timePerAttemptSeconds: TIME_PER_ATTEMPT_SECONDS[moduleId],
    });
    // Multiple weekly goals for one module (rare) — keep the one
    // asking for the most time so the planner doesn't under-budget.
    const prev = out.get(moduleId);
    if (!prev || need.timeNeededSeconds > prev.timeNeededSeconds) {
      out.set(moduleId, need);
    }
  }

  return out;
}

function isPhaseBModule(
  moduleId: string | undefined,
): moduleId is keyof typeof TIME_PER_ATTEMPT_SECONDS {
  return moduleId === 'harmonic-fluency' || moduleId === 'ear-training';
}
