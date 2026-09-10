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
 * THEY ARE EDITABLE NOW, AND THAT IS WHY THEY ARE READ THROUGH A
 * FUNCTION.
 *
 * Silas's Settings page of 10 Sep 2026 lets him move the three band
 * thresholds, both floors, the window and the Tier rule. A `const`
 * cannot be moved, so the values live in one mutable record and every
 * reader calls `ratingRules()` for them.
 *
 * MODULE STATE RATHER THAN A THREADED ARGUMENT, deliberately.
 * `computeTier` is pure, synchronous, and called from a dozen places
 * that have no settings object to hand — a dashboard row, a fluency
 * tracker, a quiz's adaptive weighting. Threading a record through all
 * of them to serve one screen would be a large change to a lot of code
 * whose behaviour does not depend on it.
 *
 * SO EVERY PURE FUNCTION HERE STILL TAKES AN EXPLICIT RULES ARGUMENT,
 * defaulting to the live one. Tests pin behaviour by passing their own,
 * and nothing is at the mercy of what a previous test wrote.
 *
 * A CHANGE RE-GRADES ON THE NEXT READ. Nothing stored moves: an
 * attempt row is what happened, and a band is a reading of it.
 * =====================================================================
 */
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getPref, setPref } from './userPrefs';

/**
 * Every number a rating depends on.
 *
 * FRACTIONS, NOT PERCENTAGES, for the three band floors, because that
 * is what the graders hold — `windowCorrect / windowTotal`. The
 * percentage is a rendering of it, and `bandPercent` is the one place
 * that conversion happens.
 */
export interface RatingRules {
  developingFloor: number;
  fluentFloor: number;
  masteredFloor: number;
  /** How many of the most recent answers a rating is taken over. */
  window: number;
  /** Answers before a measured card is graded at all. */
  measuredFloor: number;
  /** Rated reps before a self-rated cell is graded. It is ALSO that
   *  cell's window — see `lowestOf` in `tier.ts`. */
  selfRatedFloor: number;
  /** Attempts before an ear-training item can clear. */
  itemClearAttempts: number;
  /** Share of a Tier's items that must clear before it opens. */
  tierOpenShare: number;
  /**
   * Share of a Shapes & Patterns Tier's CELLS that must be solid
   * before the next Tier opens.
   *
   * ITS OWN NUMBER, NOT `tierOpenShare`. The Ear Training ladders count
   * ITEMS — twelve chord qualities, nine modes — and ask for 80% of
   * them. This counts CELLS: a quality across twelve keys and every
   * inversion state, 1,080 of them for Tier 1. Asking for 80% of that
   * is asking for a different thing, and the design doc's own example
   * is 50. One name for two measures would have made the Settings page
   * offer a reader one field that moved both.
   */
  shapesTierOpenShare: number;
}

export const DEFAULT_RATING_RULES: RatingRules = {
  developingFloor: 0.60,
  fluentFloor: 0.80,
  masteredFloor: 0.95,
  window: 20,
  measuredFloor: 5,
  selfRatedFloor: 3,
  itemClearAttempts: 10,
  tierOpenShare: 0.80,
  shapesTierOpenShare: 0.50,
};

/** Needs Work has no floor of its own; it is what is left. */
export const NEEDS_WORK_FLOOR = 0;

let live: RatingRules = DEFAULT_RATING_RULES;

/** The numbers in force. Every grader reads this. */
export function ratingRules(): RatingRules {
  return live;
}

export const RATING_RULES_PREF_KEY = 'ratingRules';

/** A stored record read back field by field, so a row written by an
 *  older build still yields usable rules. */
export function coerceRules(value: unknown): RatingRules {
  const v = (typeof value === 'object' && value !== null)
    ? value as Partial<Record<keyof RatingRules, unknown>>
    : {};
  const num = (raw: unknown, fallback: number, lo: number, hi: number) =>
    typeof raw === 'number' && Number.isFinite(raw) && raw >= lo && raw <= hi
      ? raw : fallback;
  const d = DEFAULT_RATING_RULES;
  return {
    developingFloor: num(v.developingFloor, d.developingFloor, 0.01, 0.99),
    fluentFloor: num(v.fluentFloor, d.fluentFloor, 0.01, 0.99),
    masteredFloor: num(v.masteredFloor, d.masteredFloor, 0.01, 1),
    window: num(v.window, d.window, 10, 50),
    measuredFloor: num(v.measuredFloor, d.measuredFloor, 3, 20),
    selfRatedFloor: num(v.selfRatedFloor, d.selfRatedFloor, 2, 5),
    itemClearAttempts: num(v.itemClearAttempts, d.itemClearAttempts, 5, 30),
    tierOpenShare: num(v.tierOpenShare, d.tierOpenShare, 0.5, 1),
    // ADDED 10 SEP 2026, and additive on purpose: a record written
    // before today has no such key, `num` falls to the default, and
    // nothing is migrated.
    shapesTierOpenShare: num(v.shapesTierOpenShare, d.shapesTierOpenShare, 0.1, 1),
  };
}

/**
 * Put a set of rules in force. Exported for the Settings page and for
 * tests; production writes go through `saveRatingRules`.
 */
export function setRatingRules(next: RatingRules): void {
  live = next;
}

/** Read the stored rules and put them in force. Called once at start. */
export async function hydrateRatingRules(): Promise<RatingRules> {
  live = coerceRules(await getPref<unknown>(RATING_RULES_PREF_KEY, DEFAULT_RATING_RULES));
  return live;
}

/** Store a set of rules and put them in force. */
export async function saveRatingRules(next: RatingRules): Promise<void> {
  live = next;
  await setPref(RATING_RULES_PREF_KEY, next);
}

// `RATING_WINDOW`, `DEVELOPING_FLOOR`, `FLUENT_FLOOR`,
// `MASTERED_FLOOR`, `MEASURED_RATING_FLOOR`,
// `SELF_RATED_RATING_FLOOR`, `ITEM_CLEAR_MIN_ATTEMPTS`,
// `ITEM_CLEAR_MIN_ACCURACY` and `TIER_OPEN_SHARE` WERE CONSTANTS HERE.
// They are fields of `RatingRules` now, because the Settings page
// edits them — read them with `ratingRules()`.

/**
 * How a score was arrived at, which is what picks the floor.
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
 * rather than a sample of a distribution.
 *
 * Below the floor an item is `started` rather than ungraded-and-blank —
 * see `MIN_ATTEMPTS_FOR_TIER`'s note in `tier.ts` for why that band
 * exists at all.
 * =====================================================================
 */
export type RatingKind = 'measured' | 'self-rated';

/** The floor for this kind of score. */
export function ratingFloor(kind: RatingKind, rules = live): number {
  return kind === 'self-rated' ? rules.selfRatedFloor : rules.measuredFloor;
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
export type BandKey = 'mastered' | 'fluent' | 'developing' | 'needsWork';

export function ratingBands(
  rules = live,
): ReadonlyArray<{ key: BandKey; floor: number }> {
  return [
    { key: 'mastered', floor: rules.masteredFloor },
    { key: 'fluent', floor: rules.fluentFloor },
    { key: 'developing', floor: rules.developingFloor },
    { key: 'needsWork', floor: NEEDS_WORK_FLOOR },
  ];
}

/** Which band a fraction of a window falls in. */
export function bandOf(fraction: number, rules = live): BandKey {
  for (const { key, floor } of ratingBands(rules)) {
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
// The bar is `fluentFloor` itself, not a copy of it — one number for
// "good enough", across the app, and moving Fluent moves this with it.

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
/** How many of `count` items must clear before the next tier opens. */
export function itemsToClear(count: number, rules = live): number {
  return Math.ceil(count * rules.tierOpenShare);
}

/**
 * The rules in force, reactively, plus a setter that stores them.
 *
 * =====================================================================
 * TWO THINGS AT ONCE, AND BOTH ARE NEEDED.
 *
 * `useLiveQuery` keeps the SETTINGS PAGE showing what is stored, so an
 * edit made on another device arrives here. `setRatingRules` keeps the
 * MODULE-LEVEL value in step, so the pure graders — which have no hook
 * and no settings object — read the same numbers the page shows.
 *
 * Hydration also happens here rather than at the app's entry point: the
 * first read on a cold start is the defaults, and the moment the stored
 * row arrives every consumer of `useLiveQuery` re-renders with it. A
 * grade computed in that first instant is re-computed on the next read,
 * which is exactly what the page promises.
 * =====================================================================
 */
export function useRatingRules(): [RatingRules, (next: RatingRules) => Promise<void>] {
  const stored = useLiveQuery(
    async () => getPref<unknown>(RATING_RULES_PREF_KEY, DEFAULT_RATING_RULES),
    [],
  );
  const rules = coerceRules(stored);
  const key = JSON.stringify(rules);
  const [seen, setSeen] = useState(key);
  const [local, setLocal] = useState<RatingRules>(rules);
  if (key !== seen) {
    setSeen(key);
    setLocal(rules);
    setRatingRules(rules);
  }

  const set = async (next: RatingRules) => {
    setLocal(next);
    await saveRatingRules(next);
  };

  return [local, set];
}
