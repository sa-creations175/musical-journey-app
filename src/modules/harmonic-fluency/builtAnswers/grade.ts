/**
 * Marking a built answer.
 *
 * =====================================================================
 * WHAT IS GRADED, AND WHAT IS DELIBERATELY NOT.
 *
 * A built answer offers more than the card asks about, and the grade
 * has to ignore the surplus or it becomes a harder card than the one
 * that was written.
 *
 *   EXTENSIONS NEVER FAIL AN ANSWER. The card wants a major chord on
 *   the 1; Cmaj7 and Cmaj9 are that chord with more of it. Only the
 *   FAMILY is compared — see `familyMatches`.
 *
 *   INVERSION IS NEVER GRADED. "The 2 5 1 in the key of B♭ major" is a
 *   question about which chords, not about which note is on the
 *   bottom. The inversion row exists so a reader can hear the voicing
 *   they would actually play.
 *
 *   OCTAVE IS NEVER GRADED. Every comparison is on pitch class: a
 *   pentatonic is five notes, not five notes in one register.
 *
 *   ORDER IS NEVER GRADED, except on the one card whose question is
 *   about order. The lick wording asks which minor pentatonic fits, so
 *   the root is the answer and the first tap is the claim.
 *
 * =====================================================================
 * THE SHELL STILL DOES THE COMPARING IT ALWAYS DID.
 *
 * Nothing here writes an attempt or moves a schedule. A surface grades
 * locally, then hands the shell either the card's own
 * `correctAnswer` — which its one string comparison marks right — or a
 * description of what was actually built, which it marks wrong and
 * records. That is `DegreeKeyboardAnswer`'s arrangement, and it is why
 * no rating rule changes.
 * =====================================================================
 */
import { spellNote } from '../../../lib/spelling';
import type { QualityId } from '../../../lib/builtAnswers/chordShapes';
import { familyMatches } from '../../../lib/builtAnswers/chordShapes';
import type { BuiltTarget } from './cardTargets';
import { joinRow } from '../../../lib/progressionRow';
import { CANONICAL_SPELLING } from '../../../lib/progressionSpelling';

/** One chord as the reader built it. */
export interface BuiltChord {
  rootPc: number | null;
  quality: QualityId | null;
}

export interface Grade {
  correct: boolean;
  /** What the reader built, written the way the card writes its own
   *  answer. Handed to the shell when the answer is wrong, so the
   *  attempt records what they really did. */
  built: string;
  /** Which chord or note was wrong first, for the surface to point at.
   *  Null when the answer is right or the fault is not positional. */
  firstWrong: number | null;
}

/**
 * How a key spells its black notes.
 *
 * THE KEY DECIDES, NOT THE TAP. A reader taps one black key and the
 * card names it: in the key of E♭ major it is A♭, in the key of B major
 * it is G♯. The letter row shows both spellings on the tile and this is
 * what resolves it once picked, which is the brief's rule.
 */
export function keySpelling(keyName: string): 'flat' | 'sharp' {
  return keyName.includes('b') || keyName.includes('♭') || keyName === 'F'
    ? 'flat'
    : 'sharp';
}

/**
 * A pitch class, named the way this card's key would name it.
 *
 * `spellNote` returns the GLYPH form already — `lib/spelling` holds its
 * twelve names with ♭ and ♯ in them — so nothing here re-spells it. A
 * second pass through `withAccidentalGlyphs` was harmless and read as
 * though it were doing something.
 */
export function spellInKey(pc: number, keyName: string): string {
  return spellNote(pc, keySpelling(keyName));
}

/** The chords a reader built, as the progression cards write them. */
export function describeChords(
  chords: ReadonlyArray<BuiltChord>,
  keyName: string,
): string {
  // =====================================================================
  // CANONICAL, BECAUSE THIS STANDS IN FOR A CHOSEN OPTION.
  //
  // `answer(grade.correct ? card.correctAnswer : grade.built)` — a
  // wrong build is handed to the session as the string the reader
  // "chose", is compared against the answer key and is written to the
  // attempt row as `chosenAnswerText`. So it takes the same spelling
  // the key is baked in, and the reader's own spelling is applied on
  // the way to the eye by `renderOptionLabel`.
  //
  // A build that got every chord right and joined them differently
  // would not match the answer it is compared against.
  // =====================================================================
  return joinRow(chords
    .map(c => (c.rootPc === null
      ? '—'
      : `${spellInKey(c.rootPc, keyName)}${c.quality ?? ''}`)),
  CANONICAL_SPELLING);
}

export function gradeProgression(
  target: Extract<BuiltTarget, { kind: 'progression' }>,
  built: ReadonlyArray<BuiltChord>,
): Grade {
  const description = describeChords(built, target.keyName);
  const firstWrong = target.chords.findIndex((want, i) => {
    const got = built[i];
    if (got === undefined || got.rootPc === null || got.quality === null) return true;
    return got.rootPc !== want.rootPc || !familyMatches(want.quality, got.quality);
  });
  return {
    correct: firstWrong < 0,
    built: description,
    firstWrong: firstWrong < 0 ? null : firstWrong,
  };
}

export function gradeSlash(
  target: Extract<BuiltTarget, { kind: 'slash' }>,
  built: { chord: BuiltChord; bassPc: number | null },
): Grade {
  const { chord, bassPc } = built;
  const chordText = chord.rootPc === null
    ? '—'
    : `${spellInKey(chord.rootPc, target.keyName)}${chord.quality ?? ''}`;
  const bassText = bassPc === null ? '—' : spellInKey(bassPc, target.keyName);
  const topOk = chord.rootPc === target.chordRootPc
    && chord.quality !== null && familyMatches(target.quality, chord.quality);
  const bassOk = bassPc === target.bassPc;
  return {
    correct: topOk && bassOk,
    built: `${chordText}/${bassText}`,
    // 0 names the chord row and 1 the note row, which is what the
    // surface points at.
    firstWrong: topOk ? (bassOk ? null : 1) : 0,
  };
}

/**
 * The five notes of a pentatonic, in the order they were tapped.
 *
 * ORDER IS KEPT EVEN WHERE IT IS NOT GRADED, because the lick card
 * needs the first tap and the notes card needs the same surface. What
 * differs is only whether `rootFirst` is read.
 */
export function gradeScale(
  target: Extract<BuiltTarget, { kind: 'scale' }>,
  taps: ReadonlyArray<number>,
): Grade & { wrongRoot: boolean } {
  const named = taps.map(pc => spellInKey(pc, target.rootName));
  const chosen = new Set(taps);
  const setOk = taps.length === target.pcs.length
    && target.pcs.every(pc => chosen.has(pc));
  const rootOk = !target.rootFirst || taps[0] === target.rootPc;
  return {
    correct: setOk && rootOk,
    built: named.join(', '),
    firstWrong: null,
    // THE ONE CASE WORTH TELLING APART. Five right notes claimed from
    // the wrong one is a different mistake from five wrong notes, and
    // the prototype says so in words.
    wrongRoot: setOk && !rootOk,
  };
}

export function gradeRoot(
  target: Extract<BuiltTarget, { kind: 'root' }>,
  pc: number | null,
): Grade {
  return {
    correct: pc === target.rootPc,
    built: pc === null
      ? '—'
      : `${spellInKey(pc, target.rootName)} ${target.minor ? 'minor' : 'major'}`,
    firstWrong: null,
  };
}

export function gradeSignature(
  target: Extract<BuiltTarget, { kind: 'signature' }>,
  built: { count: number | null; direction: 'sharps' | 'flats' | null },
): Grade {
  const { count, direction } = built;
  /**
   * ZERO HAS NO DIRECTION, AND THE CARD SAYS SO. "The key of C major
   * has _____ sharps/flats" answers 0, and a reader who taps 0 has
   * answered it whichever way the switch happens to be sitting.
   */
  const zeroAgrees = target.count === 0 && count === 0;
  return {
    correct: count === target.count
      && (zeroAgrees || direction === target.direction),
    /**
     * THE DIRECTION IS IN THE STRING, AND IT HAS TO BE.
     *
     * The card's own answer is a bare count — "1" — so a reader who
     * answers "1 flat" in the key of G major would hand the shell the
     * string "1", which its one comparison marks RIGHT. Naming the
     * direction is what keeps a wrong answer distinguishable from the
     * right one; `noWrongAnswerReadsAsRight` asserts it across every
     * built family.
     */
    built: count === null
      ? '—'
      : count === 0 ? '0' : `${count} ${direction ?? 'unsaid'}`,
    firstWrong: null,
  };
}
