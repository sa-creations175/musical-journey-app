/**
 * The numbers behind every rating this app shows.
 *
 * =====================================================================
 * ONE PLACE, BECAUSE THE SETTINGS PAGE WILL EDIT THEM.
 *
 * The bands were written down in Rules of the Game on 25 Aug 2026 and
 * the code has been carrying two different sets of numbers ever since:
 * `lib/tier.ts` graded 50 / 80 and reserved Mastered for a perfect
 * window of twenty, and the desktop dashboard's own `bands.ts` graded
 * 50 / 70 / 85. One reader could see the same item called Developing on
 * one screen and amber on another, and both were right about their own
 * file.
 *
 * So the four bands, the two floors and the window live here, and every
 * surface that grades anything imports them. Nothing else may hard-code
 * a threshold: Silas's ruling of 10 Sep 2026 is that these become
 * editable on the Settings page, and a number typed into a second file
 * is a number that control will not reach.
 *
 * =====================================================================
 * THE BANDS, AS RULED.
 *
 *   under 60%    Needs Work
 *   60 – 79      Developing
 *   80 – 94      Fluent
 *   95 and up    Mastered
 *
 * Over the last twenty answers, and nothing is graded under five.
 *
 * WHAT MOVED FROM THE OLD CODE, and both directions are deliberate:
 *
 *   · 50–59% was Developing and is now Needs Work. The bar for "this is
 *     coming along" went up.
 *   · 95%+ is now Mastered without needing a full twenty. It used to
 *     require twenty answers with nothing wrong, which is a different
 *     claim — perfection — and made the top band unreachable in
 *     practice. Ninety-five per cent of the window is the claim the
 *     ruling makes instead.
 * =====================================================================
 */

/**
 * The lower bound of each band, as a fraction of the window.
 *
 * FRACTIONS, NOT PERCENTAGES, because that is what the graders hold —
 * `windowCorrect / windowTotal`. The percentage is a rendering of it,
 * and `bandPercent` below is the one place that conversion happens.
 */
export const NEEDS_WORK_FLOOR = 0;
export const DEVELOPING_FLOOR = 0.60;
export const FLUENT_FLOOR = 0.80;
export const MASTERED_FLOOR = 0.95;

/**
 * How many of the most recent answers a rating is taken over.
 *
 * Twenty. Anything older has already dropped out, which is what makes
 * the number read as recent form rather than as a lifetime average.
 */
export const RATING_WINDOW = 20;

/**
 * How many answers it takes to be graded at all.
 *
 * =====================================================================
 * FIVE MEASURED, THREE SELF-RATED, AND THE GAP IS THE POINT.
 *
 * A measured answer is right or wrong, so a run of them can be lucky:
 * three right answers out of a pool of four qualities is a coin that
 * came up heads. Five is where the guess stops explaining the score.
 *
 * A self-rated rep is not a guess. The player played the thing and said
 * how it went, and three of those is already a judgement about a shape
 * rather than a sample of a distribution. Holding both to five would
 * leave two honest ratings on the floor for no reason.
 *
 * Below the floor an item is `started` rather than ungraded-and-blank —
 * see `MIN_ATTEMPTS_FOR_TIER`'s note in `tier.ts` for why that band
 * exists at all.
 * =====================================================================
 */
export const MEASURED_RATING_FLOOR = 5;
export const SELF_RATED_RATING_FLOOR = 3;

/** How a score was arrived at, which is what picks the floor. */
export type RatingKind = 'measured' | 'self-rated';

/** The floor for this kind of score. */
export function ratingFloor(kind: RatingKind): number {
  return kind === 'self-rated' ? SELF_RATED_RATING_FLOOR : MEASURED_RATING_FLOOR;
}

/** A band's floor as a whole percentage, for copy and for legends. */
export function bandPercent(floor: number): number {
  return Math.round(floor * 100);
}

/**
 * The bands as a list, best first, for anything that walks them.
 *
 * A legend, a colour map and a grader that each wrote their own copy of
 * these four is exactly how the app came to have two ladders. Walk this.
 */
export const RATING_BANDS: ReadonlyArray<{
  key: 'mastered' | 'fluent' | 'developing' | 'needsWork';
  floor: number;
}> = [
  { key: 'mastered', floor: MASTERED_FLOOR },
  { key: 'fluent', floor: FLUENT_FLOOR },
  { key: 'developing', floor: DEVELOPING_FLOOR },
  { key: 'needsWork', floor: NEEDS_WORK_FLOOR },
];

/** Which band a fraction of a window falls in. */
export function bandOf(fraction: number): typeof RATING_BANDS[number]['key'] {
  for (const { key, floor } of RATING_BANDS) {
    if (fraction >= floor) return key;
  }
  return 'needsWork';
}

// =====================================================================
// WHAT IT TAKES TO OPEN A TIER
// =====================================================================

/**
 * An item clears at ten attempts with eighty per cent passed.
 *
 * A PASS IS NOT A RIGHT ANSWER. Silas's ruling of 10 Sep 2026: an
 * attempt passes for unlocking if it was right AND no listening aid was
 * taken — In flow or Clean on the four-step scale. Replays are allowed.
 * The walk that applies it lives in each ladder's own `tierUnlock`; the
 * numbers live here.
 *
 * Eighty is the same bar the Fluent rating is drawn at, deliberately:
 * one number for "good enough", across the app.
 */
export const ITEM_CLEAR_MIN_ATTEMPTS = 10;
export const ITEM_CLEAR_MIN_ACCURACY = FLUENT_FLOOR;

/**
 * A Tier opens when this share of its items have cleared.
 *
 * =====================================================================
 * EIGHTY PER CENT OF THE ITEMS, NOT ALL OF THEM. Ruled 10 Sep 2026.
 *
 * Every item was the old rule, and it made one stubborn chord a wall:
 * fifteen items cleared and the sixteenth uncleared left the whole tier
 * shut, with the ladder's own advice pointing at work the reader had
 * already done. A tier is a body of material rather than a checklist,
 * and eighty per cent of it is where the next one starts making sense.
 *
 * ROUNDED UP, so the share can never be satisfied by clearing less than
 * it names: 6 items → 5, 15 → 12, 12 → 10, 4 → 4, 5 → 4, 2 → 2.
 * =====================================================================
 */
export const TIER_OPEN_SHARE = 0.80;

/** How many of `count` items must clear before the next tier opens. */
export function itemsToClear(count: number): number {
  return Math.ceil(count * TIER_OPEN_SHARE);
}
