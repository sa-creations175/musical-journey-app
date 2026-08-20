/**
 * "Your goal's scope got smaller" detection.
 *
 * A coverage goal stores `targetValue` as a frozen count of items —
 * "cover 200 of the 852 chord shapes". Nothing recomputes it. When a
 * catalog shrinks (the 20 Aug 2026 chord-shape cut took 852 → 648, and
 * emptied the extension sub-areas entirely) a stored target can become
 * unreachable, or point at a scope with nothing in it at all.
 *
 * WHY A NOTICE AND NOT A MIGRATION
 *
 * Quietly rewriting a target the user set is the same class of problem
 * as a denominator that moves with a settings toggle: the number stops
 * meaning what they think it means, and they were never told. Rescoping
 * a goal is their call. This module only reports; the row surfaces it
 * and the user decides whether to edit, keep, or drop the goal.
 *
 * Deliberately catalog-agnostic — it compares the stored target against
 * `enumerateScopeForGoal`, which every coverage module derives from its
 * own catalog. Any future catalog cut is covered without touching this
 * file.
 */
import type { Goal } from '../../lib/db';
import { isCoverageMetric, isCoverageSpecificMetric } from './coverageMetrics';
import { enumerateScopeForGoal } from './scopeEnumeration';
import { getShapesCoverageGroup } from './shapesCoverageGroups';

export interface ScopeShrink {
  /** The count the goal was saved with. */
  storedTarget: number;
  /** How many items that scope holds today. */
  availableNow: number;
  /** True when the scope is now empty — nothing to practise at all. */
  isEmpty: boolean;
  /** Human name for the scope, when one resolves. */
  scopeLabel: string | null;
}

/** Human label for a coverage goal's sub-area, when it has one. */
function scopeLabelFor(goal: Goal): string | null {
  if (!isCoverageSpecificMetric(goal.targetMetric)) return null;
  const subArea = goal.targetUnit;
  if (!subArea) return null;
  // Shapes sub-areas keep their defs after a cut precisely so this
  // resolves — an unresolvable id would turn an explainable notice
  // into a shrug.
  return getShapesCoverageGroup(subArea)?.label ?? subArea;
}

/**
 * Returns a `ScopeShrink` when the goal's stored target can no longer
 * be reached, or null when the goal is fine.
 *
 * Umbrella goals are skipped — their progress is a rollup of children,
 * and each child reports its own shrink.
 */
export function detectScopeShrink(goal: Goal): ScopeShrink | null {
  if (goal.isUmbrella) return null;
  if (!isCoverageMetric(goal.targetMetric)) return null;
  const storedTarget = typeof goal.targetValue === 'number' ? goal.targetValue : 0;
  if (storedTarget <= 0) return null;

  const availableNow = enumerateScopeForGoal(goal).length;
  if (availableNow >= storedTarget) return null;

  return {
    storedTarget,
    availableNow,
    isEmpty: availableNow === 0,
    scopeLabel: scopeLabelFor(goal),
  };
}

/**
 * One sentence for the goal row. States what changed and what is
 * possible now, and stops — it never suggests a new number, because
 * picking one is the decision being handed back.
 */
export function describeScopeShrink(shrink: ScopeShrink): string {
  const what = shrink.scopeLabel ? `"${shrink.scopeLabel}"` : 'this goal’s scope';
  if (shrink.isEmpty) {
    return `${what} no longer has any items — the catalog changed after you set this goal. `
      + `Its target of ${shrink.storedTarget} can’t be reached.`;
  }
  return `${what} now holds ${shrink.availableNow} items, fewer than this goal’s `
    + `target of ${shrink.storedTarget}. The catalog changed after you set it.`;
}
