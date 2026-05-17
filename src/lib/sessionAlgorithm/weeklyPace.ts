/**
 * Phase 4 Step 4 — Weekly pace pressure (module-level).
 *
 * Different signal from `pace.ts`:
 *
 *   pace.ts             — per-coverage-goal urgency, comparing items
 *                         covered vs items expected in the goal's
 *                         start/target window. Per-item, multi-scope.
 *
 *   weeklyPace.ts (this) — per-module urgency for the current week's
 *                         attempt cadence, comparing attempts logged
 *                         this week vs the user's saved weekly attempt
 *                         target for that module. Operates at module
 *                         granularity, week-window only.
 *
 * Weekly Goal records (scope='weekly') carry `relatedModules: [m]`
 * + `targetValue: weeklyAttempts` + `startDate: weekStart` + `targetDate:
 * weekEnd`. They have `targetMetric: null` (the user-confirmed slice
 * doesn't ride the per-goal candidate-spec pipeline), so the existing
 * pace pathway can't see them — this file is the dedicated bridge.
 *
 * The factor multiplies block weight in
 * sessionGenerator.aggregateGoalCandidatesByModule, lifting items in
 * modules whose weekly cadence is lagging. The notice list surfaces
 * separately on the proposal screen — meaningfully-behind modules
 * get a yes/no nudge regardless of context filter, since the user
 * may want to override the default arc to catch up.
 *
 * Pure helpers. Caller fetches weekly Goal records + per-module
 * weekly attempt counts; this file just does math.
 */

import type { Goal } from '../db';
import {
  factorForRatio,
  daysRemaining as daysRemainingHelper,
  type PaceBand,
  bandForRatio,
} from './pace';

/**
 * Threshold for emitting a behind-pace notice (Step 4, spec §
 * "Weekly pace pressure"): a module is "meaningfully behind" when
 * its actual attempts this week are below 50% of the weekly target
 * AND more than 2 days remain in the week.
 *
 * The factor-boost band (handled by factorForRatio) uses a finer-
 * grained ladder — a module can boost slightly behind (ratio 0.85)
 * but still not earn the user-facing notice. The notice is a
 * stricter, action-implying signal.
 */
export const BEHIND_PACE_NOTICE_TARGET_FRACTION = 0.5;
export const BEHIND_PACE_NOTICE_DAYS_REMAINING_MIN = 2;

export interface BehindPaceNotice {
  /** Module the weekly goal belongs to. Matches the
   *  GoalFlowModuleId values: 'harmonic-fluency' / 'ear-training' /
   *  'shapes-and-patterns' / 'repertoire' / 'production' /
   *  'practice-consistency'. */
  moduleId: string;
  /** Attempts logged this week so far. */
  actual: number;
  /** Weekly attempt target the user confirmed. */
  target: number;
  /** Whole days remaining in the week (today counts as remaining). */
  daysRemaining: number;
}

export interface WeeklyPaceResult {
  /** Per-module pace boost. Reuses pace.ts's bandForRatio + factor
   *  ladder, so the magnitudes compose cleanly with the existing
   *  per-goal pace factors in weightForItem. */
  factorByModule: Map<string, number>;
  /** Per-module pace band — same key set as factorByModule. Exposed
   *  separately so callers can map the band to their own multiplier
   *  curve (e.g. the lean-to-goals intent in flexibleProposal.ts
   *  collapses the 5-band ladder to a 3-tier 0.6/1.0/1.5 set
   *  without needing to invert factorByModule). */
  bandByModule: Map<string, PaceBand>;
  /** Modules meeting the stricter behind-pace threshold. Surfaced as
   *  user-facing notices on the proposal screen. */
  notices: BehindPaceNotice[];
}

/**
 * Compute pace for a single weekly Goal record against an actual
 * attempt count. Pure — caller supplies the attempts number.
 *
 * Edge cases:
 *   - target <= 0           → factor 1.0, no notice (degenerate goal)
 *   - period length <= 0    → same (degenerate window)
 *   - now <= startDate      → 0 elapsed; ratio defaults to 1 (no
 *                              pressure yet); no notice
 *   - now >= targetDate     → full week elapsed; ratio = actual/target
 *
 * Returns null when the goal isn't structurally a weekly attempt
 * goal — callers should skip without applying anything.
 */
export function evaluateWeeklyGoalPace(args: {
  goal: Goal;
  actualAttempts: number;
  now: number;
}): {
  moduleId: string;
  ratio: number;
  band: PaceBand;
  factor: number;
  expected: number;
  notice: BehindPaceNotice | null;
} | null {
  const { goal, actualAttempts, now } = args;

  if (goal.scope !== 'weekly') return null;
  if (goal.status !== 'active') return null;
  const moduleId = goal.relatedModules[0];
  if (!moduleId) return null;
  const target = goal.targetValue ?? 0;
  if (target <= 0) return null;

  const periodLength = goal.targetDate - goal.startDate;
  if (periodLength <= 0) return null;

  const elapsed = Math.max(0, Math.min(now, goal.targetDate) - goal.startDate);
  const elapsedFraction = elapsed / periodLength;
  const expected = target * elapsedFraction;

  // Ratio handling — guard against the not-yet-started window.
  let ratio: number;
  if (expected === 0) {
    ratio = actualAttempts > 0 ? Number.POSITIVE_INFINITY : 1;
  } else {
    ratio = actualAttempts / expected;
  }

  const days = daysRemainingHelper(goal.targetDate, now);
  const isBehindForNotice =
    actualAttempts < BEHIND_PACE_NOTICE_TARGET_FRACTION * target &&
    days > BEHIND_PACE_NOTICE_DAYS_REMAINING_MIN;

  return {
    moduleId,
    ratio,
    band: bandForRatio(ratio),
    factor: factorForRatio(ratio),
    expected,
    notice: isBehindForNotice
      ? { moduleId, actual: actualAttempts, target, daysRemaining: days }
      : null,
  };
}

/**
 * Aggregate weekly-pace pressure across every active weekly goal.
 * Returns the per-module factor map (for block-weight multiplication)
 * + the user-facing notice list.
 *
 * Multi-goal-per-module: the MAX factor wins (matches the pace
 * pathway's per-item MAX-across-goals semantic from weighting.ts).
 * Multiple notices for the same module are deduped — the highest-
 * priority (largest deficit) survives.
 */
export function computeWeeklyPaceByModule(args: {
  weeklyGoals: ReadonlyArray<Goal>;
  /** Map from GoalFlowModuleId to actual attempts logged this week.
   *  Caller fetches via getWeeklyAttempts per module. */
  attemptsByModule: ReadonlyMap<string, number>;
  now: number;
}): WeeklyPaceResult {
  const factorByModule = new Map<string, number>();
  const bandByModule = new Map<string, PaceBand>();
  const ratioByModule = new Map<string, number>();
  const noticeByModule = new Map<string, BehindPaceNotice>();

  for (const goal of args.weeklyGoals) {
    const actualAttempts = args.attemptsByModule.get(goal.relatedModules[0] ?? '') ?? 0;
    const result = evaluateWeeklyGoalPace({ goal, actualAttempts, now: args.now });
    if (!result) continue;

    const prev = factorByModule.get(result.moduleId) ?? 1.0;
    factorByModule.set(result.moduleId, Math.max(prev, result.factor));

    // Track per-module band — driven by the WORST (lowest) ratio
    // across the module's weekly goals so a single behind goal lifts
    // the whole module out of "ahead." Mirrors the factor's
    // MAX-wins semantic at the band layer.
    const prevRatio = ratioByModule.get(result.moduleId);
    if (prevRatio === undefined || result.ratio < prevRatio) {
      ratioByModule.set(result.moduleId, result.ratio);
      bandByModule.set(result.moduleId, result.band);
    }

    if (result.notice) {
      const prevNotice = noticeByModule.get(result.moduleId);
      // Keep the notice with the larger absolute deficit (more
      // pressing). Equal deficit → keep the first one.
      const prevDeficit = prevNotice ? prevNotice.target - prevNotice.actual : -1;
      const newDeficit = result.notice.target - result.notice.actual;
      if (newDeficit > prevDeficit) noticeByModule.set(result.moduleId, result.notice);
    }
  }

  return {
    factorByModule,
    bandByModule,
    notices: Array.from(noticeByModule.values()),
  };
}
