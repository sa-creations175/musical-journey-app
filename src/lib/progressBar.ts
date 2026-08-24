import { MIN_ATTEMPTS_FOR_TIER } from './tier';
import { ROLLING_WINDOW_SIZE } from './adaptiveSelection';

/**
 * One item's progress, as three segments and a strip of ticks.
 *
 * =====================================================================
 * WIDTH AND COLOUR COME FROM ONE SOURCE. THAT IS THE WHOLE POINT.
 *
 * Every tracker in the app draws its bar like this:
 *
 *   width: rolling.total === 0 ? 0 : `${Math.max(4, rolling.percent)}%`
 *   className: TIER_BAR_CLASS[rolling.tier]
 *
 * `percent` is correct/total — ACCURACY. `tier` is `untouched` below
 * five attempts. So four correct answers paint an 80%-wide bar in
 * untouched grey: width says "you got most of these right", colour says
 * "there is nothing here". Two sources, disagreeing, on every item that
 * has been tried but not yet rated.
 *
 * Worse, grey means two different things on one screen. On a rated bar
 * the grey remainder is WRONG ANSWERS. On an unrated one the whole grey
 * bar is ATTEMPTS NOT MADE. Same pixels, opposite readings.
 *
 * So this computes all three widths from one input, and there is no
 * separate empty state: an unrated bar is these same three segments
 * with grey still present.
 * =====================================================================
 */

export interface BarInput {
  /** Attempts in the rolling window that were right. */
  correct: number;
  /** Attempts in the rolling window that were wrong. */
  wrong: number;
}

export interface BarSegments {
  /** Percentages, summing to 100 whenever anything is present. */
  correctPct: number;
  wrongPct: number;
  /** Attempts not yet made, counting up to the rating threshold. Zero
   *  once the item is rated. */
  pendingPct: number;
  /** What the percentages are out of — the threshold until it is
   *  passed, then the attempt count itself. */
  denominator: number;
  attempted: number;
  /** True once there are enough attempts to rate. NOT a different
   *  render path — see the header. */
  rated: boolean;
}

/**
 * The three widths.
 *
 * THE DENOMINATOR IS WHAT MAKES GREY MEAN ONE THING. Below the
 * threshold it is the threshold, so grey is "attempts still to make".
 * At or above it, it is the attempt count, so grey is zero and the bar
 * is green and amber only. Grey never means "wrong", ever, at any
 * count — which is the collision this replaces.
 */
export function barSegments({ correct, wrong }: BarInput): BarSegments {
  const safeCorrect = Math.max(0, Math.floor(correct));
  const safeWrong = Math.max(0, Math.floor(wrong));
  const attempted = safeCorrect + safeWrong;
  const denominator = Math.max(MIN_ATTEMPTS_FOR_TIER, attempted);
  const pct = (n: number) => (denominator === 0 ? 0 : (n / denominator) * 100);
  return {
    correctPct: pct(safeCorrect),
    wrongPct: pct(safeWrong),
    pendingPct: pct(Math.max(0, denominator - attempted)),
    denominator,
    attempted,
    rated: attempted >= MIN_ATTEMPTS_FOR_TIER,
  };
}

// ---------------------------------------------------------------------
// The tick strip
// ---------------------------------------------------------------------

/**
 * How much solidity a tick loses per full spacing interval of age, and
 * the floor it never falls below.
 *
 * ---------------------------------------------------------------
 * AGE IS MEASURED IN THE ITEM'S OWN INTERVALS, NOT IN DAYS.
 *
 * An item drilled fifteen times has a longer `currentIntervalDays` than
 * one drilled five, and its reps should stay solid longer — without
 * anyone tuning a number. A six-day-old rep on an item reviewed weekly
 * is nearly current; the same six days on an item reviewed every two
 * days is three intervals stale. A hardcoded day count cannot tell
 * those apart, and would need re-tuning every time the spacing engine
 * changed.
 *
 * THE FLOOR IS NOT ZERO. A tick that faded to nothing would lose the
 * one thing it still carries — whether that attempt was right or wrong.
 * Old evidence is weak, not absent.
 * ---------------------------------------------------------------
 */
export const FADE_PER_INTERVAL = 0.25;
export const FADE_FLOOR = 0.25;

/** Fallback when an item has no spacing row yet. One day makes every
 *  rep read as its own interval old, which is the conservative
 *  direction: it fades faster rather than claiming freshness. */
export const FALLBACK_INTERVAL_DAYS = 1;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * A single tick's opacity, from that attempt's OWN age.
 *
 * Per tick, never per strip. Ten reps from a month ago and ten from
 * yesterday share one strip, and a uniform fade would make them
 * indistinguishable — which is the thing the strip exists to show.
 */
export function tickOpacity(
  attemptAt: number,
  now: number,
  intervalDays: number,
): number {
  const days = Math.max(0, now - attemptAt) / MS_PER_DAY;
  const interval = intervalDays > 0 ? intervalDays : FALLBACK_INTERVAL_DAYS;
  const intervalsOld = days / interval;
  const opacity = 1 - FADE_PER_INTERVAL * intervalsOld;
  return Math.min(1, Math.max(FADE_FLOOR, opacity));
}

export interface TickAttempt {
  correct: boolean;
  timestamp: number;
  /**
   * This rep's OWN review interval, when the strip's rows do not share
   * one.
   *
   * ---------------------------------------------------------------
   * OPTIONAL, AND THAT IS THE DESIGN.
   *
   * Four of the five trackers show one ITEM per row, so every rep in
   * the strip shares that item's interval and the strip-level value is
   * exactly right. They pass nothing here and are unaffected.
   *
   * Harmonic fluency shows a CATEGORY per row — "pentatonic scales" is
   * 41 cards, each separately scheduled. There is no single interval
   * for that row, and a median across cards at 2-day and 30-day
   * intervals would describe neither card while reading as a fact
   * about every rep in the strip.
   *
   * The fade is already per-tick, so making its INPUT per-tick is the
   * change that keeps the strip exactly right rather than approximately
   * right. Required would have forced a value at four call sites that
   * already have the correct one a level up.
   * ---------------------------------------------------------------
   */
  intervalDays?: number;
}

export interface Tick {
  /** Null for a slot no attempt has filled. */
  correct: boolean | null;
  opacity: number;
  /** Slot index, 0 = most recent. */
  index: number;
}

/**
 * The strip: one tick per slot in the rolling window, OLDEST FIRST.
 *
 * ---------------------------------------------------------------
 * IT READS THE SAME DIRECTION AS THE BAR ABOVE IT.
 *
 * The bar fills left to right from your earliest attempts. A strip
 * running newest-first would put your most recent rep at the left edge
 * directly beneath the bar's earliest — two things stacked on top of
 * each other, reading in opposite directions, and nothing on screen
 * saying so.
 *
 * So slot 0 is the OLDEST attempt still in the window, and new reps
 * arrive at the right, next to the empty slots they will fill. The
 * order is part of the meaning: a strip rendered backwards shows a
 * recovering item as a declining one.
 *
 * `attempts` arrives NEWEST-first — that is the order every caller
 * already sorts in, and the order `rollingFor` slices its window in —
 * so the window is taken from the front and then reversed. Slicing
 * from the back instead would take the OLDEST twenty on a long
 * history, which is not the rolling window at all.
 * ---------------------------------------------------------------
 */
export function tickStrip(
  attempts: ReadonlyArray<TickAttempt>,
  now: number,
  intervalDays: number,
): Tick[] {
  const window = attempts.slice(0, ROLLING_WINDOW_SIZE);
  const oldestFirst = [...window].reverse();
  const out: Tick[] = [];
  for (let i = 0; i < ROLLING_WINDOW_SIZE; i++) {
    const a = oldestFirst[i];
    out.push(a
      ? {
        correct: a.correct,
        // The rep's own interval when it has one, else the strip's.
        opacity: tickOpacity(a.timestamp, now, a.intervalDays ?? intervalDays),
        index: i,
      }
      : { correct: null, opacity: 1, index: i });
  }
  return out;
}

/**
 * The line beside the bar, when the item is not yet rated.
 *
 * ---------------------------------------------------------------
 * "no data yet — needs 5 (4/5)" WAS A LIE, AND IN A SPECIFIC WAY.
 *
 * There IS data. Four attempts is data. What there is not is enough to
 * RATE, which is a different claim, and the old string made the app say
 * the first thing while meaning the second — beside a bar that was
 * simultaneously painting those four attempts as an empty grey.
 *
 * DERIVED FROM `BarSegments`, the same object the bar's widths come
 * from. Composing it from a separate count is how the label and the bar
 * drift — which is the original defect wearing different clothes.
 *
 * Null once rated: the tracker then shows its own correct/total and
 * tier, and a second summary of the same numbers is noise.
 * ---------------------------------------------------------------
 */
export function unratedLabel(seg: BarSegments): string | null {
  if (seg.rated) return null;
  if (seg.attempted === 0) return 'no data yet';
  const remaining = seg.denominator - seg.attempted;
  return `${seg.attempted} of ${seg.denominator} attempts — `
    + `${remaining} more to rate`;
}

// ---------------------------------------------------------------------
// What the ⓘ says
// ---------------------------------------------------------------------

/**
 * The explanation, DERIVED from the same constants the bar and strip
 * read.
 *
 * Not prose. A hand-written "the bar fills to five attempts" goes stale
 * the first time `MIN_ATTEMPTS_FOR_TIER` moves, and nothing catches it
 * — the text still reads plausibly, it is simply wrong. Interpolating
 * the constant means the sentence cannot disagree with the bar above
 * it, and a test can change the constant and watch the copy follow.
 */
export function progressBarExplanation(intervalDays: number): string[] {
  const interval = intervalDays > 0 ? intervalDays : FALLBACK_INTERVAL_DAYS;
  const dayWord = (n: number) => `${n} day${n === 1 ? '' : 's'}`;
  const steps = Math.round((1 - FADE_FLOOR) / FADE_PER_INTERVAL);
  return [
    'Green is an answer you got right. Amber is one you got wrong.',
    `Grey is an attempt you have not made yet. The bar fills to `
      + `${MIN_ATTEMPTS_FOR_TIER} attempts, which is what it takes to be `
      + `rated — after that there is no grey left and the bar is green and `
      + `amber only.`,
    `The ticks below are your last ${ROLLING_WINDOW_SIZE} attempts, oldest `
      + `first, left to right — the same direction the bar above fills. One `
      + `tick each; an empty slot is grey.`,
    `Each tick fades on its own age, measured against this item's review `
      + `interval of ${dayWord(interval)}. A tick loses `
      + `${Math.round(FADE_PER_INTERVAL * 100)}% of its strength per `
      + `${dayWord(interval)}, reaching its faintest after about `
      + `${dayWord(interval * steps)}. It never fades away entirely — an old `
      + `answer is weak evidence, not missing evidence.`,
  ];
}

/** A screen reader's version of the strip, which the bar alone cannot
 *  convey: the bar is a total, the strip is a sequence. */
export function tickStripLabel(ticks: ReadonlyArray<Tick>): string {
  const filled = ticks.filter(t => t.correct !== null);
  if (filled.length === 0) return 'No attempts yet.';
  const right = filled.filter(t => t.correct).length;
  const sequence = filled
    .map(t => (t.correct ? 'right' : 'wrong'))
    .join(', ');
  return `Last ${filled.length} attempts, oldest first: ${sequence}. `
    + `${right} right, ${filled.length - right} wrong.`;
}
