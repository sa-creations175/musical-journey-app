import type { Song, SongKey, SongSection } from '../../lib/db';
import { sectionHasChords } from './sectionChords';

/**
 * Practice-readiness classification for a song.
 *
 *   'needs-setup'   — no sections defined yet; user must add sections
 *                     before any matrix work is meaningful.
 *   'needs-chords'  — sections exist but no chords have been entered;
 *                     matrix cells can still progress, but pre-play
 *                     chord recall isn't possible yet.
 *   'ready'         — sections exist AND at least one chord has been
 *                     entered somewhere in the song; the chord-quiz
 *                     warm-up and full matrix practice are both
 *                     available.
 *
 * The classifier is the canonical signal the session generator uses
 * to choose between a Setup block, a plain practice block, and a
 * chord-quiz-prepended practice block.
 */
export type SongReadiness = 'needs-setup' | 'needs-chords' | 'ready';

/**
 * Pure readiness classifier. `songKeys` is in the signature for
 * symmetry with other matrix helpers and to leave room for future
 * readiness rules (e.g. "no original-key row" — out of scope here);
 * the current implementation only needs the section list.
 *
 * `song` is no longer unused: the shared chord reader needs it for
 * the section's effective time signature, which is what sizes a bar.
 *
 * THE CHORD TEST IS NOT WRITTEN HERE. It used to be — a private
 * `sectionHasChords` walking `basicChords`, `alternateChords`,
 * `phrases[].chords` and `phrases[].chordsByArrangement`. That list
 * omitted `section.chordPlacements`, the bar-anchored storage the
 * lead-sheet editor has written since the Lead Sheet Redesign, so
 * every song charted in the bar grid was classified `needs-chords`
 * while the chord-progression quiz — reading the same sections
 * through its own, correct walk — quizzed them happily.
 *
 * The lesson is not "that list was missing an entry". It is that a
 * predicate copied to a second place will be updated in one of them.
 * See `repertoire/sectionChords.ts`.
 */
export function getSongReadiness(
  song: Song,
  _songKeys: ReadonlyArray<SongKey>,
  songSections: ReadonlyArray<SongSection>,
): SongReadiness {
  if (songSections.length === 0) return 'needs-setup';
  for (const section of songSections) {
    if (sectionHasChords(song, section)) return 'ready';
  }
  return 'needs-chords';
}
