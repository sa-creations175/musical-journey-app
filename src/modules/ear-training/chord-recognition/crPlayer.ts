/**
 * Chord recognition's chord, exactly as stored.
 *
 * =====================================================================
 * NOTHING IS RE-VOICED HERE, AND THAT IS THE WHOLE RULE.
 *
 * Every other surface on the shared player voice-leads: it lists the
 * placements of a chord and picks the one nearest the chord before it.
 * That is correct for a progression and WRONG here, because the answer
 * to this card is *which inversion did you hear*. A first-inversion C
 * major re-voiced to the nearest position is no longer the question
 * that was asked.
 *
 * So this file takes the stored intervals, rotates them for the asked
 * inversion, and stops. What the panel's settings may do to it is
 * limited to three things that cannot change which inversion it is:
 *
 *   · the LIFT moves every note up an octave together, or none of them
 *   · BASS ONLY plays the bottom note alone
 *   · the LADDER drops or adds notes without moving the ones that stay
 *
 * =====================================================================
 * THE LADDER KEEPS THE INVERSION. Silas's prototype: "the ladder plays
 * the same chord thinner or thicker without changing its inversion".
 * So a rung is a FILTER over the notes that are already placed —
 * whichever of them do the job that rung asks for — rather than a fresh
 * voicing of the chord at that thickness.
 * =====================================================================
 */
import type { ChordData } from '../../../lib/db';
import {
  extendedShape, extendedTones, type ExtendedQuality,
} from '../../../lib/extendedVoicings';
import type { Thickness } from '../../../lib/builtAnswers/chordShapes';
import type { PlayerSettings } from '../../../lib/player/settings';
import type { PlayerChord } from '../../../lib/player/voices';
import { rotateForInversion, type Inversion } from './inversionUtils';

/** The board's top, so a lift never pushes a note off it. */
const BOARD_TOP = 84;

/**
 * Which degrees of the chord a rung keeps, as semitones above the
 * root, given the chord's own intervals.
 *
 * `null` for the rung that keeps everything.
 */
function rungTones(
  intervals: ReadonlyArray<number>,
  rung: Thickness,
): number[] | null {
  const iv = [...intervals].sort((a, b) => a - b);
  const hasSeventh = iv.length >= 4;
  switch (rung) {
    case 'triads':
      return hasSeventh ? iv.slice(0, 3) : null;
    case 'guide':
      // THE 3 AND THE 7 — the two notes a comping hand actually plays.
      // A triad has no seventh, so there is nothing to thin to and the
      // rung is not offered: "a triad is what it is".
      return hasSeventh ? [iv[1], iv[3]] : null;
    case 'seventh':
    case 'full':
    case 'bass':
    case undefined:
    default:
      return null;
  }
}

/** The chords Silas plays as a shape rather than as a stack. */
const SHAPE_FOR_CHORD: Readonly<Record<string, ExtendedQuality>> = {
  maj13: 'maj13',
  dom13: 'dom9-13',
};

/**
 * Silas's own hand for this chord, or null to sound the stack.
 *
 * =====================================================================
 * THE 13 CHORDS SOUND THE WAY HE PLAYS THEM: NO 5TH. Ruled 11 Sep 2026
 * (`~/cc-scratch/NEXT_TAB1_RETIRE_913.md`). The seed keeps the full
 * stack because that is what the card NAMES; the SOUND comes from the
 * voicings table, which is where what he actually plays is written
 * down. Both chords used to have a second card for the voicing — the
 * retired `maj9_13` and `dom9_13` — and this is where that went.
 *
 * ONLY AT THE RUNG THAT KEEPS EVERY NOTE. A shape is the whole chord in
 * one hand. The thinner rungs ask about the chord's OWN degrees — "just
 * the 1 3 5", "just the 3 and the 7" — and a hand with no 5th in it
 * cannot answer the first of those. So triads and guide tones still
 * come off the stack, and the shape sounds where the rung would
 * otherwise sound everything.
 *
 * ROOT POSITION ONLY, for this file's own reason: a shape is a fixed
 * arrangement of notes, so it cannot answer a question about which note
 * is in the bass. Neither chord is inversion-trained, so neither is
 * ever asked at anything but 0 — the guard is here so that stays true
 * if one ever is.
 * =====================================================================
 */
function shapedNotes(
  chord: ChordData,
  rootMidi: number,
  inversion: Inversion,
  rung: Thickness,
): number[] | null {
  const named = SHAPE_FOR_CHORD[chord.id];
  if (named === undefined || inversion !== 0) return null;
  if (rungTones(chord.intervals, rung) !== null) return null;
  const shape = extendedShape(named, 'A');
  return shape === null ? null : extendedTones(shape).map(iv => rootMidi + iv);
}

/**
 * The exact notes to sound, as semitones above `rootMidi`.
 *
 * `rootMidi` is passed as 0 by the quiz's own player, which adds it
 * itself; the shared panel wants absolute MIDI and passes the real one.
 */
export function crQuizChord(
  chord: ChordData,
  rootMidi: number,
  inversion: Inversion,
  settings: PlayerSettings,
  rung: Thickness = 'seventh',
): number[] {
  const placed = shapedNotes(chord, rootMidi, inversion, rung)
    ?? rotateForInversion(chord.intervals, inversion).map(iv => rootMidi + iv);
  // BASS ONLY IS THE BOTTOM NOTE, which on an inverted chord is the
  // note the inversion is named for — so it is an aid that gives some
  // of the answer away, which is why taking it is on the attempt.
  if (settings.listen === 'bass') return placed.slice(0, 1);
  // A RUNG IS A FILTER OVER THE NOTES ALREADY PLACED, matched by pitch
  // class above the root — so the notes that stay do not move, and the
  // inversion survives the ladder.
  const keep = rungTones(chord.intervals, rung);
  const wanted = keep === null
    ? null
    : new Set(keep.map(k => ((k % 12) + 12) % 12));
  const thinned = wanted === null
    ? placed
    : placed.filter(m => wanted.has((((m - rootMidi) % 12) + 12) % 12));
  const notes = thinned.length > 0 ? thinned : placed;
  // THE LIFT MOVES THE WHOLE CHORD OR NONE OF IT, so it can never
  // re-order the notes and never change the inversion.
  const canLift = notes.every(m => m + 12 <= BOARD_TOP);
  return settings.octaveUp && canLift ? notes.map(m => m + 12) : notes;
}

/** The one chord, for the shared panel: exact notes, no bass line. */
export function crChords(
  chord: ChordData,
  rootMidi: number,
  inversion: Inversion,
  settings: PlayerSettings,
  name: string,
  rung: Thickness = 'seventh',
): PlayerChord[] {
  return [{
    hand: crQuizChord(chord, rootMidi, inversion, settings, rung),
    // NO BASS LINE. One chord in one hand; the root is wherever the
    // inversion put it, and adding a root underneath would answer the
    // question the card is asking.
    bass: null,
    rootPc: ((rootMidi % 12) + 12) % 12,
    name,
  }];
}
