/**
 * Phase 2 step 5a — metric vocabulary for yearly anchor Mastery
 * dimensions.
 *
 * Mastery is the third dimension of the yearly anchor framework
 * (Breadth → Mastery → Depth → Consistency). Where Breadth targets
 * the `acquired` stage ("touched everything"), Mastery targets the
 * `mastered` stage ("really own these specific groups"). The two
 * dimensions deliberately use the same shape (overall + specific
 * variants per module) so the algorithm and the UI can route them
 * symmetrically — coverage_at_acquired vs mastery_at_mastered.
 *
 * Shipped here:
 *
 *   {ear_training,harmonic_fluency,shapes}_mastery_at_mastered
 *                                                    [_specific]
 *
 * NOT shipped here (deliberate):
 *
 *   - Production mastery metric — Production's yearly anchor runs
 *     3 questions (Breadth / Depth / Consistency); the depth/mastery
 *     distinction is deferred until more firsthand experience with
 *     the lesson material exists. See PRACTICE_SESSIONS_DESIGN_3.md
 *     "Production (3 questions, depth/mastery merged)" section.
 *
 *   - Song Repertoire mastery metric — Songs reuse the existing
 *     `song_whole_at_level` metric with targetUnit: 'internalized'.
 *     Songs already have a level-based vocabulary (Comfortable /
 *     Solid / Internalized) that the matrix's state machine drives;
 *     adding a parallel mastery metric would duplicate semantics.
 *     Songs Mastery is a count input ("How many songs do you want
 *     to internalize?"), encoded as
 *     `song_whole_at_level` + `targetUnit: 'internalized'` +
 *     `targetValue: <count>`.
 *
 * Naming convention mirrors `coverageMetrics.ts`'s `<module>_<dim>_at_<stage>`
 * pattern so `goalVocabulary.moduleForMetric`'s existing prefix
 * matchers (`ear_training_*`, `harmonic_fluency_*`, `shapes_*`)
 * route the new ids automatically — no edit to that file required.
 *
 * Progress reads (counting spacingState rows at `mastered` stage in
 * the relevant moduleRef) are deferred to Step 5b/Step 6 follow-up;
 * Step 4's progress.ts router returns `{ kind: 'unsupported' }` for
 * these metrics today, which the goal-row UI renders as a
 * placeholder rather than crashing.
 */

// ---- Overall metric ids (all items in a module) ------------------

export const MASTERY_OVERALL_METRIC = {
  EAR_TRAINING:     'ear_training_mastery_at_mastered',
  HARMONIC_FLUENCY: 'harmonic_fluency_mastery_at_mastered',
  SHAPES:           'shapes_mastery_at_mastered',
} as const;

export type MasteryOverallMetric =
  typeof MASTERY_OVERALL_METRIC[keyof typeof MASTERY_OVERALL_METRIC];

// ---- Specific metric ids (one or more sub-areas within a module) -

/**
 * Specific variants follow the same shape as coverage_at_acquired_specific:
 * `targetUnit` holds the picked sub-area id (e.g. 'intervals' for
 * Ear Training, 'foundational' for Harmonic Fluency). Multi-pick
 * Mastery (when the user wants to master more than one group)
 * encodes the picked groups in `relatedItems[]` rather than
 * splitting into N sibling records — Mastery is one dimension of
 * the yearly anchor, so it's one row.
 */
export const MASTERY_SPECIFIC_METRIC = {
  EAR_TRAINING:     'ear_training_mastery_at_mastered_specific',
  HARMONIC_FLUENCY: 'harmonic_fluency_mastery_at_mastered_specific',
  SHAPES:           'shapes_mastery_at_mastered_specific',
} as const;

export type MasterySpecificMetric =
  typeof MASTERY_SPECIFIC_METRIC[keyof typeof MASTERY_SPECIFIC_METRIC];

export type MasteryMetric = MasteryOverallMetric | MasterySpecificMetric;

// ---- Internal sets for O(1) membership checks --------------------

const MASTERY_OVERALL_SET: ReadonlySet<string> = new Set(
  Object.values(MASTERY_OVERALL_METRIC),
);

const MASTERY_SPECIFIC_SET: ReadonlySet<string> = new Set(
  Object.values(MASTERY_SPECIFIC_METRIC),
);

// ---- Type guards -------------------------------------------------

/**
 * True when `m` is one of the *_mastery_at_mastered ids (targets
 * all items in a module at the `mastered` stage). Returns false for
 * null, undefined, empty string, or any non-mastery metric (including
 * the *_specific variants).
 */
export function isMasteryOverallMetric(
  m: string | null | undefined,
): m is MasteryOverallMetric {
  return typeof m === 'string' && MASTERY_OVERALL_SET.has(m);
}

/**
 * True when `m` is one of the *_mastery_at_mastered_specific ids
 * (targets one or more sub-areas within a module). Returns false
 * for null, undefined, empty string, or any non-mastery metric
 * (including the *_overall variants).
 */
export function isMasterySpecificMetric(
  m: string | null | undefined,
): m is MasterySpecificMetric {
  return typeof m === 'string' && MASTERY_SPECIFIC_SET.has(m);
}

/**
 * True when `m` is any mastery metric id (overall or specific).
 * Convenience union of the two predicates above.
 */
export function isMasteryMetric(
  m: string | null | undefined,
): m is MasteryMetric {
  return isMasteryOverallMetric(m) || isMasterySpecificMetric(m);
}
