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
import { INTERVAL_QUALITIES } from './scaleDegreeQuality';
import { SLASH_SHAPES } from './catalogExpansions';

type Label = (value: string) => string;

/**
 * The row, in order, with the word above each line (ruling 24).
 *
 * =====================================================================
 * THIS LIST IS ALSO WHAT THE ROW OFFERS, AND THAT IS ON PURPOSE.
 *
 * `semitones` and `enharmonicGroup` are not here (ruling 25). Silas
 * does not think in half steps — the Number chips already isolate a
 * fifth or a tritone — and Distance covers what the enharmonic sets
 * were for. Both are still COMPUTED: a link that names one still
 * narrows, and the tritone gather still works. Nothing shows them.
 *
 * So there is one list rather than a list and a separate blocklist,
 * because a facet added to the model and forgotten here is a facet
 * nobody was asked to name.
 * =====================================================================
 */
export const FACET_ROW: ReadonlyArray<{ name: FacetName; label: string }> = [
  { name: 'key', label: 'Key' },
  { name: 'note', label: 'Note' },
  { name: 'degree', label: 'Number' },
  { name: 'fromDegree', label: 'Starting Number' },
  { name: 'movement', label: 'Distance' },
  { name: 'progression', label: 'Progression' },
  { name: 'pentatonic', label: 'Pentatonic' },
  { name: 'slashDegrees', label: 'Slash Chord' },
  { name: 'keyRelation', label: 'Maj/Min Key Relation' },
  { name: 'enharmonicKind', label: 'Enharmonic' },
];

/** The facets the row is allowed to offer, in its order. */
export const OFFERED_FACETS: ReadonlyArray<FacetName> =
  FACET_ROW.map(f => f.name);

const ROW_LABEL = new Map(FACET_ROW.map(f => [f.name, f.label] as const));

/** What a facet's line is called. */
export function facetRowLabel(name: FacetName): string {
  return ROW_LABEL.get(name) ?? name;
}

/**
 * A distance in interval words (ruling 27) — "up a minor third",
 * "down a fifth".
 *
 * =====================================================================
 * NOT `up:M3`, AND NOT A NUMBER.
 *
 * The id is a coordinate and reads like one. The chip is a phrase a
 * player would say out loud, which is the same phrase the question
 * itself uses.
 *
 * A PERFECT INTERVAL DROPS ITS QUALITY, because nobody says "down a
 * perfect fifth" at a piano; every other quality keeps it, because
 * "up a third" would be two different distances. That asymmetry is
 * ruling 27's two examples read literally, and it is the only decision
 * in this function.
 *
 * DERIVED FROM `INTERVAL_QUALITIES`, never a second table. The twelve
 * qualities and their ordinals live there and the words are built off
 * them, so a quality added there gets a chip without being written
 * down twice.
 * =====================================================================
 */
const ORDINAL_WORD: Readonly<Record<number, string>> = {
  1: 'unison', 2: 'second', 3: 'third', 4: 'fourth',
  5: 'fifth', 6: 'sixth', 7: 'seventh', 8: 'octave',
};

const QUALITY_WORD: Readonly<Record<string, string>> = {
  perfect: '', major: 'major ', minor: 'minor ',
  augmented: 'augmented ', diminished: 'diminished ',
};

const MOVEMENT_WORDS = new Map<string, string>();
for (const quality of INTERVAL_QUALITIES) {
  const words = `${QUALITY_WORD[quality.qualityId] ?? ''}${ORDINAL_WORD[quality.intervalId] ?? quality.intervalId}`;
  const article = /^[aeiou]/.test(words) ? 'an' : 'a';
  for (const direction of ['up', 'down'] as const) {
    MOVEMENT_WORDS.set(`${direction}:${quality.id}`, `${direction} ${article} ${words}`);
  }
}

/** Exported so the copy file's test can read the whole set. */
export const MOVEMENT_LABELS: ReadonlyMap<string, string> = MOVEMENT_WORDS;

/**
 * A little progression, said the way the module says it (ruling 26).
 *
 * The stored values are the notations the generators already wrote —
 * `ii-V-I` and `V/V` — and they stay stored, so every link that named
 * one still resolves. Only the chip changes.
 */
const PROGRESSION_WORDS: Readonly<Record<string, string>> = {
  'ii-V-I': '2 5 1',
  'V/V': '5 of 5',
  'V/vi': '5 of 6',
  '1-5-6-4': '1 5 6 4',
  // ONE ENTRY PER GENERATED PROGRESSION, AND NONE OF IT IS NEW COPY.
  // Ruling 26's own rule — dashes become spaces.
  //
  // `6-4-1-5`, `gospel walk-up`, `rhythm changes` and `neo-soul` WERE
  // HERE and went with their cards: a chip for a progression the deck
  // no longer generates is a filter that finds nothing.
  '1-6-4-5': '1 6 4 5',
  '1-6-2-5': '1 6 2 5',
  '1-4-5': '1 4 5',
  // NUMBERS LEAD, NAMES FOLLOW — the same rule the card's own question
  // takes. The stored value stays `backdoor`, so every link that named
  // it still resolves; only the chip changes.
  backdoor: '1 4 ♭7 1 (backdoor)',
  'gospel walk-up': 'gospel walk-up',
  'rhythm changes': 'rhythm changes',
  'neo-soul': 'neo-soul',
};

/** A slash chord, written the way its own cards write it — `1/3`,
 *  not the hyphen the id is built from. Read off the deck's own shape
 *  list rather than re-spelled here. */
const SLASH_LABEL = new Map(SLASH_SHAPES.map(s => [s.id, s.label] as const));

/**
 * Which facets carry a musical spelling, and which kind.
 *
 * ABSENT MEANS PRINTED AS STORED, deliberately. `pentatonic`,
 * `keyRelation` and `enharmonicKind` hold no accidental and no ruled
 * wording, so they print their stored value and are listed under
 * "Unruled" in `docs/HARMONIC_FLUENCY_COPY.md`.
 */
const FACET_LABEL: Readonly<Partial<Record<FacetName, Label>>> = {
  key: withAccidentalGlyphs,
  note: withAccidentalGlyphs,
  degree: degreeLabel,
  slashDegrees: value => degreeLabelsIn(SLASH_LABEL.get(value) ?? value),
  // NO `enharmonicGroup` HERE ANY MORE. Ruling 25 took it off the row,
  // and a label nothing renders is a label nobody maintains.
  movement: value => MOVEMENT_WORDS.get(value) ?? value,
  progression: value => PROGRESSION_WORDS[value] ?? value,
};

/** `1/3` with its accidentals as glyphs — `6/b7` reads 6/♭7. */
function degreeLabelsIn(label: string): string {
  return label.split('/').map(degreeLabel).join('/');
}

/** A facet value, written for the eye. Never for a comparison. */
export function facetValueLabel(name: FacetName, value: string): string {
  const label = FACET_LABEL[name];
  return label === undefined ? value : label(value);
}
