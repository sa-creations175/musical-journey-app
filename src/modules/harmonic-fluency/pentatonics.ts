import {
  spellInterval, type Accidental, type Letter, type Pitch,
} from '../reading/pitch';

/**
 * Pentatonic scales in twelve keys, spelled by interval.
 *
 * =====================================================================
 * WHY THE TWO SHAPES DO NOT SHARE ONE LIST OF TWELVE.
 *
 * Minor pentatonic is 1 ♭3 4 5 ♭7 and MAJOR pentatonic is 1 2 3 5 6, so
 * they lean opposite ways and the twelve keys that spell cleanly for
 * one are not the twelve for the other.
 *
 *   MINOR spells badly on the flat side. G♭ minor pentatonic is
 *   G♭ B𝄫 C♭ D♭ F♭ — a double flat and two theoretical accidentals in
 *   five notes. D♭ needs F♭ and C♭. A♭ needs C♭, because the third
 *   letter up from A is C and a minor third makes it C♭, not B.
 *
 *   MAJOR spells badly on the SHARP side. C♯ major pentatonic needs
 *   E♯; D♯ needs F𝄪; G♯ needs B♯ and E♯; A♯ needs C𝄪 and F𝄪.
 *
 * So minor takes the sharp spelling of the three contested pitch
 * classes and major takes the flat one. Both lists are clean: no
 * double accidentals, no theoretical accidentals, in any of the
 * twenty-four scales.
 *
 * THIS IS WHY A♭ WAS UNREACHABLE. The deck had one keyed shape, a
 * MINOR one, and A♭ is precisely the key that shape cannot spell. A♭
 * major pentatonic is A♭ B♭ C E♭ F — clean, nothing to work around —
 * and it simply had no door to come through.
 * =====================================================================
 */

/** 1, ♭3, 4, 5, ♭7 — as (letter steps, semitones) from the root. */
const MINOR_PENT: ReadonlyArray<readonly [number, number]> = [
  [0, 0], [2, 3], [3, 5], [4, 7], [6, 10],
];

/** 1, 2, 3, 5, 6. */
const MAJOR_PENT: ReadonlyArray<readonly [number, number]> = [
  [0, 0], [1, 2], [2, 4], [4, 7], [5, 9],
];

/**
 * The twelve minor roots. Sharp on C♯/F♯/G♯ — see the header.
 *
 * Order is chromatic from C rather than circle-of-fourths, because
 * these are scale roots being enumerated, not keys being related to
 * one another.
 */
export const MINOR_ROOTS: ReadonlyArray<string> = [
  'C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B',
];

/** The twelve major roots. Flat on D♭/G♭/A♭ — the mirror of the above. */
export const MAJOR_ROOTS: ReadonlyArray<string> = [
  'C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B',
];

/**
 * A second name for the SCALE, where the app's usual flat default would
 * have you reaching for a different label.
 *
 * ---------------------------------------------------------------
 * NOT THE SAME RULE AS THE LYDIAN PARENTHETICAL. DO NOT MERGE THEM.
 *
 * `lydianChords.ts` parenthesises a NOTE whose correct spelling nobody
 * uses in speech — E♯ (F). The note is genuinely E♯ in that chord; the
 * parenthesis tells you where your hand goes.
 *
 * This parenthesises a SCALE NAME. Both names are equally real and
 * equally used — G♯ minor and A♭ minor are the same five keys under the
 * label a given chart happens to pick. The parenthesis is here because
 * the app defaults to flats, so "A♭ minor pentatonic" is what the user
 * reaches for, while the SPELLING has to be sharp or it produces C♭.
 *
 * Same visual convention, different rule, and they must not be
 * collapsed: one is about a note that is mis-said, the other about a
 * scale that is double-named. Aliasing a note here, or spelling a note
 * flat inside the list to match the alias, would reintroduce exactly
 * the C♭ this list exists to avoid.
 * ---------------------------------------------------------------
 *
 * Major needs none: its twelve are already the names everyone uses.
 */
const MINOR_NAME_ALIAS: Readonly<Record<string, string>> = {
  'C#': 'Db', 'F#': 'Gb', 'G#': 'Ab',
};

/**
 * Accidental → the glyph the rest of the app renders.
 *
 * The doubles are here even though none of the twenty-four chosen
 * scales produces one. `spellInterval` can return them, and the
 * rejected root lists do — G♭ minor's ♭3 is B𝄫. Without an entry a
 * double would fall through as raw ASCII "Bbb", which reads like a
 * typo rather than like the double flat that it is, and would hide the
 * very thing the root lists were chosen to avoid.
 */
const GLYPH: Readonly<Record<string, string>> = {
  '#': '♯', b: '♭', '##': '𝄪', bb: '𝄫',
};

function parse(name: string): Pitch | null {
  const letter = name[0] as Letter;
  if (!/^[A-G]$/.test(letter)) return null;
  const rest = name.slice(1);
  if (rest !== '' && rest !== '#' && rest !== 'b') return null;
  return { letter, accidental: (rest === '' ? null : rest) as Accidental, octave: 4 };
}

/** ASCII note name — "Eb", "F#", "C". Storage/comparison form. */
function ascii(p: Pitch): string {
  return `${p.letter}${p.accidental ?? ''}`;
}

/** Display form with the app's real glyphs — "E♭", "F♯". */
export function noteLabel(name: string): string {
  const letter = name[0];
  const accidental = name.slice(1);
  if (!/^[A-G]$/.test(letter ?? '')) return name;
  if (accidental === '') return letter;
  return `${letter}${GLYPH[accidental] ?? accidental}`;
}

/**
 * The scale's name as the card asks it — "G♯ (A♭)" where the user may
 * reach for the other label, plain everywhere else.
 */
export function scaleName(root: string, quality: 'minor' | 'major'): string {
  const alias = quality === 'minor' ? MINOR_NAME_ALIAS[root] : undefined;
  return alias === undefined
    ? noteLabel(root)
    : `${noteLabel(root)} (${noteLabel(alias)})`;
}

function spell(
  root: string,
  formula: ReadonlyArray<readonly [number, number]>,
): string[] | null {
  const p = parse(root);
  if (p === null) return null;
  const out: string[] = [];
  for (const [steps, semitones] of formula) {
    const note = spellInterval(p, steps, semitones);
    // Null means the interval needed more than a double accidental.
    // None of the twenty-four scales here does — the root lists were
    // chosen so — and a hole in a scale beats a wrong note if one ever
    // does.
    if (note === null) return null;
    out.push(ascii(note));
  }
  return out;
}

/** The five notes, ASCII, in scale order. */
export function minorPentatonic(root: string): string[] | null {
  return spell(root, MINOR_PENT);
}
export function majorPentatonic(root: string): string[] | null {
  return spell(root, MAJOR_PENT);
}

/** The five notes as the card prints them — glyphs, comma-separated. */
export function noteList(notes: ReadonlyArray<string>): string {
  return notes.map(noteLabel).join(', ');
}

/**
 * The relative minor root for a major root — the 6th degree.
 *
 * Spelled through the same interval machinery rather than looked up, so
 * the pair cannot disagree with the scales on either side of it. Then
 * mapped onto the MINOR list's spelling: E major's relative is C♯
 * minor, and C♯ is the minor list's own choice, so the two shapes name
 * the same scale the same way.
 */
export function relativeMinorRoot(majorRoot: string): string | null {
  const p = parse(majorRoot);
  if (p === null) return null;
  const rel = spellInterval(p, 5, 9);
  return rel === null ? null : ascii(rel);
}

/**
 * THE THREE DECOY FAMILIES, derived per key rather than hand-typed.
 *
 * Read off the three that were hand-chosen for the C card, which were
 * not arbitrary — each is a different plausible way to be wrong:
 *
 *   NEAR-SCALE      the first five of the parent scale, so it contains
 *                   the degree the pentatonic DROPS. For minor that is
 *                   the 2 (C D E♭ F G); for major it is the 4.
 *                   Tests whether you know what was removed.
 *
 *   SWAPPED-DEGREE  one pentatonic tone replaced by its neighbour — the
 *                   minor's 5 becomes ♭6 (C E♭ F A♭ B♭), the major's 6
 *                   becomes 7. Tests whether you know which five, not
 *                   just how many.
 *
 *   NO-THIRD        the third removed and the 2 put back (C D F G B♭),
 *                   which is the sound of a suspended pentatonic and
 *                   the most seductive wrong answer, because it is a
 *                   real scale.
 *
 * Every family is a formula, so twelve keys cost nothing beyond the
 * twelve roots — and a decoy can never accidentally BE the answer,
 * which a hand-typed set can.
 */
const MINOR_DECOY_FAMILIES: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [[0, 0], [1, 2], [2, 3], [3, 5], [4, 7]],    // near-scale: 1 2 ♭3 4 5
  [[0, 0], [2, 3], [3, 5], [5, 8], [6, 10]],   // swapped: 5 → ♭6
  [[0, 0], [1, 2], [3, 5], [4, 7], [6, 10]],   // no-third: 1 2 4 5 ♭7
];
const MAJOR_DECOY_FAMILIES: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [[0, 0], [1, 2], [2, 4], [3, 5], [4, 7]],    // near-scale: 1 2 3 4 5
  [[0, 0], [1, 2], [2, 4], [4, 7], [6, 11]],   // swapped: 6 → 7
  [[0, 0], [1, 2], [3, 5], [4, 7], [5, 9]],    // no-third: 1 2 4 5 6
];

export function pentatonicDecoys(
  root: string,
  quality: 'minor' | 'major',
): string[] {
  const families = quality === 'minor' ? MINOR_DECOY_FAMILIES : MAJOR_DECOY_FAMILIES;
  const correct = quality === 'minor' ? minorPentatonic(root) : majorPentatonic(root);
  const correctText = correct === null ? '' : noteList(correct);
  const out: string[] = [];
  for (const family of families) {
    const notes = spell(root, family);
    if (notes === null) continue;
    const text = noteList(notes);
    // A decoy that IS the answer is the one failure a derived set can
    // still produce, if two families ever collide on a root.
    if (text === correctText || out.includes(text)) continue;
    out.push(text);
  }
  return out;
}

/**
 * Card ids, and the two that cannot move.
 *
 * ---------------------------------------------------------------
 * `pent-8` AND `pent-10` ARE DRILLED HISTORY, NOT NAMES.
 *
 * `flashcardStates.cardId` carries their SM-2 ease factor, interval and
 * streak; every `attempts.itemId` and the `spacingState` row at
 * `itemRef` are keyed on the same string. Renumbering them would not
 * rename those rows, it would address DIFFERENT ones, and the history
 * would detach with nothing on screen to say so.
 *
 * So the generator fits the existing ids rather than the ids fitting
 * the generator: C keeps `pent-8` for the minor shape and `pent-10`
 * for the relative-pairs shape, and every new card takes a
 * root-suffixed id that cannot collide with the old `pent-N` sequence.
 *
 * Root-suffixed rather than positional, deliberately — `pent-min-Eb`
 * survives someone reordering the root list, which `pent-min-4` would
 * not. That is the hazard `generatedCardIds.test.ts` exists to catch,
 * and this is the shape that does not have it.
 * ---------------------------------------------------------------
 */
const LEGACY_IDS: Readonly<Record<string, string>> = {
  'minor:C': 'pent-8',
  'relative:C': 'pent-10',
};

export function pentatonicCardId(
  shape: 'minor' | 'major' | 'relative',
  root: string,
): string {
  return LEGACY_IDS[`${shape}:${root}`] ?? `pent-${shape}-${root}`;
}
