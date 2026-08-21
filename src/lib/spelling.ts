/**
 * Enharmonic spelling — the one place the app decides what a pitch is
 * CALLED, as opposed to which pitch it is.
 *
 * =====================================================================
 * THE RULE
 *
 *   `songKeys.keyName` is an IDENTITY and never changes.
 *   Spelling is applied at RENDER.
 *
 * Everything else in this module follows from that sentence, so it is
 * worth stating why it holds.
 *
 * A key name in storage is not a label that happens to be readable. It
 * is a lookup value: `songKeys` is indexed `[songId+keyName]`,
 * `songCrossKeyProgress` ids are `${songId}:${sectionId}:${keyName}`,
 * `drillSkills` is indexed `[kind+keyName+quality]`, and every
 * `spacingState` row for chord shapes, scales and voice leading carries
 * the key inside its itemRef primary key. Re-spelling a stored key name
 * does not rename a row, it addresses a DIFFERENT row — so a song
 * "switched to flats" would silently lose its matrix, its streaks and
 * its spacing history, with nothing on screen to say so.
 *
 * That is why the toggle cannot be implemented by rewriting storage,
 * however natural that reads. The identity stays put and the name is
 * computed on the way to the screen. If you are ever tempted to "fix"
 * a spelling inconsistency by migrating key names, this paragraph is
 * the reason not to.
 *
 * The app's canonical identity vocabulary spells the sixth key F#
 * (`repertoire/matrix/keys.ts`). Under the default spelling that name
 * never reaches a screen — `spellKey('F#', 'flat')` is 'Gb'.
 * =====================================================================
 *
 * SCOPE — the five black-key pairs, and nothing else.
 *
 *   C#/Db   D#/Eb   F#/Gb   G#/Ab   A#/Bb
 *
 * The four theoretical spellings (Cb, Fb, B#, E#) are ACCEPTED AS INPUT
 * and NEVER EMITTED. A pasted chart or an imported song can carry them
 * and should not fail to resolve; but a binary flat/sharp toggle cannot
 * reach them anyway (the flat spelling of B is B, not Cb), and the
 * Reading module already made the same call for key signatures — see
 * `reading/catalog.ts`, which drops the 7-sharp and 7-flat signatures
 * because they "name music that is universally written as D-flat and B,
 * so drilling them trains a spelling nobody uses".
 *
 * =====================================================================
 * READING IS EXEMPT, DELIBERATELY AND PERMANENTLY.
 *
 * `src/modules/reading/pitch.ts` does not and must not use this module.
 * Quoting its header so the rule and its exemption sit together, and so
 * nobody "unifies pitch representation" later without meeting the
 * argument first:
 *
 *   > WHY NOT REUSE chordFunction.ts / voicingColors.ts. Those are
 *   > PITCH-CLASS tools — twelve chromatic slots, `NOTE_NAMES_FLAT` and
 *   > `NOTE_NAMES_SHARP` as parallel spellings of the same slot. That is
 *   > the right model for a keyboard, where C-sharp and D-flat are one
 *   > key. It is the wrong model for a STAFF, where they are different
 *   > glyphs on different lines, and where B-double-flat is a real thing
 *   > a diminished seventh needs. Collapsing spelling into pitch class is
 *   > exactly how enharmonic bugs get into notation, so this module keeps
 *   > letter, accidental, and octave as separate facts and never rounds
 *   > them through a semitone number.
 *
 * This module IS a pitch-class tool, by design. That makes it right for
 * keyboards, grids, chord symbols and key labels, and wrong for the
 * staff. Both statements are in the same file on purpose.
 * =====================================================================
 */

export type Spelling = 'flat' | 'sharp';

/**
 * The twelve chromatic slots in each spelling. These two arrays are the
 * app's only note-name tables that anything new should read; the older
 * per-module copies (chordFunction, voicingColors, harmonic-fluency,
 * the chord-progressions tabs) are being folded into these.
 *
 * Index is pitch class, 0 = C.
 */
export const NOTE_NAMES_FLAT: readonly string[] =
  ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
export const NOTE_NAMES_SHARP: readonly string[] =
  ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * Every spelling the app accepts as INPUT, mapped to pitch class.
 *
 * Includes the four theoretical names. They resolve here so a freeform
 * or imported key does not fail to place; they are absent from both
 * output tables above, so they can never come back out. Input-tolerant,
 * output-strict — the asymmetry is the point.
 */
const PITCH_CLASS: Readonly<Record<string, number>> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4,
  F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9,
  'A#': 10, Bb: 10, B: 11,
  // Theoretical — accepted, never emitted. See SCOPE above.
  'B#': 0, Cb: 11, 'E#': 5, Fb: 4,
};

export const DEFAULT_SPELLING: Spelling = 'flat';

/**
 * Pitch class 0–11 for any accepted note or key name, or null when the
 * input is not one this app recognises.
 *
 * Null is REACHABLE rather than defensive padding: `Song.key` is a
 * freeform string and `keyDiagnostics` exists precisely because
 * non-canonical values are in the data. Returning null lets a caller
 * decline to re-spell something it cannot place, instead of guessing.
 */
export function pitchClassOf(name: string): number | null {
  const pc = PITCH_CLASS[name.trim()];
  return pc === undefined ? null : pc;
}

/** The name of a pitch class in the requested spelling. */
export function spellNote(pitchClass: number, spelling: Spelling): string {
  const pc = ((pitchClass % 12) + 12) % 12;
  return (spelling === 'flat' ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP)[pc];
}

/**
 * Display name for a stored key name.
 *
 * PASSES UNKNOWN INPUT THROUGH UNCHANGED rather than dropping it or
 * substituting a placeholder. A song whose key is 'Cm' or 'D minor'
 * still has to render something, and showing the user the string that
 * is actually stored is what makes `keyDiagnostics` legible — replacing
 * it with '?' would hide the very rows that screen exists to surface.
 *
 * The seven natural keys are returned untouched in both spellings, so
 * this is only ever a no-op or a black-key swap.
 */
export function spellKey(keyName: string, spelling: Spelling): string {
  const pc = pitchClassOf(keyName);
  if (pc === null) return keyName;
  return spellNote(pc, spelling);
}

/**
 * Re-spell a whole ordered list of key names, preserving order.
 *
 * Exists so the S&P grids cannot drift apart again: all three column
 * headers (chord shapes, scales, voice leading) go through this one
 * call, and a grid that skipped it would be visibly the odd one out
 * rather than quietly inconsistent — which is exactly how the three
 * disagreed before this module existed.
 */
export function spellKeys(
  keyNames: readonly string[],
  spelling: Spelling,
): string[] {
  return keyNames.map(k => spellKey(k, spelling));
}
