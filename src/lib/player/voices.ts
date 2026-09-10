/**
 * Turning a voicing plus the panel's settings into notes and marks.
 *
 * =====================================================================
 * THE SETTINGS DECIDE WHAT SOUNDS; THE VOICING DECIDES WHAT IT IS.
 *
 * A `PlayerChord` is where the hand and the bass are. Whether the bass
 * sounds at all, whether the root goes under the hand or inside it, and
 * whether the hand is lifted an octave are all the panel's — and every
 * surface asks the same three questions, so they are answered once,
 * here, rather than five times in five components.
 *
 * SO THE BOARD AND THE SOUND CANNOT DISAGREE. What lights is built from
 * this same function, which is the bug worth designing out: a hand
 * lifted in the audio and not on the keyboard is a reader being taught
 * the wrong thing quietly.
 * =====================================================================
 */
import { BROKEN_STEP_BEATS, type SeqChord } from '../audio';
import { onBoard } from '../builtAnswers/board';
import type { KeyMark } from '../builtAnswers/board';
import type { VoicedChord } from '../builtAnswers/voiceLeading';
import { intervalColor } from '../voicingColors';
import type { PlayerSettings } from './settings';

/** One chord the player can sound and draw, with the name it goes by. */
export interface PlayerChord extends VoicedChord {
  /** What the chip says — "Cmaj9 A", "G7♯5". The caller's, because only
   *  it knows the key's spelling. */
  name: string;
  /**
   * How long this chord lasts, in beats.
   *
   * ABSENT MEANS THE SEQUENCE'S OWN LENGTH — two beats, or whatever the
   * caller asked for. A pass gives every chord the same length; a
   * RECORDED MOVEMENT does not, because its rhythm is part of what was
   * played, so it sets this per chord.
   */
  beats?: number;
}

/**
 * The hand moved up an octave, where it still fits.
 *
 * PER NOTE, NOT PER CHORD, is what `marks.raise` does and is right for
 * drawing. THE LIFT IS ALL OR NOTHING, which is what the brief asks of
 * the control: "the lift moves the whole hand or not at all; never
 * re-orders a chord". A per-note lift on a wide voicing would move the
 * bottom note over the top one and hand the reader a chord nobody
 * plays, so a hand that cannot go up whole stays where it is.
 */
export function liftHand(
  hand: ReadonlyArray<number>,
  up: boolean,
): number[] {
  if (!up || hand.length === 0) return [...hand];
  return hand.every(m => onBoard(m + 12)) ? hand.map(m => m + 12) : [...hand];
}

/**
 * The root brought up into the hand, for "One hand".
 *
 * IT GOES UNDER THE HAND, NOT INTO THE MIDDLE OF IT — the nearest
 * octave of the root at or below the hand's bottom note, so the chord
 * keeps its shape and simply gains its root. The prototype's own rule.
 */
function rootInHand(bass: number, hand: ReadonlyArray<number>): number {
  const floor = hand.length > 0 ? hand[0] : bass + 12;
  let m = bass;
  while (m + 12 <= floor) m += 12;
  return m;
}

/** What a chord sounds, as absolute MIDI with a hand per note. */
export function soundingNotes(
  chord: PlayerChord,
  settings: PlayerSettings,
): { notes: number[]; hands: Array<'L' | 'R'> } {
  // BASS ONLY MEANS THE LOWEST NOTE AND NOTHING ELSE. On a chord with
  // no bass of its own — a single quiz chord — that is the bottom of
  // the hand, which is what the brief says in terms.
  if (settings.listen === 'bass') {
    const low = chord.bass ?? (chord.hand.length > 0 ? chord.hand[0] : null);
    return low === null
      ? { notes: [], hands: [] }
      : { notes: [low], hands: ['L'] };
  }
  const hand = liftHand(chord.hand, settings.octaveUp);
  if (chord.bass === null) {
    return { notes: hand, hands: hand.map((): 'R' => 'R') };
  }
  if (settings.hands === 'one') {
    const root = rootInHand(chord.bass, hand);
    const notes = [root, ...hand];
    return { notes, hands: notes.map((): 'R' => 'R') };
  }
  return {
    notes: [chord.bass, ...hand],
    hands: ['L', ...hand.map((): 'R' => 'R')],
  };
}

/**
 * How long a chord's slot is, once the roll is allowed for.
 *
 * =====================================================================
 * A ROLLED CHORD NEEDS ROOM TO FINISH ROLLING.
 *
 * Broken strikes the notes three quarters of a beat apart, so a
 * four-note chord takes two and a quarter beats to state — more than
 * the two a panel chord gets. Left at two, the next chord would start
 * before this one had finished arriving, and a progression would smear
 * into itself.
 *
 * So a broken chord's slot grows to fit its own roll and no further:
 * `noteCount × 0.75`, which leaves three quarters of a beat of the last
 * note ringing alone before the next chord. A blocked chord, and a
 * chord short enough to roll inside its slot, keep the length they had.
 *
 * `panelBeats` and `chordStep` both read this, which is what keeps
 * Pause honest — the panel measures against the same number it plays.
 * =====================================================================
 */
export function stepBeats(
  chord: PlayerChord,
  settings: PlayerSettings,
  beats: number,
): number {
  // THE CHORD'S OWN LENGTH WINS. A movement's rhythm is part of what
  // was played and the sequence's default would flatten it.
  const own = chord.beats ?? beats;
  if (settings.attack !== 'broken') return own;
  const { notes } = soundingNotes(chord, settings);
  return Math.max(own, notes.length * BROKEN_STEP_BEATS);
}

/** One chord as a step of the sequence. */
export function chordStep(
  chord: PlayerChord,
  settings: PlayerSettings,
  beats: number,
): SeqChord {
  const { notes, hands } = soundingNotes(chord, settings);
  return {
    intervals: notes,
    beats: stepBeats(chord, settings, beats),
    hands,
    // BROKEN IS A ROLL ON THE STEP, and the sequencer does the rest —
    // one broken mode, through the one player, so Pause and Resume land
    // on a rolled chord exactly as they do on a struck one.
    ...(settings.attack === 'broken' ? { roll: BROKEN_STEP_BEATS } : {}),
  };
}

/**
 * The marks the board carries while a chord sounds.
 *
 * BUILT FROM `soundingNotes`, so what lights is what plays. The bass
 * keeps its green band; a note the hand and the bass share shows both,
 * which is why the band is a band and not a fill.
 */
export function playerMarks(
  chord: PlayerChord | null,
  settings: PlayerSettings,
): Map<number, KeyMark> {
  const marks = new Map<number, KeyMark>();
  if (chord === null) return marks;
  const { notes, hands } = soundingNotes(chord, settings);
  notes.forEach((midi, i) => {
    if (!onBoard(midi)) return;
    if (hands[i] === 'L' && settings.hands === 'both') return;
    marks.set(midi, settings.colours === 'plain'
      ? { plain: true }
      : { fill: intervalColor(midi - chord.rootPc) });
  });
  // THE BASS IS DRAWN LAST so its band goes over whatever the hand put
  // there. Under "One hand" there is no bass to band — the root is in
  // the chord and is coloured as a root like any other note.
  if (settings.hands === 'both') {
    const bass = notes.find((_, i) => hands[i] === 'L');
    if (bass !== undefined && onBoard(bass)) {
      const existing = marks.get(bass);
      marks.set(bass, {
        ...(existing ?? (settings.colours === 'plain'
          ? { plain: true }
          : { fill: intervalColor(0) })),
        bassBand: true,
      });
    }
  }
  return marks;
}
