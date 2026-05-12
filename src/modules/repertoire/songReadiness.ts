import type { Song, SongKey, SongSection } from '../../lib/db';

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
 */
export function getSongReadiness(
  _song: Song,
  _songKeys: ReadonlyArray<SongKey>,
  songSections: ReadonlyArray<SongSection>,
): SongReadiness {
  if (songSections.length === 0) return 'needs-setup';
  for (const section of songSections) {
    if (sectionHasChords(section)) return 'ready';
  }
  return 'needs-chords';
}

/**
 * "Has at least one chord entered anywhere" — checks every chord-
 * storage shape the schema supports:
 *
 *   · `basicChords` / `alternateChords` — legacy space-separated
 *     chord tokens at the section level. Non-empty trimmed string
 *     = chord present.
 *   · `phrases[].chords` — legacy pre-beat single chord string per
 *     phrase. Non-empty trimmed string = chord present.
 *   · `phrases[].chordsByArrangement` — current authoritative
 *     storage. arrangementId → beatId → ChordFunction. Any
 *     non-empty inner map = chord present.
 *
 * Returns true on the first hit; the matrix UI's "song has chord
 * data" affordance uses the same union so this classifier stays in
 * lockstep with what the user sees.
 */
function sectionHasChords(section: SongSection): boolean {
  if (section.basicChords && section.basicChords.trim().length > 0) return true;
  if (section.alternateChords && section.alternateChords.trim().length > 0) return true;
  if (section.phrases) {
    for (const phrase of section.phrases) {
      if (phrase.chords && phrase.chords.trim().length > 0) return true;
      if (phrase.chordsByArrangement) {
        for (const arrangementId of Object.keys(phrase.chordsByArrangement)) {
          const placements = phrase.chordsByArrangement[arrangementId];
          if (placements && Object.keys(placements).length > 0) return true;
        }
      }
    }
  }
  return false;
}
