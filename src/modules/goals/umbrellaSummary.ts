import type { Goal } from '../../lib/db';
import { isCoverageMetric } from './coverageMetrics';
import { isMasteryMetric } from './yearlyAnchorMetrics';
import { moduleForMetric, type GoalFlowModuleId } from './goalVocabulary';

/**
 * Phase 2 step 6c.1 — helpers for the umbrella goal row.
 *
 * Three concerns:
 *
 *   1. `dimensionForGoal` — classify a child goal by which
 *      dimension of the yearly-anchor framework it answers
 *      (Breadth / Mastery / Depth / Consistency). Drives the
 *      umbrella row's subtitle ("Breadth · Mastery · Depth ·
 *      Consistency").
 *
 *   2. `findChildren` — given an umbrella + the full active
 *      goal list, return its same-scope children. By-timeframe
 *      view nests these under the umbrella; by-module view
 *      (6f) will use a cross-scope variant.
 *
 *   3. `umbrellaModuleId` — given an umbrella's children, return
 *      the single shared module if all children agree, or null
 *      when children span multiple modules. Drives the umbrella
 *      row's chart routing (single-module → real chart;
 *      cross-module → "not available" message).
 *
 * Songs are a special case: `song_whole_at_level` is reused
 * across breadth / depth / mastery dimensions, distinguished by
 * `targetUnit` ('comfortable' / 'solid' / 'internalized'). The
 * dimension classifier reads the unit on song goals.
 */

export type GoalDimension = 'Breadth' | 'Mastery' | 'Depth' | 'Consistency';

/**
 * Display-time mapping from canonical dimension to user-facing
 * label. Pure substitution — never touches stored data.
 *
 * "Depth" is too abstract above an accuracy-or-proficiency goal,
 * so it gets renamed by module:
 *   - card modules (ET, HF) → "Accuracy"
 *   - time / proficiency modules (Songs, Shapes, Production) → "Proficiency"
 *   - unknown / practice-consistency / cross-module → "Proficiency"
 *     (defensive default; Depth shouldn't surface there in practice)
 *
 * Other dimensions display their canonical label unchanged.
 */
export function dimensionDisplayLabel(
  dimension: GoalDimension,
  moduleId: GoalFlowModuleId | null,
): string {
  if (dimension !== 'Depth') return dimension;
  if (moduleId === 'ear-training' || moduleId === 'harmonic-fluency') {
    return 'Accuracy';
  }
  return 'Proficiency';
}

/**
 * Classify a goal by dimension. Returns null for goals that
 * don't fit the four-dimension framework (most non-yearly-anchor
 * goals — they're standalone targets, not framework slots).
 */
export function dimensionForGoal(goal: Goal): GoalDimension | null {
  const metric = goal.targetMetric;
  if (!metric) return null;

  if (isCoverageMetric(metric)) return 'Breadth';
  if (isMasteryMetric(metric)) return 'Mastery';
  if (metric.includes('_accuracy_')) return 'Depth';
  if (metric.includes('_sessions_per_') || metric.startsWith('practice_')) {
    return 'Consistency';
  }

  // Songs: same metric for breadth/depth/mastery, differentiated
  // by targetUnit. See yearlyAnchorMetrics.ts header note.
  if (metric === 'song_whole_at_level') {
    if (goal.targetUnit === 'comfortable') return 'Breadth';
    if (goal.targetUnit === 'solid') return 'Depth';
    if (goal.targetUnit === 'internalized') return 'Mastery';
  }

  return null;
}

/**
 * Build the umbrella subtitle from its children's dimensions.
 *
 * Each dimension appears at most once, in the order it first
 * appears as we walk the children list — the user sees the
 * subtitle in the same order their children render below.
 *
 * Display labels go through `dimensionDisplayLabel` so the
 * subtitle stays in sync with the per-child labels (e.g. ET
 * children show "Accuracy", subtitle says "Accuracy" too — not
 * "Depth").
 *
 * Returns null when no child has a classifiable dimension.
 */
export function umbrellaSubtitle(children: ReadonlyArray<Goal>): string | null {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const c of children) {
    const dim = dimensionForGoal(c);
    if (!dim) continue;
    const moduleId = moduleForMetric(c.targetMetric);
    const label = dimensionDisplayLabel(dim, moduleId);
    if (!seen.has(label)) {
      seen.add(label);
      order.push(label);
    }
  }
  if (order.length === 0) return null;
  return order.join(' · ');
}

/**
 * Children of an umbrella sharing its scope. By-timeframe view
 * nests these directly under the umbrella row. Cross-scope
 * children stay flat in their own scope's layer.
 */
export function findChildren(
  umbrella: Goal,
  allGoals: ReadonlyArray<Goal>,
): Goal[] {
  return allGoals.filter(
    g =>
      g.parentGoalId === umbrella.id &&
      g.scope === umbrella.scope &&
      g.id !== umbrella.id,
  );
}

/**
 * Cross-scope variant of findChildren — returns every goal whose
 * parentGoalId points at the umbrella regardless of scope. Used
 * by the by-module view, which renders the full yearly →
 * monthly → weekly hierarchy under the yearly umbrella. The
 * by-timeframe view stays on the same-scope variant since each
 * scope layer only contains its own scope.
 */
export function findAllChildren(
  umbrella: Goal,
  allGoals: ReadonlyArray<Goal>,
): Goal[] {
  return allGoals.filter(
    g => g.parentGoalId === umbrella.id && g.id !== umbrella.id,
  );
}

/**
 * Single module for the umbrella's chart, derived from its
 * children. Returns:
 *   - the shared moduleId when every child agrees
 *   - null when children span multiple modules (caller renders
 *     the cross-module placeholder)
 *   - null when no child has a derivable module
 */
export function umbrellaModuleId(
  children: ReadonlyArray<Goal>,
): GoalFlowModuleId | null {
  let shared: GoalFlowModuleId | null = null;
  for (const c of children) {
    const m = moduleForMetric(c.targetMetric);
    if (!m) continue;
    if (shared === null) {
      shared = m;
    } else if (shared !== m) {
      return null; // mixed
    }
  }
  return shared;
}

/**
 * Are children of this umbrella spread across multiple modules?
 * Distinguishes the "no children with a module" case (false —
 * single-module is technically vacuously true) from the
 * genuine "spans modules" case the chart cares about.
 */
export function isCrossModuleUmbrella(
  children: ReadonlyArray<Goal>,
): boolean {
  const seen = new Set<GoalFlowModuleId>();
  for (const c of children) {
    const m = moduleForMetric(c.targetMetric);
    if (m) seen.add(m);
  }
  return seen.size > 1;
}

/**
 * Heuristic for the second legacy umbrella description shape:
 * concatenated child descriptions joined by " and " (the auto-
 * formatter that lived before yearly anchors had a real
 * auto-name).
 *
 * Returns true when the goal is an umbrella AND its description
 * contains " and " — broad on purpose. The Goals home pairs
 * this with the explicit isLegacyAnchorName check; together
 * they cover both legacy patterns without a data migration.
 *
 * Accepted false positive: a user customizes their umbrella
 * title to a string that happens to contain " and " (e.g.,
 * "Master ET basics and dive deeper"). That title gets
 * substituted with the new default at render time. User can
 * re-edit; tradeoff is worth it because the run-on
 * concatenation case is far more common.
 */
export function isConcatenatedChildSummary(goal: Goal): boolean {
  if (!goal.isUmbrella) return false;
  const desc = goal.description?.trim() ?? '';
  return desc.includes(' and ');
}
