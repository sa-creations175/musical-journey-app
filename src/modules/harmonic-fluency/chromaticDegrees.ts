/**
 * Every degree of the chromatic scale, spelled correctly from any root.
 *
 * =====================================================================
 * THE TABLE THE DECK WAS MISSING.
 *
 * `catalogExpansions` already spells degrees from a root, and its table
 * holds eight: the seven diatonic ones and ♭7. That is enough for the
 * families it serves and it is why nothing in the app can ask what the
 * ♭6 of A♭ is — the degree does not exist as a thing to ask about.
 *
 * This is the same mechanism with the full chromatic set. Nothing here
 * is new machinery: `spellInterval` does the spelling, and it has done
 * since the reading module needed to draw a diminished seventh
 * correctly.
 *
 * =====================================================================
 * TWO NUMBERS PER DEGREE, AND THE SECOND ONE IS THE WHOLE POINT.
 *
 * A degree is a LETTER DISTANCE and a SEMITONE DISTANCE, never one or
 * the other. ♯4 and ♭5 are the same sound and different notes: in C
 * they are F♯ and G♭, three letter-steps up and four. Give the speller
 * only the semitones and it has to guess, and the guess is wrong half
 * the time — which is exactly the mistake `scale-degree-math` builds
 * its decoys out of.
 *
 * So both are listed, both are used, and ♯4 and ♭5 are two entries
 * rather than one. They ask different questions and they have different
 * answers.
 *
 * =====================================================================
 * A PITCH CLASS COMES FROM `semitoneValue`, NOT FROM `pitchClassOf`.
 *
 * `pitchClassOf` reads a table of note NAMES, and that table stops at
 * one accidental — it has no row for A𝄫. Some degrees from some roots
 * genuinely need a double, and a card that cannot say where its own
 * answer sits on a keyboard is a card that cannot be sounded or
 * pressed. `semitoneValue` computes from the letter and the accidental
 * instead, so it answers for any spelling the speller can produce.
 * =====================================================================
 */
import {
  semitoneValue, spellInterval,
  type Accidental, type Letter, type Pitch,
} from '../reading/pitch';

/** A degree's identity: how it is written, and where it sits. */
export interface ChromaticDegree {
  /** ASCII, and the form an id is built from — "b6", "#4", "5". */
  id: string;
  /** Letter steps above the tonic. 0 for the 1, 5 for any kind of 6. */
  letterSteps: number;
  /** Semitones above the tonic. */
  semitones: number;
}

/**
 * The thirteen degrees, in pitch order, with the tritone spelled both
 * ways.
 *
 * THIRTEEN, NOT TWELVE, and the extra one is deliberate — see the
 * header. ♯4 and ♭5 sound identical and are different degrees, so a
 * reader who answers "G♭" to "what is the ♯4 of C" has made the mistake
 * this family exists to catch.
 *
 * The 1 is included and is not filler: "what is the 1 of E♭" is the
 * only card in the family whose answer is the key itself, and a reader
 * who has to think about it has learned something about how the rest
 * are counted.
 */
export const CHROMATIC_DEGREES: ReadonlyArray<ChromaticDegree> = [
  { id: '1',  letterSteps: 0, semitones: 0 },
  { id: 'b2', letterSteps: 1, semitones: 1 },
  { id: '2',  letterSteps: 1, semitones: 2 },
  { id: 'b3', letterSteps: 2, semitones: 3 },
  { id: '3',  letterSteps: 2, semitones: 4 },
  { id: '4',  letterSteps: 3, semitones: 5 },
  { id: '#4', letterSteps: 3, semitones: 6 },
  { id: 'b5', letterSteps: 4, semitones: 6 },
  { id: '5',  letterSteps: 4, semitones: 7 },
  { id: 'b6', letterSteps: 5, semitones: 8 },
  { id: '6',  letterSteps: 5, semitones: 9 },
  { id: 'b7', letterSteps: 6, semitones: 10 },
  { id: '7',  letterSteps: 6, semitones: 11 },
];

export const DEGREE_BY_ID: ReadonlyMap<string, ChromaticDegree> =
  new Map(CHROMATIC_DEGREES.map(d => [d.id, d]));

/** A root name — "C", "Eb", "F#" — as a pitch the speller can walk
 *  from. The octave is arbitrary and never surfaces. */
function rootPitch(name: string): Pitch {
  return {
    letter: name[0] as Letter,
    accidental: (name.slice(1) === '' ? null : name.slice(1)) as Accidental,
    octave: 4,
  };
}

/**
 * The note a degree lands on, spelled from the root's own letter.
 *
 * `null` where the spelling would need more than a double accidental —
 * a triple sharp is a note no chart prints and no reader would accept.
 * Real, and reachable: the caller decides what to do about it rather
 * than being handed a wrong answer that spells cleanly.
 */
export function degreePitch(root: string, degreeId: string): Pitch | null {
  const degree = DEGREE_BY_ID.get(degreeId);
  if (degree === undefined) return null;
  return spellInterval(rootPitch(root), degree.letterSteps, degree.semitones);
}

/** ASCII form — "Ab", "F#", "Abb". Storage and comparison. */
export function degreeNoteAscii(root: string, degreeId: string): string | null {
  const p = degreePitch(root, degreeId);
  return p === null ? null : `${p.letter}${p.accidental ?? ''}`;
}

/**
 * Where the answer sits on a keyboard, 0–11.
 *
 * Computed from the SPELLING rather than looked up by name, so a double
 * accidental still answers. See the header.
 */
export function degreePitchClass(root: string, degreeId: string): number | null {
  const p = degreePitch(root, degreeId);
  return p === null ? null : ((semitoneValue(p) % 12) + 12) % 12;
}

/** How many accidentals the spelling carries: 0, 1 or 2. */
export function accidentalWidth(ascii: string): number {
  return ascii.length - 1;
}
