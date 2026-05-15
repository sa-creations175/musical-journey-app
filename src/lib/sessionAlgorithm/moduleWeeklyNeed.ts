/**
 * Phase B Step 5 — the keystone: per-module weekly need + pace.
 *
 * `computeModuleWeeklyNeeds` is the pure heart of Phase B session
 * planning. Given each module's weekly attempt target and the
 * attempts logged so far this week, it works out what's left, how
 * much practice time that costs (per-attempt seeds from
 * timePerAttempt.ts), and whether the user is ahead / on-pace /
 * behind for this point in the week.
 *
 * Two layers, mirroring the rest of sessionAlgorithm/:
 *
 *   computeModuleWeeklyNeeds(weekStart, weekEnd, today, moduleInputs)
 *     — pure, fixture-tested. No db, no clock. The caller hands it
 *       pre-fetched per-module counts.
 *   loadModuleWeeklyNeeds(today)
 *     — async wrapper: pulls the active weekly coverage goals plus
 *       each module's attempt count out of Dexie, then runs the pure
 *       layer.
 *
 * This is a NEW, parallel keystone — it does not replace the earlier
 * Phase B prototype (computeSessionNeedByModule / ModuleSessionNeed
 * in sessionNeed.ts), which is still wired into the allocator and
 * GoalsNeedTodayScreen. The design doc's build sequencing wires
 * Phase B into those layers in Steps 6–7; Step 5 just builds the
 * keystone, so the two coexist until then.
 *
 * See docs/PHASE_B_SESSION_PLANNING_DESIGN.md.
 */

import { db } from '../db';
import type { GoalFlowModuleId } from '../../modules/goals/goalVocabulary';
import {
  getEarTrainingAttemptsBySubActivity,
  getWeeklyAttempts,
  getWeeklyRatedProductionAttempts,
} from '../weeklyAttempts';
import { startOfWeekLocal, endOfWeekLocal } from '../../modules/goals/weeklyPlanData';
import { recomputeWeeklyTargetForMonthlyGoal } from '../../modules/goals/weeklyDerivation';
import { moduleForMetric } from '../../modules/goals/goalVocabulary';
import {
  PRODUCTION_TIME_RANGE_MINUTES,
  SHAPES_DEFAULT_TIME_PER_REP_MINUTES,
  TIME_PER_ATTEMPT_MINUTES,
  TIME_PER_ATTEMPT_SECONDS,
} from './timePerAttempt';

// ---------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------

/** Where the user stands against the expected pace for this point in
 *  the week. A single enum rather than three mutually-exclusive
 *  booleans — the states can't co-occur, and the rest of the codebase
 *  models this kind of thing as a discriminated string. */
export type WeeklyPace = 'ahead' | 'on-pace' | 'behind';

/** ET sub-activity completed-count breakdown. Phase B Step 4 split ET
 *  attempt counting by sub-activity; this carries that split up into
 *  the per-module need so Step 6's allocator can divide ET time
 *  between intervals and chord recognition. No per-sub-activity
 *  *target* yet — the weekly goal model targets 'ear-training' as a
 *  whole — so these are completed counts only. */
export interface ModuleWeeklyNeedSubActivity {
  subActivity: 'intervals' | 'chord-recognition';
  completedAttemptsThisWeek: number;
}

/** Pre-fetched per-module input to the pure keystone. The async
 *  wrapper builds one of these per module that has an active weekly
 *  coverage goal; fixtures build them directly in tests. */
export interface ModuleWeeklyNeedInput {
  moduleId: GoalFlowModuleId;
  /** Weekly attempt target — the module's active weekly coverage
   *  Goal.targetValue (targetUnit 'attempts'). */
  targetAttemptsThisWeek: number;
  /** Attempts logged for this module in [weekStart, weekEnd]. */
  completedAttemptsThisWeek: number;
  /** ear-training only — the intervals / chord-recognition split of
   *  `completedAttemptsThisWeek` (getEarTrainingAttemptsBySubActivity).
   *  intervals + chordRecognition ≤ completedAttemptsThisWeek; the
   *  remainder is the "other" ET sub-activities. */
  earTrainingBreakdown?: {
    intervals: number;
    chordRecognition: number;
  };
}

/** One module's weekly need — the keystone output the session
 *  planner reads. */
export interface ModuleWeeklyNeed {
  moduleId: GoalFlowModuleId;
  targetAttemptsThisWeek: number;
  completedAttemptsThisWeek: number;
  /** targetAttemptsThisWeek − completedAttemptsThisWeek, floored at 0
   *  (an over-completed week needs nothing more — never "negative"
   *  attempts remain). */
  remainingAttempts: number;
  /** remainingAttempts × the module's per-attempt time seed, in
   *  minutes. Not rounded — callers round for display. */
  estimatedMinutesNeeded: number;
  /** Pace vs. the expected fraction of the week elapsed. */
  pace: WeeklyPace;
  /** ear-training only — completed-count breakdown by sub-activity
   *  (present when the input carried an earTrainingBreakdown). */
  subActivities?: ModuleWeeklyNeedSubActivity[];
}

// ---------------------------------------------------------------------
// Per-attempt time seeds
// ---------------------------------------------------------------------

const SECONDS_PER_MINUTE = 60;

/**
 * Per-attempt practice time, in MINUTES, for one logged attempt of a
 * module — where "one attempt" is one row in that module's source
 * table:
 *
 *   harmonic-fluency / ear-training → one db.attempts row
 *   shapes-and-patterns             → one db.drillSessions row
 *   repertoire                      → one db.songCellRunThroughs row
 *   production                      → one rated ProductionLessonSession
 *
 * Every value is read from timePerAttempt.ts — no new constant is
 * introduced. HF/ET use TIME_PER_ATTEMPT_SECONDS (30 s — the Phase B
 * seed; the 20 s TIME_PER_ATTEMPT_MINUTES value is the unresolved
 * discrepancy noted in the design doc, deliberately not touched
 * here). S&P uses the catalog-weighted rep average. Repertoire uses
 * the per-cell-session midpoint. Production collapses its lesson-
 * length range to its midpoint — the same choice dailyGoalNeed.ts
 * already makes, so no third value enters the codebase.
 */
function minutesPerAttemptForModule(moduleId: GoalFlowModuleId): number {
  switch (moduleId) {
    case 'harmonic-fluency':
      return TIME_PER_ATTEMPT_SECONDS['harmonic-fluency'] / SECONDS_PER_MINUTE;
    case 'ear-training':
      return TIME_PER_ATTEMPT_SECONDS['ear-training'] / SECONDS_PER_MINUTE;
    case 'shapes-and-patterns':
      return SHAPES_DEFAULT_TIME_PER_REP_MINUTES;
    case 'repertoire':
      return TIME_PER_ATTEMPT_MINUTES['repertoire'];
    case 'production':
      return (
        PRODUCTION_TIME_RANGE_MINUTES.minPerLesson
        + PRODUCTION_TIME_RANGE_MINUTES.maxPerLesson
      ) / 2;
    case 'practice-consistency':
      // Practice Consistency is the global cadence denominator, not a
      // coverage module — it never carries a weekly attempt target,
      // so it never reaches the keystone. Defensive 0.
      return 0;
  }
}

// ---------------------------------------------------------------------
// Pace classifier
// ---------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

/** Tolerance band around the expected pace. Within ±this fraction of
 *  the "expected share of the week complete" reads as on-pace. */
export const PACE_TOLERANCE = 0.15;

/**
 * Classify weekly pace: compare the fraction of the weekly target
 * already completed against the fraction of the week elapsed.
 *
 *   dayIndex = whole days since weekStart (0 on day 1, clamped 0–6)
 *   expected = dayIndex / 7
 *   actual   = completed / target
 *
 *   ahead   : actual >  expected + PACE_TOLERANCE
 *   behind  : actual <  expected − PACE_TOLERANCE
 *   on-pace : otherwise (the ±tolerance band, boundary inclusive)
 *
 * Zero (or negative) target → on-pace — there's nothing to be behind
 * on. `today` is clamped into [weekStart, weekEnd] so an out-of-window
 * value can't push the day index negative or past day 6.
 */
export function classifyWeeklyPace(
  weekStart: number,
  weekEnd: number,
  today: number,
  targetAttemptsThisWeek: number,
  completedAttemptsThisWeek: number,
): WeeklyPace {
  if (targetAttemptsThisWeek <= 0) return 'on-pace';

  const clampedToday = Math.min(Math.max(today, weekStart), weekEnd);
  const dayIndex = Math.min(
    6,
    Math.max(0, Math.floor((clampedToday - weekStart) / DAY_MS)),
  );

  const expectedFraction = dayIndex / 7;
  const actualFraction = completedAttemptsThisWeek / targetAttemptsThisWeek;

  if (actualFraction > expectedFraction + PACE_TOLERANCE) return 'ahead';
  if (actualFraction < expectedFraction - PACE_TOLERANCE) return 'behind';
  return 'on-pace';
}

// ---------------------------------------------------------------------
// Pure keystone
// ---------------------------------------------------------------------

/**
 * The Phase B keystone — pure. Maps each pre-fetched module input to
 * its weekly need: remaining attempts, the practice time that costs,
 * and pace. ear-training inputs that carry an `earTrainingBreakdown`
 * get the intervals / chord-recognition sub-entries.
 *
 * Pure and deterministic — no db, no clock. Tests drive it with
 * fixtures.
 */
export function computeModuleWeeklyNeeds(
  weekStart: number,
  weekEnd: number,
  today: number,
  moduleInputs: ReadonlyArray<ModuleWeeklyNeedInput>,
): ModuleWeeklyNeed[] {
  return moduleInputs.map(input => {
    const { moduleId, targetAttemptsThisWeek, completedAttemptsThisWeek } = input;
    const remainingAttempts = Math.max(
      0,
      targetAttemptsThisWeek - completedAttemptsThisWeek,
    );
    const estimatedMinutesNeeded =
      remainingAttempts * minutesPerAttemptForModule(moduleId);
    const pace = classifyWeeklyPace(
      weekStart, weekEnd, today,
      targetAttemptsThisWeek,
      completedAttemptsThisWeek,
    );

    const need: ModuleWeeklyNeed = {
      moduleId,
      targetAttemptsThisWeek,
      completedAttemptsThisWeek,
      remainingAttempts,
      estimatedMinutesNeeded,
      pace,
    };

    if (moduleId === 'ear-training' && input.earTrainingBreakdown) {
      need.subActivities = [
        {
          subActivity: 'intervals',
          completedAttemptsThisWeek: input.earTrainingBreakdown.intervals,
        },
        {
          subActivity: 'chord-recognition',
          completedAttemptsThisWeek: input.earTrainingBreakdown.chordRecognition,
        },
      ];
    }

    return need;
  });
}

/**
 * Set of modules Phase B is actively budgeting time for — every
 * module need with `estimatedMinutesNeeded > 0`. Modules with no
 * active weekly coverage goal are absent from the input list and so
 * absent from the returned set. Step 6's wiring uses this set to
 * neutralize weeklyPace.factorByModule for Phase-B-active modules
 * (the design-doc "double-counting urgency" fix).
 */
export function phaseBModulesFromNeeds(
  needs: ReadonlyArray<ModuleWeeklyNeed>,
): Set<GoalFlowModuleId> {
  const out = new Set<GoalFlowModuleId>();
  for (const n of needs) {
    if (n.estimatedMinutesNeeded > 0) out.add(n.moduleId);
  }
  return out;
}

// ---------------------------------------------------------------------
// Async wrapper
// ---------------------------------------------------------------------

/** Weekly coverage Goal records use the 'attempts' targetUnit (see
 *  sessionNeed.ts — confirmed weekly slices carry targetMetric null
 *  and are identified by scope + targetUnit). */
const WEEKLY_COVERAGE_UNIT = 'attempts';

/** The modules Phase B's keystone plans for. Practice Consistency is
 *  the global cadence denominator, not a coverage module, so it's
 *  absent (and the goal model never gives it a weekly 'attempts'
 *  target anyway — its metric is days_per_cadence). */
const KEYSTONE_MODULES: ReadonlySet<GoalFlowModuleId> = new Set<GoalFlowModuleId>([
  'harmonic-fluency',
  'ear-training',
  'shapes-and-patterns',
  'repertoire',
  'production',
]);

/**
 * Async wrapper around computeModuleWeeklyNeeds — the only part that
 * touches Dexie. Reads the active weekly coverage goals for `today`'s
 * week and each Phase-B module's attempt count for the window, then
 * runs the pure keystone.
 *
 * Modules with no active weekly coverage goal are absent from the
 * result — callers fall back to MEMORY_TYPE_DURATIONS tier constants
 * for those, exactly as the design doc's "no active goal" path
 * specifies.
 *
 * Production uses the rated-session counter (Step 3's
 * getWeeklyRatedProductionAttempts), NOT the legacy
 * getWeeklyAttempts('production', …) spacingState walk — Phase B's
 * notion of a Production attempt is a rated lesson session.
 */
export async function loadModuleWeeklyNeeds(
  today: number = Date.now(),
): Promise<ModuleWeeklyNeed[]> {
  const weekStart = startOfWeekLocal(today);
  const weekEnd = endOfWeekLocal(weekStart);

  const allGoals = await db.goals.toArray();

  // Largest weekly 'attempts' target per Phase B module. Multiple
  // weekly coverage goals on one module is rare; take the most
  // demanding so the planner doesn't under-budget. Mirrors the
  // earlier prototype loader's tie-breaker.
  //
  // A weekly Goal record landing here represents the user's
  // confirmed plan for the week — the implicit override (per design
  // doc Decision 1: "Phase B respects the override if kept"). When
  // no record exists for a Phase-B module, we live-recompute from
  // its monthly parent below.
  const targetByModule = new Map<GoalFlowModuleId, number>();
  for (const g of allGoals) {
    if (g.scope !== 'weekly' || g.status !== 'active') continue;
    if (g.startDate > today || g.targetDate < today) continue;
    if (g.targetUnit !== WEEKLY_COVERAGE_UNIT) continue;
    const target = g.targetValue ?? 0;
    if (target <= 0) continue;
    const moduleId = g.relatedModules[0] as GoalFlowModuleId | undefined;
    if (!moduleId || !KEYSTONE_MODULES.has(moduleId)) continue;
    const prev = targetByModule.get(moduleId) ?? 0;
    if (target > prev) targetByModule.set(moduleId, target);
  }

  // Step 8 fallback — for any Phase-B module with an active monthly
  // coverage goal but NO weekly Goal record for the current week,
  // live-recompute the weekly target from monthly remaining. This is
  // the design-doc rule ("Phase B always live-recomputes from monthly
  // remaining") applied to modules the user hasn't explicitly
  // confirmed a weekly plan for this week. When a record DOES exist,
  // it wins (the user's confirmed plan stays sticky until they
  // explicitly update via the WeeklyPlan modal's divergence prompt).
  //
  // Weekly Goal records OUTSIDE the current week (past or future)
  // never reach this loop — the date-range filter above drops them.
  // That's the "frozen weekly Goal records become display-only" rule
  // (design doc Legacy Systems #4) — past records are reference-only
  // in WeeklyPlan; the session planner never sees them.
  for (const monthly of allGoals) {
    if (monthly.scope !== 'monthly') continue;
    if (monthly.status !== 'active') continue;
    if (monthly.isUmbrella) continue;
    if (!monthly.targetMetric) continue;
    const moduleId = moduleForMetric(monthly.targetMetric);
    if (!moduleId || !KEYSTONE_MODULES.has(moduleId)) continue;
    if (targetByModule.has(moduleId)) continue; // confirmed plan wins
    const recomputed = await recomputeWeeklyTargetForMonthlyGoal(monthly, today);
    if (!recomputed || recomputed.weeklyTarget <= 0) continue;
    const prev = targetByModule.get(moduleId) ?? 0;
    if (recomputed.weeklyTarget > prev) {
      targetByModule.set(moduleId, recomputed.weeklyTarget);
    }
  }

  const inputs: ModuleWeeklyNeedInput[] = [];
  for (const [moduleId, targetAttemptsThisWeek] of targetByModule) {
    if (moduleId === 'ear-training') {
      const breakdown = await getEarTrainingAttemptsBySubActivity(weekStart, weekEnd);
      inputs.push({
        moduleId,
        targetAttemptsThisWeek,
        completedAttemptsThisWeek: breakdown.total,
        earTrainingBreakdown: {
          intervals: breakdown.intervals,
          chordRecognition: breakdown.chordRecognition,
        },
      });
    } else if (moduleId === 'production') {
      const completed = await getWeeklyRatedProductionAttempts(weekStart, weekEnd);
      inputs.push({ moduleId, targetAttemptsThisWeek, completedAttemptsThisWeek: completed });
    } else {
      const completed = await getWeeklyAttempts(moduleId, weekStart, weekEnd);
      inputs.push({ moduleId, targetAttemptsThisWeek, completedAttemptsThisWeek: completed });
    }
  }

  return computeModuleWeeklyNeeds(weekStart, weekEnd, today, inputs);
}
