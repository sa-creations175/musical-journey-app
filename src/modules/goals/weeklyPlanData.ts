import { db, type Goal, type WeeklyOverride } from '../../lib/db';
import { getAttemptsInRange, getWeeklyTimeEstimate, type TimeEstimate } from '../../lib/weeklyAttempts';
import type { GoalFlowModuleId } from './goalVocabulary';
import { ORDERED_GOAL_MODULES } from './goalsByModule';

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
 * Weekly goals previously saved for the given Sunday. Exact
 * equality on `startDate` — these are the rows WeeklyPlan's
 * handleConfirm writes (always at Sunday 00:00 local). Used by:
 *   · the modal's "already confirmed" check (matches the modal's
 *     own save timestamp exactly)
 *   · WeeklyPlanBanner's Sunday auto-surface gating
 *   · the last-week review (previous-week's Sunday)
 *
 * For "does a confirmed plan exist this week from the user's
 * derived-from-monthly commitment?" — use `loadConfirmedPlanForWeek`
 * instead. That helper uses parent linkage + date-range overlap so
 * weekly goals saved partway through the week (Path B via
 * GoalCreationFlow) still count as long as they're children of an
 * active monthly goal.
 */
export async function loadWeeklyGoalsForWeek(
  weekStart: number,
): Promise<Goal[]> {
  const all = await db.goals.toArray();
  return all.filter(g => g.scope === 'weekly' && g.startDate === weekStart);
}

/**
 * Confirmed-plan detection by parent linkage. A "confirmed plan"
 * for this week is any active weekly goal that is the child of an
 * active monthly goal AND whose window overlaps with this week.
 *
 * Two saves the strict-equality `loadWeeklyGoalsForWeek` misses:
 *   · Path A — WeeklyPlan.handleConfirm: startDate = exact Sunday
 *     midnight. Caught by both queries.
 *   · Path B — GoalCreationFlow weekly create: startDate = the
 *     exact `Date.now()` of save (mid-week, mid-second). Caught
 *     only by date-range overlap.
 *
 * The parent-linkage predicate keeps standalone weekly goals (no
 * monthly parent, or parented to a yearly anchor) out of the
 * confirmed-plan summary — those are independent commitments,
 * not the derived-from-monthly plan. Mirrors the LayerSection's
 * "hide monthly-child weeklies from the explicit list" filter so
 * the two surfaces stay coherent.
 */
export async function loadConfirmedPlanForWeek(
  weekStart: number,
  weekEnd: number,
): Promise<Goal[]> {
  const all = await db.goals.toArray();
  const activeMonthlyIds = new Set(
    all
      .filter(g => g.scope === 'monthly' && g.status === 'active')
      .map(g => g.id),
  );
  return all.filter(
    g =>
      g.scope === 'weekly' &&
      g.status === 'active' &&
      g.startDate <= weekEnd &&
      g.targetDate >= weekStart &&
      g.parentGoalId !== null &&
      activeMonthlyIds.has(g.parentGoalId),
  );
}

// ---------------------------------------------------------------------
// Weekly override of consistency days
// ---------------------------------------------------------------------

/** Minimum / maximum value the weekly override may carry. The picker
 *  clamps to this range on edit; loaders defensively clamp on read so
 *  a corrupted row can't blow up the formula. */
export const WEEKLY_AVAILABLE_DAYS_MIN = 1;
export const WEEKLY_AVAILABLE_DAYS_MAX = 7;

/** Row id used by the WeeklyOverride table. The weekStart epoch ms is
 *  naturally unique per week, so we stringify it as the primary key
 *  (one row per Sunday). Keeps `put` a deterministic upsert. */
export function weeklyOverrideIdFor(weekStart: number): string {
  return String(weekStart);
}

/**
 * Active override (1–7) for the given week, or null when the user
 * hasn't adjusted this week — caller falls back to the global
 * practice-consistency goal value. Clamps a stored value to the
 * supported range so a corrupted row can't break the formula.
 */
export async function loadWeeklyAvailableDays(
  weekStart: number,
): Promise<number | null> {
  const row = await db.weeklyOverrides.get(weeklyOverrideIdFor(weekStart));
  if (!row) return null;
  return Math.min(
    WEEKLY_AVAILABLE_DAYS_MAX,
    Math.max(WEEKLY_AVAILABLE_DAYS_MIN, Math.round(row.availableDays)),
  );
}

/**
 * Upsert the user's override for `weekStart`. Clamps to 1–7 — the
 * picker already enforces this but the loader defends the formula
 * against any future caller that forgets.
 */
export async function saveWeeklyAvailableDays(
  weekStart: number,
  availableDays: number,
): Promise<void> {
  const clamped = Math.min(
    WEEKLY_AVAILABLE_DAYS_MAX,
    Math.max(WEEKLY_AVAILABLE_DAYS_MIN, Math.round(availableDays)),
  );
  const row: WeeklyOverride = {
    id: weeklyOverrideIdFor(weekStart),
    weekStart,
    availableDays: clamped,
    updatedAt: Date.now(),
  };
  await db.weeklyOverrides.put(row);
}

/** Clear the override for `weekStart` — pacing reverts to the global
 *  consistency goal value. No-op when no row exists. */
export async function clearWeeklyAvailableDays(weekStart: number): Promise<void> {
  await db.weeklyOverrides.delete(weeklyOverrideIdFor(weekStart));
}

// ---------------------------------------------------------------------
// Last week stats
// ---------------------------------------------------------------------

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
    ORDERED_GOAL_MODULES.map(async (moduleId) => {
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
