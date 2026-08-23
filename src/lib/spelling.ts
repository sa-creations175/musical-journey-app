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
 * never reaches a screen — `spellKey('F#', 'flat')` is 'G♭', with a
 * real flat sign. See TWO ALPHABETS below.
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
 * =====================================================================
 * TWO ALPHABETS: ASCII IS THE IDENTITY, SYMBOLS ARE THE DISPLAY.
 *
 * Storage, itemRefs and every lookup use ASCII 'b' and '#' — 'Bb',
 * 'F#'. Nothing here changes that, and nothing here may ever be written
 * to a table. Screens get the real Unicode accidentals, MUSIC FLAT SIGN
 * (U+266D) and MUSIC SHARP SIGN (U+266F).
 *
 * The immediate reason is that `b` is a letter. The grids head their
 * columns with `text-transform: uppercase`, which turned 'Bb' into
 * 'BB' — a flat rendered as a second capital B. Any surface that
 * touches case does the same thing, and there is no way to write a
 * lowercase-only letter that survives it. ♭ and ♯ have no uppercase
 * form, so they come through whatever a surface does to their case.
 *
 * The larger reason is that they are the correct characters. 'b' and
 * '#' are typewriter substitutes for them.
 *
 * Because the swap lives here, every surface that adopts this seam gets
 * it without knowing about it. Do not special-case it per grid.
 *
 * SEE ALSO index.css, which pins these two codepoints to a font that
 * actually contains them — the app's own mono stack starts with SF
 * Mono, which does not, and an unpinned glyph falls back per-character
 * to whatever the browser picks.
 * =====================================================================
 */
export const FLAT_SIGN = '\u266D';
export const SHARP_SIGN = '\u266F';

/**
 * The twelve chromatic slots, for DISPLAY. Index is pitch class, 0 = C.
 *
 * These are the app's only note-name tables that anything new should
 * read; the older per-module copies (chordFunction, voicingColors,
 * harmonic-fluency, the chord-progressions tabs) are being folded in.
 */
export const NOTE_NAMES_FLAT: readonly string[] =
  ['C', `D${FLAT_SIGN}`, 'D', `E${FLAT_SIGN}`, 'E', 'F', `G${FLAT_SIGN}`,
   'G', `A${FLAT_SIGN}`, 'A', `B${FLAT_SIGN}`, 'B'];
export const NOTE_NAMES_SHARP: readonly string[] =
  ['C', `C${SHARP_SIGN}`, 'D', `D${SHARP_SIGN}`, 'E', 'F', `F${SHARP_SIGN}`,
   'G', `G${SHARP_SIGN}`, 'A', `A${SHARP_SIGN}`, 'B'];

/**
 * The same twelve slots in the ASCII forms that STORAGE uses. Exported
 * because the identity vocabulary has to be nameable — Step 2's ref
 * migration and any lookup key building needs these, and reaching for
 * the display tables there is the mistake this pair exists to prevent.
 */
export const NOTE_NAMES_FLAT_ASCII: readonly string[] =
  ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
export const NOTE_NAMES_SHARP_ASCII: readonly string[] =
  ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * Every spelling the app accepts as INPUT, mapped to pitch class.
 *
 * Keyed on the ASCII forms; symbol input is folded onto them first by
 * `toAsciiAccidentals`, so 'G♭' and 'Gb' resolve identically. That
 * matters for idempotence — re-spelling an already-displayed name has
 * to be a no-op, or a value that round-trips through the UI degrades.
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

/**
 * Fold display accidentals back to their ASCII forms.
 *
 * Exported because it is the safe way to take anything that may have
 * passed through a display path and use it as a lookup again. If you
 * find yourself needing it on a value read from the database, something
 * upstream has written a symbol into storage — fix that instead.
 */
export function toAsciiAccidentals(name: string): string {
  return name.replace(/\u266D/g, 'b').replace(/\u266F/g, '#');
}

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
  const pc = PITCH_CLASS[toAsciiAccidentals(name.trim())];
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

/**
 * Resolve an override against a fallback — the rule for "this thing's
 * own spelling, or the one it inherits".
 *
 * Trivial on its face, and it exists so the rule has ONE home. A song
 * carries `spelling?: Spelling` where undefined means "no opinion", and
 * that reading has to be identical in React (`useSongSpelling`) and in
 * any pure path that cannot call a hook. Two `??` expressions in two
 * files is two chances to decide that empty-string, or 'inherit', or
 * null means something different.
 */
export function resolveSpelling(
  override: Spelling | null | undefined,
  fallback: Spelling,
): Spelling {
  return override ?? fallback;
}
