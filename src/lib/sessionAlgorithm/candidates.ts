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

/**
 * Phase B Step 9b follow-up — extend a coverage goal's itemRefFilter
 * with the goal's `relatedItems` so explicit scope additions
 * (Accept's leftover items appended via the carry-over flow) are
 * treated as in-scope alongside the metric predicate. Pure: returns
 * the base filter unchanged when there are no relatedItems.
 *
 * Only takes effect for coverage-SPECIFIC metrics that carry an
 * itemRefFilter — coverage-overall has no filter (the whole module
 * is in scope) so relatedItems within the same module are already
 * surfaced. Items in relatedItems whose `moduleRef` falls outside
 * the goal's `moduleRefs` are dropped by the module-set check in
 * `resolveCandidates`; that's a known limitation for the rare
 * cross-sub-area carry-over case (e.g., accepting intervals leftover
 * into a chord-recognition-only goal).
 */
function extendWithRelatedItems(
  base: (itemRef: string) => boolean,
  relatedItems: readonly string[],
): (itemRef: string) => boolean {
  if (relatedItems.length === 0) return base;
  const extras = new Set(relatedItems);
  return itemRef => base(itemRef) || extras.has(itemRef);
}

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

  // Phase B Step 9b follow-up #2 — Accept-extended scope items.
  // Populated on every coverage spec so `resolveCandidates` can
  // bypass the module-set check when a row's itemRef is in this set
  // (the cross-submodule ET case; a no-op for same-module HF /
  // Shapes / Production).
  const relatedItems = goal.relatedItems.length > 0
    ? new Set(goal.relatedItems)
    : undefined;

  // --- Coverage (overall) -----------------------------------------
  if (isCoverageOverallMetric(metric)) {
    if (metric === COVERAGE_OVERALL_METRIC.EAR_TRAINING) {
      return {
        kind: 'coverage',
        moduleRefs: ET_MODULE_REFS,
        excludeStages: COVERED_STAGES,
        relatedItems,
      };
    }
    if (metric === COVERAGE_OVERALL_METRIC.HARMONIC_FLUENCY) {
      return {
        kind: 'coverage',
        moduleRefs: [HF_MODULE_REF],
        excludeStages: COVERED_STAGES,
        relatedItems,
      };
    }
    if (metric === COVERAGE_OVERALL_METRIC.SHAPES) {
      return {
        kind: 'coverage',
        moduleRefs: [SHAPES_MODULE_REF],
        excludeStages: COVERED_STAGES,
        relatedItems,
      };
    }
    if (metric === COVERAGE_OVERALL_METRIC.PRODUCTION) {
      return {
        kind: 'coverage',
        moduleRefs: [PRODUCTION_MODULE_REF],
        excludeStages: COVERED_STAGES,
        relatedItems,
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
        // ET-specific has no itemRefFilter — `relatedItems` is the
        // ONLY mechanism that lets cross-submodule Accept-extended
        // items (e.g., intervals leftover in a chord-recognition
        // goal) bypass the moduleRefs gate and surface as
        // monthly-scope candidates rather than backlog-factor only.
        relatedItems,
      };
    }
    if (metric === COVERAGE_SPECIFIC_METRIC.HARMONIC_FLUENCY) {
      const categories = HF_GROUP_CATEGORIES[subArea];
      if (!categories) return { kind: 'unsupported' };
      const categorySet = new Set(categories);
      const base = (itemRef: string) => {
        const card = cardById(itemRef);
        return card !== undefined && categorySet.has(card.category);
      };
      return {
        kind: 'coverage',
        moduleRefs: [HF_MODULE_REF],
        excludeStages: COVERED_STAGES,
        itemRefFilter: extendWithRelatedItems(base, goal.relatedItems),
        relatedItems,
      };
    }
    if (metric === COVERAGE_SPECIFIC_METRIC.SHAPES) {
      const matcher = itemRefMatcherForCoverageGroup(subArea);
      if (!matcher) return { kind: 'unsupported' };
      return {
        kind: 'coverage',
        moduleRefs: [SHAPES_MODULE_REF],
        excludeStages: COVERED_STAGES,
        itemRefFilter: extendWithRelatedItems(matcher, goal.relatedItems),
        relatedItems,
      };
    }
    if (metric === COVERAGE_SPECIFIC_METRIC.PRODUCTION) {
      const lessonIds = new Set(lessonsByPath(subArea).map(l => l.id));
      if (lessonIds.size === 0) return { kind: 'unsupported' };
      const base = (itemRef: string) => lessonIds.has(itemRef);
      return {
        kind: 'coverage',
        moduleRefs: [PRODUCTION_MODULE_REF],
        excludeStages: COVERED_STAGES,
        itemRefFilter: extendWithRelatedItems(base, goal.relatedItems),
        relatedItems,
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
  // Cold-start: when a song goal exists but no spacingState rows have
  // been written for Repertoire yet (the user hasn't logged practice
  // on any song), the aggregator wouldn't otherwise produce a
  // Repertoire block. That gap is closed in sessionGenerator's
  // `maybeInjectRepertoireColdStartBlock` — it injects a synthetic
  // Repertoire AlgorithmBlock so toProposalBlocks' split logic can
  // surface the spotlight + maintenance songs (the latter selected
  // by Song.learningOrder ASC in loadRepertoireSplitContext).
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

  // --- Song of the Month metadata --------------------------------
  // Sentinel metric on slot-1 TBD + every slot 2/3 entry in the
  // Repertoire monthly queue (see modules/repertoire/songOfMonth.ts).
  // Pure queue metadata — never drives session generation. Only
  // slot-1 specific (routed via song_whole_at_level above) reaches
  // the algorithm's session-candidate path.
  if (metric === 'song_of_month') {
    return { kind: 'unsupported' };
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
  /** Chord-recognition progressive-difficulty gate. When supplied,
   *  rows with `moduleRef === 'chord-recognition'` whose `itemRef`
   *  isn't in this set are dropped — locked tiers and not-yet-
   *  introduced items don't reach session proposals. Undefined
   *  preserves the pre-progressive-difficulty behaviour (used by
   *  unit tests of the unrelated specs). The set is supplied by
   *  the session pipeline upstream, computed once per session via
   *  `getUnlockedTier` + `getEligibleItems`. */
  chordRecognitionEligibleItems?: ReadonlySet<string>,
): readonly string[] {
  if (spec.kind === 'umbrella' || spec.kind === 'unsupported') return [];
  if (spec.kind === 'song_proficiency' || spec.kind === 'production_count') return [];

  const moduleSet = new Set(spec.moduleRefs);
  // Phase B Step 9b follow-up #2 — Accept-extended scope items.
  // When present on a coverage spec, a row whose itemRef is in this
  // set bypasses the moduleSet check (the row may live in a
  // different ET sub-module than the goal's primary subArea).
  // Non-coverage specs don't carry the field so the check is a
  // straight false → behaves as before.
  const acceptedRefs: ReadonlySet<string> | undefined =
    spec.kind === 'coverage' ? spec.relatedItems : undefined;
  const out: string[] = [];

  for (const row of rows) {
    const inModule = moduleSet.has(row.moduleRef);
    const inAccepted = acceptedRefs?.has(row.itemRef) ?? false;
    if (!inModule && !inAccepted) continue;

    // Chord-recognition tier/staged-introduction gate. Applied
    // after the moduleRef match so the cost is paid only for the
    // small chord-recognition slice of the candidate pool.
    if (
      row.moduleRef === 'chord-recognition'
      && chordRecognitionEligibleItems !== undefined
      && !chordRecognitionEligibleItems.has(row.itemRef)
    ) {
      continue;
    }

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
