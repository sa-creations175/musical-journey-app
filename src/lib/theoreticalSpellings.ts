/**
 * The four spellings that name a WHITE key by an unusual letter, and
 * the name a player would actually say.
 *
 * =====================================================================
 *   F♭ is E     C♭ is B     E♯ is F     B♯ is C
 *
 * THAT IS THE COMPLETE SET at single accidentals, and it is complete
 * for a reason rather than by inspection: a single sharp or flat moves
 * a letter by one semitone, and the only places a semitone step lands
 * on a white key are the two natural half-steps — E–F and B–C. Every
 * other single accidental lands on a black key, where the enharmonic
 * partner (G♯/A♭) is an equally ordinary name and needs no gloss.
 * =====================================================================
 *
 * WHY THE GLOSS IS SAFE ON AN ANSWER OPTION, which it did not used to
 * be. It used to appear only in question text and explanations, on the
 * grounds that a bracket on the answer and on nothing else lets a
 * reader pick the bracketed option without reading the question.
 *
 * The gloss is now a function of the SPELLING alone. Every option
 * naming one of these four carries it, right or wrong, and no other
 * option ever does — so the bracket says "this letter is not the one
 * you would say", never "this one is correct". A decoy that names C♭
 * gets it too, and that is the point.
 *
 * The gloss is DISPLAY ONLY. Option strings are identity — a flashcard
 * compares the tapped option against `correctAnswer` and writes it to
 * the attempt — so nothing here may reach a stored value.
 *
 * NOT THE ALIAS RULE AND NOT THE UNPLAYABLE RULE. `pentatonics.ts`
 * writes "G♯ (A♭) minor pentatonic" for a scale that is genuinely
 * double-named, and `scaleDegreeQuality.ts` writes "B𝄫 (**A**)" for a
 * note that cannot be played as written at all. Same visual shape,
 * three different things being said. Do not collapse them.
 */

/** Theoretical spelling in ASCII → the white key it names. */
export const PRACTICAL_NAME: Readonly<Record<string, string>> = {
  Cb: 'B', Fb: 'E', 'B#': 'C', 'E#': 'F',
};

/** The white key a theoretical spelling names, or undefined for every
 *  other note. ASCII in — 'Cb', not 'C♭'. */
export function practicalNameOf(ascii: string): string | undefined {
  return PRACTICAL_NAME[ascii];
}

/**
 * A note name, glyph or ASCII, matched only where it is a whole note
 * name rather than the start of a longer one.
 *
 * The two guards are what keep this from firing on things that merely
 * begin the same way. The lookbehind stops `Cb` being found inside a
 * word; the lookahead stops `C♭` inside `C♭♭`, `Cb` inside `Cbb`, and
 * `E♯` inside `E♯11`, none of which are the note this glosses. The
 * open bracket is in that lookahead too, which is what makes a second
 * pass over an already-glossed label a no-op rather than `C♭(B)(B)`.
 *
 * `Bb` reaches the lookup and comes back undefined, which is the whole
 * defence against glossing an ordinary flat: membership of the table
 * decides, not the shape of the match.
 */
const NOTE = /(?<![A-Za-z])([A-G])([♯♭#b])(?![A-Za-z0-9♯♭#(])/g;

/**
 * Put the practical name in brackets after every theoretical spelling
 * in a display label, and leave everything else exactly as it was.
 *
 * Works on labels that are a bare note (`C♭`) and on labels that
 * contain one (`B♭m/C♭`), because the rule is about the note, not
 * about the label's shape.
 */
export function glossTheoreticalSpellings(label: string): string {
  return label.replace(NOTE, (whole, letter: string, accidental: string) => {
    const ascii = letter + (accidental === '♯' ? '#'
      : accidental === '♭' ? 'b'
        : accidental);
    const practical = PRACTICAL_NAME[ascii];
    return practical === undefined ? whole : `${whole}(${practical})`;
  });
}
