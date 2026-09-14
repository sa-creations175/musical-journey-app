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
} from '../moduleItemCounts';
import {
  getShapesCoverageGroup, shapesCoverageDenominator,
} from '../../modules/goals/shapesCoverageGroups';
import {
  HF_UNIT_TO_COUNT_GROUP, HF_CATEGORIES_BY_UNIT,
} from '../../modules/harmonic-fluency/coverageGroups';
import type { OutOfScore } from '../../modules/shapes-and-patterns/cellTargets';
import { lessonsByPath } from '../../modules/production/content/lessons';

/**
 * Goal `targetUnit` (kebab, as authored by the goal picker and read by
 * `candidateSpecForGoal`) → `moduleItemCounts` group id (camelCase).
 *
 * TWO FIELDS OF ONE ROW NOW, not two tables with a guard between them
 * — see `harmonic-fluency/coverageGroups.ts`. Re-exported here because
 * that is where every caller already reaches for it.
 */
export { HF_UNIT_TO_COUNT_GROUP };

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
 *
 * =====================================================================
 * FOR SHAPES, THIS IS THE SAME NUMBER THE CARD AND THE GRID SHOW.
 *
 * `shapesCounts` and `shapesCoverageDenominator` both count targets off
 * `sectionTargets` — the one enumeration — so a scope, a goal, a card
 * and a grid cannot give four answers to one question. They used to:
 * this file asked for itemRef counts with no hand axis while the
 * numerator counted spacingState rows, which are per hand.
 *
 * AND IT MOVES WITH THE SCORE. `outOfScore` is what Edit what counts
 * has taken out. A maintenance trigger asking "is this scope finished"
 * has to ask about the scope the user is actually going for, or it will
 * hold a goal open on items he has said he is not working on.
 * =====================================================================
 */
export function catalogTotalForGoal(
  goal: Goal,
  outOfScore?: OutOfScore,
  /** The movements the caller has in hand (ruling 48). Threaded rather
   *  than read: everything on this path is pure and synchronous, and
   *  `loadScopeMaintenanceViews` is the one place that has awaited
   *  Dexie already. */
  movementIds: readonly string[] = [],
): number | null {
  const metric = goal.targetMetric;
  if (!metric) return null;

  if (isCoverageOverallMetric(metric)) {
    switch (metric) {
      case COVERAGE_OVERALL_METRIC.EAR_TRAINING:
        return earTrainingCounts().total;
      case COVERAGE_OVERALL_METRIC.HARMONIC_FLUENCY:
        return harmonicFluencyCounts().total;
      case COVERAGE_OVERALL_METRIC.SHAPES:
        return shapesCounts(outOfScore, movementIds).total;
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
        if (group) return harmonicFluencyCounts().byGroup[group];
        // A GROUP RETIRED ON 14 SEP 2026 is counted from the families it
        // held, so a goal set before the regroup keeps its denominator.
        const categories = HF_CATEGORIES_BY_UNIT[unit];
        if (!categories) return null;
        const byCategory = harmonicFluencyCounts().byCategory as Record<string, number>;
        return categories.reduce((n, c) => n + (byCategory[c] ?? 0), 0);
      }
      case COVERAGE_SPECIFIC_METRIC.SHAPES: {
        // ASKED FRESH RATHER THAN READ OFF THE DEF, because the def's
        // own `denominator` is the at-rest figure — everything in the
        // catalog. This has to be the score-aware one.
        return getShapesCoverageGroup(unit)
          ? shapesCoverageDenominator(unit, outOfScore, movementIds)
          : null;
      }
      case COVERAGE_SPECIFIC_METRIC.PRODUCTION: {
        const n = lessonsByPath(unit).length;
        return n > 0 ? n : null;
      }
    }
  }

  return null;
}
