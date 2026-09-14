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
import { bassWindow, type PlayerSettings } from './settings';

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
  /**
   * The bass move INTO this chord was named — by the card (Chord
   * Motion's up or down) or by a direction someone set.
   *
   * ONE NAMED MOVE MAKES THE WHOLE LINE A BLOCK in the Bass register
   * window, so no jump in it is flipped. See `placeBass`.
   */
  namesMove?: boolean;
  /**
   * The bass has been put in its register already — see `placeBass`.
   *
   * THE RULE IS NOT IDEMPOTENT ON ITS OWN: on C1 to G2, Forward takes a
   * C3 bass to C2, inside the window, and a second pass would take it on
   * to C1. So a placed chord says so, and is not placed again.
   */
  bassPlaced?: boolean;
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
 * The lowest note a root joins the hand above when a chord has no bass.
 */
const BOARD_FLOOR = 36;

/**
 * The bass line, placed in the Bass register window.
 *
 * =====================================================================
 * THE WINDOW IS WHERE THE BASS LIVES, AND IT NEVER LEAVES IT. Silas's
 * answers of 14 Sep 2026, replacing the 10 Sep whole-line drop.
 *
 * WHERE A DIRECTION IS NAMED — Chord Motion's up or down, a progression
 * whose bass moves the card or the reader set — THE DIRECTION WINS. The
 * whole line moves into the window as one block, so every jump keeps
 * its direction and its size: on Forward the lowest octave that fits,
 * on Blended the highest.
 *
 * ELSEWHERE each bass is placed as the bass rule placed it; on Forward
 * each drops an octave unless that takes it below the window; any bass
 * above the window comes down an octave, and any below it goes up. With
 * the default window a 2-5-1 in F sounds G2 → C2 → F2 on Forward and
 * G2 → C3 → F2 on Blended.
 *
 * INSIDE THE WINDOW, THE BASS STAYS UNDER ITS HAND where a placement
 * allows it: a block takes the next octave that fits and clears the
 * hands, and a single bass sitting on its hand goes down an octave if
 * the window has room. The window is never left to do it.
 *
 * APPLIED ONCE, BEFORE THE HANDS ROW, and marked (`bassPlaced`), so a
 * list the panel has placed and then hands to the sequencer is not
 * placed twice.
 * =====================================================================
 */
export function placeBass(
  chords: ReadonlyArray<PlayerChord>,
  settings: PlayerSettings,
): PlayerChord[] {
  const open = chords
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.bass !== null && c.bassPlaced !== true);
  if (open.length === 0) return [...chords];
  const { low, high } = bassWindow(settings.bassRegister);
  const forward = settings.bass === 'forward';
  const underHand = (bass: number, chord: PlayerChord) =>
    chord.hand.length === 0 || bass < Math.min(...chord.hand);

  const shifts = new Map<number, number>();
  if (chords.some(c => c.namesMove === true)) {
    const basses = open.map(({ c }) => c.bass as number);
    const lo = Math.min(...basses);
    const hi = Math.max(...basses);
    const candidates: number[] = [];
    for (let s = -60; s <= 60; s += 12) {
      if (lo + s >= low && hi + s <= high) candidates.push(s);
    }
    // A LINE WIDER THAN THE WINDOW still moves as a block: to the octave
    // that leaves the least of it outside.
    if (candidates.length === 0) {
      const outside = (s: number) => basses.reduce(
        (n, b) => n + Math.max(0, low - (b + s)) + Math.max(0, b + s - high), 0);
      let best = 0;
      for (let s = -60; s <= 60; s += 12) {
        if (outside(s) < outside(best) || (outside(s) === outside(best) && (forward ? s < best : s > best))) best = s;
      }
      candidates.push(best);
    }
    const ordered = forward ? candidates : [...candidates].reverse();
    const shift = ordered.find(s => open.every(({ c }) => underHand((c.bass as number) + s, c)))
      ?? ordered[0];
    open.forEach(({ i }) => shifts.set(i, shift));
  } else {
    open.forEach(({ c, i }) => {
      const at = c.bass as number;
      let b = at;
      if (forward && b - 12 >= low) b -= 12;
      while (b > high) b -= 12;
      while (b < low) b += 12;
      while (!underHand(b, c) && b - 12 >= low) b -= 12;
      shifts.set(i, b - at);
    });
  }
  return chords.map((c, i) => {
    const shift = shifts.get(i);
    return shift === undefined ? c : { ...c, bass: (c.bass as number) + shift, bassPlaced: true };
  });
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
 * THE ROOT JOINS; IT NEVER DISPLACES. The rung decides the chord: at
 * Full Voicing Cmaj7 is a maj9, so the hand plays C E G B D — five notes,
 * the 9th kept — and at Seventh Chords C E G B. Silas's ruling of 10 Sep
 * 2026, answering whether the root should take the 9th's place: no.
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
): { notes: number[]; hands: Array<'L' | 'R'> } {
  // BASS ONLY MEANS THE LOWEST NOTE AND NOTHING ELSE. On a chord with
  // no bass of its own — a single quiz chord — that is the bottom of
  // the hand, which is what the brief says in terms.
  // THE BASS IS WHERE `placeBass` PUT IT; nothing here moves it.
  const bass = chord.bass;
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
 * The order the notes of a run strike in.
 *
 * UP IS THE ORDER GIVEN, which is low to high everywhere this is
 * called, and it does not sort: chord recognition's card is about an
 * inversion, and a run that sorted would be re-voicing the question.
 * Down is that order reversed. Up and Down goes up and comes back
 * without striking the top note twice. Together has no order and hands
 * the notes back as they are.
 */
export function strikeOrder<T>(
  notes: ReadonlyArray<T>,
  playAs: PlayerSettings['playAs'],
): T[] {
  if (playAs === 'down') return [...notes].reverse();
  if (playAs === 'upDown') return [...notes, ...[...notes].reverse().slice(1)];
  return [...notes];
}

/**
 * How long a note in a run rings, as a share of the gap to the next.
 *
 * JUST PAST THE NEXT ONE. Silas's spec of 12 Sep 2026: "Notes in a run
 * release just after the next one sounds; no long bleed." The walked
 * prototype holds each note for 1.2 of the gap, and so does this.
 */
export const RUN_RELEASE = 1.2;

/**
 * The gap between the notes of a run, in beats.
 *
 * THREE QUARTERS OF A BEAT FOR A CHORD ON ITS OWN, the spacing ruled on
 * 10 Sep 2026 and unchanged. INSIDE ITS OWN BAR IN A PROGRESSION: the
 * 13 Sep answer has each chord's run fit the chord's length, so the next
 * chord still arrives on its beat. Nine tenths of the bar is shared
 * between the strikes, which leaves the last one room to ring.
 */
export function runGapBeats(strikes: number, beats: number, inBar: boolean): number {
  if (!inBar || strikes < 2) return BROKEN_STEP_BEATS;
  return Math.min(BROKEN_STEP_BEATS, (beats * 0.9) / strikes);
}

/**
 * How long a chord's slot is, once its run is allowed for.
 *
 * =====================================================================
 * A CHORD ON ITS OWN GROWS TO FIT ITS RUN; A CHORD IN A BAR DOES NOT.
 *
 * On its own, a run strikes three quarters of a beat apart, so a
 * four-note chord takes two and a quarter beats to state — more than
 * the two a panel chord gets — and its slot grows to fit, no further.
 * Together, and a chord short enough to run inside its slot, keep the
 * length they had.
 *
 * In a progression the bar is the bar. The run is fitted into it
 * (`runGapBeats`) and the slot keeps its length, so the chords land
 * where the progression puts them.
 *
 * `panelBeats` and `chordStep` both read this, which is what keeps
 * Pause honest — the panel measures against the same number it plays.
 * =====================================================================
 */
export function stepBeats(
  chord: PlayerChord,
  settings: PlayerSettings,
  beats: number,
  /** Whether this chord is one bar of a progression. */
  inBar = false,
): number {
  // THE CHORD'S OWN LENGTH WINS. A movement's rhythm is part of what
  // was played and the sequence's default would flatten it.
  const own = chord.beats ?? beats;
  if (settings.playAs === 'together' || inBar) return own;
  const { notes } = soundingNotes(chord, settings);
  return Math.max(own, strikeOrder(notes, settings.playAs).length * BROKEN_STEP_BEATS);
}

/** One chord as a step of the sequence. */
export function chordStep(
  chord: PlayerChord,
  settings: PlayerSettings,
  beats: number,
  /** Whether this chord is one bar of a progression. */
  inBar = false,
): SeqChord {
  const { notes, hands } = soundingNotes(chord, settings);
  const length = stepBeats(chord, settings, beats, inBar);
  if (settings.playAs === 'together') return { intervals: notes, beats: length, hands };
  // A RUN IS A ROLL ON THE STEP, and the sequencer does the rest —
  // through the one player, so Pause and Resume land on a run exactly
  // as they do on a struck chord.
  const order = strikeOrder(notes.map((_, i) => i), settings.playAs);
  const gap = runGapBeats(order.length, chord.beats ?? beats, inBar);
  return {
    intervals: order.map(i => notes[i]),
    hands: order.map(i => hands[i]),
    beats: length,
    roll: gap,
    release: gap * RUN_RELEASE,
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
  // THE LIT KEYS ARE THE SOUNDING KEYS: the chord is handed in with its
  // bass already in its register (`placeBass`), so it lights where it
  // sounds.
  const { notes, hands } = soundingNotes(chord, settings);
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
