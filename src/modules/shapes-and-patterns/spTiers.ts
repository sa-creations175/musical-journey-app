/**
 * Phase 1 of the Shapes & Patterns Session Structure design
 * (docs/SHAPES_AND_PATTERNS_SESSION_DESIGN.md — May 2026).
 *
 * Four-tier progression for the Chord Shape Track. Mirrors the ET
 * chord-recognition tier system in shape but advances INDEPENDENTLY
 * — playing a chord and recognising it by ear are different skills.
 * Cross-module dashboards may surface progress side-by-side later;
 * the registries don't cite each other.
 *
 *   Tier 1 — Core Triads:        maj / min / dim / aug / sus2 / sus4
 *   Tier 2 — Essential 7ths:     maj7 / min7 / dom7 / dim7 / m7b5 / mmaj7
 *   Tier 3 — Extended maj / min: maj9 / maj13 / maj6 / maj6_9 /
 *                                add9 / min9 / min11 / min6
 *   Tier 4 — Altered Dominants:  dom7b9 / dom7s9 / dom13
 *
 * Quality IDs match the shapes catalog (CHORD_QUALITIES in
 * catalog.ts) so the tier lookup composes cleanly with
 * spacingState itemRefs (parsed via parseShapesItemRef → quality
 * field). The design doc lists a few additional T3 / T4 qualities
 * ("min6/9", "dom7#9#5", "dom9(13)", "dom7sus4") that aren't in
 * the current catalog — they're omitted here; catalog additions
 * will flow in automatically once their IDs exist.
 *
 * Unlock model: tier N+1 unlocks when at least
 * `SP_TIER_UNLOCK_THRESHOLD` (50%) of the tier-N possible-cell
 * count is at acquisitionStage `comfortable` or `internalized`.
 * Possible cells = catalog inversion-state count × 12 keys per
 * quality, with `supplementary` filtered via `gatesAcquisition`.
 */

import {
  db,
  type AcquisitionStage,
  type SpacingState,
} from '../../lib/db';
import {
  CHORD_QUALITY_BY_ID,
  INVERSION_STATES_FOR_CHORD_SHAPE_KIND,
  gatesAcquisition,
} from './catalog';
import { parseShapesItemRef } from './drillModel';

export type SPTier = 1 | 2 | 3 | 4;

export const SP_MAX_TIER: SPTier = 4;

/** Fraction of a tier's possible cells that must be at comfortable+
 *  for the next tier to unlock. 50% mirrors the design-doc example
 *  ("let the data decide ... if ≥50% of Tier N cells are
 *  comfortable, Tier N+1 unlocks"). Tunable — recalibrate after a
 *  few weeks of real drilling data. */
export const SP_TIER_UNLOCK_THRESHOLD = 0.5;

const KEY_COUNT = 12;

const TIER_1_QUALITIES = [
  'maj', 'min', 'dim', 'aug', 'sus2', 'sus4',
] as const;

const TIER_2_QUALITIES = [
  'maj7', 'min7', 'dom7', 'dim7', 'm7b5', 'mmaj7',
] as const;

const TIER_3_QUALITIES = [
  'maj9', 'maj13', 'maj6', 'maj6_9',
  'add9', 'min9', 'min11', 'min6',
] as const;

const TIER_4_QUALITIES = [
  'dom7b9', 'dom7s9', 'dom13',
] as const;

export const SP_TIERS: Readonly<Record<SPTier, readonly string[]>> = {
  1: TIER_1_QUALITIES,
  2: TIER_2_QUALITIES,
  3: TIER_3_QUALITIES,
  4: TIER_4_QUALITIES,
};

const TIER_BY_QUALITY: ReadonlyMap<string, SPTier> = (() => {
  const m = new Map<string, SPTier>();
  (Object.entries(SP_TIERS) as Array<[string, readonly string[]]>)
    .forEach(([tierStr, items]) => {
      const tier = Number(tierStr) as SPTier;
      for (const id of items) m.set(id, tier);
    });
  return m;
})();

/**
 * Tier number (1–4) for a chord-shape quality id (catalog form —
 * e.g. `maj7`, `mmaj7`, `maj6_9`). Throws on qualities outside the
 * tier system; callers that may receive untracked qualities should
 * gate on `isTrackedShape` first.
 */
export function getTierForShape(quality: string): SPTier {
  const tier = TIER_BY_QUALITY.get(quality);
  if (tier === undefined) {
    throw new Error(
      `spTiers: chord quality "${quality}" is not part of the S&P tier system`,
    );
  }
  return tier;
}

/** Soft companion to `getTierForShape`. Cheap to call. */
export function isTrackedShape(quality: string): boolean {
  return TIER_BY_QUALITY.has(quality);
}

/** All quality ids declared in a tier — same order as the static
 *  list above. Stable iteration order is exposed because the
 *  key-by-key session walk (Part 2) drills shapes in this order. */
export function shapesForTier(tier: SPTier): readonly string[] {
  return SP_TIERS[tier];
}

/**
 * Total *possible* cells in a tier — sum across qualities of
 * (inversion-states that gate acquisition × 12 keys). The
 * tier-unlock check uses this as the denominator so advancement
 * requires broad coverage of the tier, not just mastery of a few
 * touched cells.
 *
 * Qualities not present in the catalog contribute 0 (the catalog
 * is the source of truth for what can actually be drilled).
 */
export function tierTotalCells(tier: SPTier): number {
  return SP_TIERS[tier].reduce((sum, qualityId) => {
    const entry = CHORD_QUALITY_BY_ID.get(qualityId);
    if (!entry) return sum;
    const states = INVERSION_STATES_FOR_CHORD_SHAPE_KIND[entry.kind];
    const eligible = states.filter(s => gatesAcquisition(entry.kind, s));
    return sum + eligible.length * KEY_COUNT;
  }, 0);
}

/**
 * acquisitionStage values that count toward the tier-unlock check.
 *
 * Vocabulary translation: the design doc uses "comfortable /
 * internalized" but the actual SpacingState schema uses the
 * `acquiring → acquired → consolidated → mastered` ladder
 * (see db.ts:971). Mapping:
 *
 *   "needs work / developing" (doc) → 'acquiring'
 *   "comfortable" (doc)             → 'acquired' or higher
 *   "internalized" (doc)            → 'consolidated' / 'mastered'
 *
 * Counting `acquired+` is the only working choice today —
 * `consolidated` and `mastered` are declared but Phase 3 hasn't
 * implemented the promotion from `acquired` yet, so a strict
 * `consolidated+` would never unlock anything. Easy to tighten
 * to `consolidated+` once that promotion ships.
 */
const COMFORTABLE_STAGES: ReadonlySet<AcquisitionStage> = new Set<AcquisitionStage>([
  'acquired',
  'consolidated',
  'mastered',
]);

/**
 * Pure unlock walk. Public so tests can pass fixture rows without
 * touching Dexie. Walks tiers in order; advances when ≥
 * `SP_TIER_UNLOCK_THRESHOLD` of the tier's possible cells are at
 * a comfortable+ stage. Returns 1 when the user has zero qualifying
 * cells.
 */
export function computeSPUnlockedTier(
  rowsByTier: ReadonlyMap<SPTier, ReadonlyArray<SpacingState>>,
): SPTier {
  let unlocked: SPTier = 1;
  for (let t = 1; t < SP_MAX_TIER; t++) {
    const tier = t as SPTier;
    const total = tierTotalCells(tier);
    if (total === 0) break;
    const tierRows = rowsByTier.get(tier) ?? [];
    const comfortable = tierRows.filter(
      r => COMFORTABLE_STAGES.has(r.acquisitionStage),
    ).length;
    if (comfortable / total >= SP_TIER_UNLOCK_THRESHOLD) {
      unlocked = (t + 1) as SPTier;
    } else {
      break;
    }
  }
  return unlocked;
}

/**
 * Highest S&P tier the user has unlocked. Tier 1 is always
 * unlocked. Reads chord-shape rows from `db.spacingState` for the
 * shapes-and-patterns module, groups by tier (skipping non-chord-
 * shape kinds + qualities outside the registry), and runs
 * `computeSPUnlockedTier`.
 *
 * `userId` is reserved for future multi-user contexts; Dexie is
 * per-installation today and the read filters by moduleRef alone.
 */
export async function getSPUnlockedTier(_userId?: string): Promise<SPTier> {
  const rows = await db.spacingState
    .where('moduleRef').equals('shapes-and-patterns').toArray();
  const rowsByTier = new Map<SPTier, SpacingState[]>();
  for (const row of rows) {
    const desc = parseShapesItemRef(row.itemRef);
    if (!desc || desc.kind !== 'chord-shape') continue;
    if (!isTrackedShape(desc.quality)) continue;
    const tier = getTierForShape(desc.quality);
    const arr = rowsByTier.get(tier) ?? [];
    arr.push(row);
    rowsByTier.set(tier, arr);
  }
  return computeSPUnlockedTier(rowsByTier);
}

// ===================================================================
// Key ordering + relative-major helper — exposed here so the
// Part-2 session shaper + Part-3 scale mini-track share one canonical
// source. (CIRCLE_OF_FOURTHS itself lives in
// repertoire/circleOfFourths.ts; re-exported for ergonomics.)
// ===================================================================

export { CIRCLE_OF_FOURTHS } from '../repertoire/circleOfFourths';

/** Chromatic order anchored on the flat-side spellings used by the
 *  circle-of-fourths catalog. Index = number of semitones above C.
 *  Used by `relativeMajorOf` to advance 3 semitones — the parallel
 *  natural-minor / relative-major distance. */
const CHROMATIC_ORDER: ReadonlyArray<string> = [
  'C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B',
];

/** Map every reasonable spelling of a key root to its canonical
 *  CHROMATIC_ORDER form. Sharps collapse to flats; exotic
 *  enharmonics (Cb, Fb, E#, B#) re-spell to their canonical letter. */
const CHROMATIC_CANONICAL: Readonly<Record<string, string>> = {
  C: 'C', D: 'D', E: 'E', F: 'F', G: 'G', A: 'A', B: 'B',
  Db: 'Db', Eb: 'Eb', Gb: 'Gb', Ab: 'Ab', Bb: 'Bb',
  'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb',
  'Cb': 'B', 'Fb': 'E', 'E#': 'F', 'B#': 'C',
};

/**
 * Relative major of a minor root — minor root + 3 semitones in
 * chromatic order. Used by the scale mini-track (Part 3) to surface
 * the relative-major scale in the same key set as the natural-minor
 * scale (e.g. C minor → Eb major).
 *
 * Returns the canonical (flat-side, no enharmonic duplicate) form.
 * Falls back to the input string when the root doesn't normalise —
 * defensive against freeform key labels.
 */
export function relativeMajorOf(minorRoot: string): string {
  const canonical = CHROMATIC_CANONICAL[minorRoot];
  if (!canonical) return minorRoot;
  const idx = CHROMATIC_ORDER.indexOf(canonical);
  if (idx < 0) return minorRoot;
  return CHROMATIC_ORDER[(idx + 3) % CHROMATIC_ORDER.length];
}
