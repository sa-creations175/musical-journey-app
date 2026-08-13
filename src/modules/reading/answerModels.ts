/**
 * Reading answer sets and verdicts — pure, no React, no Dexie.
 *
 * Every option list here is DERIVED from the catalog rather than typed
 * out, for the same reason the denominators are: a hand-written list
 * is a second source of truth, and the first catalog change makes it
 * wrong. The octave list is the sharpest case — see below.
 *
 * Verdicts live here too, so "what counts as right" is testable
 * without mounting a component. Step 4.3 reads these; nothing here
 * writes an attempt.
 */

import {
  CHORD_QUALITIES,
  NOTE_POSITIONS,
  SHAPE_FAMILIES,
  SIGNATURES,
  FLAT_ORDER,
  SHARP_ORDER,
  positionsForFamily,
  shapeItemRef,
  type Clef,
  type ChordPosition,
  type KeyMode,
  type SignatureId,
} from './catalog';
import { LETTERS, pitchAtStaffPosition, withAccidentalGlyphs, isLinePosition } from './pitch';
import type { PickerOption } from '../../components/FullSetPicker';

// =====================================================================
// Note recognition — staged: letter, then octave
// =====================================================================

/** The seven letters. Note cards render no accidentals by design, so
 *  this is the whole first-stage answer set. */
export function letterOptions(): PickerOption[] {
  return LETTERS.map(l => ({ id: l, label: l }));
}

/**
 * The octaves reachable on a clef — DERIVED by walking every catalog
 * position, not written down.
 *
 * THE OCTAVE STAGE IS NOT A FIXED SET, which is easy to assume and
 * wrong. Treble spans A3–C6 across the catalog's two-ledger range and
 * bass spans C2–E4, so the second stage is four buttons on treble and
 * three on bass. A shared five-button row would offer octaves that
 * cannot occur on the clef being asked about, which is a free
 * elimination hint.
 */
export function octavesForClef(clef: Clef): number[] {
  const seen = new Set<number>();
  for (const position of NOTE_POSITIONS) {
    seen.add(pitchAtStaffPosition(clef, position).octave);
  }
  return [...seen].sort((a, b) => a - b);
}

export function octaveOptions(clef: Clef): PickerOption[] {
  return octavesForClef(clef).map(o => ({ id: String(o), label: String(o) }));
}

export interface NoteVerdict {
  letterCorrect: boolean;
  octaveCorrect: boolean;
  /** Both halves. Getting one half right is still wrong. */
  correct: boolean;
}

export function judgeNote(
  clef: Clef,
  position: number,
  pickedLetter: string | null,
  pickedOctave: string | null,
): NoteVerdict {
  const pitch = pitchAtStaffPosition(clef, position);
  const letterCorrect = pickedLetter === pitch.letter;
  const octaveCorrect = pickedOctave === String(pitch.octave);
  return { letterCorrect, octaveCorrect, correct: letterCorrect && octaveCorrect };
}

// =====================================================================
// Mnemonics — shown on feedback, right or wrong
// =====================================================================

/**
 * The four staff mnemonics, keyed by (clef, line-or-space).
 *
 * Shown on EVERY note answer rather than only on a miss. A mnemonic
 * offered only after a mistake reads as a correction; offered every
 * time it reads as the thing being learned, which is what it is.
 */
const MNEMONICS: Readonly<Record<string, string>> = {
  'treble-line':  'E G B D F — Every Good Boy Does Fine',
  'treble-space': 'F A C E',
  'bass-line':    'G B D F A — Good Boys Do Fine Always',
  'bass-space':   'A C E G — All Cows Eat Grass',
};

export function mnemonicFor(clef: Clef, position: number): string {
  return MNEMONICS[`${clef}-${isLinePosition(position) ? 'line' : 'space'}`];
}

// =====================================================================
// Notation shapes — the seven silhouettes
// =====================================================================

const POSITION_WORD: Readonly<Record<ChordPosition, string>> = {
  root: 'root',
  inv1: '1st inv',
  inv2: '2nd inv',
  inv3: '3rd inv',
};

/** All seven, in catalog order — triads then sevenths. Ids ARE the
 *  itemRefs, so judging is an equality check on identity rather than a
 *  parallel encoding that could drift. */
export function shapeOptions(): PickerOption[] {
  const out: PickerOption[] = [];
  for (const family of SHAPE_FAMILIES) {
    for (const position of positionsForFamily(family)) {
      out.push({
        id: shapeItemRef(family, position),
        label: `${family} ${POSITION_WORD[position]}`,
      });
    }
  }
  return out;
}

// =====================================================================
// Key signatures
// =====================================================================

/** The thirteen tonics for a mode — the answer set for the `name`
 *  direction. Mode comes from the prompt ("which major key?"), so it
 *  is not part of the choice. */
export function keyNameOptions(mode: KeyMode): PickerOption[] {
  return SIGNATURES.map(s => ({
    id: s.id,
    label: withAccidentalGlyphs(mode === 'major' ? s.major : s.minor),
  }));
}

/**
 * "How many, and which kind" — the thirteen signature ids as a
 * countable answer. `0` reads "none" rather than "0 sharps", because
 * an empty signature has no kind.
 */
export function accidentalCountOptions(): PickerOption[] {
  return SIGNATURES.map(s => ({
    id: s.id,
    label: s.count === 0
      ? 'none'
      : `${s.count} ${s.accidental === 'sharp' ? 'sharp' : 'flat'}${s.count === 1 ? '' : 's'}`,
  }));
}

/** The seven names of one accidental kind, in written order. The
 *  answer to "which ones" is the ordered PREFIX of length `count`. */
export function accidentalNameOptions(kind: 'sharp' | 'flat'): PickerOption[] {
  const order = kind === 'sharp' ? SHARP_ORDER : FLAT_ORDER;
  const mark = kind === 'sharp' ? '♯' : '♭';
  return order.map(l => ({ id: `${l}${kind === 'sharp' ? '#' : 'b'}`, label: `${l}${mark}` }));
}

export function correctAccidentalSequence(id: SignatureId): string[] {
  const sig = SIGNATURES.find(s => s.id === id);
  if (!sig || sig.accidental === null) return [];
  const order = sig.accidental === 'sharp' ? SHARP_ORDER : FLAT_ORDER;
  const suffix = sig.accidental === 'sharp' ? '#' : 'b';
  return order.slice(0, sig.count).map(l => `${l}${suffix}`);
}

export interface SignatureCountVerdict {
  countCorrect: boolean;
  whichCorrect: boolean;
  /** ONE attempt, both parts. Committing to the number is tested as
   *  its own fact, but a right count with the wrong accidentals is
   *  not a right answer. */
  correct: boolean;
}

export function judgeSignatureCount(
  id: SignatureId,
  pickedCountId: string | null,
  pickedSequence: ReadonlyArray<string>,
): SignatureCountVerdict {
  const countCorrect = pickedCountId === id;
  const expected = correctAccidentalSequence(id);
  const whichCorrect =
    pickedSequence.length === expected.length
    && expected.every((a, i) => pickedSequence[i] === a);
  return { countCorrect, whichCorrect, correct: countCorrect && whichCorrect };
}

// =====================================================================
// Chord identification — three picks, any order
// =====================================================================

/**
 * The twelve roots a chord card can be drawn on.
 *
 * This list is also the CONSTRAINT on card selection: `pickCard` may
 * only choose a root from here, so the right answer is always on
 * screen. Spelling one root as F# and another as Gb would put a card
 * on the staff that no button names.
 */
export const CHORD_ROOTS: ReadonlyArray<{ letter: string; accidental: 'b' | '#' | null }> = [
  { letter: 'C', accidental: null },
  { letter: 'D', accidental: 'b' },
  { letter: 'D', accidental: null },
  { letter: 'E', accidental: 'b' },
  { letter: 'E', accidental: null },
  { letter: 'F', accidental: null },
  { letter: 'G', accidental: 'b' },
  { letter: 'G', accidental: null },
  { letter: 'A', accidental: 'b' },
  { letter: 'A', accidental: null },
  { letter: 'B', accidental: 'b' },
  { letter: 'B', accidental: null },
];

export function rootId(letter: string, accidental: 'b' | '#' | null): string {
  return `${letter}${accidental ?? ''}`;
}

export function rootOptions(): PickerOption[] {
  return CHORD_ROOTS.map(r => ({
    id: rootId(r.letter, r.accidental),
    label: withAccidentalGlyphs(`${r.letter}${r.accidental ?? ''}`),
  }));
}

export function qualityOptions(): PickerOption[] {
  return CHORD_QUALITIES.map(q => ({ id: q.id, label: q.label }));
}

/** All four, always — including for open shapes, which have only a
 *  root position. See `chordInversionAsked` for why that is a
 *  question rather than a settled call. */
export function inversionOptions(): PickerOption[] {
  return (['root', 'inv1', 'inv2', 'inv3'] as ChordPosition[]).map(p => ({
    id: p,
    label: POSITION_WORD[p],
  }));
}

export interface ChordVerdict {
  inversionCorrect: boolean;
  rootCorrect: boolean;
  qualityCorrect: boolean;
  correct: boolean;
}

export function judgeChord(
  expected: { position: ChordPosition; rootId: string; qualityId: string },
  picked: { position: string | null; rootId: string | null; qualityId: string | null },
): ChordVerdict {
  const inversionCorrect = picked.position === expected.position;
  const rootCorrect = picked.rootId === expected.rootId;
  const qualityCorrect = picked.qualityId === expected.qualityId;
  return {
    inversionCorrect,
    rootCorrect,
    qualityCorrect,
    correct: inversionCorrect && rootCorrect && qualityCorrect,
  };
}
