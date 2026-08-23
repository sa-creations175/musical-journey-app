import type { Song } from '../../lib/db';
import { useSpelling } from '../../lib/spellingPref';
import { resolveSpelling, type Spelling } from '../../lib/spelling';

/**
 * How to spell key and note names ON A PARTICULAR SONG'S SURFACES.
 *
 * =====================================================================
 * THE ONE PLACE A SONG'S SPELLING IS DECIDED.
 *
 * A song's own `spelling` wins; `undefined` means it has no opinion and
 * follows the global setting.
 *
 * UNDEFINED IS NOT THE SAME AS THE DEFAULT VALUE, and the difference is
 * the whole design. If a song stored 'flat' the moment it was created,
 * the global setting would only ever apply to songs added afterwards —
 * which is not a global setting. Undefined means the song keeps
 * tracking the default, so flipping it re-spells everything the user
 * has not deliberately overridden.
 *
 * That is also why nothing backfills the field: every existing song is
 * already in the state it should be in.
 *
 * Callers that genuinely have no song (a drill opened cold from a
 * catalog grid) should call `useSpelling` directly rather than passing
 * null here. "No song" and "a song with no preference" happen to
 * resolve the same way today, and they are still different questions —
 * collapsing them is how the distinction gets lost.
 * =====================================================================
 */
export function useSongSpelling(song: Song | null | undefined): Spelling {
  const [globalSpelling] = useSpelling();
  return resolveSpelling(song?.spelling, globalSpelling);
}
