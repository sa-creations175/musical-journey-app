import { SONG_KEY_ITEM_REF_PREFIX } from '../../practice/endOfSessionPersistence';
import { getSpacingState, recordEngagement } from '../../../lib/spacingState';
import type { Feel } from '../../../lib/fluencyScale';
import { feelToRating } from '../../shapes-and-patterns/drillModel';

/**
 * Recording that a key was, or was not, proven.
 *
 * ---------------------------------------------------------------
 * ONLY THE WHOLE-SONG TEST MOVES THE CLOCK.
 *
 * A rung says the key is HELD, and holding means re-proving under the
 * bar that earned it: three clean run-throughs at tempo, back to back,
 * in one sitting. If a single clean pass doubled the interval, a key
 * could stay held indefinitely on one good run a month — never three
 * in a row, never under pressure. That hollows out "prove it, three
 * times" while appearing to satisfy it.
 *
 *   test PASSED        → 'flying'   → interval doubles
 *   test attempted,
 *     did not reach 3  → 'crawling' → interval halves
 *   log-a-run          → no signal at all, either outcome
 *
 * A single run is BREADTH evidence and already counts as criterion 3
 * of Cross-key → Internalized. Letting it also drive DEPTH scheduling
 * would make one event do two jobs at two different standards. And the
 * symmetry is deliberate: if a run cannot earn time, it must not cost
 * time either.
 *
 * `flying` rather than `cruising` for a pass, although both double the
 * interval identically. `performanceHistory` stores the label and
 * `nextStageRatingBased` reads ratings elsewhere, so the honest one is
 * worth writing even where the arithmetic cannot tell them apart.
 * ---------------------------------------------------------------
 */

export function songKeyItemRef(songKeyId: string): string {
  return `${SONG_KEY_ITEM_REF_PREFIX}${songKeyId}`;
}

/**
 * Record the outcome of a whole-song test on one key.
 *
 * =====================================================================
 * NO BOUNDS. THE SONGS ROW OF THE SPACING TREE DECIDES, LIKE EVERY
 * OTHER CALLER.
 *
 * This used to pass `bounds: boundsFrom(settings)`, a per-caller
 * override carrying repertoire's own first-interval and longest-
 * interval prefs. When `recordEngagement` moved onto the two-stage
 * engine the parameter stopped being read, and the override went
 * silently nowhere — song keys were scheduled by the tree's defaults
 * while the settings screen still showed numbers that did nothing.
 *
 * Removed rather than reconnected: one engine means one place the
 * numbers live, and that place is now the Songs row. Repertoire is no
 * longer a special case, so `boundsFrom` and the parameter it fed are
 * both gone.
 *
 * Outside a transaction, mirroring every other spacing write: a
 * spacing failure must not roll back the test result the user just
 * earned.
 * =====================================================================
 */
export async function recordKeyProving(args: {
  songKeyId: string;
  passed: boolean;
  timestamp?: number;
}): Promise<void> {
  try {
    await recordEngagement({
      itemRef: songKeyItemRef(args.songKeyId),
      moduleRef: 'repertoire',
      // THE TEST, AND THE ONLY THING THAT RATES A SONG KEY. A pass is
      // a clean run at tempo, which is Clean rather than In flow — the
      // test does not ask how it felt, so it cannot claim the top step.
      // A failure is Struggled.
      signal: {
        kind: 'rating',
        rating: args.passed ? 'flying' : 'crawling',
        feel: args.passed ? 3 : 1,
        // =============================================================
        // IT MOVES THE CLOCK. IT DOES NOT CAST A FOURTH VOTE.
        //
        // The three runs of the test each wrote their own rating here
        // through `recordSongKeyRun`. A pass writing a FOURTH rating
        // would put a rep on the row that nobody played — and under the
        // streak rule that rep is Clean, so it could extend or complete
        // a streak on its own.
        //
        // What a pass is actually for at this level is the SCHEDULE:
        // the key has been proven, so ask again later rather than soon.
        // `recordEngagement` moves `nextDueAt` and `lastEngagedAt` for
        // any engagement, scoring or not, so `scores: false` gets the
        // clock moved and leaves the band to the runs.
        //
        // Same mechanism and same reasoning as `logPractice.ts`, which
        // records that a song was sat down with without claiming how
        // well it went.
        // =============================================================
        scores: false,
      },
      ...(args.timestamp !== undefined ? { timestamp: args.timestamp } : {}),
    });
  } catch (err) {
    console.warn('[repertoire] key proving signal failed', err);
  }
}

/** When each key is next due, keyed by songKey id. Null for a key that
 *  has never been proven — which is not the same as due now, and the
 *  four-state reader treats it differently. */
export async function dueByKeyId(
  songKeyIds: ReadonlyArray<string>,
): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  await Promise.all(songKeyIds.map(async id => {
    try {
      const row = await getSpacingState(songKeyItemRef(id), 'repertoire', 'both');
      out.set(id, row?.nextDueAt ?? null);
    } catch {
      // A read failure must not demote a key. Absent reads as
      // never-proven, which holds the rung.
      out.set(id, null);
    }
  }));
  return out;
}

/**
 * Which of these keys carry a rating at all.
 *
 * =====================================================================
 * PRESENCE, WHICH `dueByKeyId` CANNOT ANSWER.
 *
 * That function sets an entry for every id it is asked about — null
 * where there is no row — so a key that has never been played and a
 * key played but not yet scheduled look identical in its map. The
 * Started → Learning rung turns on exactly that difference: whether a
 * rated run has ever happened.
 *
 * Reads the same `songKey:<id>` ref, minted by the same function, so
 * the two readers cannot drift onto different namespaces. A read
 * failure omits the key, which HOLDS the song at Started rather than
 * promoting it on an error.
 * =====================================================================
 */
export async function ratedKeyIds(
  songKeyIds: ReadonlyArray<string>,
): Promise<Set<string>> {
  const out = new Set<string>();
  await Promise.all(songKeyIds.map(async id => {
    try {
      const row = await getSpacingState(songKeyItemRef(id), 'repertoire', 'both');
      if (row) out.add(id);
    } catch {
      // Absent reads as never-rated. See the note above.
    }
  }));
  return out;
}

/**
 * Record a rated RUN against the song in this key.
 *
 * =====================================================================
 * THE SCHEDULE IS PER SONG-AND-KEY, NEVER PER SECTION.
 *
 * A `songCell:` row is a BAND — how well one section goes in one key.
 * This row is the SCHEDULE — when the song in this key should come
 * round again. They are different levels and must not be conflated:
 * scheduling twelve sections independently would have the app ask for
 * a verse on Tuesday and the chorus of the same song on Thursday,
 * which is not how anybody practises a song.
 *
 * So a rated run writes a band at every section it covered AND one
 * engagement here. `recordKeyProving` above writes to this same ref
 * for the whole-song test — one ref minter, two callers, rather than
 * a second namespace that would have to be kept in step.
 *
 * WHAT IT IS NOT: this does not move a key's status, AND IT DOES NOT
 * MOVE THE RETEST CLOCK. It records that the song was played in this
 * key and how it felt. Until 10 Sep 2026 it let the scheduler move the
 * due date on every rated run — against this file's own header and
 * SONG_PAGE_REDESIGN_SPEC, which make the whole-song test the only
 * writer of the clock.
 * =====================================================================
 */
export async function recordSongKeyRun(args: {
  songKeyId: string;
  feel: Feel;
  /** True for a rep given inside a test. Rides into the band rule;
   *  absent would mean legacy, and this is not legacy. */
  fromTest: boolean;
  /** Which testing session it happened in. Required for the same
   *  reason `fromTest` is: absent means pre-change history, and a live
   *  writer must not make that claim. */
  sessionId: string;
  timestamp?: number;
}): Promise<void> {
  try {
    await recordEngagement({
      itemRef: songKeyItemRef(args.songKeyId),
      moduleRef: 'repertoire',
      signal: {
        kind: 'rating',
        rating: feelToRating(args.feel),
        feel: args.feel,
        fromTest: args.fromTest,
        sessionId: args.sessionId,
      },
      // A RUN IS RATED AND DOES NOT MOVE THE CLOCK — see the header.
      // A single run, a cell test's run, a whole-song test's own runs:
      // the rating lands on the row, the due date stays. Only the passed
      // whole-song test, through `recordKeyProving`, moves it.
      schedules: false,
      ...(args.timestamp !== undefined ? { timestamp: args.timestamp } : {}),
    });
  } catch (err) {
    console.warn('[repertoire] song key run signal failed', err);
  }
}
