/**
 * Phase B Step 9b — cross-month carryover.
 *
 * Two pure / async layers:
 *
 *   getUncoveredItemsFromLastMonth(today, moduleId?)
 *     — items in the LAST configured monthly goal for last calendar
 *       month that didn't reach acquired/consolidated/mastered by
 *       month end. Drives the Goals-home carry-over banner.
 *
 *   getCarryoverBacklog(today, moduleId?)
 *     — the running list of uncovered items from EVERY past monthly
 *       in the user's history that's still un-covered. Persists
 *       until items reach COVERED_STAGES; declining a carry-over
 *       doesn't drop items. Pure derivation from goal history +
 *       spacingState — no separate persistence table needed (see
 *       module comment below).
 *
 * Persistence note: backlog derivation walks past monthlies (~6–12
 * for an active user) + their scope matchers against spacingState
 * rows that already exist for engaged items. Bounded cost; the
 * marginal value of a dedicated Dexie table doesn't justify the
 * migration + sync surface. If backlog ever grows large enough to
 * make the derivation costly, the helper signature stays the same —
 * we'd just memoize the walk behind it.
 *
 * "Uncovered" definition follows the design-doc spec:
 *   · An item is in scope when the goal's matcher accepts its
 *     itemRef AND its spacingState moduleRef.
 *   · An item is uncovered when its current spacingState
 *     acquisitionStage is NOT in COVERED_STAGES — practically, when
 *     the user touched it (so we have a spacingState row) but didn't
 *     drive it to acquired+. Untouched-in-scope items don't appear
 *     in the count: they're future work, not "leftover from last
 *     month." This is a pragmatic departure from the strict "every
 *     scope item, touched or not" reading the design doc considers —
 *     surfacing thousands of untouched scope items would overwhelm
 *     the banner, and "items I started but didn't finish" is the
 *     useful signal for the carry-over UX.
 */

import { db, type Goal, type SpacingState } from '../../lib/db';
import {
  COVERAGE_OVERALL_METRIC,
  COVERAGE_SPECIFIC_METRIC,
  isCoverageOverallMetric,
  isCoverageSpecificMetric,
} from './coverageMetrics';
import {
  COVERED_STAGES,
  ET_MODULE_REFS,
  HF_GROUP_CATEGORIES,
  HF_MODULE_REF,
  PRODUCTION_MODULE_REF,
  SHAPES_MODULE_REF,
} from './progress';
import { cardById } from '../harmonic-fluency/catalog';
import { itemRefMatcherForCoverageGroup } from './shapesCoverageGroups';
import { lessonsByPath } from '../production/content/lessons';
import { moduleForMetric, type GoalFlowModuleId } from './goalVocabulary';

// =====================================================================
// Public types
// =====================================================================

export interface ModuleUncoveredEntry {
  moduleId: GoalFlowModuleId;
  /** Item refs in the goal's scope that didn't reach
   *  acquired/consolidated/mastered. May be empty (skipped from the
   *  result). */
  uncoveredItemRefs: string[];
  /** The source monthly goal record id. For 'last month' this is
   *  the LAST configured monthly target for that module/period. For
   *  backlog entries with multiple historical monthlies per module,
   *  the most-recent goal's id is surfaced. */
  monthlyGoalId: string;
}

// =====================================================================
// Month boundary helpers
// =====================================================================

export interface MonthBoundary {
  /** First ms of the first day of the month, local time. */
  start: number;
  /** Last ms (23:59:59.999) of the last day of the month, local. */
  end: number;
}

/** Boundary of the calendar month containing `at`. */
export function monthBoundary(at: number): MonthBoundary {
  const d = new Date(at);
  const start = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0).getTime();
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
  return { start, end };
}

/** Boundary of the calendar month immediately before `today`'s month. */
export function lastMonthBoundary(today: number): MonthBoundary {
  const d = new Date(today);
  const lastMonthAnchor = new Date(d.getFullYear(), d.getMonth() - 1, 15, 12, 0, 0, 0);
  return monthBoundary(lastMonthAnchor.getTime());
}

// =====================================================================
// Scope predicate per goal — uses existing per-metric infrastructure
// =====================================================================

/** Returns a predicate `(row) → boolean` matching a spacingState row
 *  to a goal's scope. null when the goal's metric has no enumerable
 *  item scope (consistency, accuracy, song goals — those don't
 *  produce carry-over because they don't gate items). */
function scopeMatcherForGoal(
  goal: Goal,
): ((row: SpacingState) => boolean) | null {
  const metric = goal.targetMetric;
  if (!metric) return null;

  // Coverage-overall metrics: entire module is in scope.
  if (isCoverageOverallMetric(metric)) {
    if (metric === COVERAGE_OVERALL_METRIC.HARMONIC_FLUENCY) {
      return row => row.moduleRef === HF_MODULE_REF;
    }
    if (metric === COVERAGE_OVERALL_METRIC.EAR_TRAINING) {
      return row => ET_MODULE_REFS.includes(row.moduleRef);
    }
    if (metric === COVERAGE_OVERALL_METRIC.SHAPES) {
      return row => row.moduleRef === SHAPES_MODULE_REF;
    }
    if (metric === COVERAGE_OVERALL_METRIC.PRODUCTION) {
      return row => row.moduleRef === PRODUCTION_MODULE_REF;
    }
  }

  // Coverage-specific metrics: sub-area drives the matcher.
  if (isCoverageSpecificMetric(metric)) {
    const subArea = goal.targetUnit ?? null;
    if (!subArea) return null;

    if (metric === COVERAGE_SPECIFIC_METRIC.HARMONIC_FLUENCY) {
      const categories = HF_GROUP_CATEGORIES[subArea];
      if (!categories) return null;
      const set = new Set(categories);
      return row => {
        if (row.moduleRef !== HF_MODULE_REF) return false;
        const card = cardById(row.itemRef);
        return !!card && set.has(card.category);
      };
    }
    if (metric === COVERAGE_SPECIFIC_METRIC.EAR_TRAINING) {
      if (!ET_MODULE_REFS.includes(subArea)) return null;
      return row => row.moduleRef === subArea;
    }
    if (metric === COVERAGE_SPECIFIC_METRIC.SHAPES) {
      const matcher = itemRefMatcherForCoverageGroup(subArea);
      if (!matcher) return null;
      return row => row.moduleRef === SHAPES_MODULE_REF && matcher(row.itemRef);
    }
    if (metric === COVERAGE_SPECIFIC_METRIC.PRODUCTION) {
      const lessons = new Set(lessonsByPath(subArea).map(l => l.id));
      if (lessons.size === 0) return null;
      return row => row.moduleRef === PRODUCTION_MODULE_REF
        && lessons.has(row.itemRef);
    }
  }

  return null;
}

// =====================================================================
// Goal history walks
// =====================================================================

/** True when the monthly's `[startDate, targetDate]` window overlaps
 *  the boundary's `[start, end]`. Picks up "active during last
 *  month" even if a goal extended across multiple months. */
function overlapsBoundary(g: Goal, b: MonthBoundary): boolean {
  return g.startDate <= b.end && g.targetDate >= b.start;
}

/** Per-module LAST configured monthly goal whose window overlaps
 *  `bounds`. Mid-month-change rule: the goal with the largest
 *  `startDate` wins — when the user changes a monthly target
 *  mid-month, the new record is written with a later startDate, so
 *  the abandoned earlier record's scope drops out of the carry-over
 *  calculation. Status doesn't filter: even an abandoned goal can
 *  win if it's the most recent commitment for its period (the
 *  status flips when the user RE-targets, but only the LATEST
 *  re-target is the "leftover" by design). */
function lastConfiguredMonthlyPerModule(
  monthlies: ReadonlyArray<Goal>,
  bounds: MonthBoundary,
  moduleIdFilter: GoalFlowModuleId | undefined,
): Map<GoalFlowModuleId, Goal> {
  const out = new Map<GoalFlowModuleId, Goal>();
  for (const g of monthlies) {
    if (g.scope !== 'monthly') continue;
    if (g.isUmbrella) continue;
    if (!g.targetMetric) continue;
    if (!overlapsBoundary(g, bounds)) continue;
    const modId = moduleForMetric(g.targetMetric);
    if (!modId) continue;
    if (moduleIdFilter && modId !== moduleIdFilter) continue;
    const prev = out.get(modId);
    if (!prev) {
      out.set(modId, g);
      continue;
    }
    // Latest-configured wins. Tie-break on createdAt for stability.
    if (g.startDate > prev.startDate) out.set(modId, g);
  }
  return out;
}

/** Uncovered scope items for a single monthly goal — `spacingRows`
 *  pre-loaded so callers walking many goals don't refetch. */
function uncoveredForGoal(
  goal: Goal,
  spacingRows: ReadonlyArray<SpacingState>,
): string[] {
  const matcher = scopeMatcherForGoal(goal);
  if (!matcher) return [];
  const out: string[] = [];
  for (const row of spacingRows) {
    if (!matcher(row)) continue;
    if (COVERED_STAGES.has(row.acquisitionStage)) continue;
    out.push(row.itemRef);
  }
  return out;
}

// =====================================================================
// Part A — public detection helpers
// =====================================================================

/**
 * Items in last month's LAST configured monthly target per module
 * that didn't reach acquired+ by month end. `moduleId` narrows to a
 * single module; omit to scan all of them. Modules with zero
 * uncovered items are dropped from the result.
 */
export async function getUncoveredItemsFromLastMonth(
  today: number = Date.now(),
  moduleIdFilter?: GoalFlowModuleId,
): Promise<ModuleUncoveredEntry[]> {
  const bounds = lastMonthBoundary(today);
  const [allGoals, spacingRows] = await Promise.all([
    db.goals.toArray(),
    db.spacingState.toArray(),
  ]);
  const lastByModule = lastConfiguredMonthlyPerModule(
    allGoals, bounds, moduleIdFilter,
  );
  const out: ModuleUncoveredEntry[] = [];
  for (const [modId, goal] of lastByModule) {
    const uncovered = uncoveredForGoal(goal, spacingRows);
    if (uncovered.length === 0) continue;
    out.push({
      moduleId: modId,
      uncoveredItemRefs: uncovered,
      monthlyGoalId: goal.id,
    });
  }
  return out;
}

/**
 * Running carryover backlog — items from ANY past monthly goal that
 * are still uncovered. Walks every past monthly the user configured
 * (per-module, latest-per-period wins via the same mid-month-change
 * rule) and unions their uncovered scope.
 *
 * Excludes:
 *   · Items in the CURRENT month's last-configured monthly scope —
 *     those are already in active scope, not carryover.
 *   · Items that have reached COVERED_STAGES since the goal closed —
 *     the backlog "clears" naturally as items get covered.
 *
 * No persistence: pure derivation from db.goals + db.spacingState.
 * Bounded by the number of past monthlies + spacingState rows.
 */
export async function getCarryoverBacklog(
  today: number = Date.now(),
  moduleIdFilter?: GoalFlowModuleId,
): Promise<ModuleUncoveredEntry[]> {
  const currentBounds = monthBoundary(today);
  const [allGoals, spacingRows] = await Promise.all([
    db.goals.toArray(),
    db.spacingState.toArray(),
  ]);

  // Walk EVERY past monthly, grouping by (moduleId × the month it
  // closed in), and pick the latest-configured per group — same
  // mid-month-change rule applied to every past period.
  const latestByPeriod = new Map<string, Goal>(); // key = `${moduleId}|${YYYY-MM}`
  for (const g of allGoals) {
    if (g.scope !== 'monthly') continue;
    if (g.isUmbrella) continue;
    if (!g.targetMetric) continue;
    // A goal that closed at or after this month's start is "current,"
    // not "past." Skip — its uncovered items belong to current scope,
    // not the backlog.
    if (g.targetDate >= currentBounds.start) continue;
    const modId = moduleForMetric(g.targetMetric);
    if (!modId) continue;
    if (moduleIdFilter && modId !== moduleIdFilter) continue;
    // Bucket by the calendar month the goal CLOSED in (its
    // targetDate). Mid-month-change rule then picks latest-configured
    // within that bucket.
    const close = new Date(g.targetDate);
    const key = `${modId}|${close.getFullYear()}-${String(close.getMonth() + 1).padStart(2, '0')}`;
    const prev = latestByPeriod.get(key);
    if (!prev) {
      latestByPeriod.set(key, g);
      continue;
    }
    if (g.startDate > prev.startDate) latestByPeriod.set(key, g);
  }

  // Items in the CURRENT month's scope — excluded from the backlog
  // so we don't double-count items the user is actively working on.
  const currentLastByModule = lastConfiguredMonthlyPerModule(
    allGoals, currentBounds, moduleIdFilter,
  );
  const currentScopeRefs = new Set<string>();
  for (const [, goal] of currentLastByModule) {
    for (const ref of uncoveredForGoal(goal, spacingRows)) {
      currentScopeRefs.add(ref);
    }
  }

  // Accumulate per module, dedupe across periods, drop currently-scoped.
  const accumByModule = new Map<
    GoalFlowModuleId,
    { itemRefs: Set<string>; latestGoalId: string; latestStamp: number }
  >();
  for (const goal of latestByPeriod.values()) {
    const modId = moduleForMetric(goal.targetMetric!);
    if (!modId) continue;
    const uncovered = uncoveredForGoal(goal, spacingRows);
    if (uncovered.length === 0) continue;
    const entry = accumByModule.get(modId) ?? {
      itemRefs: new Set<string>(),
      latestGoalId: goal.id,
      latestStamp: goal.startDate,
    };
    for (const ref of uncovered) {
      if (currentScopeRefs.has(ref)) continue;
      entry.itemRefs.add(ref);
    }
    if (goal.startDate > entry.latestStamp) {
      entry.latestGoalId = goal.id;
      entry.latestStamp = goal.startDate;
    }
    accumByModule.set(modId, entry);
  }

  const out: ModuleUncoveredEntry[] = [];
  for (const [modId, entry] of accumByModule) {
    if (entry.itemRefs.size === 0) continue;
    out.push({
      moduleId: modId,
      uncoveredItemRefs: [...entry.itemRefs],
      monthlyGoalId: entry.latestGoalId,
    });
  }
  return out;
}

/**
 * Flat set of all backlog itemRefs across modules — convenient for
 * the candidate-pool weighting layer (Part D), which only cares
 * whether an item is "in some past goal but currently uncovered" so
 * it can lift the item's pace factor.
 */
export async function getCarryoverBacklogItemRefs(
  today: number = Date.now(),
): Promise<Set<string>> {
  const out = new Set<string>();
  for (const entry of await getCarryoverBacklog(today)) {
    for (const ref of entry.uncoveredItemRefs) out.add(ref);
  }
  return out;
}
