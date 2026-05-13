/**
 * Progressive-difficulty tier mapping for ear-training chord
 * recognition. Five tiers, walked top-down: a user must clear the
 * unlock criteria on every item in tier N before tier N+1 becomes
 * available for practice (see tierUnlock.ts).
 *
 * Item-ref convention matches `attemptItemId(chordId, inversion)` in
 * inversionUtils — `${chordId}:${inversion}`. Tier 1, 2, 4, 5 are
 * root-position items, so their canonical keys here are the bare
 * chordId; tier 3 carries explicit `chordId:inversion` strings for
 * the inversion-only items. `getTierForItem` normalises a stored
 * itemRef like `"maj:0"` (root position, attempt form) onto `"maj"`
 * (the canonical key) before lookup.
 *
 * The lists below are deliberately curated, not exhaustive of every
 * possible chordId × inversion combination — inversions of dim7 /
 * m7b5 / minMaj7 / sus2 / sus4 are intentionally excluded from the
 * progression. Items outside the tier system are not "untiered with
 * tier 1 default"; they're simply not tracked, which is what
 * `getTierForItem` enforces by throwing.
 */

export type ChordRecognitionTier = 1 | 2 | 3 | 4 | 5;

export const MAX_TIER: ChordRecognitionTier = 5;

const TIER_1_ITEMS = [
  'maj', 'min', 'dim', 'aug', 'sus2', 'sus4',
] as const;

const TIER_2_ITEMS = [
  'maj7', 'min7', 'dom7', 'dim7', 'm7b5', 'minMaj7',
] as const;

const TIER_3_ITEMS = [
  'maj:1', 'maj:2',
  'min:1', 'min:2',
  'dim:1', 'dim:2',
  'aug:1', 'aug:2',
  'maj7:1', 'maj7:2', 'maj7:3',
  'min7:1', 'min7:2', 'min7:3',
  'dom7:1', 'dom7:2', 'dom7:3',
] as const;

const TIER_4_ITEMS = [
  'maj9', 'maj13', 'maj9_13', 'maj6', 'maj6_9', 'add9', 'add2',
  'min9', 'min11', 'min9_11', 'min6', 'min6_9',
] as const;

const TIER_5_ITEMS = [
  'dom7sus4', 'dom7b9', 'dom7#9', 'dom7#9#5', 'dom9_13', 'dom13',
] as const;

/** Items belonging to each tier, keyed by canonical form. Tier 1, 2,
 *  4, 5 contain bare chordIds (root position); tier 3 contains
 *  explicit inversion item-refs. */
export const CHORD_RECOGNITION_TIERS: Readonly<Record<ChordRecognitionTier, readonly string[]>> = {
  1: TIER_1_ITEMS,
  2: TIER_2_ITEMS,
  3: TIER_3_ITEMS,
  4: TIER_4_ITEMS,
  5: TIER_5_ITEMS,
};

// Inverse lookup table — built once at module load.
const TIER_BY_ITEM: ReadonlyMap<string, ChordRecognitionTier> = (() => {
  const m = new Map<string, ChordRecognitionTier>();
  (Object.entries(CHORD_RECOGNITION_TIERS) as Array<[string, readonly string[]]>)
    .forEach(([tierStr, items]) => {
      const tier = Number(tierStr) as ChordRecognitionTier;
      for (const item of items) m.set(item, tier);
    });
  return m;
})();

/** Strip a trailing `:0` so "maj:0" (attempt-recording form for the
 *  root-position major triad) resolves onto "maj" (tier-table form).
 *  Non-zero inversions and bare chordIds pass through unchanged. */
function toCanonicalTierKey(itemRef: string): string {
  return itemRef.endsWith(':0') ? itemRef.slice(0, -2) : itemRef;
}

/**
 * Return the tier number (1–5) for a chord-recognition item-ref.
 * Accepts both the bare-chord form (`"maj"`) and the attempt-stored
 * form (`"maj:0"`, `"min7:2"`, etc.).
 *
 * Throws on items outside the tier system (e.g. `"dim7:1"`,
 * `"sus2:1"`) — callers that may receive untracked items should
 * gate on `isTrackedItem` first.
 */
export function getTierForItem(itemRef: string): ChordRecognitionTier {
  const tier = TIER_BY_ITEM.get(toCanonicalTierKey(itemRef));
  if (tier === undefined) {
    throw new Error(`chord-recognition: item-ref "${itemRef}" is not part of the tier system`);
  }
  return tier;
}

/** Soft companion to `getTierForItem` — true iff the item is tracked
 *  by the tier system. Cheap to call; useful for filtering candidate
 *  pools before classification. */
export function isTrackedItem(itemRef: string): boolean {
  return TIER_BY_ITEM.has(toCanonicalTierKey(itemRef));
}

/** Convert a tier-table form into the attempt-storage form. Tier 1
 *  / 2 / 4 / 5 strings carry no inversion suffix; the renderer
 *  records attempts as `${chordId}:0`, so we append it here for
 *  cross-table comparison. Tier 3 strings already carry an
 *  inversion suffix and pass through. */
export function toAttemptForm(itemRef: string): string {
  return itemRef.includes(':') ? itemRef : `${itemRef}:0`;
}

/** All canonical tier-table item-refs for a tier. Returned in the
 *  declaration order from the static lists above so callers can
 *  rely on deterministic iteration (used by the staged-introduction
 *  logic). */
export function itemsForTier(tier: ChordRecognitionTier): readonly string[] {
  return CHORD_RECOGNITION_TIERS[tier];
}
