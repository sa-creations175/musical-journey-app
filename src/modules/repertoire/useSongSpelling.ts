import type { Song } from '../../lib/db';
import { useSpelling } from '../../lib/spellingPref';
import type { Spelling } from '../../lib/spelling';

/**
 * How to spell key and note names ON A PARTICULAR SONG'S SURFACES.
 *
 * =====================================================================
 * THE ONE PLACE A SONG'S SPELLING IS DECIDED.
 *
 * Today this returns the global setting and ignores its argument. That
 * is deliberate and temporary: the per-song override is the next step,
 * and when it lands it changes THIS FUNCTION and nothing else.
 *
 * The alternative was for each matrix surface to call `useSpelling()`
 * directly and be revisited later. That would have meant editing a
 * dozen files twice, in a part of the tree another session is about to
 * rewrite. Naming the decision now, even while it has only one input,
 * means the override arrives as a one-line change.
 *
 * The argument is already threaded so that adding the second input does
 * not require finding the callers again — which is the failure this
 * whole workstream keeps running into. Callers that genuinely have no
 * song (a drill opened cold from a catalog grid) should call
 * `useSpelling` directly rather than passing null here: "no song" and
 * "a song with no preference" are different questions, and collapsing
 * them is how the distinction gets lost.
 * =====================================================================
 */
export function useSongSpelling(_song: Song | null | undefined): Spelling {
  const [globalSpelling] = useSpelling();
  // The song is not consulted yet — see header. Referenced so the
  // parameter is not dropped by a well-meaning lint fix.
  void _song;
  return globalSpelling;
}
