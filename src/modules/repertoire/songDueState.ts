import type { SongKey } from '../../lib/db';
import { keyDueState, type DueWindows } from './matrix/keySpacing';
import { isComfortableOrBetter } from './matrix/keyProgress';

/**
 * Whether a SONG has re-proving to do, rolled up from its keys.
 *
 * ---------------------------------------------------------------
 * DUE IS PER KEY. A LIST ROW IS PER SONG. THIS IS THE JOIN.
 *
 * A song is due when a key that CURRENTLY HOLDS part of its rung is
 * due or due soon — work still available to keep what you have.
 *
 * TWO EXCLUSIONS, and both are the point rather than housekeeping:
 *
 *   A key that never counted. `isComfortableOrBetter` is what makes a
 *   key hold anything, so a `learning` key has no claim to re-prove
 *   and nothing to lose. `keyDueState` would read it as `held` anyway
 *   (a null due date holds), but saying so here means the rule reads
 *   as a rule rather than as a coincidence of another function.
 *
 *   OVERDUE, which is different IN KIND from due. Past due and past
 *   grace, the rung has already dropped, and `DemotionNotice` says so
 *   on the song page persistently — with the date, the criterion and
 *   the key. Putting an already-dropped song in the same list as one
 *   merely approaching would flatten two situations that call for
 *   opposite responses: one is "do this and keep it", the other is
 *   "this is gone; here is what it takes to get it back".
 * ---------------------------------------------------------------
 *
 * THE WORDS COME FROM `KeyRow`. It has rendered `due` and `soon`
 * against these same states since 3d-0a, so a card that said "needs a
 * retest" would be a second name for a fact the grid already names.
 *
 * Pure and synchronous: `nextDueAt` arrives in a map the caller
 * already loaded, because both callers compute this inside a `useMemo`
 * during render, where a Dexie read is a different kind of bug.
 */

/** `due` outranks `soon` when a song has both. The more urgent of two
 *  true statements is the one a single row can carry. */
export type SongDueState = 'due' | 'due-soon';

/**
 * A key and WHEN it is next due.
 *
 * The date is carried rather than left in the map because `SongKey`
 * has no `nextDueAt` field — the due dates live in spacing rows, keyed
 * separately. A renderer that wanted to say "in 4 days" would
 * otherwise need the map threaded to it as a second prop, and two
 * things to keep in step where one would do.
 */
export interface DueKey {
  key: SongKey;
  /** Null only for a key that has never been proven, which cannot
   *  reach either state here. Kept nullable so the type matches the
   *  map it came from rather than asserting past it. */
  nextDueAt: number | null;
}

export interface SongDueReading {
  state: SongDueState;
  /** Keys past their due date. */
  dueKeys: DueKey[];
  /** Keys inside the warning window. */
  soonKeys: DueKey[];
}

/**
 * Null when there is nothing to say — which covers a song with no held
 * keys, a song whose keys are all comfortably inside their intervals,
 * and a song that has already dropped a rung.
 *
 * Null rather than a `'held'` member deliberately: every caller renders
 * NOTHING in that case, and a state that always maps to no output is a
 * branch waiting to be rendered by mistake.
 */
export function songDueReading(
  songKeys: ReadonlyArray<SongKey>,
  dueByKeyId: ReadonlyMap<string, number | null>,
  now: number,
  windows: DueWindows,
): SongDueReading | null {
  const dueKeys: DueKey[] = [];
  const soonKeys: DueKey[] = [];

  for (const key of songKeys) {
    if (!isComfortableOrBetter(key.keyState)) continue;
    const nextDueAt = dueByKeyId.get(key.id) ?? null;
    const state = keyDueState(nextDueAt, now, windows);
    if (state === 'due') dueKeys.push({ key, nextDueAt });
    else if (state === 'due-soon') soonKeys.push({ key, nextDueAt });
    // 'held' has nothing to say; 'overdue' is DemotionNotice's, not
    // this function's — see the header.
  }

  if (dueKeys.length === 0 && soonKeys.length === 0) return null;
  return {
    state: dueKeys.length > 0 ? 'due' : 'due-soon',
    dueKeys,
    soonKeys,
  };
}

/** How many songs in a list have something to re-prove. What the
 *  dashboard pill counts. */
export function countSongsDue(
  readings: ReadonlyArray<SongDueReading | null>,
): number {
  return readings.filter(r => r !== null).length;
}
