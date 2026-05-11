/**
 * Phase 3 Step 2a — getCandidatesForGoal translation layer.
 *
 * Goals reference modules / sub-areas / individual items in different
 * shapes; the algorithm needs a uniform way to ask "what items does
 * this goal want?" Two pure functions handle the translation:
 *
 *   candidateSpecForGoal(goal): CandidateSpec
 *     — Inspects the goal's metric + targetUnit + relatedItems and
 *       returns a structured spec the resolver can apply against a
 *       spacingState row set. No DB access; safely composable.
 *
 *   resolveCandidates(spec, rows): readonly string[]
 *     — Filters a list of SpacingRow against a spec and returns the
 *       matching itemRefs. Pure; tests pass row fixtures directly.
 *
 * The async boundary (fetch rows from db.spacingState, then call
 * resolveCandidates) is left to whoever assembles the algorithm
 * pipeline — keeps unit tests fast and the math obvious.
 */

import type { Goal } from '../db';
import { cardById } from '../../modules/harmonic-fluency/catalog';
import {
  COVERAGE_OVERALL_METRIC,
  COVERAGE_SPECIFIC_METRIC,
  isCoverageOverallMetric,
  isCoverageSpecificMetric,
} from '../../modules/goals/coverageMetrics';
import {
  COVERED_STAGES,
  ET_MODULE_REFS,
  HF_MODULE_REF,
  HF_GROUP_CATEGORIES,
  PRODUCTION_MODULE_REF,
  REPERTOIRE_MODULE_REF,
  SHAPES_MODULE_REF,
  isConsistencyMetric,
} from '../../modules/goals/progress';
import { itemRefMatcherForCoverageGroup } from '../../modules/goals/shapesCoverageGroups';
import { lessonsByPath } from '../../modules/production/content/lessons';
import { SONG_METRIC } from '../../modules/goals/songTarget';
import type { CandidateSpec, SpacingRow } from './types';

// ---------------------------------------------------------------------
// Spec generation — pure
// ---------------------------------------------------------------------

/**
 * Map a goal record onto a CandidateSpec. Pure; no DB access.
 *
 * Coverage goals (overall + specific) → 'coverage' spec scoped to the
 * relevant moduleRefs and an itemRef filter, with COVERED_STAGES
 * excluded so already-acquired items drop out of the candidate pool.
 *
 * Accuracy goals → 'accuracy' spec scoped to the relevant moduleRefs.
 * Sub-area scoping for accuracy_specific lands once Phase 3 needs it
 * (currently goal feasibility computes accuracy module-wide; the
 * algorithm matches that semantic).
 *
 * Consistency goals → 'consistency' spec — items aren't the signal,
 * "practice this module more often" is. Algorithm uses this as a
 * mild module-wide lift.
 *
 * Songs and production-count goals → their specialised kinds; algorithm
 * resolves them through Phase 1.5 song state and the production lesson
 * catalog respectively.
 *
 * Umbrella goals → 'umbrella' marker; caller delegates to children.
 *
 * Anything not covered above (custom metrics, vision-scope text-only
 * goals, legacy items_at_level / hours_on_modules) → 'unsupported'.
 * Algorithm skips these — they don't drive item selection.
 */
export function candidateSpecForGoal(goal: Goal): CandidateSpec {
  if (goal.isUmbrella) return { kind: 'umbrella' };

  const metric = goal.targetMetric;
  if (!metric) return { kind: 'unsupported' };

  // --- Coverage (overall) -----------------------------------------
  if (isCoverageOverallMetric(metric)) {
    if (metric === COVERAGE_OVERALL_METRIC.EAR_TRAINING) {
      return {
        kind: 'coverage',
        moduleRefs: ET_MODULE_REFS,
        excludeStages: COVERED_STAGES,
      };
    }
    if (metric === COVERAGE_OVERALL_METRIC.HARMONIC_FLUENCY) {
      return {
        kind: 'coverage',
        moduleRefs: [HF_MODULE_REF],
        excludeStages: COVERED_STAGES,
      };
    }
    if (metric === COVERAGE_OVERALL_METRIC.SHAPES) {
      return {
        kind: 'coverage',
        moduleRefs: [SHAPES_MODULE_REF],
        excludeStages: COVERED_STAGES,
      };
    }
    if (metric === COVERAGE_OVERALL_METRIC.PRODUCTION) {
      return {
        kind: 'coverage',
        moduleRefs: [PRODUCTION_MODULE_REF],
        excludeStages: COVERED_STAGES,
      };
    }
  }

  // --- Coverage (specific sub-area) -------------------------------
  if (isCoverageSpecificMetric(metric)) {
    const subArea = goal.targetUnit;
    if (!subArea) return { kind: 'unsupported' };

    if (metric === COVERAGE_SPECIFIC_METRIC.EAR_TRAINING) {
      // ET sub-areas correspond directly to moduleRefs.
      if (!ET_MODULE_REFS.includes(subArea)) return { kind: 'unsupported' };
      return {
        kind: 'coverage',
        moduleRefs: [subArea],
        excludeStages: COVERED_STAGES,
      };
    }
    if (metric === COVERAGE_SPECIFIC_METRIC.HARMONIC_FLUENCY) {
      const categories = HF_GROUP_CATEGORIES[subArea];
      if (!categories) return { kind: 'unsupported' };
      const categorySet = new Set(categories);
      return {
        kind: 'coverage',
        moduleRefs: [HF_MODULE_REF],
        excludeStages: COVERED_STAGES,
        itemRefFilter: itemRef => {
          const card = cardById(itemRef);
          return card !== undefined && categorySet.has(card.category);
        },
      };
    }
    if (metric === COVERAGE_SPECIFIC_METRIC.SHAPES) {
      const matcher = itemRefMatcherForCoverageGroup(subArea);
      if (!matcher) return { kind: 'unsupported' };
      return {
        kind: 'coverage',
        moduleRefs: [SHAPES_MODULE_REF],
        excludeStages: COVERED_STAGES,
        itemRefFilter: matcher,
      };
    }
    if (metric === COVERAGE_SPECIFIC_METRIC.PRODUCTION) {
      const lessonIds = new Set(lessonsByPath(subArea).map(l => l.id));
      if (lessonIds.size === 0) return { kind: 'unsupported' };
      return {
        kind: 'coverage',
        moduleRefs: [PRODUCTION_MODULE_REF],
        excludeStages: COVERED_STAGES,
        itemRefFilter: itemRef => lessonIds.has(itemRef),
      };
    }
  }

  // --- Accuracy ---------------------------------------------------
  // Naming convention from Phase 2: <module>_accuracy_overall and
  // <module>_accuracy_specific. Match the prefix and route to the
  // module's spacingState moduleRefs. Sub-area scoping lands when
  // Phase 3 algorithm needs it.
  if (metric.endsWith('_accuracy_overall') || metric.endsWith('_accuracy_specific')) {
    if (metric.startsWith('ear_training_')) {
      return { kind: 'accuracy', moduleRefs: ET_MODULE_REFS };
    }
    if (metric.startsWith('harmonic_fluency_')) {
      return { kind: 'accuracy', moduleRefs: [HF_MODULE_REF] };
    }
    if (metric.startsWith('shapes_')) {
      return { kind: 'accuracy', moduleRefs: [SHAPES_MODULE_REF] };
    }
  }

  // --- Consistency ------------------------------------------------
  if (isConsistencyMetric(metric)) {
    if (metric.startsWith('ear_training_'))     return { kind: 'consistency', moduleRefs: ET_MODULE_REFS };
    if (metric.startsWith('harmonic_fluency_')) return { kind: 'consistency', moduleRefs: [HF_MODULE_REF] };
    if (metric.startsWith('shapes_'))           return { kind: 'consistency', moduleRefs: [SHAPES_MODULE_REF] };
    if (metric.startsWith('production_'))       return { kind: 'consistency', moduleRefs: [PRODUCTION_MODULE_REF] };
    if (metric.startsWith('repertoire_'))       return { kind: 'consistency', moduleRefs: [REPERTOIRE_MODULE_REF] };
    // Practice-consistency umbrella metrics ('practice_*') are
    // module-agnostic — the user practising anything counts. Algorithm
    // gets a no-target signal here; consistency lift applies broadly.
    if (metric.startsWith('practice_')) {
      return {
        kind: 'consistency',
        moduleRefs: [
          ...ET_MODULE_REFS,
          HF_MODULE_REF,
          SHAPES_MODULE_REF,
          PRODUCTION_MODULE_REF,
          REPERTOIRE_MODULE_REF,
        ],
      };
    }
  }

  // --- Songs ------------------------------------------------------
  // Song proficiency metrics target specific songs (whole / section /
  // key state at a level). Songs aren't tracked in spacingState — the
  // matrix carries their state. Algorithm consumes 2h's lived-with
  // window + matrix state to surface song work; spec hands off the
  // related song ids.
  //
  // TODO: When a song has no spacingState rows yet, use the song's
  // learning order number as priority — surface cells from the
  // lowest-numbered incomplete song first. Implement once songs
  // have real matrix data. The Song.learningOrder field now exists
  // (added in db.ts v21; 1-indexed, ASC = study next, authored via
  // drag-to-reorder on the Repertoire home in learning-order sort
  // mode). Read as `song.learningOrder ?? Number.MAX_SAFE_INTEGER`
  // defensively, since pre-backfill sync rows could lack it.
  if (
    metric === SONG_METRIC.WHOLE ||
    metric === SONG_METRIC.SECTION ||
    metric === SONG_METRIC.KEY
  ) {
    return { kind: 'song_proficiency', relatedItems: goal.relatedItems };
  }

  // --- Production count ------------------------------------------
  // production_lesson_count_overall and similar — counted via
  // spacingState rows in the production module that have reached an
  // end-of-lesson stage. For algorithm purposes this maps to the
  // production module's items.
  if (metric.startsWith('production_lesson_count') || metric === 'count_completed') {
    return { kind: 'production_count', moduleRefs: [PRODUCTION_MODULE_REF] };
  }

  return { kind: 'unsupported' };
}

// ---------------------------------------------------------------------
// Spec resolution — pure
// ---------------------------------------------------------------------

/**
 * Apply a CandidateSpec to a list of spacingState rows and return
 * the matching itemRefs. Pure; tests pass fixture rows directly.
 *
 * Coverage:
 *   row.moduleRef in spec.moduleRefs
 *   AND row.acquisitionStage NOT in spec.excludeStages
 *   AND (no filter OR filter passes)
 *
 * Accuracy / consistency:
 *   row.moduleRef in spec.moduleRefs
 *   (any stage; filter applied if present)
 *
 * Items with no spacingState row at all are NOT enumerated here —
 * they surface via 2i cold-start ordering when the candidate pool
 * is sparse. This keeps resolveCandidates a pure filter rather than
 * a catalog enumerator.
 *
 * Umbrella / unsupported / song_proficiency / production_count
 * specs all return [] from this resolver — those use cases are
 * handled elsewhere in the pipeline.
 *
 * Returns itemRefs in the order the rows were supplied. Caller
 * controls input order if it matters.
 */
export function resolveCandidates(
  spec: CandidateSpec,
  rows: ReadonlyArray<SpacingRow>,
): readonly string[] {
  if (spec.kind === 'umbrella' || spec.kind === 'unsupported') return [];
  if (spec.kind === 'song_proficiency' || spec.kind === 'production_count') return [];

  const moduleSet = new Set(spec.moduleRefs);
  const out: string[] = [];

  for (const row of rows) {
    if (!moduleSet.has(row.moduleRef)) continue;

    if (spec.kind === 'coverage') {
      if (spec.excludeStages.has(row.acquisitionStage)) continue;
      if (spec.itemRefFilter && !spec.itemRefFilter(row.itemRef)) continue;
    } else if (spec.kind === 'accuracy') {
      if (spec.itemRefFilter && !spec.itemRefFilter(row.itemRef)) continue;
    }
    // consistency: accept any row in the module set

    out.push(row.itemRef);
  }

  return out;
}
