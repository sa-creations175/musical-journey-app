/**
 * One relationship, asked three ways: a scale degree and a note, in a
 * named key.
 *
 * =====================================================================
 * THE DECK COULD NOT ASK FOR THE ♭6 OF A♭.
 *
 * Named Notes turns a degree into a note in a real key and stops at the
 * seven diatonic ones — no ♭6, no ♭7, no ♯4. Scale Degree Math covers
 * every quality and answers in the abstract, "in any major key",
 * naming no note at all. Tritone Pairs is the only family that puts a
 * named root and a fixed distance together and hands back a note, and
 * it covers one distance of the twelve.
 *
 * This family is that question for the whole chromatic scale.
 *
 * =====================================================================
 * THREE ANGLES ON ONE FACT, AND THEY ARE NOT THE SAME CARD.
 *
 *   NAME IT     "In the key of C, what is the ♭6?"    → A♭
 *               Production. You have to build the note.
 *
 *   PLACE IT    "In the key of C, A♭ is which degree?" → ♭6
 *               Analysis. You have to recognise what a note is DOING.
 *
 *   PRESS IT    "In the key of C, press the ♭6."       → the key itself
 *               Location. Naming it and finding it are different acts,
 *               and only the third one is worth anything at the piano.
 *
 * The deck already believes the first two are different skills: Named
 * Notes and Reverse Key Pivots are exactly this reversal for keys
 * rather than for notes, and both exist.
 *
 * =====================================================================
 * ALL THREE ARE SCORED, NOT RATED, AND THAT IS WHY THE THIRD ONE FITS.
 *
 * Pressing a key here is harder RECALL, not a physical skill: there is
 * no tempo, no hand, no "how did that feel". The card is right or
 * wrong, it writes an attempt, and Harmonic Fluency stays declarative.
 * Nothing about the memory-type model changes — see the report.
 * =====================================================================
 */
import type { Flashcard, FlashcardCategory } from './catalog';
import { chooseDecoys } from './decoyGuard';
import {
  CHROMATIC_DEGREES, degreeNoteAscii, degreePitchClass,
} from './chromaticDegrees';
import { FLAT_TWELVE } from './catalogExpansions';
import { canonicaliseKey } from '../repertoire/circleOfFourths';
import { noteWithPlayable } from './scaleDegreeQuality';
import { degreePitch } from './chromaticDegrees';

export const DEGREE_NOTE_CATEGORY: FlashcardCategory = 'degree-notes';

const DECOY_COUNT = 3;

/**
 * How a degree is written on screen.
 *
 * ASCII in the id and the answer string, glyphs on the way to the eye —
 * the same split every other family here uses, because an option string
 * is compared against `correctAnswer` and written to the attempt.
 */
export function degreeLabel(id: string): string {
  return id.replace('b', '♭').replace('#', '♯');
}

/** A note, written for the eye: real glyphs, and the playable name
 *  beside a spelling that cannot be played as written. */
export function noteDisplay(root: string, degreeId: string): string {
  const p = degreePitch(root, degreeId);
  return p === null ? '' : noteWithPlayable(p);
}

/**
 * Ids are built from the identity spelling; nothing a reader sees is.
 *
 * AND WITH `#` WRITTEN `s`. A sharp is a fragment marker in a URL, and
 * these ids are the first in this deck to carry a root at all — every
 * other family's are positional or degree-based. Encoding it here
 * rather than escaping it at each use means the id is safe wherever it
 * ends up, which is what a stable handle has to be.
 */
function idRoot(root: string): string {
  return (canonicaliseKey(root) ?? root).replace('#', 's');
}

/** `b6` → `b6`, `#4` → `s4`. Same rule, same reason. */
function idDegree(degreeId: string): string {
  return degreeId.replace('#', 's');
}

/**
 * The notes a wrong answer would most plausibly be.
 *
 * NEIGHBOURING DEGREES FIRST, because a wrong degree is the mistake
 * this card is about: answering the 6 when asked for the ♭6 is the
 * whole failure mode, and it must be on screen. `chooseDecoys` keeps
 * the caller's ordering where it can.
 */
function noteDecoyPool(root: string, degreeId: string): string[] {
  const index = CHROMATIC_DEGREES.findIndex(d => d.id === degreeId);
  const byDistance = [...CHROMATIC_DEGREES]
    .map((d, i) => ({ d, gap: Math.abs(i - index) }))
    .filter(x => x.gap > 0)
    .sort((a, b) => a.gap - b.gap)
    .map(x => degreeNoteAscii(root, x.d.id));
  return byDistance.filter((n): n is string => n !== null);
}

/**
 * The degrees a wrong answer would most plausibly be.
 *
 * THE SAME NUMBER WITH A DIFFERENT ALTERATION LEADS — 6 beside ♭6 is
 * the pair this family exists to separate, and an option set where
 * every number is different lets a reader count letters and stop. It is
 * the same argument `scale-degree-math` makes for putting ♯4 beside 4.
 */
/** Whether another degree shares this one's number. Only the 1 does
 *  not — there is no ♭1 and no ♯1. */
function hasAlteredTwin(degreeId: string): boolean {
  return CHROMATIC_DEGREES.some(
    d => d.id !== degreeId && bareDegree(d.id) === bareDegree(degreeId),
  );
}

/** A degree without its alteration: `b6` and `6` are both `6`. */
function bareDegree(degreeId: string): string {
  return degreeId.replace(/[b#]/g, '');
}

function degreeDecoyPool(degreeId: string): string[] {
  const bare = bareDegree(degreeId);
  const sameNumber = CHROMATIC_DEGREES
    .filter(d => d.id !== degreeId && d.id.replace(/[b#]/g, '') === bare)
    .map(d => d.id);
  const rest = CHROMATIC_DEGREES
    .filter(d => d.id !== degreeId && !sameNumber.includes(d.id))
    .map(d => d.id);
  return [...sameNumber, ...rest];
}

interface Pair { root: string; degreeId: string; note: string }

/** Every key against every chromatic degree, with the note it lands
 *  on. Generated, never listed — see the module header. */
export function degreeNotePairs(): Pair[] {
  const out: Pair[] = [];
  for (const root of FLAT_TWELVE) {
    for (const degree of CHROMATIC_DEGREES) {
      const note = degreeNoteAscii(root, degree.id);
      // `null` means the spelling would need more than a double, which
      // nothing in this grid reaches. Skipped rather than asserted so a
      // future degree added to the table cannot break the build in a
      // way that looks like a card bug.
      if (note !== null) out.push({ root, degreeId: degree.id, note });
    }
  }
  return out;
}

/** "In the key of C, what is the ♭6?" → A♭ */
export function nameItCards(): Flashcard[] {
  return degreeNotePairs().map(({ root, degreeId, note }) => {
    const id = `dgn-${idRoot(root)}-${idDegree(degreeId)}`;
    return {
      id,
      category: DEGREE_NOTE_CATEGORY,
      categoryName: DEGREE_NOTE_CATEGORY_NAME,
      axis: { key: idRoot(root), degree: degreeId },
      question: `In the key of ${root}, what is the ${degreeLabel(degreeId)}?`,
      correctAnswer: note,
      decoys: chooseDecoys(note, noteDecoyPool(root, degreeId), {
        count: DECOY_COUNT, seed: id, label: id, category: DEGREE_NOTE_CATEGORY,
      }),
      explanation:
        `The ${degreeLabel(degreeId)} of ${root} is ${noteDisplay(root, degreeId)}.`,
      skillTag: `degree-note-${idRoot(root)}-${idDegree(degreeId)}`,
    };
  });
}

/** "In the key of C, A♭ is which degree?" → ♭6 */
export function placeItCards(): Flashcard[] {
  return degreeNotePairs().map(({ root, degreeId }) => {
    const id = `dgd-${idRoot(root)}-${idDegree(degreeId)}`;
    return {
      id,
      category: DEGREE_NOTE_CATEGORY,
      categoryName: DEGREE_NOTE_CATEGORY_NAME,
      axis: { key: idRoot(root), degree: degreeId },
      question: `In the key of ${root}, ${noteDisplay(root, degreeId)} is which degree?`,
      correctAnswer: degreeId,
      decoys: chooseDecoys(degreeId, degreeDecoyPool(degreeId), {
        count: DECOY_COUNT, seed: id, label: id, category: DEGREE_NOTE_CATEGORY,
        // THE SAME NUMBER, DIFFERENTLY ALTERED, IS REQUIRED — not
        // merely offered first. An option set where every number
        // differs lets a reader read the digit and stop, which is the
        // habit this family exists to break. `scale-degree-math` makes
        // the identical requirement for the same reason.
        //
        // EXCEPT FOR THE 1, WHICH HAS NO ALTERED TWIN. There is no ♭1
        // and no ♯1 — the tonic is the one degree in the table that
        // cannot be confused with a differently-spelled version of
        // itself, so requiring one would ask the guard for a card that
        // cannot exist. Conditioned rather than exempted by id, so a
        // degree added later gets the right answer without being
        // remembered here.
        require: hasAlteredTwin(degreeId)
          ? (ds: readonly string[]) => ds.some(d => bareDegree(d) === bareDegree(degreeId))
          : () => true,
      }),
      explanation:
        `${noteDisplay(root, degreeId)} is the ${degreeLabel(degreeId)} of ${root}.`,
      skillTag: `note-degree-${idRoot(root)}-${idDegree(degreeId)}`,
    };
  });
}

/**
 * "In the key of C, press the ♭6."
 *
 * THE KEYBOARD IS THE ANSWER, and the decoys below are never drawn.
 * They exist because a `Flashcard` carries them and because the deck's
 * own guards read every card in the catalog — a family with none would
 * be a hole in a sweep rather than a card without options.
 */
export function pressItCards(): Flashcard[] {
  return degreeNotePairs().map(({ root, degreeId, note }) => {
    const id = `dgp-${idRoot(root)}-${idDegree(degreeId)}`;
    return {
      id,
      category: DEGREE_NOTE_CATEGORY,
      categoryName: DEGREE_NOTE_CATEGORY_NAME,
      axis: { key: idRoot(root), degree: degreeId },
      question: `In the key of ${root}, press the ${degreeLabel(degreeId)}.`,
      correctAnswer: note,
      decoys: chooseDecoys(note, noteDecoyPool(root, degreeId), {
        count: DECOY_COUNT, seed: id, label: id, category: DEGREE_NOTE_CATEGORY,
      }),
      explanation:
        `The ${degreeLabel(degreeId)} of ${root} is ${noteDisplay(root, degreeId)}.`,
      skillTag: `degree-press-${idRoot(root)}-${idDegree(degreeId)}`,
    };
  });
}

/**
 * PLACEHOLDER, NOT A PROPOSAL. The category has to be called something
 * for the nav, the chip row and the card header to render at all. This
 * is the most literal description of what the family relates, and it is
 * flagged at the top of the report for Silas to replace. Nothing about
 * it was chosen for how it reads.
 */
export const DEGREE_NOTE_CATEGORY_NAME = 'Degrees And Notes';

export function degreeNoteCards(): Flashcard[] {
  return [...nameItCards(), ...placeItCards(), ...pressItCards()];
}

// =====================================================================
// What a pressed answer is judged against
// =====================================================================

/**
 * Whether a card is answered by pressing a key rather than by picking
 * one of four.
 *
 * READ OFF THE ID PREFIX, which is the one thing about these cards that
 * is structural rather than editorial. The alternative — a flag on
 * `Flashcard` — would put a field on all ~900 cards to describe three
 * hundred of them.
 */
export function isPressedCard(cardId: string): boolean {
  return cardId.startsWith('dgp-');
}

/**
 * The pitch class a press has to land on, or null when the card is not
 * a pressed one.
 *
 * THE CARD JUDGES, WHICH IS WHY THIS IS HERE AND NOT IN THE KEYBOARD.
 * `AnswerKeyboard` emits a position and knows no theory at all — a
 * tritone is the same interval up or down, an ascending seventh is not,
 * and putting either rule inside the keyboard would leak it into every
 * card type that adopts it later. This family's rule is the simplest
 * one there is: a pitch class, in whichever octave the reader reaches
 * for, because "the ♭6 of C" names a note and not a register.
 */
export function pressedPitchClass(cardId: string): number | null {
  if (!isPressedCard(cardId)) return null;
  const parsed = parsePressedId(cardId);
  if (parsed === null) return null;
  return degreePitchClass(parsed.root, parsed.degreeId);
}

/** The root a pressed card is asked in — the note the board marks. */
export function pressedRootPitchClass(cardId: string): number | null {
  const parsed = parsePressedId(cardId);
  if (parsed === null) return null;
  return degreePitchClass(parsed.root, '1');
}

/**
 * `dgp-Db-b6` → root `Db`, degree `b6`.
 *
 * Reading a coordinate back out of an id is normally forbidden here —
 * an id is a stable handle for spacing state, and parsing one makes it
 * a schema. This is the exception the rule allows for: these ids are
 * CONTENT-SUFFIXED by construction directly above, and the alternative
 * is a lookup table rebuilt on every render of a card the reader is
 * already looking at.
 *
 * `#` is written `s` in an id, because a fragment marker in a URL is
 * not a sharp.
 */
export function parsePressedId(
  cardId: string,
): { root: string; degreeId: string } | null {
  const m = /^dg[dnp]-([A-G][bs]?)-([bs]?\d)$/.exec(cardId);
  if (m === null) return null;
  return {
    root: m[1].replace('s', '#'),
    degreeId: m[2].replace(/^s/, '#'),
  };
}
