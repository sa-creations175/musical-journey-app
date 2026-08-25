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
// Note recognition — the answer is the letter
// =====================================================================

/** The seven letters. Note cards render no accidentals by design, so
 *  this is the whole answer set. */
export function letterOptions(): PickerOption[] {
  return LETTERS.map(l => ({ id: l, label: l }));
}

/**
 * The octaves reachable on a clef — DERIVED by walking every catalog
 * position, not written down.
 *
 * =====================================================================
 * NO LONGER AN ANSWER SET. IT DESCRIBES THE REVEAL.
 *
 * This used to build the second stage of the question, and there was a
 * good argument for deriving it: a shared five-button row would have
 * offered octaves that cannot occur on the clef being asked about,
 * which is a free elimination hint.
 *
 * The question no longer asks. Naming the note is reading; knowing
 * that middle C is called C4 is a numbering convention, and asking for
 * it tested a second skill inside the first one's score. What survives
 * is the RANGE — treble reaches A3–C6 across the catalog's two-ledger
 * span and bass reaches C2–E4 — which is what the reveal's keyboard is
 * showing you when it brackets the clef. Kept derived rather than
 * written down for the original reason: the catalog moves and a typed
 * list would not.
 * =====================================================================
 */
export function octavesForClef(clef: Clef): number[] {
  const seen = new Set<number>();
  for (const position of NOTE_POSITIONS) {
    seen.add(pitchAtStaffPosition(clef, position).octave);
  }
  return [...seen].sort((a, b) => a - b);
}

/**
 * The verdict on a note card.
 *
 * `letterCorrect` and `correct` are the same value, and both are kept
 * deliberately. `correct` is what every skill's verdict carries and
 * what the attempt row records; `letterCorrect` is what `noteMissFor`
 * reads to decide the miss reason. Collapsing them would make the
 * miss reason depend on a field named for the whole answer, which is
 * how the next half of a staged answer gets added back without anyone
 * noticing the reason column stopped meaning anything.
 */
export interface NoteVerdict {
  letterCorrect: boolean;
  correct: boolean;
}

export function judgeNote(
  clef: Clef,
  position: number,
  pickedLetter: string | null,
): NoteVerdict {
  const pitch = pitchAtStaffPosition(clef, position);
  const letterCorrect = pickedLetter === pitch.letter;
  return { letterCorrect, correct: letterCorrect };
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
 *
 * STRUCTURED, NOT A SENTENCE. It used to be one string — "E G B D F —
 * Every Good Boy Does Fine" — which is a sentence you have to decode
 * into a picture of the staff before it helps. `items` is ordered
 * BOTTOM TO TOP so it can be laid against the lines it names and be
 * the picture instead.
 *
 * `label` exists because there are four of these and a bare rhyme does
 * not say which staff or which of lines/spaces it applies to. Without
 * it the mnemonic is unusable on the next card.
 */
export interface StaffMnemonic {
  clef: Clef;
  kind: 'line' | 'space';
  /** Which staff and which run — e.g. "treble clef · staff lines". */
  label: string;
  /** Bottom to top. `word` is absent where the letters spell
   *  themselves (F A C E needs no sentence). */
  items: ReadonlyArray<{ letter: string; word?: string }>;
  /** Flat form, for screen readers and any caller that just wants the
   *  line of text. */
  phrase: string;
}

const MNEMONICS: Readonly<Record<string, StaffMnemonic>> = {
  'treble-line': {
    clef: 'treble', kind: 'line', label: 'treble clef · staff lines',
    items: [
      { letter: 'E', word: 'Every' }, { letter: 'G', word: 'Good' },
      { letter: 'B', word: 'Boy' }, { letter: 'D', word: 'Does' },
      { letter: 'F', word: 'Fine' },
    ],
    phrase: 'E G B D F — Every Good Boy Does Fine',
  },
  'treble-space': {
    clef: 'treble', kind: 'space', label: 'treble clef · staff spaces',
    items: [{ letter: 'F' }, { letter: 'A' }, { letter: 'C' }, { letter: 'E' }],
    phrase: 'F A C E — the spaces spell FACE',
  },
  'bass-line': {
    clef: 'bass', kind: 'line', label: 'bass clef · staff lines',
    items: [
      { letter: 'G', word: 'Good' }, { letter: 'B', word: 'Boys' },
      { letter: 'D', word: 'Do' }, { letter: 'F', word: 'Fine' },
      { letter: 'A', word: 'Always' },
    ],
    phrase: 'G B D F A — Good Boys Do Fine Always',
  },
  'bass-space': {
    clef: 'bass', kind: 'space', label: 'bass clef · staff spaces',
    items: [
      { letter: 'A', word: 'All' }, { letter: 'C', word: 'Cows' },
      { letter: 'E', word: 'Eat' }, { letter: 'G', word: 'Grass' },
    ],
    phrase: 'A C E G — All Cows Eat Grass',
  },
};

export function mnemonicFor(clef: Clef, position: number): StaffMnemonic {
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

/**
 * What happens after the count is committed, in the `count` direction.
 *
 * A WRONG KIND ENDS THE ATTEMPT IMMEDIATELY. If the prompt says
 * "G♭ major" and the answer picked is sharps, that is not a near miss
 * — the spelling is in the key name, so it is a category error and
 * realistically a mistap. Tapping out six sharps to confirm it would
 * rehearse a wrong accidental order against a card that names flats,
 * which teaches something false and spends the card doing it.
 *
 * A wrong COUNT with the right kind does NOT stop: naming the flats in
 * written order is still the right rehearsal, and only the number is
 * off. That is a near miss and worth finishing.
 *
 * BUT THE NUMBER IS CORRECTED FIRST. Carrying a wrong count into the
 * sequence means naming flats while still believing there are three of
 * them and finding out at the end — the rep happens against the wrong
 * number, which is the thing being rehearsed. `actualCount` is
 * returned so the correction can be shown before the tapping starts.
 * The attempt is still wrong either way; what changes is what gets
 * practised.
 *
 * ORDER IS REQUIRED, and this is settled rather than open: "which four
 * flats" is a set, but the WRITTEN ORDER is why a signature has a
 * recognisable silhouette, and recognising that silhouette is how
 * signatures actually get read. In a reading module the order is the
 * notation.
 *
 * The empty signature settles here too — "none" has nothing to name,
 * so there is no second stage to enter.
 */
export type CountStage =
  | {
      stage: 'sequence';
      kind: 'sharp' | 'flat';
      /** False when the number was wrong but the kind was right. */
      countCorrect: boolean;
      /** How many the card actually has — shown as the correction. */
      actualCount: number;
    }
  | { stage: 'settled'; reason: 'wrong-kind' | 'no-accidentals' };

export function countStageAfterPick(
  cardId: SignatureId,
  pickedCountId: string,
): CountStage {
  const card = SIGNATURES.find(s => s.id === cardId);
  const picked = SIGNATURES.find(s => s.id === pickedCountId);
  const pickedKind = picked?.accidental ?? null;
  if (pickedKind !== (card?.accidental ?? null)) {
    return { stage: 'settled', reason: 'wrong-kind' };
  }
  if (pickedKind === null) return { stage: 'settled', reason: 'no-accidentals' };
  return {
    stage: 'sequence',
    kind: pickedKind,
    countCorrect: pickedCountId === cardId,
    actualCount: card?.count ?? 0,
  };
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

/**
 * The answer to "which inversion" — the four positions plus OPEN
 * SHAPE, which is a real answer rather than a missing one.
 *
 * An octave or a root–tenth has no inversion: it IS a voicing, and
 * `positionsForFamily` gives it only 'root'. The two obvious ways to
 * handle that are both wrong. Hiding the picker on those cards
 * announces "this is an open shape" through the layout, before the
 * staff has been read. Showing four buttons and accepting only 'root'
 * asks a question with no meaning.
 *
 * Naming the open shape as its own answer fixes both: the picker is
 * IDENTICAL on every chord card, so it leaks nothing, and recognising
 * a voicing as an open shape becomes part of the skill instead of
 * something the interface gives away.
 */
export const OPEN_SHAPE_ANSWER = 'open';

/** What the inversion picker can return — a real position, or the
 *  open-shape answer, which is deliberately not a ChordPosition. */
export type InversionAnswer = ChordPosition | typeof OPEN_SHAPE_ANSWER;

export function inversionOptions(): PickerOption[] {
  const positions: PickerOption[] =
    (['root', 'inv1', 'inv2', 'inv3'] as ChordPosition[]).map(p => ({
      id: p,
      label: POSITION_WORD[p],
    }));
  return [
    ...positions,
    { id: OPEN_SHAPE_ANSWER, label: 'open shape', hint: 'octave, fifth, tenth — a voicing, not an inversion' },
  ];
}

/** The inversion answer for a chord item: open-family cards answer
 *  'open', everything else answers its written position. Derived from
 *  the quality so the picker and the judge cannot disagree. */
export function inversionAnswerFor(
  qualityId: string,
  position: ChordPosition,
): InversionAnswer {
  const family = CHORD_QUALITIES.find(q => q.id === qualityId)?.family;
  return family === 'open' ? OPEN_SHAPE_ANSWER : position;
}

export interface ChordVerdict {
  inversionCorrect: boolean;
  rootCorrect: boolean;
  qualityCorrect: boolean;
  correct: boolean;
}

export function judgeChord(
  expected: { position: InversionAnswer; rootId: string; qualityId: string },
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
