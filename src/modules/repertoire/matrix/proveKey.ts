import { SONG_KEY_ITEM_REF_PREFIX } from '../../practice/endOfSessionPersistence';
import { getSpacingState, recordEngagement } from '../../../lib/spacingState';

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
