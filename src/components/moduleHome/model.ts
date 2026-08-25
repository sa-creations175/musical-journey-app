/**
 * What a module-home card is, and the one computation behind all three.
 *
 * =====================================================================
 * ONE MODEL, THREE ADAPTERS — AND THE MODEL IS THE CONTRACT.
 *
 * Harmonic fluency, reading and ear training show the same card over
 * three different things: a flashcard category, a reading skill, a
 * whole sub-module. What they have in common is not their content, it
 * is the SHAPE of the claim each card makes — this many items, this
 * rolling window, this tier, last touched this long ago.
 *
 * So the card component never sees a Flashcard, a reading itemRef or a
 * module id. It sees this. An adapter is whatever turns one module's
 * data into a list of these, and adding a fourth module means writing a
 * fourth adapter, not a fourth card.
 * =====================================================================
 *
 * `stats` is the piece worth guarding: it is `computeCategoryStats`
 * lifted out of `HarmonicFluencyTracker`, where it was the only correct
 * implementation of "a rolling window over a group of separately
 * scheduled items" in the app. Reading and ear training would each have
 * grown their own, and the three would have disagreed about the same
 * question the way the three tier computations did
 * (docs/RULE_LEGIBILITY.md §1.12).
 */
import type { AttemptRecord } from '../../lib/db';
import { ROLLING_WINDOW_SIZE } from '../../lib/adaptiveSelection';
import { daysBetween, localDayKey } from '../../lib/dailyGoal';
import { computeTier, type Tier } from '../../lib/tier';
import { spacingIntervalFor } from '../../lib/useSpacingIntervals';
import type { TickAttempt } from '../../lib/progressBar';

/** The measured half of a card — everything derived from attempts. */
export interface CategoryCardStats {
  /**
   * The rolling window, newest first, each rep carrying ITS OWN item's
   * interval.
   *
   * A card is not an item. "Pentatonic scales" is 41 cards on 41
   * schedules and "intervals" is 25 rows on 25; there is no single
   * interval for the group, so the strip fades each tick against the
   * item it was on. See `TickAttempt.intervalDays`, which is optional
   * for exactly this case.
   */
  window: TickAttempt[];
  rollingCorrect: number;
  rollingTotal: number;
  tier: Tier;
  /** Distinct items with at least one attempt. */
  itemsSeen: number;
  lastPracticedDaysAgo: number | null;
}

/** A card, ready to render. */
export interface CategoryCardModel extends CategoryCardStats {
  /** Stable identity — the category id, skill id or sub-module id.
   *  Used as the expansion key, so it must not be the label. */
  key: string;
  label: string;
  /** How many items the card covers. DERIVED by the adapter from a
   *  catalog helper, never written down. */
  itemCount: number;
  /**
   * A short caption explaining the count, when the bare number would
   * mislead.
   *
   * Ear training's intervals card reads 25 against a module that says
   * thirteen intervals, and scales & modes reads 18 against nine modes
   * — both because a spacing row is per direction or per tab, not per
   * catalog entry. `null` where the count speaks for itself.
   *
   * DERIVED BY THE ADAPTER, never written. See `intervalCountSummary`.
   */
  countDetail: string | null;

  /**
   * The one line saying what this asks of the reader.
   *
   * `null` until the copy exists. Deliberately not defaulted to a
   * placeholder: a card with no description renders no line, which is
   * honest, where "Description coming soon" would be a sentence the
   * reader has to read before learning it says nothing.
   */
  description: string | null;
}

/**
 * The rolling window over a GROUP of separately scheduled items.
 *
 * `attempts` must already be narrowed to the group. Narrowing is the
 * adapter's job because only it knows what "belongs" means — a
 * flashcard category matches on `card.category`, a reading skill on a
 * parsed itemRef, a sub-module on `moduleId`.
 *
 * `now` is passed rather than read from the clock so a render is pure
 * and a test needs no fake timer.
 */
export function categoryCardStats(
  attempts: readonly AttemptRecord[],
  intervals: ReadonlyMap<string, number>,
  now: number,
): CategoryCardStats {
  const sorted = [...attempts].sort((a, b) => b.timestamp - a.timestamp);
  const recent = sorted.slice(0, ROLLING_WINDOW_SIZE);
  const rollingCorrect = recent.filter(a => a.correct).length;
  const latestTs = sorted[0]?.timestamp;
  const lastPracticedDaysAgo = latestTs
    ? daysBetween(localDayKey(new Date(latestTs)), localDayKey(new Date(now)))
    : null;
  return {
    window: recent.map(a => ({
      correct: a.correct,
      timestamp: a.timestamp,
      intervalDays: spacingIntervalFor(intervals, a.itemId),
    })),
    rollingCorrect,
    rollingTotal: recent.length,
    tier: computeTier({
      windowCorrect: rollingCorrect,
      windowTotal: recent.length,
      daysSinceLastAttempt: lastPracticedDaysAgo,
    }),
    itemsSeen: new Set(sorted.map(a => a.itemId)).size,
    lastPracticedDaysAgo,
  };
}
