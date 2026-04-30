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

const DIMENSION_ORDER: ReadonlyArray<GoalDimension> = [
  'Breadth',
  'Mastery',
  'Depth',
  'Consistency',
];

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
 * Each dimension appears at most once, in the canonical order
 * (Breadth → Mastery → Depth → Consistency). Returns null when
 * no child has a classifiable dimension — caller falls back to
 * a generic subtitle (currently nothing, but step 7 may add a
 * count of children).
 */
export function umbrellaSubtitle(children: ReadonlyArray<Goal>): string | null {
  const set = new Set<GoalDimension>();
  for (const c of children) {
    const dim = dimensionForGoal(c);
    if (dim) set.add(dim);
  }
  if (set.size === 0) return null;
  return DIMENSION_ORDER.filter(d => set.has(d)).join(' · ');
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
