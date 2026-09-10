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
 * `spTierUnlockThreshold()` (50% by default, editable in Settings) of
 * tier N's drills — every (item, hand) the grid scores — read Fluent
 * or Mastered: the rating the grid shows, not the spacing stage. See
 * `computeSPUnlockedTier`.
 */

import { db, type SpacingState } from '../../lib/db';
import { ratingRules } from '../../lib/ratingRules';
import {
  countFluentPlusTargets, rowsByRefHand, sectionTargets, type CellTarget,
} from './cellTargets';

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

/**
 * Fraction of a tier's possible cells that must read Fluent or better
 * for the next tier to unlock.
 *
 * =====================================================================
 * EDITABLE, AND READ AT CALL TIME.
 *
 * It was a `const 0.5` with "Tunable — recalibrate after a few weeks of
 * real drilling data" beside it, and the only way to tune it was to
 * edit the file. It is on the Settings page as of 10 Sep 2026, under
 * Unlocking Tiers of Difficulty, and lives in `ratingRules` with every
 * other number a reader can move. A module-level const would freeze
 * whatever was in force at import.
 * =====================================================================
 */
export function spTierUnlockThreshold(): number {
  return ratingRules().shapesTierOpenShare;
}

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
 * Total *possible* DRILLS in a tier. The tier-unlock check uses this as
 * the denominator so advancement requires broad coverage of the tier,
 * not just mastery of a few touched cells.
 *
 * =====================================================================
 * IT COUNTED THE WRONG THING ON THE SAME SIDE AS THE GOALS DID.
 *
 * It was `inversion states × 12 keys`, with no hand axis and with
 * `supplementary` counted in. The NUMERATOR — `tierRows` in
 * `unlockedTier` — counts spacingState rows, and a row is
 * `(itemRef, hand)`. So the ratio was up to three times what it should
 * have been and a tier could unlock on a third of the work.
 *
 * Counted off `sectionTargets` now, the same enumeration the card, the
 * grid, `shapesCounts` and every goal denominator read. The threshold
 * is untouched; what changed is that both sides count drills.
 *
 * Qualities not present in the catalog contribute 0 — the enumeration
 * comes from the catalog, so that falls out rather than being checked.
 * =====================================================================
 */
export function tierTotalCells(tier: SPTier): number {
  return tierTargets(tier).length;
}

/** Every drill the grid scores in a tier, from the catalog. */
function tierTargets(tier: SPTier): CellTarget[] {
  const inTier = new Set(SP_TIERS[tier]);
  return sectionTargets('chord-shapes')
    .filter(t => inTier.has(t.itemRef.split(':')[1]));
}

/**
 * Pure unlock walk. Public so tests can pass fixture rows without
 * touching Dexie. Walks tiers in order; advances when ≥
 * `spTierUnlockThreshold()` of the tier's drills read Fluent or
 * Mastered. Returns 1 when nothing does.
 *
 * =====================================================================
 * IT READS THE RATING THE GRID SHOWS. Silas's ruling of 10 Sep 2026.
 *
 * It counted rows whose `acquisitionStage` was `acquired` or beyond —
 * a spacing-system stage — while the Settings page promised "Tier 2
 * opens when 50% of Tier 1's cells read Fluent or better", in the
 * four-word vocabulary the page defines just above. The two part
 * company: a drill can read Fluent on the grid and still be
 * `acquiring`, and one that reached `acquired` can have slipped back
 * to Developing. The sentence was the one a reader could check, so the
 * gate now reads what the sentence says.
 *
 * ONE RATING, ONE PLACE. `countFluentPlusTargets` is what the grid's
 * own progress line counts with — each drill's rating from its row,
 * `bandVerdictForRow` — so the gate and the grid cannot disagree about
 * which drills are Fluent. And the numerator counts the same catalog
 * targets the denominator does: a row the catalog no longer holds
 * cannot tip a tier open.
 * =====================================================================
 */
export function computeSPUnlockedTier(
  rows: ReadonlyArray<SpacingState>,
): SPTier {
  const byRefHand = rowsByRefHand(rows);
  let unlocked: SPTier = 1;
  for (let t = 1; t < SP_MAX_TIER; t++) {
    const { total, fluentPlus } = countFluentPlusTargets(
      tierTargets(t as SPTier), byRefHand,
    );
    if (total === 0) break;
    if (fluentPlus / total >= spTierUnlockThreshold()) {
      unlocked = (t + 1) as SPTier;
    } else {
      break;
    }
  }
  return unlocked;
}

/**
 * Highest S&P tier the user has unlocked. Tier 1 is always
 * unlocked. Reads the module's rows from `db.spacingState` and runs
 * `computeSPUnlockedTier`, which looks up only the catalog's own
 * chord-shape drills among them.
 *
 * Dexie is per-installation, so the read filters by moduleRef alone.
 * (It took an unused `userId` "for future multi-user contexts"; no
 * caller ever passed one.)
 */
export async function getSPUnlockedTier(): Promise<SPTier> {
  const rows = await db.spacingState
    .where('moduleRef').equals('shapes-and-patterns').toArray();
  return computeSPUnlockedTier(rows);
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
