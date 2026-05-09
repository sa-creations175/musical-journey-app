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
