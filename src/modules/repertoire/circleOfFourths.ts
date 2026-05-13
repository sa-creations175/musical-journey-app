/**
 * Circle-of-fourths key sequencing for the "expand keys" progression
 * path. When a song reaches comfortable in its original key and the
 * user picks Expand keys, the algorithm walks them through every
 * other key in fourths order — the standard progression for taking
 * a tune all the way around the wheel.
 *
 * Order (matches the addendum spec):
 *
 *   C → F → Bb → Eb → Ab → Db → Gb → B → E → A → D → G → (back to C)
 *
 * The transition between Db and B picks the natural-letter side
 * (Gb is in the flat run; B/E are in the sharp-side run) — that's
 * how the spec lays it out, and matches how most gospel / R&B / soul
 * pianists actually read the wheel.
 *
 * Enharmonic input is accepted: C# / D# / F# / G# / A# / Cb all
 * normalise to their flat-side counterparts before lookup, so a
 * song with `key: 'F#'` (the canonical form used by MAJOR_KEYS) is
 * treated as a song starting at Gb on this wheel. The output
 * sequence is always in the canonical (spec) notation.
 */

/** The wheel, starting at C. Twelve entries, no enharmonic duplicates.
 *  Exported so other modules (S&P session walk, scale mini-track key
 *  ordering) share the same canonical sequence. */
export const CIRCLE_OF_FOURTHS: ReadonlyArray<string> = [
  'C', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'B', 'E', 'A', 'D', 'G',
];

/** Map every reasonable spelling of a major key to its canonical
 *  CIRCLE_OF_FOURTHS form. Naturals pass through unchanged; sharps
 *  collapse to flats except where the spec keeps a natural-letter
 *  (B for Cb, E for Fb). */
const ENHARMONIC_TO_CANONICAL: Readonly<Record<string, string>> = {
  // Naturals.
  C: 'C', D: 'D', E: 'E', F: 'F', G: 'G', A: 'A', B: 'B',
  // Flats (already canonical).
  Db: 'Db', Eb: 'Eb', Gb: 'Gb', Ab: 'Ab', Bb: 'Bb',
  // Sharps → flats (or natural-letter where the wheel uses one).
  'C#': 'Db',
  'D#': 'Eb',
  'F#': 'Gb',
  'G#': 'Ab',
  'A#': 'Bb',
  // Exotic enharmonics that occasionally show up in lead sheets.
  'Cb': 'B',
  'Fb': 'E',
  'E#': 'F',
  'B#': 'C',
};

/**
 * Walk the circle of fourths starting one step ahead of `originalKey`
 * and return every other key, in order, ending one step short of a
 * full rotation. Output excludes the original key itself.
 *
 * Returns an empty array when `originalKey` doesn't normalise to any
 * known key — defensive for goal-of-month songs with a freeform
 * key string. Callers should treat `[]` as "we don't know how to
 * sequence this song's keys" and surface a UI fallback.
 *
 * @example
 *   generateCircleOfFourthsSequence('C')
 *   // → ['F','Bb','Eb','Ab','Db','Gb','B','E','A','D','G']
 *
 *   generateCircleOfFourthsSequence('F#')   // F# canonicalises to Gb
 *   // → ['B','E','A','D','G','C','F','Bb','Eb','Ab','Db']
 */
export function generateCircleOfFourthsSequence(originalKey: string): string[] {
  const canonical = ENHARMONIC_TO_CANONICAL[originalKey];
  if (!canonical) return [];
  const start = CIRCLE_OF_FOURTHS.indexOf(canonical);
  if (start < 0) return [];
  const out: string[] = [];
  for (let i = 1; i < CIRCLE_OF_FOURTHS.length; i++) {
    out.push(CIRCLE_OF_FOURTHS[(start + i) % CIRCLE_OF_FOURTHS.length]);
  }
  return out;
}
