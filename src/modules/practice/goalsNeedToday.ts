/**
 * GoalsNeedTodayScreen data layer — Phase B Step 7.
 *
 * Two layers, mirroring the rest of sessionAlgorithm/:
 *
 *   summarizeGoalsNeedToday(needs, practicedToday)
 *     — pure transform. Takes a ModuleWeeklyNeed[] (from the
 *       keystone) plus a "practiced today?" flag, produces the
 *       view-model the screen renders.
 *   loadGoalsNeedToday(now)
 *     — async wrapper: pulls the keystone needs + today's practice
 *       count out of Dexie, then runs the pure layer.
 *
 * Supersedes dailyGoalNeed.ts. The semantic of the per-module
 * "minutes" field is now the WEEKLY remaining from the Phase B
 * keystone (estimatedMinutesNeeded), not the OLD "today's slice"
 * the prototype produced — Step 5's keystone deliberately moved to
 * a weekly-remaining shape, and Step 7 routes the screen through it.
 *
 * Practice Consistency is intentionally absent from the per-module
 * list (per design-doc §"Practice Consistency — Special Case": it's
 * the global cadence denominator, not a coverage module, and never
 * gets a time slice). Instead it surfaces as a daily nudge when the
 * user hasn't practiced today.
 */

import { db } from '../../lib/db';
import {
  loadModuleWeeklyNeeds,
  type ModuleWeeklyNeed,
  type WeeklyPace,
} from '../../lib/sessionAlgorithm/moduleWeeklyNeed';
import type { GoalFlowModuleId } from '../goals/goalVocabulary';

// ---------------------------------------------------------------------
// View model
// ---------------------------------------------------------------------

export interface GoalsNeedTodayEntry {
  moduleId: GoalFlowModuleId;
  /** Rounded minutes the keystone says the WEEK still needs for this
   *  module (Phase B `estimatedMinutesNeeded`, rounded for display).
   *  0 in over-practice mode — the row renders a "target met" pill
   *  instead of a minutes line. */
  minutes: number;
  /** Weekly attempts target — surfaced for the per-row breakdown
   *  text ("N attempts × Ms each"). */
  targetAttemptsThisWeek: number;
  /** Attempts still remaining this week. 0 in over-practice mode. */
  remainingAttempts: number;
  /** Seconds per attempt (derived from estimatedMinutesNeeded /
   *  remainingAttempts). 0 in over-practice mode. */
  perAttemptSeconds: number;
  /** Weekly pace pill — 'ahead' / 'on-pace' / 'behind'. */
  pace: WeeklyPace;
  /** True when the weekly target is already met (remainingAttempts
   *  is 0). The screen renders this as a "target met" win instead
   *  of a minutes line. */
  isTargetMet: boolean;
}

export interface GoalsNeedTodaySummary {
  entries: GoalsNeedTodayEntry[];
  /** Total minutes across the entries (active rows; over-practice
   *  rows contribute 0). */
  totalMinutes: number;
  /** True when the user hasn't logged a practice session today —
   *  drives the Practice Consistency nudge. */
  showConsistencyNudge: boolean;
}

// ---------------------------------------------------------------------
// Pure summary
// ---------------------------------------------------------------------

/**
 * Pure transform: keystone needs + "practiced today?" flag → the
 * view-model the screen renders. No db, no clock — fixture-tested.
 *
 * Each ModuleWeeklyNeed maps to one entry; over-practice (remaining
 * 0) entries stay in the list with `isTargetMet = true` so the
 * screen can render the "target met" win rather than hiding the
 * positive signal — same shape as the dailyGoalNeed.ts behaviour
 * this supersedes.
 *
 * Per-attempt seconds is recovered from the keystone's two fields:
 * `perAttemptSeconds = (estimatedMinutesNeeded × 60) ÷
 * remainingAttempts`. It's a derived metric for the row breakdown
 * text only; the keystone is the canonical source of the totals.
 */
export function summarizeGoalsNeedToday(
  needs: ReadonlyArray<ModuleWeeklyNeed>,
  practicedToday: boolean,
): GoalsNeedTodaySummary {
  const entries: GoalsNeedTodayEntry[] = needs.map(n => {
    const isTargetMet = n.remainingAttempts <= 0;
    const minutes = isTargetMet ? 0 : Math.round(n.estimatedMinutesNeeded);
    const perAttemptSeconds = isTargetMet || n.remainingAttempts === 0
      ? 0
      : (n.estimatedMinutesNeeded * 60) / n.remainingAttempts;
    return {
      moduleId: n.moduleId,
      minutes,
      targetAttemptsThisWeek: n.targetAttemptsThisWeek,
      remainingAttempts: n.remainingAttempts,
      perAttemptSeconds,
      pace: n.pace,
      isTargetMet,
    };
  });

  const totalMinutes = entries.reduce((s, e) => s + e.minutes, 0);

  return {
    entries,
    totalMinutes,
    showConsistencyNudge: !practicedToday,
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

/**
 * Load the screen's view-model for `now`. Runs the keystone +
 * practice-session count in parallel, then routes through the pure
 * summarizer. Two Dexie reads per call.
 */
export async function loadGoalsNeedToday(
  now: number = Date.now(),
): Promise<GoalsNeedTodaySummary> {
  const dayStart = startOfLocalDay(now);
  const [needs, practicedTodayCount] = await Promise.all([
    loadModuleWeeklyNeeds(now),
    // `above(dayStart - 1)` so a session logged exactly at 00:00.000
    // counts as "today". Cheaper than `between` for an open-ended
    // upper bound; `now` lives strictly above midnight anyway.
    db.practiceSessions.where('startedAt').above(dayStart - 1).count(),
  ]);
  return summarizeGoalsNeedToday(needs, practicedTodayCount > 0);
}
