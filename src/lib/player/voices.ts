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
import { voicingDistance, type VoicedChord } from '../builtAnswers/voiceLeading';
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
  /**
   * How the chord's own name spells its root, where that is not the
   * note-name setting's spelling.
   *
   * ABSENT EVERYWHERE BUT CHORD MOTION, where a chord on a raised or
   * lowered degree takes the degree's accidental — the ♯4 in the key of
   * C is F♯m7♭5, never G♭ — whatever the setting says. The legend names
   * the root note with it, so the chip and the chord name agree. Only
   * the root: F♯dim7 is F♯ A C E♭, and spelling every tone sharp would
   * make the E♭ a D♯.
   */
  rootLetter?: string;
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
 * The board's lowest key. A bass dropped below it would be inaudible
 * and unlightable, which is what makes it the floor of the drop.
 */
const BOARD_FLOOR = 36;

/**
 * How far the whole bass line moves under "Bass: Forward".
 *
 * =====================================================================
 * AN OCTAVE, OR NOTHING, FOR THE WHOLE SEQUENCE.
 *
 * Silas's ruling of 10 Sep 2026. The bass rule chooses where each root
 * goes RELATIVE to the one before it, so dropping one note of that line
 * and not another would replace the move it chose with a different one:
 * a fourth up becomes a fifth down. So every bass drops together, and
 * only when the LOWEST of them still clears the board's floor.
 *
 * Taken over the chords the sequence will actually play, which is why
 * this is a function of the list rather than of a chord.
 * =====================================================================
 */
export function bassDrop(
  chords: ReadonlyArray<PlayerChord>,
  settings: PlayerSettings,
): number {
  if (settings.bass !== 'forward') return 0;
  const basses = chords
    .map(c => c.bass)
    .filter((b): b is number => b !== null);
  if (basses.length === 0) return 0;
  return Math.min(...basses) - 12 >= BOARD_FLOOR ? -12 : 0;
}

/**
 * The right hand under the Hands row: as written, or with its root.
 *
 * =====================================================================
 * THE ROOT JOINS THE HAND; THE BASS DOES NOT MOVE. Silas's ruling of
 * 10 Sep 2026. On "Root in the right hand" a chord whose right hand has
 * no root — a rootless seventh, a rootless full voicing — gains one,
 * and nothing else changes: the left hand keeps the bass line exactly.
 * A hand of fewer than three notes is left alone (Guide Tones are the
 * 3rd and the 7th by definition), and a hand that already has its root
 * (a triad) has nothing to gain.
 *
 * INVERTED AS VOICE LEADING NEEDS. The first chord takes the root just
 * under its hand — root position, C E G B. Every chord after takes the
 * placement of its root nearest the hand before it, measured the way
 * the rest of the app measures voice leading (`voicingDistance`). The
 * root always sits above the bass.
 *
 * A LIST, NOT A CHORD, for the same reason `bassDrop` is: voice leading
 * is a fact about the sequence. Idempotent — a hand that has its root
 * is left alone — so the panel and the sequencer may both apply it.
 * =====================================================================
 */
export function handsForSetting(
  chords: ReadonlyArray<PlayerChord>,
  settings: PlayerSettings,
): PlayerChord[] {
  if (settings.hands !== 'root') return [...chords];
  let previous: number[] | null = null;
  return chords.map(chord => {
    const pc = (m: number) => (((m - chord.rootPc) % 12) + 12) % 12;
    const hand = chord.hand;
    if (hand.length < 3 || hand.some(m => pc(m) === 0)) {
      if (hand.length > 0) previous = [...hand];
      return chord;
    }
    const low = Math.min(...hand);
    const high = Math.max(...hand);
    const floor = chord.bass === null ? BOARD_FLOOR - 1 : chord.bass;
    const candidates: number[] = [];
    for (let m = low - 11; m <= high + 11; m += 1) {
      if (pc(m) === 0 && m > floor && onBoard(m)) candidates.push(m);
    }
    if (candidates.length === 0) {
      previous = [...hand];
      return chord;
    }
    const under = candidates.filter(m => m < low);
    const pick = previous === null
      ? (under.length > 0 ? Math.max(...under) : Math.min(...candidates))
      : candidates.reduce((best, m) => (
        voicingDistance([...hand, m], previous!) < voicingDistance([...hand, best], previous!)
          ? m : best));
    const withRoot = [...hand, pick].sort((a, b) => a - b);
    previous = withRoot;
    return { ...chord, hand: withRoot };
  });
}

/** What a chord sounds, as absolute MIDI with a hand per note. */
export function soundingNotes(
  chord: PlayerChord,
  settings: PlayerSettings,
  /** How far this sequence's bass line has been moved — see `bassDrop`.
   *  Zero unless the caller knows the whole line. */
  drop = 0,
): { notes: number[]; hands: Array<'L' | 'R'> } {
  // BASS ONLY MEANS THE LOWEST NOTE AND NOTHING ELSE. On a chord with
  // no bass of its own — a single quiz chord — that is the bottom of
  // the hand, which is what the brief says in terms.
  // THE DROP APPLIES TO THE BASS AND TO NOTHING ELSE. It is a bass
  // control; moving the hand with it would be a second octave lift.
  const bass = chord.bass === null ? null : chord.bass + drop;
  if (settings.listen === 'bass') {
    const low = bass ?? (chord.hand.length > 0 ? chord.hand[0] : null);
    return low === null
      ? { notes: [], hands: [] }
      : { notes: [low], hands: ['L'] };
  }
  const hand = liftHand(chord.hand, settings.octaveUp);
  if (bass === null) {
    return { notes: hand, hands: hand.map((): 'R' => 'R') };
  }
  return {
    notes: [bass, ...hand],
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
  drop = 0,
): SeqChord {
  const { notes, hands } = soundingNotes(chord, settings, drop);
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
  /** The sequence's bass drop — see `bassDrop`. THE LIT KEYS ARE THE
   *  SOUNDING KEYS, so a dropped bass lights where it sounds. */
  drop = 0,
): Map<number, KeyMark> {
  const marks = new Map<number, KeyMark>();
  if (chord === null) return marks;
  const { notes, hands } = soundingNotes(chord, settings, drop);
  notes.forEach((midi, i) => {
    if (!onBoard(midi)) return;
    if (hands[i] === 'L') return;
    marks.set(midi, settings.colours === 'plain'
      ? { plain: true }
      : { fill: intervalColor(midi - chord.rootPc) });
  });
  // THE BASS IS DRAWN LAST so its band goes over whatever the hand put
  // there. The left hand always plays it, whichever voicing the right
  // hand has — see `Hands`.
  {
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
