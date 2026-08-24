import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { FALLBACK_INTERVAL_DAYS } from './progressBar';

/**
 * Each item's own review interval, for the progress strip's fade.
 *
 * ---------------------------------------------------------------
 * THE ONE PIECE OF NEW WIRING THE MIGRATION NEEDS.
 *
 * No tracker read `spacingState` before this. They each computed a
 * rolling window from `attempts` and stopped — which is why every fade
 * that existed was uniform, and why an item drilled fifteen times aged
 * its reps at the same rate as one drilled five.
 *
 * Keyed by `itemRef`, which every drill already writes on its
 * `recordEngagement` call and which matches the id its tracker groups
 * rows by. The one exception is intervals, whose ref is
 * `${id}:${direction}` — that is the same string its tracker splits on,
 * so the map still lines up.
 * ---------------------------------------------------------------
 */
export function useSpacingIntervals(moduleRef: string): ReadonlyMap<string, number> {
  const rows = useLiveQuery(
    () => db.spacingState.where('moduleRef').equals(moduleRef).toArray(),
    [moduleRef],
  ) ?? [];
  const map = new Map<string, number>();
  for (const row of rows) map.set(row.itemRef, row.currentIntervalDays);
  return map;
}

/**
 * The interval to fade an item's reps against.
 *
 * MISSING IS A REAL STATE AND HAS A DEFINED ANSWER, rather than a
 * silent zero. A spacing row is created by the FIRST attempt, so an
 * item with reps but no row means either a `recordEngagement` that
 * threw or a row that predates the spacing engine. Both are real.
 *
 * The fallback fades FASTER than any real interval would, which is the
 * conservative direction: it under-claims freshness rather than
 * asserting a rep is current when nothing knows whether it is.
 */
export function spacingIntervalFor(
  intervals: ReadonlyMap<string, number>,
  itemRef: string,
): number {
  const days = intervals.get(itemRef);
  return days !== undefined && days > 0 ? days : FALLBACK_INTERVAL_DAYS;
}
