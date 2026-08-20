import type { AcquisitionStage, ProductionLessonRating } from '../../lib/db';

/**
 * The five-step Production lesson self-rating: what it means, how it
 * renders, and what acquisition stage it mirrors to. One definition,
 * shared by every surface that reads a lesson's state (LessonView,
 * PathView, ProductionOverview), by the dashboard's aggregate counts,
 * by the skills catalogue, and by both writers of production
 * spacingState rows (data.ts's live path and the one-time backfill).
 *
 * This file exists because the thing it replaced did not. The mastery
 * enum's dot colours and labels were copy-pasted across three
 * components — which is how PathView came to say "got it" where
 * LessonView said "completed" for the same stored value — and its
 * stage map existed twice, in data.ts and in spacingStateBackfill.ts,
 * free to drift.
 */

/**
 * Mapping from the five-step rating to the unified spacingState
 * acquisition stage. Production lessons have no per-rep rating
 * signals — the user declares state directly, so spacingState mirrors
 * that declaration rather than going through recordEngagement's
 * signal-driven transition logic.
 *
 *     0 not started → null       (delete row — canonical "absence = new")
 *    25 read it     → acquiring  (touched, not covered)
 *    50 deep dive   → acquiring  (still reading)
 *    75 tried it    → acquired   ← the coverage line
 *   100 mastered    → mastered   (user-declared full ownership)
 *
 * COVERAGE BEGINS AT "TRIED IT", not at comprehension. `COVERED_STAGES`
 * in goals/progress.ts is {acquired, consolidated, mastered}, so 75 is
 * where a lesson starts counting toward a Production coverage goal.
 * That is the whole point of the scale: covered means you did the
 * thing, not that you understood the words. It makes Production
 * coverage goals strictly harder than the mastery enum did (where
 * "completed" — understood-and-can-use — was the line), which is
 * intended.
 *
 * 'consolidated' stays unused for Production, exactly as under the
 * mastery enum — there's no signal that would distinguish it from
 * 'acquired' here.
 */
export const STAGE_FOR_RATING: Record<ProductionLessonRating, AcquisitionStage | null> = {
  0:   null,
  25:  'acquiring',
  50:  'acquiring',
  75:  'acquired',
  100: 'mastered',
};

/**
 * The rating at which a lesson starts counting toward a Production
 * coverage goal — "tried it". Below this the user has read about the
 * idea; at or above it they have run it.
 *
 * Mirrors the acquired+ line in STAGE_FOR_RATING. The two have to
 * agree: this constant is what the UI uses to explain coverage, and
 * STAGE_FOR_RATING is what actually produces it.
 */
export const COVERAGE_RATING: ProductionLessonRating = 75;

/** Has this lesson been covered — i.e. did the user actually do it? */
export function isCovered(rating: ProductionLessonRating): boolean {
  return rating >= COVERAGE_RATING;
}

/** Started but not yet covered: read about, not yet run. */
export function isStarted(rating: ProductionLessonRating): boolean {
  return rating > 0 && rating < COVERAGE_RATING;
}

/**
 * The five steps, in order. Each names something the lesson page
 * actually offers — the body, the Deep dive section, the Try now
 * block — so the rating is a claim about what you did, not a guess at
 * how well you understood it.
 *
 * The dot colours climb neutral → amber → green, and the shift to
 * green lands on "tried it": the step where the lesson starts
 * counting toward coverage. Reading is progress, but it isn't
 * coverage, and the colours say so.
 */
export const RATING_OPTIONS: ReadonlyArray<{
  value: ProductionLessonRating;
  label: string;
  meaning: string;
  dot: string;
}> = [
  {
    value: 0,
    label: 'not started',
    meaning: "haven't opened this yet",
    dot: 'bg-neutral-200 dark:bg-neutral-700',
  },
  {
    value: 25,
    label: 'read it',
    meaning: 'read the lesson through',
    dot: 'bg-developing/50',
  },
  {
    value: 50,
    label: 'deep dive',
    meaning: 'went through the deep dive or the reference tutorial',
    dot: 'bg-developing',
  },
  {
    value: 75,
    label: 'tried it',
    meaning: 'actually ran the Try now exercise',
    dot: 'bg-fluent',
  },
  {
    value: 100,
    label: 'mastered',
    meaning: 'use it instinctively in my own work',
    dot: 'bg-mastered',
  },
];

const BY_VALUE = new Map(RATING_OPTIONS.map(o => [o.value, o]));

/** Presentation for a rating. Falls back to "not started" for an
 *  absent or unrecognised value — a lesson with no row yet reads as
 *  untouched, which is the honest rendering rather than a blank. */
export function ratingOption(
  rating: ProductionLessonRating | undefined,
): (typeof RATING_OPTIONS)[number] {
  return BY_VALUE.get(rating ?? 0) ?? RATING_OPTIONS[0];
}
