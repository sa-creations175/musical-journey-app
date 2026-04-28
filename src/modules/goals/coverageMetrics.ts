/**
 * Phase 2 step 2a — metric vocabulary for coverage goals.
 *
 * A coverage goal targets the `acquired` (or higher) acquisition
 * stage for all items in a module — or for one chosen sub-area
 * within it. Per the Phase 2 design (SESSION_SUMMARY_2026_04_27_
 * PHASE2_DESIGN.md §5–§6), `acquired` is the minimum bar for genuine
 * coverage: not just seen once, but stable recall.
 *
 * Goal-record shape for a coverage goal:
 *
 *   targetMetric: one of the constants below
 *   targetValue:  count of items the user wants covered
 *                 (e.g. 143 for all of Ear Training, 30 for the 30
 *                 chord-recognition cards, etc.)
 *   targetUnit:   'items' (or null — TBD in 2b–2e per-module wiring)
 *   relatedItems: [] for *_overall metrics
 *                 single sub-area id for *_specific metrics
 *                 (e.g. 'intervals' for an ear-training-specific
 *                 coverage goal targeting just the intervals group)
 *
 * Naming convention mirrors the existing accuracy/proficiency
 * metrics (`<module>_accuracy_overall`, `<module>_accuracy_specific`)
 * so the existing `goalVocabulary.moduleForMetric` prefix matcher
 * routes the new ids automatically — no edit to that file required.
 *
 * Progress calculation (counting spacingState rows at acquired+ in
 * the relevant moduleRef) is deferred to step 5/6, when the
 * YearlyAnchorFlow + Goals home need to render percentages. 2a only
 * defines the vocabulary; per-module wiring (target types, UI cards,
 * encoders, decoders) lands in 2b–2e as separate vertical slices.
 *
 * Song Repertoire is intentionally out of scope: songs use the
 * existing proficiency-level vocabulary (Comfortable / Solid /
 * Internalized) via the matrix's own state machine, not spacingState
 * acquisition stages.
 */

// ---- Overall metric ids (all items in a module) ------------------

export const COVERAGE_OVERALL_METRIC = {
  EAR_TRAINING:     'ear_training_coverage_at_acquired',
  HARMONIC_FLUENCY: 'harmonic_fluency_coverage_at_acquired',
  SHAPES:           'shapes_coverage_at_acquired',
  PRODUCTION:       'production_coverage_at_acquired',
} as const;

export type CoverageOverallMetric =
  typeof COVERAGE_OVERALL_METRIC[keyof typeof COVERAGE_OVERALL_METRIC];

// ---- Specific metric ids (one sub-area within a module) ---------

export const COVERAGE_SPECIFIC_METRIC = {
  EAR_TRAINING:     'ear_training_coverage_at_acquired_specific',
  HARMONIC_FLUENCY: 'harmonic_fluency_coverage_at_acquired_specific',
  SHAPES:           'shapes_coverage_at_acquired_specific',
  PRODUCTION:       'production_coverage_at_acquired_specific',
} as const;

export type CoverageSpecificMetric =
  typeof COVERAGE_SPECIFIC_METRIC[keyof typeof COVERAGE_SPECIFIC_METRIC];

export type CoverageMetric = CoverageOverallMetric | CoverageSpecificMetric;

// ---- Internal sets for O(1) membership checks --------------------

const COVERAGE_OVERALL_SET: ReadonlySet<string> = new Set(
  Object.values(COVERAGE_OVERALL_METRIC),
);

const COVERAGE_SPECIFIC_SET: ReadonlySet<string> = new Set(
  Object.values(COVERAGE_SPECIFIC_METRIC),
);

// ---- Type guards -------------------------------------------------

/**
 * True when `m` is one of the *_overall coverage metric ids
 * (targets all items in a module). Returns false for null,
 * undefined, empty string, or any non-coverage metric (including
 * the *_specific variants).
 */
export function isCoverageOverallMetric(
  m: string | null | undefined,
): m is CoverageOverallMetric {
  return typeof m === 'string' && COVERAGE_OVERALL_SET.has(m);
}

/**
 * True when `m` is one of the *_specific coverage metric ids
 * (targets one chosen sub-area within a module). Returns false for
 * null, undefined, empty string, or any non-coverage metric
 * (including the *_overall variants).
 */
export function isCoverageSpecificMetric(
  m: string | null | undefined,
): m is CoverageSpecificMetric {
  return typeof m === 'string' && COVERAGE_SPECIFIC_SET.has(m);
}

/**
 * True when `m` is any coverage metric id (overall or specific).
 * Convenience union of the two predicates above.
 */
export function isCoverageMetric(
  m: string | null | undefined,
): m is CoverageMetric {
  return isCoverageOverallMetric(m) || isCoverageSpecificMetric(m);
}
