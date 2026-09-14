// @vitest-environment jsdom
/**
 * Pins the S&P tier registry, the catalog-anchored possible-cell
 * math, the ≥50%-read-Fluent unlock walk, the circle-of-fourths
 * key ordering re-export, and the relative-major calculator that
 * Part 3 (scale mini-track) leans on.
 */
import { describe, expect, it } from 'vitest';
import type { SpacingState } from '../../../lib/db';
import { CHORD_QUALITIES, CIRCLE_KEY } from '../catalog';
import { sectionTargetCount, sectionTargets, type CellTarget } from '../cellTargets';
import {
  CIRCLE_OF_FOURTHS,
  SP_MAX_TIER,
  SP_TIERS,
  spTierUnlockThreshold,
  computeSPUnlockedTier,
  getTierForShape,
  isTrackedShape,
  relativeMajorOf,
  shapesForTier,
  tierTotalCells,
  type SPTier,
} from '../spTiers';

// -----------------------------------------------------------------
// Tier registry
// -----------------------------------------------------------------

describe('SP_TIERS', () => {
  it('has 2 tiers', () => {
    // WAS 4. Tiers 3 and 4 were entirely extension / special-sixth
    // qualities, all of which left the drill catalog on 20 Aug 2026.
    // Deleted rather than left empty — an unlockable tier containing
    // nothing is worse than no tier.
    expect(SP_MAX_TIER).toBe(2);
    expect(Object.keys(SP_TIERS)).toEqual(['1', '2']);
  });

  it('tier 1 = core triads (maj / min / dim / aug / sus2 / sus4)', () => {
    expect(SP_TIERS[1]).toEqual([
      'maj', 'min', 'dim', 'aug', 'sus2', 'sus4',
    ]);
  });

  it('tier 2 = essential 7ths (catalog form — mmaj7, not minMaj7)', () => {
    expect(SP_TIERS[2]).toEqual([
      'maj7', 'min7', 'dom7', 'dim7', 'm7b5', 'mmaj7',
    ]);
  });

  it('covers the whole drill catalog and nothing else', () => {
    // The tier ladder and the catalog must agree exactly. Before the
    // cut they didn't — six catalog qualities sat in no tier at all,
    // which is what exposed them as grid-fill in the first place.
    const tiered = [...SP_TIERS[1], ...SP_TIERS[2]].sort();
    expect(tiered).toEqual(CHORD_QUALITIES.map(q => q.id).sort());
  });

  it('every quality appears in exactly one tier', () => {
    const seen = new Set<string>();
    for (const t of [1, 2] as SPTier[]) {
      for (const q of SP_TIERS[t]) {
        expect(seen.has(q)).toBe(false);
        seen.add(q);
      }
    }
  });
});

describe('getTierForShape', () => {
  it('classifies all tier-1 triads', () => {
    expect(getTierForShape('maj')).toBe(1);
    expect(getTierForShape('min')).toBe(1);
    expect(getTierForShape('dim')).toBe(1);
    expect(getTierForShape('aug')).toBe(1);
    expect(getTierForShape('sus2')).toBe(1);
    expect(getTierForShape('sus4')).toBe(1);
  });

  it('classifies all tier-2 7ths', () => {
    expect(getTierForShape('maj7')).toBe(2);
    expect(getTierForShape('min7')).toBe(2);
    expect(getTierForShape('dom7')).toBe(2);
    expect(getTierForShape('dim7')).toBe(2);
    expect(getTierForShape('m7b5')).toBe(2);
    expect(getTierForShape('mmaj7')).toBe(2);
  });

  it('throws on qualities outside the tier system', () => {
    expect(() => getTierForShape('bogus')).toThrow(/not part of the S&P tier system/);
    // Cut qualities. Stored drillSkills / spacingState rows still carry
    // these ids, so every caller must gate on isTrackedShape first.
    expect(() => getTierForShape('maj9')).toThrow(/not part of the S&P tier system/);
    expect(() => getTierForShape('maj6_9')).toThrow(/not part of the S&P tier system/);
  });
});

describe('isTrackedShape', () => {
  it('returns true for every tier member', () => {
    for (const t of [1, 2] as SPTier[]) {
      for (const q of SP_TIERS[t]) {
        expect(isTrackedShape(q)).toBe(true);
      }
    }
  });

  it('returns false for cut and unknown qualities', () => {
    expect(isTrackedShape('dom9')).toBe(false);
    expect(isTrackedShape('maj9')).toBe(false);
    expect(isTrackedShape('min6')).toBe(false);
    expect(isTrackedShape('bogus')).toBe(false);
  });
});

describe('shapesForTier', () => {
  it('returns the same array as SP_TIERS[t]', () => {
    expect(shapesForTier(1)).toBe(SP_TIERS[1]);
    expect(shapesForTier(2)).toBe(SP_TIERS[2]);
  });
});

// -----------------------------------------------------------------
// tierTotalCells — catalog-anchored possible-cell counts
// -----------------------------------------------------------------

describe('tierTotalCells', () => {
  /**
   * =====================================================================
   * IT HAD THE SAME BUG THE GOAL DENOMINATORS HAD.
   *
   * `inversion states × 12 keys`, no hand axis — while the numerator in
   * `computeSPUnlockedTier` counts spacingState rows, which are
   * `(itemRef, hand)`. So the ratio ran up to three times high and a
   * tier could unlock on a third of the work.
   *
   * Counted off `sectionTargets` now, like everything else.
   * =====================================================================
   */
  it('tier 1 = 6 triads × 4 inversion states × 12 keys × 3 hands = 864', () => {
    expect(tierTotalCells(1)).toBe(6 * 4 * 12 * 3);
  });

  it('tier 2 = 6 sevenths × 5 inversion states × 12 keys × 3 hands = 1080', () => {
    // FIVE, not six: `supplementary` left the score on 31 Aug 2026.
    // The 20 Aug ruling that put it in is reversed — see catalog.ts.
    expect(tierTotalCells(2)).toBe(6 * 5 * 12 * 3);
  });

  it('the two tiers sum to the catalog\'s 1944 key targets', () => {
    expect(tierTotalCells(1) + tierTotalCells(2)).toBe(1944);
    // THE CIRCLE OF 4THS CELL IS NOT IN THE GATE (14 Sep 2026). Its
    // 162 targets are in the grid's total; counting them here would
    // raise the bar under anyone already past it and shut Tier 2 again.
    expect(tierTotalCells(1) + tierTotalCells(2))
      .toBe(sectionTargetCount('chord-shapes') - 162);
  });

  it('the tier-2 unlock bar is half the tier, in drills', () => {
    // Unlock is 50% of the tier, and the tier is now counted in the
    // same unit the numerator counts. 216 was half of 432 cells against
    // a row count that could reach 1296.
    expect(tierTotalCells(2) * spTierUnlockThreshold()).toBe(540);
  });
});

// -----------------------------------------------------------------
// computeSPUnlockedTier
// -----------------------------------------------------------------

/**
 * A row for one of the catalog's own drills, rated through three test
 * reps at `feel` — the self-rated route S&P cells take. Feel 3 reads
 * Fluent, 4 Mastered, 2 Developing (see `BAND_FOR_LOWEST`).
 *
 * THE STAGE IS SET SEPARATELY, ON PURPOSE. The gate used to read it;
 * the fixtures below set it against the rating to prove it no longer
 * does.
 */
function ratedRow(
  target: CellTarget,
  feel: 2 | 3 | 4,
  stage: SpacingState['acquisitionStage'] = 'acquiring',
): SpacingState {
  return {
    id: `${target.itemRef}\x00shapes-and-patterns\x00${target.hand}`,
    itemRef: target.itemRef,
    moduleRef: 'shapes-and-patterns',
    memoryType: 'procedural',
    hand: target.hand,
    acquisitionStage: stage,
    currentIntervalDays: 0,
    lastEngagedAt: null,
    nextDueAt: null,
    performanceHistory: [1, 2, 3].map(() => ({
      kind: 'rating', rating: feel >= 4 ? 'flying' : 'cruising', feel,
      fromTest: true, sessionId: 'ss-1', at: 0,
    })),
  } as unknown as SpacingState;
}

/** The first `count` drills of a tier, from the catalog. The Circle of
 *  4ths cell's are not in the gate, so they are not handed to it. */
function tierDrills(tier: SPTier, count: number): CellTarget[] {
  const inTier = new Set(SP_TIERS[tier]);
  const all = sectionTargets('chord-shapes').filter(t => {
    const [, quality, keyName] = t.itemRef.split(':');
    return inTier.has(quality) && keyName !== CIRCLE_KEY;
  });
  expect(all.length).toBeGreaterThanOrEqual(count);
  return all.slice(0, count);
}

const rated = (tier: SPTier, count: number, feel: 2 | 3 | 4,
  stage?: SpacingState['acquisitionStage']) =>
  tierDrills(tier, count).map(t => ratedRow(t, feel, stage));

describe('computeSPUnlockedTier', () => {
  it('returns 1 when the user has no rows at all', () => {
    expect(computeSPUnlockedTier([])).toBe(1);
  });

  it('returns 1 when tier 1 is below the 50% threshold', () => {
    // Tier 1 has 864 drills; 50% = 432. 100 Fluent isn't enough.
    expect(computeSPUnlockedTier(rated(1, 100, 3))).toBe(1);
  });

  it('returns 2 when tier 1 crosses the threshold', () => {
    // 432 / 864 = exactly 0.5 ≥ threshold (inclusive).
    expect(computeSPUnlockedTier(rated(1, 432, 3))).toBe(2);
  });

  it('counts Mastered alongside Fluent', () => {
    const rows = [...rated(1, 432, 4)];
    expect(computeSPUnlockedTier(rows)).toBe(2);
  });

  it('does not count Developing, however many', () => {
    expect(computeSPUnlockedTier(rated(1, 864, 2))).toBe(1);
  });

  it('returns MAX_TIER (2) when every tier is fully cleared', () => {
    expect(computeSPUnlockedTier([...rated(1, 864, 3), ...rated(2, 1080, 3)]))
      .toBe(SP_MAX_TIER);
  });

  /**
   * =====================================================================
   * THE RATING, NOT THE STAGE — both directions.
   *
   * The spacing stage and the four-word rating are different measures,
   * and the Settings sentence names the rating. So a drill that READS
   * Fluent opens the tier whatever its stage says, and one whose stage
   * has reached `mastered` but reads Developing does not.
   * =====================================================================
   */
  it('opens on drills that read Fluent while their stage is still acquiring', () => {
    expect(computeSPUnlockedTier(rated(1, 432, 3, 'acquiring'))).toBe(2);
  });

  it('stays shut on drills whose stage is mastered but read Developing', () => {
    expect(computeSPUnlockedTier(rated(1, 864, 2, 'mastered'))).toBe(1);
  });

  it('ignores rows the catalog does not hold', () => {
    // 432 Fluent rows, none of them a real drill: nothing to count.
    const stray = Array.from({ length: 432 }, (_, i) =>
      ratedRow({ itemRef: `fixture:1:${i}`, hand: 'both' } as CellTarget, 3));
    expect(computeSPUnlockedTier(stray)).toBe(1);
  });

  it('threshold constant matches the design doc', () => {
    expect(spTierUnlockThreshold()).toBe(0.5);
  });
});

// -----------------------------------------------------------------
// Circle of fourths re-export
// -----------------------------------------------------------------

describe('CIRCLE_OF_FOURTHS', () => {
  it('walks 12 keys in the spec order, in the identity vocabulary', () => {
    // F#, not Gb: this array builds scale itemRefs, so it must match
    // what `songKeys.keyName` and every other stored key holds. Gb is
    // what the user reads — see lib/spelling.ts.
    expect(CIRCLE_OF_FOURTHS).toEqual([
      'C', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'F#', 'B', 'E', 'A', 'D', 'G',
    ]);
  });

  it('contains exactly 12 unique entries (no enharmonic duplicates)', () => {
    expect(new Set(CIRCLE_OF_FOURTHS).size).toBe(12);
  });
});

// -----------------------------------------------------------------
// relativeMajorOf
// -----------------------------------------------------------------

describe('relativeMajorOf', () => {
  it('walks the full minor-root → relative-major mapping', () => {
    // Each minor root + 3 semitones lands on its relative major.
    expect(relativeMajorOf('C')).toBe('Eb');
    expect(relativeMajorOf('Db')).toBe('E');
    expect(relativeMajorOf('D')).toBe('F');
    expect(relativeMajorOf('Eb')).toBe('F#');
    expect(relativeMajorOf('E')).toBe('G');
    expect(relativeMajorOf('F')).toBe('Ab');
    expect(relativeMajorOf('F#')).toBe('A');
    expect(relativeMajorOf('G')).toBe('Bb');
    expect(relativeMajorOf('Ab')).toBe('B');
    expect(relativeMajorOf('A')).toBe('C');
    expect(relativeMajorOf('Bb')).toBe('Db');
    expect(relativeMajorOf('B')).toBe('D');
  });

  it('accepts any spelling of the root and emits the identity form', () => {
    // C# minor → E major (3 semitones up from Db = E).
    expect(relativeMajorOf('C#')).toBe('E');
    expect(relativeMajorOf('D#')).toBe('F#');
    expect(relativeMajorOf('Gb')).toBe('A');
    expect(relativeMajorOf('G#')).toBe('B');
    expect(relativeMajorOf('A#')).toBe('Db');
  });

  it('never returns Gb — the output is a lookup key, not a label', () => {
    // The old implementation emitted flat-side canonical, so this
    // returned 'Gb' for two roots and any itemRef built from it missed.
    for (const root of ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']) {
      expect(relativeMajorOf(root), `relativeMajorOf(${root})`).not.toBe('Gb');
    }
  });

  it('returns the input verbatim when the root is unrecognisable', () => {
    expect(relativeMajorOf('not-a-key')).toBe('not-a-key');
    expect(relativeMajorOf('')).toBe('');
  });
});
