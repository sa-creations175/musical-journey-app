import type { Goal } from '../../lib/db';
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

function goalModuleId(
  goal: Goal,
  allGoals: ReadonlyArray<Goal>,
): GoalFlowModuleId | null {
  if (goal.isUmbrella) {
    const children = findChildren(goal, allGoals);
    return umbrellaModuleId(children);
  }
  return moduleForMetric(goal.targetMetric);
}
