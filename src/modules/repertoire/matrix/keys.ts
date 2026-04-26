/**
 * The 12 major keys arranged in circle of fourths, starting from C.
 * Each step ascends a perfect 4th: C → F → Bb → Eb → Ab → Db →
 * F# (= Gb) → B → E → A → D → G → (back to C).
 *
 * The matrix view never renders this list as-is — it always rotates
 * to put the song's original key first via `keysOrderedFromOriginal`.
 * The cycle order matters because rotating preserves the
 * functional-harmony adjacency: keys close to the user's original
 * key (modulating by a fourth or fifth) sit close to it on the
 * matrix, while keys far around the cycle (functionally distant)
 * sit far from it. That tracks how players actually approach
 * cross-key work — closely related keys first, distant keys later.
 *
 * Notation choice mirrors goals/songTarget.ts::MAJOR_KEYS — sharps
 * for F#, flats for the others. The user-facing description used
 * Gb in the spec discussion; F# is the same pitch class and matches
 * the rest of the app's notation.
 */
export const CIRCLE_OF_FOURTHS_KEYS: readonly string[] = [
  'C', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'F#', 'B', 'E', 'A', 'D', 'G',
] as const;

/**
 * Build the 12-key display ordering for the matrix view, with the
 * original key pinned first and the remaining 11 keys following the
 * circle of fourths from there.
 *
 * Examples (matching the spec discussion):
 *   originalKey === 'C' → C, F, Bb, Eb, Ab, Db, F#, B, E, A, D, G
 *   originalKey === 'F' → F, Bb, Eb, Ab, Db, F#, B, E, A, D, G, C
 *
 * Edge cases:
 *   - Null original key (no songKeys row exists, or no
 *     isOriginalKey row) — falls back to the canonical cycle
 *     starting at C. The matrix renders identically across songs
 *     in this state, which is fine because the original-key tag
 *     would have nothing to mark anyway.
 *   - originalKey not in the cycle (e.g., the song record holds
 *     a non-canonical key like 'Cm' or 'D minor') — defensive
 *     fallback: prepend the unknown key, then the canonical cycle.
 *     The matrix still renders 13 rows in this case rather than
 *     dropping the unknown key; the matrix UI's key picker (a
 *     later step) will let the user normalize.
 */
export function keysOrderedFromOriginal(originalKey: string | null): string[] {
  if (!originalKey) {
    return [...CIRCLE_OF_FOURTHS_KEYS];
  }
  const idx = CIRCLE_OF_FOURTHS_KEYS.indexOf(originalKey);
  if (idx === -1) {
    return [originalKey, ...CIRCLE_OF_FOURTHS_KEYS];
  }
  return [
    CIRCLE_OF_FOURTHS_KEYS[idx],
    ...CIRCLE_OF_FOURTHS_KEYS.slice(idx + 1),
    ...CIRCLE_OF_FOURTHS_KEYS.slice(0, idx),
  ];
}
