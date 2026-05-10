import { db, type Goal } from '../../lib/db';
import { getAttemptsInRange, getWeeklyTimeEstimate, type TimeEstimate } from '../../lib/weeklyAttempts';
import type { GoalFlowModuleId } from './goalVocabulary';

/**
 * Phase 4 Step 3 — data loaders for the WeeklyPlan screen.
 *
 * Three concerns:
 *
 *   1. Week boundary math — Sunday 00:00:00 local → Saturday
 *      23:59:59.999 local. The weekly-cycle convention from the
 *      Phase 4 design (Sun=deepest day, Mon-Fri=Standard, Sat=Deep
 *      flex) anchors on Sunday as week-start, which differs from
 *      `scopeMeta.endOfWeek` (Sunday-as-end). New helpers here so
 *      the existing Sunday-as-end semantics stay untouched for
 *      pre-existing weekly goal flows.
 *
 *   2. Active monthly goal selection — every monthly goal whose
 *      window covers the target Sunday and whose status is 'active'.
 *      Excludes umbrellas (the derivation walks children directly
 *      via per-record metric translation).
 *
 *   3. Last week stats — actual attempts + time per module against
 *      saved weekly targets (if any). Empty state is "no data yet"
 *      when no weekly goals existed AND no attempts were logged.
 */

// ---------------------------------------------------------------------
// Week boundaries
// ---------------------------------------------------------------------

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Sunday 00:00:00.000 local for the week containing `now`. */
export function startOfWeekLocal(now: number = Date.now()): number {
  const d = new Date(now);
  const dow = d.getDay(); // 0 = Sunday
  d.setDate(d.getDate() - dow);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Saturday 23:59:59.999 local for the same week as `weekStart`. */
export function endOfWeekLocal(weekStart: number): number {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/** True when `now` (epoch ms, local-interpreted) is a Sunday. Used
 *  by the auto-surface banner — Sunday is the planning day. */
export function isSundayLocal(now: number = Date.now()): boolean {
  return new Date(now).getDay() === 0;
}

/** Last week's Sunday 00:00 local, derived from this week's Sunday. */
export function previousWeekStart(weekStart: number): number {
  return weekStart - 7 * ONE_DAY_MS;
}

// ---------------------------------------------------------------------
// Goal queries
// ---------------------------------------------------------------------

/**
 * Active monthly goals whose window overlaps with this week.
 * Excludes umbrellas — the umbrella's children carry the
 * per-metric data the derivation needs.
 *
 * Overlap (not "covers weekStart") is the right semantic because
 * a goal saved partway through a week (e.g. on Saturday) has
 * `startDate > weekStart` but is still active for the remainder
 * of the week. `deriveWeeklyGoals` handles that mid-week-creation
 * case via proration; this query just has to let those goals
 * through.
 */
export async function loadActiveMonthlyGoals(
  weekStart: number,
): Promise<Goal[]> {
  const weekEnd = endOfWeekLocal(weekStart);
  const all = await db.goals.toArray();
  return all.filter(
    g =>
      g.scope === 'monthly' &&
      g.status === 'active' &&
      !g.isUmbrella &&
      g.startDate <= weekEnd &&
      g.targetDate >= weekStart,
  );
}

/**
 * Weekly goals previously saved for the given Sunday. Used both
 * by the "already confirmed for this week" check and by the
 * last-week review (compare actual vs target).
 */
export async function loadWeeklyGoalsForWeek(
  weekStart: number,
): Promise<Goal[]> {
  const all = await db.goals.toArray();
  return all.filter(g => g.scope === 'weekly' && g.startDate === weekStart);
}

// ---------------------------------------------------------------------
// Last week stats
// ---------------------------------------------------------------------

const ALL_MODULES: ReadonlyArray<GoalFlowModuleId> = [
  'harmonic-fluency',
  'ear-training',
  'shapes-and-patterns',
  'repertoire',
  'production',
  'practice-consistency',
];

export interface ModuleWeekStat {
  moduleId: GoalFlowModuleId;
  /** Attempts logged in last week's window. 0 when nothing happened. */
  attempts: number;
  /** Time estimate from the attempt count — point or range. */
  time: TimeEstimate;
  /** Saved weekly goal target for this module last week, if any. */
  targetValue: number | null;
  /** Saved targetUnit for the saved weekly goal, if any. */
  targetUnit: string | null;
}

export interface LastWeekReview {
  weekStart: number;
  weekEnd: number;
  /** True when the user had no weekly goals AND no attempts —
   *  the "first use" empty state. */
  isEmpty: boolean;
  /** Per-module stats; one row per known module regardless of
   *  whether a target existed. */
  byModule: ModuleWeekStat[];
}

/**
 * Aggregate last week's actuals + saved targets per module. Pure
 * read — no writes, no side effects.
 */
export async function loadLastWeekReview(
  thisWeekStart: number,
): Promise<LastWeekReview> {
  const lastWeekStart = previousWeekStart(thisWeekStart);
  const lastWeekEnd = endOfWeekLocal(lastWeekStart);

  const lastWeekGoals = await loadWeeklyGoalsForWeek(lastWeekStart);

  const byModule: ModuleWeekStat[] = await Promise.all(
    ALL_MODULES.map(async (moduleId) => {
      const attempts = await getAttemptsInRange(
        moduleId,
        lastWeekStart,
        lastWeekEnd,
      );
      const time = getWeeklyTimeEstimate(moduleId, attempts);

      // Find a saved weekly goal whose relatedModules / metric
      // routes to this module. Use moduleForMetric so song /
      // production-hours goals route correctly.
      const matchingGoal = lastWeekGoals.find(g => {
        if (g.relatedModules.includes(moduleId)) return true;
        return false;
      });

      return {
        moduleId,
        attempts,
        time,
        targetValue: matchingGoal?.targetValue ?? null,
        targetUnit: matchingGoal?.targetUnit ?? null,
      };
    }),
  );

  const totalAttempts = byModule.reduce((sum, m) => sum + m.attempts, 0);
  const isEmpty = lastWeekGoals.length === 0 && totalAttempts === 0;

  return { weekStart: lastWeekStart, weekEnd: lastWeekEnd, isEmpty, byModule };
}

// ---------------------------------------------------------------------
// Pace classification (per-module, this is for last-week's review)
// ---------------------------------------------------------------------

export type PaceStatus = 'no-target' | 'ahead' | 'on-track' | 'behind';

/**
 * Classify a module's last-week performance against its saved
 * weekly target. "On track" = within 80% of target. "Behind" <80%.
 * "Ahead" > 110%. Honest, no inflation.
 */
export function classifyPace(stat: ModuleWeekStat): PaceStatus {
  if (stat.targetValue == null || stat.targetValue <= 0) return 'no-target';
  const ratio = stat.attempts / stat.targetValue;
  if (ratio >= 1.1) return 'ahead';
  if (ratio >= 0.8) return 'on-track';
  return 'behind';
}

// ---------------------------------------------------------------------
// Banner dismissal — localStorage-backed
// ---------------------------------------------------------------------

const BANNER_DISMISS_KEY = 'phase4.weeklyPlanBanner.dismissed';

/**
 * Banner is dismissed for `weekStart` when the user has clicked the
 * X. Stored as the weekStart epoch ms so each week resets the flag
 * — Sunday surfaces the banner again automatically.
 */
export function isBannerDismissedForWeek(weekStart: number): boolean {
  try {
    const raw = localStorage.getItem(BANNER_DISMISS_KEY);
    if (!raw) return false;
    return Number(raw) === weekStart;
  } catch {
    return false;
  }
}

export function dismissBannerForWeek(weekStart: number): void {
  try {
    localStorage.setItem(BANNER_DISMISS_KEY, String(weekStart));
  } catch {
    // localStorage unavailable — banner just keeps showing this
    // session. Acceptable degraded state.
  }
}
