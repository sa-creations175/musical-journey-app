/**
 * Phase 1 of the Shapes & Patterns Session Structure design
 * (docs/SHAPES_AND_PATTERNS_SESSION_DESIGN.md — May 2026).
 *
 * TWO-tier progression for the Chord Shape Track. Mirrors the ET
 * chord-recognition tier system in shape but advances INDEPENDENTLY
 * — playing a chord and recognising it by ear are different skills.
 * Cross-module dashboards may surface progress side-by-side later;
 * the registries don't cite each other.
 *
 *   Tier 1 — Core Triads:    maj / min / dim / aug / sus2 / sus4
 *   Tier 2 — Essential 7ths: maj7 / min7 / dom7 / dim7 / m7b5 / mmaj7
 *
 * WAS four tiers. Tier 3 (8 qualities) and tier 4 (3) were entirely
 * extension and special/sixth, so the 20 Aug 2026 drill-catalog cut
 * emptied both. They are DELETED rather than left as empty buckets:
 * an empty tier you can unlock into nothing is worse than no tier, and
 * keeping 3 and 4 "for later" reproduces the fill-the-grid habit the
 * cut exists to end. When a quality is added back it gets a tier
 * containing the shapes that were actually chosen.
 *
 * Quality IDs match the shapes catalog (CHORD_QUALITIES in
 * catalog.ts) so the tier lookup composes cleanly with
 * spacingState itemRefs (parsed via parseShapesItemRef → quality
 * field).
 *
 * Unlock model: tier N+1 unlocks when at least
 * `SP_TIER_UNLOCK_THRESHOLD` (50%) of the tier-N possible-cell
 * count is at acquisitionStage `comfortable` or `internalized`.
 * Possible cells = catalog inversion-state count × 12 keys per
 * quality. Every inversion state counts, supplementary included.
 */

import {
  db,
  type AcquisitionStage,
  type SpacingState,
} from '../../lib/db';
import {
  CHORD_QUALITY_BY_ID,
  INVERSION_STATES_FOR_CHORD_SHAPE_KIND,
} from './catalog';
import { parseShapesItemRef } from './drillModel';

export type SPTier = 1 | 2;

export const SP_MAX_TIER: SPTier = 2;

/**
 * Tier values that existed before the 20 Aug 2026 two-tier change.
 * Nothing in the app persists an unlocked tier today —
 * `getSPUnlockedTier` recomputes from spacingState on every read, and
 * `ShapesSplitContext.unlockedTier` is passed in per call — so there is
 * no stored 3 or 4 to migrate. `clampStoredTier` exists so that if a
 * caller ever DOES read a tier from storage (a cached plan, a synced
 * session context written by an older build), it lands on 2 rather
 * than falling through a `> unlockedTier` comparison that would drop
 * every cell from the walk.
 */
export function clampStoredTier(value: unknown): SPTier {
  return value === 1 ? 1 : 2;
}

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

export const SP_TIERS: Readonly<Record<SPTier, readonly string[]>> = {
  1: TIER_1_QUALITIES,
  2: TIER_2_QUALITIES,
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
 * Tier number (1–2) for a chord-shape quality id (catalog form —
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
 * (inversion states × 12 keys). The
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
    return sum + states.length * KEY_COUNT;
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
import { identityKeyForPitchClass } from '../repertoire/circleOfFourths';
import { pitchClassOf } from '../../lib/spelling';

/**
 * Relative major of a minor root — minor root + 3 semitones. Used by
 * the scale mini-track (Part 3) to surface the relative-major scale in
 * the same key set as the natural-minor scale (e.g. C minor → Eb major).
 *
 * Returns the IDENTITY form, which is what callers need to build an
 * itemRef or look a cell up. Spell it before showing it — the drill
 * modal does.
 *
 * Replaced a local CHROMATIC_ORDER + CHROMATIC_CANONICAL pair that
 * duplicated circleOfFourths' own tables, character for character, in
 * the vocabulary the app does not store. Two copies of a normalisation
 * rule is a rule that can disagree with itself; this one now goes
 * through the single canonicaliser.
 *
 * Falls back to the input string when the root doesn't normalise —
 * defensive against freeform key labels.
 */
export function relativeMajorOf(minorRoot: string): string {
  const pc = pitchClassOf(minorRoot);
  if (pc === null) return minorRoot;
  return identityKeyForPitchClass(pc + 3) ?? minorRoot;
}
