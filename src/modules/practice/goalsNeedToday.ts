/**
 * GoalsNeedTodayScreen data layer — Phase B Step 7 / 7b.
 *
 * Two layers, mirroring the rest of sessionAlgorithm/:
 *
 *   summarizeGoalsNeedToday(input)
 *     — pure transform. Takes the keystone's ModuleWeeklyNeed[] plus
 *       the global cadence inputs the design-doc formula needs
 *       (consistency_target_days, calendar_days_remaining_in_week)
 *       and a "practiced today?" flag, produces the view-model the
 *       screen renders. The per-module minutes value is TODAY'S
 *       SLICE (computeModuleSessionNeed.timeNeededSeconds), not the
 *       keystone's weekly-remaining estimatedMinutesNeeded — Step 7b
 *       fix.
 *   loadGoalsNeedToday(now)
 *     — async wrapper: pulls keystone needs, today's practice-session
 *       count, and the active practice-consistency goal out of
 *       Dexie, then runs the pure layer.
 *
 * Why today's slice, not weekly remaining: the screen title is "What
 * your goals need today" and the CTA is "Full session — X min". The
 * keystone's estimatedMinutesNeeded is the WEEK'S remaining budget,
 * which can be hours for a behind-pace user — misleading framing for
 * a single-session screen. computeModuleSessionNeed (pure formula
 * in sessionNeed.ts) applies the design-doc cadence math to produce
 * today's slice; the keystone keeps returning weekly remaining for
 * the allocator (Step 6 path).
 *
 * Practice Consistency is intentionally absent from the per-module
 * list (design-doc §"Practice Consistency — Special Case": it's the
 * global cadence denominator, not a coverage module, and never gets
 * a time slice). It surfaces as a daily nudge when the user hasn't
 * practiced today.
 */

import { db } from '../../lib/db';
import {
  loadModuleWeeklyNeeds,
  type ModuleWeeklyNeed,
  type WeeklyPace,
} from '../../lib/sessionAlgorithm/moduleWeeklyNeed';
import {
  calendarDaysRemainingInWeek,
  computeModuleSessionNeed,
} from '../../lib/sessionAlgorithm/sessionNeed';
import type { GoalFlowModuleId } from '../goals/goalVocabulary';

// ---------------------------------------------------------------------
// View model
// ---------------------------------------------------------------------

export interface GoalsNeedTodayEntry {
  moduleId: GoalFlowModuleId;
  /** Today's-slice minutes — the design-doc Phase B formula's
   *  `time_needed`, rounded for display. 0 in over-practice mode
   *  (weekly target already met). */
  minutes: number;
  /** Weekly attempts target — surfaced for the per-row breakdown
   *  text ("N attempts × Ms each") + as context for the pace pill. */
  targetAttemptsThisWeek: number;
  /** Attempts today's session should target — the design-doc
   *  `attempts_today`. 0 in over-practice mode. */
  attemptsToday: number;
  /** Seconds per attempt — the seed used to scale attempts → minutes
   *  for this module. Derived from the keystone's
   *  estimatedMinutesNeeded ÷ remainingAttempts when remaining is
   *  positive; 0 in over-practice mode (where the seed has no
   *  effect on the formula anyway because attempts_today is 0). */
  perAttemptSeconds: number;
  /** Weekly pace pill — 'ahead' / 'on-pace' / 'behind'. From the
   *  keystone; not affected by today's-slice math. */
  pace: WeeklyPace;
  /** True when the weekly target is already met (over-practice).
   *  Screen renders this as a "target met" win instead of a minutes
   *  line. */
  isTargetMet: boolean;
}

export interface GoalsNeedTodaySummary {
  entries: GoalsNeedTodayEntry[];
  /** Total today's-slice minutes across the entries (active rows;
   *  over-practice rows contribute 0). */
  totalMinutes: number;
  /** True when the user hasn't logged a practice session today —
   *  drives the Practice Consistency nudge. */
  showConsistencyNudge: boolean;
}

/** Input to the pure summarizer. The two cadence fields come from
 *  the global practice-consistency goal + the calendar — they're the
 *  inputs the design-doc formula needs that the keystone doesn't
 *  carry (it operates at the weekly-remaining layer; today's-slice
 *  math is below that). */
export interface SummarizeGoalsNeedTodayInput {
  needs: ReadonlyArray<ModuleWeeklyNeed>;
  practicedToday: boolean;
  /** Active global practice-consistency goal's targetValue (days /
   *  week). 0 when no consistency goal is active — the formula
   *  degrades gracefully (potential_sessions_left floors at 1, so
   *  today's slice collapses to today = all remaining work). */
  consistencyTargetDays: number;
  /** Whole calendar days left in the week, today inclusive (1–7).
   *  Caller derives via calendarDaysRemainingInWeek(now). */
  calendarDaysRemainingInWeek: number;
}

// ---------------------------------------------------------------------
// Pure summary
// ---------------------------------------------------------------------

/**
 * Pure transform: keystone needs + cadence inputs + "practiced today?"
 * → screen view-model. Each ModuleWeeklyNeed is routed through
 * computeModuleSessionNeed to recover today's slice
 * (`attempts_today`, `time_needed`); the keystone's `pace` is passed
 * through unchanged. Over-practice rows stay in the list with
 * `isTargetMet = true` so the screen renders the "target met" win
 * rather than hiding the positive signal.
 *
 * The per-attempt seed (timePerAttemptSeconds for the formula) is
 * recovered from the keystone's pair of fields so we don't have to
 * thread an extra per-module seed table in: with the keystone's
 * estimatedMinutesNeeded == remainingAttempts × seed (Step 5
 * construction), `(estimatedMinutesNeeded × 60) ÷ remainingAttempts`
 * IS that seed exactly. In over-practice (remaining = 0) the formula
 * short-circuits to attempts_today = 0 before the seed is multiplied,
 * so a 0 seed is harmless there.
 */
export function summarizeGoalsNeedToday(
  input: SummarizeGoalsNeedTodayInput,
): GoalsNeedTodaySummary {
  const entries: GoalsNeedTodayEntry[] = input.needs.map(n => {
    const perAttemptSeconds = n.remainingAttempts > 0
      ? (n.estimatedMinutesNeeded * 60) / n.remainingAttempts
      : 0;

    const sessionNeed = computeModuleSessionNeed({
      weeklyTarget: n.targetAttemptsThisWeek,
      attemptsSoFarThisWeek: n.completedAttemptsThisWeek,
      consistencyTargetDays: input.consistencyTargetDays,
      calendarDaysRemainingInWeek: input.calendarDaysRemainingInWeek,
      timePerAttemptSeconds: perAttemptSeconds,
    });

    return {
      moduleId: n.moduleId,
      minutes: sessionNeed.isOverPractice
        ? 0
        : Math.round(sessionNeed.timeNeededSeconds / 60),
      targetAttemptsThisWeek: n.targetAttemptsThisWeek,
      attemptsToday: sessionNeed.attemptsToday,
      perAttemptSeconds,
      pace: n.pace,
      isTargetMet: sessionNeed.isOverPractice,
    };
  });

  const totalMinutes = entries.reduce((s, e) => s + e.minutes, 0);

  return {
    entries,
    totalMinutes,
    showConsistencyNudge: !input.practicedToday,
  };
}

// ---------------------------------------------------------------------
// Async loader
// ---------------------------------------------------------------------

/** Start of the local calendar day for `now`. Used to count practice
 *  sessions logged today for the Practice Consistency nudge. */
export function startOfLocalDay(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Active global practice-consistency goal's targetValue (days /
 *  week). 0 when none is active. Identified by `targetMetric ===
 *  'practice_days_per_cadence'` — the canonical metric for
 *  cross-module cadence; module-specific *_days_per_cadence goals
 *  are deliberately NOT used here (the cadence that paces the week
 *  is the global one — same contract as the pre-Step-7 prototype
 *  loader). */
async function loadConsistencyTargetDays(now: number): Promise<number> {
  const goals = await db.goals.toArray();
  const consistencyGoal = goals.find(
    g =>
      g.status === 'active' &&
      g.targetMetric === 'practice_days_per_cadence' &&
      g.startDate <= now &&
      g.targetDate >= now,
  );
  return consistencyGoal?.targetValue ?? 0;
}

/**
 * Load the screen's view-model for `now`. Three parallel Dexie reads
 * (keystone, practice-session count, consistency goal), then routes
 * through the pure summarizer.
 *
 * The keystone reads `db.goals.toArray()` internally, so this loader
 * issues a second `toArray` for the consistency lookup. Two reads
 * total is acceptable for a once-per-session-screen path; the
 * alternative (passing pre-loaded goals into the keystone) would
 * change loadModuleWeeklyNeeds's signature, which Step 7b's scope
 * forbids.
 */
export async function loadGoalsNeedToday(
  now: number = Date.now(),
): Promise<GoalsNeedTodaySummary> {
  const dayStart = startOfLocalDay(now);
  const [needs, practicedTodayCount, consistencyTargetDays] = await Promise.all([
    loadModuleWeeklyNeeds(now),
    // `above(dayStart - 1)` so a session logged exactly at 00:00.000
    // counts as "today". Cheaper than `between` for an open-ended
    // upper bound; `now` lives strictly above midnight anyway.
    db.practiceSessions.where('startedAt').above(dayStart - 1).count(),
    loadConsistencyTargetDays(now),
  ]);
  return summarizeGoalsNeedToday({
    needs,
    practicedToday: practicedTodayCount > 0,
    consistencyTargetDays,
    calendarDaysRemainingInWeek: calendarDaysRemainingInWeek(now),
  });
}
