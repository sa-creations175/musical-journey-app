/**
 * Scope identity and cardinality — the two facts about a coverage
 * scope that the maintenance trigger needs and that neither the goal
 * record nor spacingState can supply on its own.
 *
 *   scopeKeyForGoal(goal)      — stable id for the SCOPE, not the goal
 *   catalogTotalForGoal(goal)  — how many items the scope actually holds
 *
 * WHY CARDINALITY HAS TO COME FROM THE CATALOG. `resolveCandidates` is
 * a pure row filter and deliberately never enumerates items with no
 * spacingState row. So "no uncovered rows" is true both of a finished
 * scope and of a 90-item scope where three items have been touched and
 * all three are acquired. Only the catalog can tell those apart, and
 * `lib/moduleItemCounts.ts` is the app's single source for it — this
 * module maps a goal onto the right count there and adds no counting
 * of its own.
 *
 * ⚠️ THE HF GROUP IDS ARE SPELLED TWO WAYS IN THE CODEBASE, and this
 * is the seam where that bites. `goals/progress.ts` HF_GROUP_CATEGORIES
 * uses kebab ids ('chord-knowledge') and a goal's `targetUnit` carries
 * that form — it is what `candidateSpecForGoal` looks up.
 * `moduleItemCounts.ts` keeps its own copy of the same group→category
 * mapping under camelCase ids ('chordKnowledge'), and its own comment
 * acknowledges the duplication ("If a category is added, both lists
 * update"). Neither file is wrong; they simply never had to agree
 * before, because nothing crossed from one to the other. This module
 * is the first thing that does, so the translation lives here,
 * explicitly, with a test that fails if either side gains or loses a
 * group. Reconciling the two mappings into one is worth doing, but it
 * touches goal progress and the goal picker, so it is not smuggled
 * into a maintenance-trigger change.
 */

import type { Goal } from '../db';
import {
  COVERAGE_OVERALL_METRIC,
  COVERAGE_SPECIFIC_METRIC,
  isCoverageOverallMetric,
  isCoverageSpecificMetric,
} from '../../modules/goals/coverageMetrics';
import {
  earTrainingCounts,
  harmonicFluencyCounts,
  productionCounts,
  shapesCounts,
  type HarmonicFluencyGroupId,
} from '../moduleItemCounts';
import { getShapesCoverageGroup } from '../../modules/goals/shapesCoverageGroups';
import { lessonsByPath } from '../../modules/production/content/lessons';

/**
 * Goal `targetUnit` (kebab, as authored by the goal picker and read by
 * `candidateSpecForGoal`) → `moduleItemCounts` group id (camelCase).
 * See the header note. Exported so the drift test can assert both
 * sides still describe the same four groups.
 */
export const HF_UNIT_TO_COUNT_GROUP: Readonly<
  Record<string, HarmonicFluencyGroupId>
> = {
  'foundational':       'foundational',
  'chord-knowledge':    'chordKnowledge',
  'functional-applied': 'functionalApplied',
  'ear-recognition':    'earRecognition',
};

/** ET sub-area ids are moduleRefs, and map straight onto the
 *  per-sub-area fields of `earTrainingCounts`. */
const ET_UNIT_TO_COUNT_KEY: Readonly<
  Record<string, keyof ReturnType<typeof earTrainingCounts>>
> = {
  'intervals':          'intervals',
  'chord-recognition':  'chordRecognition',
  'chord-progressions': 'chordProgressions',
  'scales-modes':       'scalesModes',
};

/**
 * A stable identifier for the SCOPE a goal targets, so maintenance
 * state outlives the goal that first revealed it. Goals are created,
 * completed, and replaced; the scope ("Harmonic Fluency :
 * foundational") is the durable thing, and a user who confirmed
 * maintenance for it should not have that undone by closing a goal
 * and opening another over the same items.
 *
 * Returns null for anything that is not a coverage goal.
 */
export function scopeKeyForGoal(goal: Goal): string | null {
  const metric = goal.targetMetric;
  if (!metric) return null;
  if (isCoverageOverallMetric(metric)) return metric;
  if (isCoverageSpecificMetric(metric)) {
    if (!goal.targetUnit) return null;
    return `${metric}:${goal.targetUnit}`;
  }
  return null;
}

/**
 * How many items the goal's scope holds, per the catalogs. Null when
 * the goal is not a coverage goal or the sub-area cannot be resolved
 * — an unresolved total must disqualify a maintenance suggestion
 * rather than default to something permissive.
 */
export function catalogTotalForGoal(goal: Goal): number | null {
  const metric = goal.targetMetric;
  if (!metric) return null;

  if (isCoverageOverallMetric(metric)) {
    switch (metric) {
      case COVERAGE_OVERALL_METRIC.EAR_TRAINING:
        return earTrainingCounts().total;
      case COVERAGE_OVERALL_METRIC.HARMONIC_FLUENCY:
        return harmonicFluencyCounts().total;
      case COVERAGE_OVERALL_METRIC.SHAPES:
        return shapesCounts().total;
      case COVERAGE_OVERALL_METRIC.PRODUCTION:
        return productionCounts().total;
    }
  }

  if (isCoverageSpecificMetric(metric)) {
    const unit = goal.targetUnit;
    if (!unit) return null;

    switch (metric) {
      case COVERAGE_SPECIFIC_METRIC.EAR_TRAINING: {
        const key = ET_UNIT_TO_COUNT_KEY[unit];
        return key ? earTrainingCounts()[key] : null;
      }
      case COVERAGE_SPECIFIC_METRIC.HARMONIC_FLUENCY: {
        const group = HF_UNIT_TO_COUNT_GROUP[unit];
        return group ? harmonicFluencyCounts().byGroup[group] : null;
      }
      case COVERAGE_SPECIFIC_METRIC.SHAPES: {
        // The group defs already carry live denominators derived from
        // the same catalogs moduleItemCounts reads.
        const def = getShapesCoverageGroup(unit);
        return def ? def.denominator : null;
      }
      case COVERAGE_SPECIFIC_METRIC.PRODUCTION: {
        const n = lessonsByPath(unit).length;
        return n > 0 ? n : null;
      }
    }
  }

  return null;
}
