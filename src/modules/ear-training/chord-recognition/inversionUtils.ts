/**
 * Phase 3 polish — inversion training utilities for chord recognition.
 *
 * Pure helpers shared by the quiz, the fluency tracker, and the one-shot
 * migration that rewrites legacy itemIds. Keeping them separate keeps
 * the React component files free of pitch math + parsing logic.
 */

export type Inversion = 0 | 1 | 2 | 3;

export const INVERSION_LABEL: Record<Inversion, string> = {
  0: 'Root',
  1: '1st inversion',
  2: '2nd inversion',
  3: '3rd inversion',
};

/**
 * Chord ids excluded from inversion training. Two reasons surface
 * the same exclusion:
 *
 *   · Sus chords (sus2, sus4) — voicing-shape-defined rather than
 *     triad-stacked. "1st inversion" of Sus2 / Sus4 isn't a useful
 *     ear target; the user would be guessing between voicings that
 *     don't share the real Sus emotional fingerprint.
 *
 *   · Augmented triad (aug) — symmetric stack of major thirds
 *     ([0,4,8]). Each inversion is enharmonically the same chord
 *     at a different root — they sound identical to the ear, so
 *     there's nothing to identify.
 *
 *   · Diminished 7th (dim7) — the same argument one note further.
 *     [0,3,6,9] is a symmetric stack of minor thirds, so all four
 *     inversions are the same four pitch classes; the seed's own
 *     description says as much ("all 4 inversions are harmonically
 *     the same"). It joins the list now that step 2 fires for
 *     seventh chords, where before it was excluded by accident
 *     rather than on purpose — nothing above the foundational tier
 *     was ever asked about its inversions.
 *
 * Excluded chords always play in root position regardless of the
 * inversion settings, and never trigger step 2.
 */
/**
 * Chord tiers whose chords get the identify-the-inversion step.
 *
 * Lives here rather than in the quiz because the tier table has to
 * agree with it: an item listed in `TIER_3_ITEMS` whose chord is not
 * in a trained tier can never be attempted, and a tier that cannot be
 * completed stops the whole ladder. `chordRecognitionTiers.test.ts`
 * asserts the two against each other.
 *
 * It stops at the sevenths deliberately. Extensions and dominant
 * variations run to six and seven notes, where a rotation stops being
 * something an ear picks out as an inversion.
 */
export const INVERSION_TRAINED_TIERS: ReadonlySet<string> =
  new Set(['foundational', 'seventh']);

/**
 * Positions enabled until the player says otherwise.
 *
 * Lives beside the other inversion rules, not in the view, because it
 * is load-bearing for the tier ladder rather than cosmetic: the fourth
 * position is the only route to `maj7:3`, `min7:3` and `dom7:3`, so a
 * default of [0,1,2] leaves three tier-3 items unattainable for anyone
 * who never opens the drawer - which is a tier that cannot clear and a
 * ladder that stops, exactly the failure of the version before it.
 * `chordRecognitionTiers.test.ts` walks the tier table against THIS
 * value rather than against a list written out in the test.
 *
 * Triads need no special case: `inversionsForIntervalCount(3)` is
 * [0,1,2], so the fourth position simply does not apply to them.
 */
export const DEFAULT_INVERSION_POSITIONS: Inversion[] = [0, 1, 2, 3];

export const INVERSION_EXCLUDED_CHORD_IDS: ReadonlySet<string> = new Set([
  'sus2',
  'sus4',
  'aug',
  'dim7',
]);

/**
 * Rotate an interval array for inversion. Maintains ascending order
 * by lifting each shifted-out interval an octave above the previous
 * top.
 *
 *   [0,4,7]    inv 1 → [4,7,12]      (3rd in bass)
 *   [0,4,7]    inv 2 → [7,12,16]     (5th in bass)
 *   [0,4,7,10] inv 1 → [4,7,10,12]
 *   [0,4,7,10] inv 3 → [10,12,16,19]
 *
 * Returns a copy. Inversions out of bounds (≤ 0 or ≥ length) clamp
 * to root position.
 */
export function rotateForInversion(
  intervals: ReadonlyArray<number>,
  inversion: number,
): number[] {
  if (intervals.length === 0) return [];
  if (inversion <= 0 || inversion >= intervals.length) return [...intervals];
  const out = [...intervals];
  for (let i = 0; i < inversion; i++) {
    const first = out.shift()!;
    out.push(first + 12);
  }
  return out;
}

/**
 * Build the per-inversion attempt itemId. Going forward every
 * chord-recognition attempt logs against this shape so per-inversion
 * accuracy can be computed by simple filter + group.
 */
export function attemptItemId(chordId: string, inversion: Inversion): string {
  return `${chordId}:${inversion}`;
}

/** Parse an attempt itemId back into chord id + inversion. Legacy
 *  itemIds without a `:N` suffix parse as inversion 0 (root) since
 *  the audio engine only ever played root before this build. */
export function parseAttemptItemId(itemId: string): {
  chordId: string;
  inversion: Inversion;
} {
  const colon = itemId.indexOf(':');
  if (colon < 0) return { chordId: itemId, inversion: 0 };
  const chordId = itemId.slice(0, colon);
  const raw = Number(itemId.slice(colon + 1));
  const inversion = (Number.isFinite(raw) && raw >= 0 && raw <= 3 ? raw : 0) as Inversion;
  return { chordId, inversion };
}

/** Read-side normalization. Adds `:0` to legacy itemIds so the rest
 *  of the pipeline can rely on the canonical shape even if the
 *  one-shot migration hasn't run yet on this device. */
export function normalizeAttemptItemId(itemId: string): string {
  return itemId.includes(':') ? itemId : `${itemId}:0`;
}

/** Inversions valid for a chord with N intervals. Triads → [0,1,2];
 *  4-note chords → [0,1,2,3]. */
export function inversionsForIntervalCount(count: number): Inversion[] {
  if (count <= 1) return [0];
  if (count === 2) return [0, 1];
  if (count === 3) return [0, 1, 2];
  return [0, 1, 2, 3];
}

/**
 * Rotate the displayed scale-degree formula to match the played
 * inversion. Mirrors rotateForInversion's semantics for intervals,
 * but on the comma-separated string format ChordData.formula uses
 * (e.g. "1, 3, 5" → "3, 5, 1" for 1st inversion).
 *
 * Out-of-range inversions clamp to the original (root) formula.
 * The function preserves whatever spacing the source string used
 * by trimming each part and rejoining with ", ".
 */
export function rotateFormula(formula: string, inversion: number): string {
  if (inversion <= 0) return formula;
  const parts = formula.split(',').map(s => s.trim()).filter(s => s.length > 0);
  if (inversion >= parts.length) return formula;
  const out = [...parts];
  for (let i = 0; i < inversion; i++) {
    const first = out.shift()!;
    out.push(first);
  }
  return out.join(', ');
}
