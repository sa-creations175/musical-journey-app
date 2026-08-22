import { SONG_KEY_ITEM_REF_PREFIX } from '../../practice/endOfSessionPersistence';
import { getSpacingState, recordEngagement } from '../../../lib/spacingState';
import { boundsFrom, getSpacingSettings } from '../spacingPrefs';

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
 * Bounds come from the user's settings, so the sequence the settings
 * screen shows is the sequence the engine actually walks. Outside a
 * transaction, mirroring every other spacing write: a spacing failure
 * must not roll back the test result the user just earned.
 */
export async function recordKeyProving(args: {
  songKeyId: string;
  passed: boolean;
  timestamp?: number;
}): Promise<void> {
  const settings = await getSpacingSettings();
  try {
    await recordEngagement({
      itemRef: songKeyItemRef(args.songKeyId),
      moduleRef: 'repertoire',
      signal: { kind: 'rating', rating: args.passed ? 'flying' : 'crawling' },
      bounds: boundsFrom(settings),
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
      const row = await getSpacingState(songKeyItemRef(id), 'repertoire', 'both', 'solid');
      out.set(id, row?.nextDueAt ?? null);
    } catch {
      // A read failure must not demote a key. Absent reads as
      // never-proven, which holds the rung.
      out.set(id, null);
    }
  }));
  return out;
}
