/**
 * How recently a category was touched, in even weekly steps.
 *
 * =====================================================================
 * SEVEN RUNGS, EVENLY SPACED, FULL TO EMPTY.
 *
 *   today            full
 *   within 1 week
 *   within 2 weeks
 *   within 3 weeks
 *   within 4 weeks
 *   over a month
 *   never            empty
 *
 * A CONTINUOUS decay would have been easier and worse. "17 days" and
 * "19 days" are the same fact to a practising musician, and a bar that
 * moved between them would invite reading a difference that is not
 * there. Rungs say what the reader can act on: this week, last week,
 * a month ago, never.
 *
 * EVENLY SPACED, so the bar is honest as a picture. Six equal steps
 * from 1 to 0 means each rung down costs exactly as much bar as the
 * last — a scale where "over a month" sat at 0.1 would be drawing a
 * judgement rather than a position.
 * =====================================================================
 *
 * NOT DUE-BY. Freshness is when you last touched it; due-by is when a
 * schedule says to touch it again. They come apart constantly — a
 * well-proven item is not due for a month and is not stale for being
 * untouched in the meantime — and the desktop filter that answers
 * due-by is a different control on a different screen.
 *
 * ONE STORED NUMBER, NOT FOUR. The step length is the setting, and the
 * four boundaries are 1×–4× it. Four independent values could be set to
 * 7 / 9 / 30 / 31, which would still draw evenly spaced rungs while
 * meaning wildly uneven amounts of time — the bar would lie about
 * distance. One number keeps "even weekly steps" true by construction.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** The default step. Changing it re-scales all four boundaries. */
export const FRESHNESS_STEP_DEFAULT_DAYS = 7;

/**
 * How many steps sit between "today" and "over a month".
 *
 * Four, so the boundaries are 1×, 2×, 3× and 4× the step — a week, a
 * fortnight, three weeks, a month.
 */
export const FRESHNESS_STEPS = 4;

/** Every rung, freshest first. The bar's fraction and the printed scale
 *  both read this, so they cannot describe different scales. */
export interface FreshnessRung {
  label: string;
  /** How full the bar is on this rung, 0–1. */
  fraction: number;
  /**
   * The most days-since that still lands on this rung, or null for the
   * two open ends — "over a month" has no upper bound and "never" is
   * not a number of days at all.
   *
   * Carried so the printed scale can say what the words are worth once
   * the step has been changed from its default.
   */
  upToDays: number | null;
}

/**
 * The rungs, derived from the step.
 *
 * Labels are fixed words; only what they MEASURE moves with the
 * setting. That is the honest trade of one knob: at the default they
 * are literally true, and a reader who changes it has changed what a
 * "week" is worth on this scale and knows they did.
 */
export function freshnessRungs(stepDays: number): FreshnessRung[] {
  const step = Math.max(1, Math.round(stepDays));
  const labels = [
    'today',
    'within 1 week',
    'within 2 weeks',
    'within 3 weeks',
    'within 4 weeks',
    'over a month',
    'never',
  ];
  const last = labels.length - 1;
  return labels.map((label, i) => ({
    label,
    // Even steps from full to empty. `1 - i/last` rather than a written
    // list, so adding a rung re-spaces every one of them.
    fraction: 1 - i / last,
    // `today` is 0 days; the four middle rungs are 1x-4x the step; the
    // last two are open-ended and say so with null rather than a number
    // nobody could act on.
    upToDays: i === 0 ? 0 : i <= FRESHNESS_STEPS ? i * step : null,
  }));
}

/** Which rung a timestamp falls on — an index into `freshnessRungs`. */
function rungIndex(
  mostRecentAt: number | null,
  now: number,
  stepDays: number,
): number {
  if (mostRecentAt === null) return FRESHNESS_STEPS + 2; // never
  const days = Math.floor((now - mostRecentAt) / DAY_MS);
  if (days <= 0) return 0; // today
  const step = Math.max(1, Math.round(stepDays));
  for (let n = 1; n <= FRESHNESS_STEPS; n += 1) {
    if (days <= n * step) return n;
  }
  return FRESHNESS_STEPS + 1; // over a month
}

/** How full the bar is. Full today, empty never. */
export function freshnessFraction(
  mostRecentAt: number | null,
  now: number,
  stepDays: number,
): number {
  const rungs = freshnessRungs(stepDays);
  return rungs[rungIndex(mostRecentAt, now, stepDays)].fraction;
}

/** The rung's own words, for the text beside the bar. */
export function freshnessWords(
  mostRecentAt: number | null,
  now: number,
  stepDays: number,
): string {
  const rungs = freshnessRungs(stepDays);
  return rungs[rungIndex(mostRecentAt, now, stepDays)].label;
}
