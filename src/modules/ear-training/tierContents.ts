/**
 * What is in each Ear Training Tier, in words, for a person.
 *
 * =====================================================================
 * THE SETTINGS PAGE AND THE UNLOCK MESSAGE SAY THE SAME THING.
 *
 * "Tier 2 unlocked: maj7, m7, 7, dim7, m7♭5, mMaj7 are in play" and the
 * Tier 2 row of the Settings page's table are one sentence about one
 * fact. Written twice they would drift the first time a chord moved,
 * and the reader would have two answers to "what did I just unlock"
 * with no way to tell which was current.
 *
 * SO IT IS COPY, NOT DERIVED, and it lives here. "extended chords:
 * 9ths, 11ths, 13ths, 6ths" is a description of a Tier for a person;
 * the catalog holds `dom9`, `maj9` and eleven more, and generating the
 * list would print item ids at a reader. Every NUMBER beside it — the
 * Tier counts, the totals — IS derived, because a count that disagreed
 * with the catalog would be the app lying about something checkable.
 * =====================================================================
 */

/** Chord Recognition, Tiers 1 to 5. */
export const CHORD_RECOGNITION_ROWS: ReadonlyArray<string> = [
  'major, minor, diminished, augmented, sus2, sus4',
  'maj7, m7, 7, dim7, m7♭5, mMaj7',
  'inversions of the triads and sevenths',
  'extended chords: 9ths, 11ths, 13ths, 6ths',
  'altered dominants: 7♭9, 7♯9, 7♯9♯5, 9(13), 13, 7sus4',
];

/** Scales & Modes, Tiers 1 and 2. */
export const SCALE_MODE_ROWS: ReadonlyArray<string> = [
  'Ionian (major), Aeolian (natural minor), harmonic minor, melodic minor',
  'Dorian, Mixolydian, Lydian, Phrygian, Locrian',
];

/**
 * The sentence a reader sees when a Tier opens.
 *
 * ONE TEMPLATE, BOTH LADDERS. A Tier opening is the same event on
 * either of them, and two wordings for it would read as two different
 * kinds of thing having happened.
 */
export function tierUnlockedMessage(
  tier: number,
  rows: ReadonlyArray<string>,
): string {
  return `Tier ${tier} unlocked: ${rows[tier - 1] ?? ''} are in play.`;
}
