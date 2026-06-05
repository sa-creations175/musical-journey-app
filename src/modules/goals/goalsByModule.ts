import type { Goal, GoalScope } from '../../lib/db';
import { MODULE_ORDER } from '../../lib/moduleMeta';
import { moduleForMetric, type GoalFlowModuleId } from './goalVocabulary';
import { findChildren, umbrellaModuleId } from './umbrellaSummary';

/**
 * Phase 2 step 6e — module grouping for the by-timeframe view.
 *
 * Within each scope layer (this week, this month, …), goals
 * cluster under module subheaders so the user sees "all my ET
 * weekly goals" / "all my Songs weekly goals" at a glance. This
 * helper produces the ordered grouping; LayerSection renders.
 *
 * Order:
 *   1. Modules from MODULE_ORDER, in nav order (Harmonic Fluency,
 *      Ear Training, Shapes & Patterns, Song Repertoire,
 *      Production). Skip MODULE_ORDER entries that aren't valid
 *      goal-flow modules (e.g. 'practice-sessions').
 *   2. Practice consistency at the end — it's a meta-habit, not
 *      a learning module, so it sits outside MODULE_ORDER but
 *      still needs a subheader slot when consistency goals exist.
 *   3. Null bucket last — cross-module umbrellas, aspirational
 *      free-text goals, malformed records. Caller decides whether
 *      to render a subheader for null (current behavior: skip).
 *
 * Module derivation per goal:
 *   - Standalone goal → moduleForMetric(targetMetric)
 *   - Umbrella goal   → umbrellaModuleId(its same-scope children)
 *
 * Cross-module umbrellas (children span 2+ modules) collapse to
 * null and render in the trailing no-module bucket alongside
 * truly module-less goals.
 */

export interface ModuleGroup {
  /** null = no derivable module (cross-module umbrella, free-
   *  text aspirational goal, malformed record). */
  moduleId: GoalFlowModuleId | null;
  goals: Goal[];
}

/** Goal-flow modules that aren't in MODULE_ORDER but still need
 *  a subheader slot. Appended after MODULE_ORDER's goal subset. */
const TAIL_GOAL_MODULES: GoalFlowModuleId[] = ['practice-consistency'];

/** All known goal-flow module ids — used to filter MODULE_ORDER
 *  down to entries that goals actually target. */
const GOAL_FLOW_MODULE_IDS: ReadonlySet<GoalFlowModuleId> = new Set([
  'ear-training',
  'harmonic-fluency',
  'repertoire',
  'shapes-and-patterns',
  'production',
  'practice-consistency',
]);

/**
 * Canonical iteration order for the by-module view: MODULE_ORDER
 * filtered to goal-flow modules, then practice-consistency at
 * the end. Stable across the app so subheaders + module
 * sections stay in sync.
 */
export const ORDERED_GOAL_MODULES: ReadonlyArray<GoalFlowModuleId> = [
  ...MODULE_ORDER
    .filter(m => GOAL_FLOW_MODULE_IDS.has(m.id as GoalFlowModuleId))
    .map(m => m.id as GoalFlowModuleId),
  ...TAIL_GOAL_MODULES,
];

/** Scopes that participate in the by-module current-period
 *  filter. 2-3 year and lifetime are open-text reflections;
 *  they don't fit the "current week / month / year" model and
 *  live in the by-timeframe view's aspirational layers instead. */
const MEASURABLE_SCOPES: ReadonlySet<GoalScope> = new Set([
  'weekly',
  'monthly',
  'quarterly',
  'yearly',
]);

/**
 * Predicate for the by-module view's current-period + 7-day
 * lookahead filter.
 *
 * A goal qualifies when:
 *   - its scope is measurable (weekly / monthly / quarterly /
 *     yearly) — aspirational scopes are out of scope here
 *   - its targetDate is still in the future
 *   - its startDate is at most `lookaheadDays` from today (so we
 *     surface goals starting next week alongside current ones,
 *     but nothing beyond that window)
 *
 * Past goals (targetDate already elapsed) live in Practice
 * History (Phase 7), not in the active home view.
 *
 * `lookaheadDays` defaults to 7 per spec; tunable parameter for
 * later calibration.
 */
export function isCurrentOrUpcoming(
  goal: Goal,
  today: Date,
  lookaheadDays = 7,
): boolean {
  if (!MEASURABLE_SCOPES.has(goal.scope)) return false;
  const cutoff = today.getTime() + lookaheadDays * 86_400_000;
  return goal.startDate <= cutoff && goal.targetDate > today.getTime();
}

/**
 * Group `topLevel` goals by their module, preserving nav order
 * (then practice-consistency, then a trailing null bucket).
 *
 * `allGoals` is needed because umbrella → module derivation walks
 * the umbrella's children. Pass the same scope-filtered list both
 * times when grouping inside a single timeframe layer.
 */
export function groupByModule(
  topLevel: ReadonlyArray<Goal>,
  allGoals: ReadonlyArray<Goal>,
): ModuleGroup[] {
  const buckets = new Map<GoalFlowModuleId | null, Goal[]>();
  for (const g of topLevel) {
    const id = goalModuleId(g, allGoals);
    const arr = buckets.get(id) ?? [];
    arr.push(g);
    buckets.set(id, arr);
  }

  const result: ModuleGroup[] = [];

  // 1. MODULE_ORDER entries that are real goal-flow modules
  for (const meta of MODULE_ORDER) {
    if (!GOAL_FLOW_MODULE_IDS.has(meta.id as GoalFlowModuleId)) continue;
    const id = meta.id as GoalFlowModuleId;
    const goals = buckets.get(id);
    if (goals && goals.length > 0) {
      result.push({ moduleId: id, goals });
    }
  }

  // 2. Tail (practice-consistency)
  for (const id of TAIL_GOAL_MODULES) {
    const goals = buckets.get(id);
    if (goals && goals.length > 0) {
      result.push({ moduleId: id, goals });
    }
  }

  // 3. Null bucket last
  const nullGoals = buckets.get(null);
  if (nullGoals && nullGoals.length > 0) {
    result.push({ moduleId: null, goals: nullGoals });
  }

  return result;
}

/**
 * Canonical module assignment for a single goal — the SAME mapping the
 * by-module view uses. Umbrella → derived from its children's metrics;
 * standalone → moduleForMetric(targetMetric). Returns null for
 * cross-module umbrellas and goals with no derivable module.
 *
 * NOTE: this is metric/umbrella-based, NOT relatedModules-based. Some
 * goals carry empty relatedModules (e.g. practice-consistency), so any
 * "which module is this goal" check must go through here to stay
 * consistent with the rest of the app.
 */
export function goalModuleId(
  goal: Goal,
  allGoals: ReadonlyArray<Goal>,
): GoalFlowModuleId | null {
  if (goal.isUmbrella) {
    const children = findChildren(goal, allGoals);
    return umbrellaModuleId(children);
  }
  return moduleForMetric(goal.targetMetric);
}
