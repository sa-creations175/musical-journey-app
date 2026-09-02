/**
 * What a facet value is CALLED, as opposed to what it is.
 *
 * =====================================================================
 * THE STORED VALUE IS IDENTITY AND NOTHING HERE MAY CHANGE IT.
 *
 * A facet value is what `?f.degree=b6` carries, what
 * `cardMatchesFacets` compares against, and what a saved link
 * resolves. `lib/spelling.ts` states the rule this follows: ASCII 'b'
 * and '#' are the identity, the real glyphs are the display, and the
 * swap happens on the way to the eye. The filter row simply never went
 * through it and printed `Ab`, `F#` and `b6` as stored.
 *
 * So this is a LABEL FUNCTION. It is called at render and its result
 * is never compared, stored or put in a URL. The test asserts both
 * halves on the same value, so a later "fix" that re-spells storage to
 * make the screen right fails rather than quietly breaking every link.
 *
 * =====================================================================
 * TWO EXISTING RENDERERS, AND WHICH ONE GOES WHERE.
 *
 * `withAccidentalGlyphs` (reading/pitch) takes a NOTE NAME: it holds
 * the first character back as the letter and swaps accidentals only,
 * which is what keeps `Bb` from becoming `♭♭`.
 *
 * `degreeLabel` (degreeNoteCards) takes a DEGREE: no letter to
 * protect, so the leading accidental is the one that gets swapped —
 * `b6` → ♭6, `#4` → ♯4.
 *
 * They are not interchangeable in either direction and both already
 * exist, so neither is rewritten here. This file only says which facet
 * is which kind of word.
 *
 * =====================================================================
 * NO SPELLING PREFERENCE IS APPLIED, AND THAT IS NOT AN OVERSIGHT.
 *
 * `spellKey` re-spells enharmonically — `spellKey('F#', 'flat')` is
 * 'G♭' — and the `note` facet holds F♯ AND G♭ as two separate values,
 * because they select different cards. Running the preference over
 * them would print two buttons reading G♭, one filtering each, which
 * is a worse screen than the one being fixed. The values here are
 * identities the reader is choosing BETWEEN, so they keep their own
 * spelling and only gain the glyph. Same call the enharmonic category
 * itself makes.
 * =====================================================================
 */
import { withAccidentalGlyphs } from '../reading/pitch';
import { degreeLabel } from './degreeNoteCards';
import type { FacetName } from './facets';

type Label = (value: string) => string;

/**
 * A value that is SEVERAL degrees under one separator — `6-b7` on a
 * slash chord, `#4/b5/#11` in an enharmonic set.
 *
 * Each part is a degree and goes through the degree renderer; the
 * separator is left exactly as stored, so the shape of the value on
 * screen is the shape of the value in the URL.
 */
function degreesJoinedBy(separator: string): Label {
  return value => value.split(separator).map(degreeLabel).join(separator);
}

/**
 * Which facets carry a musical spelling, and which kind.
 *
 * ABSENT MEANS PRINTED AS STORED, deliberately. `cadence`,
 * `pentatonic`, `keyRelation`, `enharmonicKind`, `progression`,
 * `movement`, `semitones` and `fromDegree` hold no accidental, so
 * there is nothing here to fix — what they need is wording, which is
 * Silas's to write and is listed in the report.
 */
const FACET_LABEL: Readonly<Partial<Record<FacetName, Label>>> = {
  key: withAccidentalGlyphs,
  note: withAccidentalGlyphs,
  degree: degreeLabel,
  slashDegrees: degreesJoinedBy('-'),
  enharmonicGroup: degreesJoinedBy('/'),
};

/** A facet value, written for the eye. Never for a comparison. */
export function facetValueLabel(name: FacetName, value: string): string {
  const label = FACET_LABEL[name];
  return label === undefined ? value : label(value);
}
