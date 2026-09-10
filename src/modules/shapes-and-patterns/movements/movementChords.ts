/**
 * A recorded movement, as the shared player takes it.
 *
 * =====================================================================
 * AN ADAPTER, NOT A SECOND TRANSLATION.
 *
 * `toPlayableMovement` already resolves every pressed note into an
 * offset above the movement's tonic and says which hand played it —
 * that is the translation, and it stays where it is. This only reshapes
 * the result into the `PlayerChord` the shared panel takes, so a
 * movement can sound on the same panel as everything else: one Hear it,
 * one Pause, one tempo in beats per minute, one instrument.
 *
 * WHAT WAS PRESSED IS WHAT SOUNDS. Nothing here is voice-led and
 * nothing is moved into the middle of the keyboard. A movement is the
 * one thing in this app that is not an example of a rule — it is what
 * Silas actually played — so the player's job is to reproduce it.
 * =====================================================================
 */
import type { ChordMovement } from '../../../lib/db';
import type { PlayerChord } from '../../../lib/player/voices';
import { spellNote, type Spelling } from '../../../lib/spelling';
import { movementDegreeName } from './movementLabels';
import { toPlayableMovement } from './movementPlayback';

/**
 * The chords of a movement, placed.
 *
 * `rootMidi` comes from the translation, so passing a different key
 * transposes the whole thing — the mechanism `movementPlayback`'s own
 * header describes.
 */
export function movementChords(
  movement: ChordMovement,
  opts: { spelling: Spelling; key?: string } = { spelling: 'flat' },
): PlayerChord[] {
  const playable = toPlayableMovement({
    placements: movement.placements,
    key: opts.key ?? movement.key,
    timeSignature: movement.timeSignature,
  });
  if (playable === null) return [];
  return playable.placements.map(p => {
    const right = p.intervals.filter((_, n) => p.hands[n] === 'R');
    const left = p.intervals.filter((_, n) => p.hands[n] === 'L');
    const hand = (right.length > 0 ? right : p.intervals)
      .map(iv => playable.rootMidi + iv)
      .sort((a, b) => a - b);
    // THE LOWEST LEFT-HAND NOTE IS THE BASS, and the rest of the left
    // hand joins the right. A movement can hold a two-note left hand —
    // Silas's half-diminished does — and the panel draws one bass band.
    const bass = left.length > 0
      ? playable.rootMidi + Math.min(...left)
      : null;
    const extras = left
      .filter(iv => playable.rootMidi + iv !== bass)
      .map(iv => playable.rootMidi + iv);
    const placement = movement.placements.find(x => x.id === p.placementId);
    return {
      hand: [...extras, ...hand].sort((a, b) => a - b),
      bass,
      // THE ROOT IS THE CHORD'S, not the movement's tonic: the board
      // colours each note by its job in the chord that is sounding.
      rootPc: ((hand[0] ?? playable.rootMidi) % 12 + 12) % 12,
      // THE DEGREE AND ITS QUALITY, which is how a movement names its
      // own chords everywhere else on its screen — a movement is
      // written in degrees and transposes, so a letter name would be
      // one key's answer to a question the movement does not ask.
      // THE MOVEMENT'S OWN RHYTHM. A chord that was held for a bar is
      // held for a bar; flattening every one to two beats would be the
      // player deciding how the thing goes.
      beats: p.beats,
      name: placement === undefined
        ? spellNote(((playable.rootMidi + (p.intervals[0] ?? 0)) % 12 + 12) % 12,
          opts.spelling)
        : nameOf(placement.chord, opts.spelling),
    };
  });
}

/** A chord's degree name, as the movement's own screen writes it. */
function nameOf(
  chord: ChordMovement['placements'][number]['chord'], spelling: Spelling,
): string {
  const d = movementDegreeName(chord, spelling);
  return `${d.degree}${d.quality}${d.bass === null ? '' : `/${d.bass}`}`;
}
