import type { ProductionLessonRating } from '../../lib/db';

/**
 * Presentation + predicates for the five-step Production lesson
 * self-rating. One definition, shared by every surface that renders a
 * lesson's state (LessonView, PathView, ProductionOverview) and by the
 * dashboard's aggregate counts.
 *
 * This file exists because the thing it replaced did not: the mastery
 * enum's dot colours and labels were copy-pasted across three
 * components, which is how PathView came to say "got it" where
 * LessonView said "completed" for the same stored value.
 *
 * The stage mapping lives in data.ts (STAGE_FOR_RATING) rather than
 * here — it's a write-path concern, and keeping it next to the write
 * keeps the coverage contract in one place.
 */

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
