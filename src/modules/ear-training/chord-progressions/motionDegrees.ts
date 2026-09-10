/**
 * The degree chips a chord-motion answer is built from.
 *
 * =====================================================================
 * THE ANSWER IS A DEGREE, WHICH IS THE QUESTION THE CARD ASKS.
 *
 * Chord Motion asked its answer on a keyboard: tap the key the move
 * landed on. That is a fine way to answer and it is still offered — but
 * it makes the reader translate a degree they heard into a letter, in a
 * key the card named, before they can say what they heard. Silas's
 * ruling of 10 Sep 2026 puts degrees first and the board second.
 *
 * SEVEN CHIPS DIATONIC, FIFTEEN CHROMATIC: the seven, the five
 * chromatic degrees between them, and the three borrowed qualities
 * (2ø, 4m, 5m) beside their diatonic twins — the motion pool's own
 * `DEGREE_TABLE`, so a chip cannot exist for a motion the pool cannot
 * produce.
 *
 * THE QUALITY SUFFIX IS THE APP'S OWN. "7°" or "7dim" is the
 * progression-spelling setting, read through `qualitySuffix`, so the
 * chips agree with every grid row and flashcard on the same screen.
 * =====================================================================
 */
import { qualitySuffix } from '../../../lib/progressionRow';
import type { ProgressionSpelling } from '../../../lib/progressionSpellingShape';
import { DEGREE_TABLE, type DegreeLabel, type Motion } from './chordMotionPool';

/** The chord-shape quality a degree's chord takes, for the suffix. */
const SUFFIX_QUALITY: Readonly<Record<string, string>> = {
  major: 'maj7',
  minor: 'm7',
  dominant: '7',
  diminished: 'm7b5',
};

export interface DegreeChip {
  label: DegreeLabel;
  /** What the chip says: "1", "2m", "7°". */
  text: string;
  diatonic: boolean;
}

/**
 * The chips on offer.
 *
 * `chromatic` adds the five borrowed degrees; without it the row is the
 * seven of the major scale, which is what the card asks about unless
 * Note context says otherwise.
 *
 * NO RUNG PASSED, so a diminished takes its TRIAD name — the chip names
 * a degree of the key rather than a voicing of it, which is the same
 * reading a grid row label takes.
 */
export function degreeChips(
  chromatic: boolean,
  settings?: ProgressionSpelling,
): DegreeChip[] {
  return DEGREE_TABLE
    .filter(e => chromatic || e.diatonic)
    .map(e => ({
      label: e.label,
      text: chipText(e.label, settings),
      diatonic: e.diatonic,
    }));
}

/**
 * What a degree's chip says: "1", "2m", "♯4°".
 *
 * ONE SPELLING FOR THE CHIP AND EVERY LINE THAT NAMES IT. The result
 * line and the verdict say "the 4m", not "the 4" or "B♭m7", so a reader
 * checks their answer against the same words they tapped.
 */
export function chipText(
  label: DegreeLabel,
  settings?: ProgressionSpelling,
): string {
  const entry = DEGREE_TABLE.find(e => e.label === label);
  // THE BORROWED 2 IS NAMED AS THE SEVENTH CHORD IT IS BORROWED AS —
  // the ø of a minor 2 5 1 — while the 7 and the ♯4 keep their triad
  // name, °. Both are the same m7♭5 shape; the chip row Silas walked
  // spells them "2ø" and "7°", and the half-diminished setting decides
  // the ø the way the diminished setting decides the °.
  const rung = entry?.borrowed === true && entry.quality === 'diminished'
    ? 'seventh' as const : undefined;
  return (entry?.degree ?? label).replace(/b/g, '♭').replace(/#/g, '♯')
    + qualitySuffix(SUFFIX_QUALITY[entry?.quality ?? 'major'] ?? 'maj7', {
      ...(settings ? { settings } : {}),
      ...(rung ? { rung } : {}),
    });
}

/**
 * A motion by name, the way its chips spell it: "1 → 2ø", "♭2 → 3m",
 * "4m → ♭7".
 *
 * =====================================================================
 * THE ONE FORMATTER. Three places named a motion — the Focus panel, the
 * progressions tracker and the dashboard's rows — and each wrote its
 * stored id straight to the screen: "1 → 2m7b5 (Up)", "b2 → 3". An id is
 * a key, not a name; the chips had the name all along.
 *
 * SAFE FOR THE READ LAYER. Nothing under this imports React or Dexie —
 * the spelling comes from `progressionSpellingShape`, not from the file
 * with the hooks — so the dashboard can call it. Without `settings` it
 * spells at the app's default (° and ø).
 *
 * NO DIRECTION. A pair of chords has one motion in the pool, so "(Up)"
 * said nothing the two names do not, and the direction a reader cares
 * about is the one the bass took, which the verdict now says.
 * =====================================================================
 */
export function motionName(
  m: Pick<Motion, 'startLabel' | 'destLabel'>,
  settings?: ProgressionSpelling,
): string {
  return `${chipText(m.startLabel, settings)} → ${chipText(m.destLabel, settings)}`;
}

/** A degree's pitch class in a key. */
export function degreePc(keyPc: number, label: DegreeLabel): number {
  const entry = DEGREE_TABLE.find(e => e.label === label);
  return (((keyPc + (entry?.semi ?? 0)) % 12) + 12) % 12;
}

/**
 * The degree a tapped key is, in a key.
 *
 * THE PIANO ANSWERS WITH A NOTE, AND THE RESULT LINE NAMES IT AS A
 * DEGREE. "It landed on the 4, not the 5" — never "not the C", because
 * the card's question is which degree, and a letter would make the
 * reader translate their own answer back before they could read it.
 * A PITCH HAS NO QUALITY, so a tap on the 4's key is the 4, never the
 * 4m: the table lists each diatonic chord before its borrowed twin and
 * this takes the first.
 */
export function degreeOfPc(keyPc: number, pc: number): DegreeLabel {
  const semi = (((pc - keyPc) % 12) + 12) % 12;
  return DEGREE_TABLE.find(e => e.semi === semi)?.label ?? '1';
}
