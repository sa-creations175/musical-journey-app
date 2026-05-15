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
 * "Uncovered" definition (post-9b-follow-up):
 *   · Scope items come from `enumerateScopeForGoal` (catalog walk)
 *     UNION goal.relatedItems (explicit additions, including any
 *     Accept-extended carry-over).
 *   · An item is uncovered when its spacingState row's
 *     acquisitionStage is NOT in COVERED_STAGES, OR the item has
 *     no spacingState row yet (never touched — implicitly the
 *     "new" stage and definitionally uncovered).
 *
 *   The previous commit narrowed to spacing-state-walked items to
 *   prevent banner overload on huge scopes — but that lost real
 *   signal for small scopes ("12 keys × augmented triads, you
 *   touched 3" should surface the other 9). Banner-overload framing
 *   is a render-layer concern now; the data layer honours scope.
 */

import { db, type Goal, type SpacingState } from '../../lib/db';
import { COVERED_STAGES } from './progress';
import { effectiveScopeForGoal } from './scopeEnumeration';
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

// scopeMatcherForGoal removed in the 9b follow-up — the scope source
// of truth is now `effectiveScopeForGoal` (catalog walk + relatedItems
// union). Callers no longer need a per-row predicate because they
// enumerate the scope ID set directly.

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

/** Uncovered scope items for a single monthly goal. Walks the goal's
 *  effective scope (catalog ∪ relatedItems) and drops any itemRef
 *  whose spacingState row is already in COVERED_STAGES. Items with
 *  no row are untouched — implicitly "new" stage, so uncovered. */
function uncoveredForGoal(
  goal: Goal,
  rowByItemRef: ReadonlyMap<string, SpacingState>,
): string[] {
  const scope = effectiveScopeForGoal(goal);
  if (scope.length === 0) return [];
  const out: string[] = [];
  for (const itemRef of scope) {
    const row = rowByItemRef.get(itemRef);
    if (row && COVERED_STAGES.has(row.acquisitionStage)) continue;
    out.push(itemRef);
  }
  return out;
}

/** Build a `Map<itemRef, SpacingState>` over the rows once, reused
 *  across every goal in the carryover walk. O(rows) one-time cost
 *  beats O(scope × rows) per goal. */
function indexSpacingRows(
  rows: ReadonlyArray<SpacingState>,
): Map<string, SpacingState> {
  const out = new Map<string, SpacingState>();
  for (const r of rows) out.set(r.itemRef, r);
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
  const currentBounds = monthBoundary(today);
  const [allGoals, spacingRows] = await Promise.all([
    db.goals.toArray(),
    db.spacingState.toArray(),
  ]);
  const rowByItemRef = indexSpacingRows(spacingRows);
  const lastByModule = lastConfiguredMonthlyPerModule(
    allGoals, bounds, moduleIdFilter,
  );

  // Phase B Step 9b follow-up — exclude items the user has ALREADY
  // pulled into this month's scope (Accept's effect). Detection
  // naturally hides resolved modules without needing a localStorage
  // decision marker.
  const currentMonthScope = currentMonthScopeItems(
    allGoals, currentBounds, moduleIdFilter,
  );

  const out: ModuleUncoveredEntry[] = [];
  for (const [modId, goal] of lastByModule) {
    const uncovered = uncoveredForGoal(goal, rowByItemRef);
    const inScopeThisMonth = currentMonthScope.get(modId) ?? new Set();
    const leftover = uncovered.filter(ref => !inScopeThisMonth.has(ref));
    if (leftover.length === 0) continue;
    out.push({
      moduleId: modId,
      uncoveredItemRefs: leftover,
      monthlyGoalId: goal.id,
    });
  }
  return out;
}

/** Per-module set of itemRefs in scope for the user's current-month
 *  monthly goal(s). The latest-configured monthly per module
 *  defines the scope; multiple monthlies per module union their
 *  scopes (multi-goal-per-module is rare but supported elsewhere). */
function currentMonthScopeItems(
  allGoals: ReadonlyArray<Goal>,
  bounds: MonthBoundary,
  moduleIdFilter: GoalFlowModuleId | undefined,
): Map<GoalFlowModuleId, Set<string>> {
  const out = new Map<GoalFlowModuleId, Set<string>>();
  for (const g of allGoals) {
    if (g.scope !== 'monthly') continue;
    if (g.isUmbrella) continue;
    if (!g.targetMetric) continue;
    if (!overlapsBoundary(g, bounds)) continue;
    const modId = moduleForMetric(g.targetMetric);
    if (!modId) continue;
    if (moduleIdFilter && modId !== moduleIdFilter) continue;
    const scope = effectiveScopeForGoal(g);
    if (scope.length === 0) continue;
    const set = out.get(modId) ?? new Set<string>();
    for (const ref of scope) set.add(ref);
    out.set(modId, set);
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
  const rowByItemRef = indexSpacingRows(spacingRows);

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

  // Items in the CURRENT month's effective scope — excluded from
  // the backlog so we don't double-count items the user is actively
  // working on (whether part of the metric scope or pulled in via
  // an Accept-extended relatedItems list).
  const currentScopeByModule = currentMonthScopeItems(
    allGoals, currentBounds, moduleIdFilter,
  );
  const currentScopeRefs = new Set<string>();
  for (const set of currentScopeByModule.values()) {
    for (const ref of set) currentScopeRefs.add(ref);
  }

  // Accumulate per module, dedupe across periods, drop currently-scoped.
  const accumByModule = new Map<
    GoalFlowModuleId,
    { itemRefs: Set<string>; latestGoalId: string; latestStamp: number }
  >();
  for (const goal of latestByPeriod.values()) {
    const modId = moduleForMetric(goal.targetMetric!);
    if (!modId) continue;
    const uncovered = uncoveredForGoal(goal, rowByItemRef);
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
