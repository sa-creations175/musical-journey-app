// @vitest-environment jsdom
/**
 * Pins the S&P tier registry, the catalog-anchored possible-cell
 * math, the ≥50% comfortable+ unlock walk, the circle-of-fourths
 * key ordering re-export, and the relative-major calculator that
 * Part 3 (scale mini-track) leans on.
 */
import { describe, expect, it } from 'vitest';
import type { SpacingState } from '../../../lib/db';
import {
  CIRCLE_OF_FOURTHS,
  SP_MAX_TIER,
  SP_TIERS,
  SP_TIER_UNLOCK_THRESHOLD,
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
  it('has 4 tiers', () => {
    expect(SP_MAX_TIER).toBe(4);
    expect(Object.keys(SP_TIERS)).toEqual(['1', '2', '3', '4']);
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

  it('tier 3 = extended maj/min', () => {
    // 8 catalog-aligned items. min6/9 / maj9/13 / add2 / min9/11 /
    // dom9/13 from the ET tier list aren't in the shapes catalog,
    // so they're omitted — see spTiers.ts header.
    expect(SP_TIERS[3]).toEqual([
      'maj9', 'maj13', 'maj6', 'maj6_9',
      'add9', 'min9', 'min11', 'min6',
    ]);
  });

  it('tier 4 = altered dominants (catalog spelling — dom7s9, not dom7#9)', () => {
    expect(SP_TIERS[4]).toEqual(['dom7b9', 'dom7s9', 'dom13']);
  });

  it('every quality appears in exactly one tier', () => {
    const seen = new Set<string>();
    for (const t of [1, 2, 3, 4] as SPTier[]) {
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

  it('classifies all tier-3 extensions', () => {
    expect(getTierForShape('maj9')).toBe(3);
    expect(getTierForShape('maj13')).toBe(3);
    expect(getTierForShape('maj6')).toBe(3);
    expect(getTierForShape('maj6_9')).toBe(3);
    expect(getTierForShape('add9')).toBe(3);
    expect(getTierForShape('min9')).toBe(3);
    expect(getTierForShape('min11')).toBe(3);
    expect(getTierForShape('min6')).toBe(3);
  });

  it('classifies all tier-4 altered dominants', () => {
    expect(getTierForShape('dom7b9')).toBe(4);
    expect(getTierForShape('dom7s9')).toBe(4);
    expect(getTierForShape('dom13')).toBe(4);
  });

  it('throws on qualities outside the tier system', () => {
    expect(() => getTierForShape('bogus')).toThrow(/not part of the S&P tier system/);
    // Quality that's in the catalog but not in any S&P tier yet.
    expect(() => getTierForShape('dom9')).toThrow(/not part of the S&P tier system/);
  });
});

describe('isTrackedShape', () => {
  it('returns true for every tier member', () => {
    for (const t of [1, 2, 3, 4] as SPTier[]) {
      for (const q of SP_TIERS[t]) {
        expect(isTrackedShape(q)).toBe(true);
      }
    }
  });

  it('returns false for non-tier qualities', () => {
    expect(isTrackedShape('dom9')).toBe(false);
    expect(isTrackedShape('bogus')).toBe(false);
  });
});

describe('shapesForTier', () => {
  it('returns the same array as SP_TIERS[t]', () => {
    expect(shapesForTier(1)).toBe(SP_TIERS[1]);
    expect(shapesForTier(4)).toBe(SP_TIERS[4]);
  });
});

// -----------------------------------------------------------------
// tierTotalCells — catalog-anchored possible-cell counts
// -----------------------------------------------------------------

describe('tierTotalCells', () => {
  it('tier 1 = 6 triads × 4 inversion states × 12 keys = 288', () => {
    // triad kind in INVERSION_STATES_FOR_CHORD_SHAPE_KIND has
    // ['root', 'inv1', 'inv2', 'fluid'] — all 4 gate acquisition.
    expect(tierTotalCells(1)).toBe(6 * 4 * 12);
  });

  it('tier 2 = 6 sevenths × 5 acquisition-gating states × 12 keys = 360', () => {
    // seventh kind has ['root', 'inv1', 'inv2', 'inv3', 'fluid',
    // 'supplementary']; supplementary is filtered out by
    // gatesAcquisition. 5 states × 6 × 12 = 360.
    expect(tierTotalCells(2)).toBe(6 * 5 * 12);
  });

  it('tier 3 = 8 extension/special qualities × 1 cell × 12 keys = 96', () => {
    // extension + special kinds each have [null] as their single
    // inversion state. 8 items × 1 × 12 = 96.
    expect(tierTotalCells(3)).toBe(8 * 1 * 12);
  });

  it('tier 4 = 3 dominant extensions × 1 cell × 12 keys = 36', () => {
    expect(tierTotalCells(4)).toBe(3 * 1 * 12);
  });
});

// -----------------------------------------------------------------
// computeSPUnlockedTier
// -----------------------------------------------------------------

function fixtureRow(itemRef: string, stage: SpacingState['acquisitionStage']): SpacingState {
  return {
    id: `${itemRef}\x00shapes-and-patterns`,
    itemRef,
    moduleRef: 'shapes-and-patterns',
    memoryType: 'procedural',
    hand: 'both',
    style: 'solid',
    acquisitionStage: stage,
    currentIntervalDays: 0,
    lastEngagedAt: null,
    nextDueAt: null,
    performanceHistory: [],
  };
}

/** Build a comfortable-stage map for `count` synthetic cells in the
 *  given tier. The itemRefs are synthetic ids that don't need to
 *  match the catalog — the unlock walk only counts the
 *  acquisitionStage on the rows it receives. */
function comfortableRowsForTier(tier: SPTier, count: number): SpacingState[] {
  const out: SpacingState[] = [];
  for (let i = 0; i < count; i++) {
    out.push(fixtureRow(`fixture:${tier}:${i}`, 'acquired'));
  }
  return out;
}

describe('computeSPUnlockedTier', () => {
  it('returns 1 when the user has no rows at all', () => {
    expect(computeSPUnlockedTier(new Map())).toBe(1);
  });

  it('returns 1 when tier 1 is below the 50% threshold', () => {
    // Tier 1 has 288 possible cells; 50% = 144. 100 comfortable
    // rows isn't enough.
    const rows = new Map([[1 as SPTier, comfortableRowsForTier(1, 100)]]);
    expect(computeSPUnlockedTier(rows)).toBe(1);
  });

  it('returns 1 when tier 1 rows are still in acquiring (below the acquired floor)', () => {
    // 200 `acquiring` rows wouldn't qualify — the comfortable+
    // window starts at `acquired` (see COMFORTABLE_STAGES comment
    // in spTiers.ts for the design-doc → schema vocabulary map).
    const acquiring = Array.from({ length: 200 }, (_, i) =>
      fixtureRow(`fixture:1:${i}`, 'acquiring'),
    );
    const rows = new Map([[1 as SPTier, acquiring]]);
    expect(computeSPUnlockedTier(rows)).toBe(1);
  });

  it('returns 2 when tier 1 crosses the threshold', () => {
    // 144 / 288 = exactly 0.5 ≥ threshold (inclusive).
    const rows = new Map([[1 as SPTier, comfortableRowsForTier(1, 144)]]);
    expect(computeSPUnlockedTier(rows)).toBe(2);
  });

  it('cascades — fully-cleared tier 1 + tier 2 unlocks tier 3', () => {
    // 144 comfortable rows in T1 (50% of 288) +
    // 180 comfortable rows in T2 (50% of 360) → unlock T3.
    const rows = new Map<SPTier, SpacingState[]>([
      [1, comfortableRowsForTier(1, 144)],
      [2, comfortableRowsForTier(2, 180)],
    ]);
    expect(computeSPUnlockedTier(rows)).toBe(3);
  });

  it('stops at the first tier under threshold', () => {
    // T1 cleared; T2 only at 30% (108 / 360). T3 has comfortable
    // rows too, but the walk halts at T2 → returns 2.
    const rows = new Map<SPTier, SpacingState[]>([
      [1, comfortableRowsForTier(1, 144)],
      [2, comfortableRowsForTier(2, 108)],
      [3, comfortableRowsForTier(3, 96)],  // 100% of T3, but locked
    ]);
    expect(computeSPUnlockedTier(rows)).toBe(2);
  });

  it('returns MAX_TIER (4) when every tier is fully cleared', () => {
    const rows = new Map<SPTier, SpacingState[]>([
      [1, comfortableRowsForTier(1, 288)],
      [2, comfortableRowsForTier(2, 360)],
      [3, comfortableRowsForTier(3, 96)],
      [4, comfortableRowsForTier(4, 36)],
    ]);
    expect(computeSPUnlockedTier(rows)).toBe(4);
  });

  it('counts consolidated + mastered alongside acquired for the unlock check', () => {
    // Mix of 50 acquired + 50 consolidated + 44 mastered = 144 →
    // crosses 50% of T1. All three stages count as comfortable+
    // per the design-doc → schema vocabulary map.
    const mix: SpacingState[] = [
      ...Array.from({ length: 50 }, (_, i) => fixtureRow(`fixture:1:a${i}`, 'acquired')),
      ...Array.from({ length: 50 }, (_, i) => fixtureRow(`fixture:1:c${i}`, 'consolidated')),
      ...Array.from({ length: 44 }, (_, i) => fixtureRow(`fixture:1:m${i}`, 'mastered')),
    ];
    const rows = new Map([[1 as SPTier, mix]]);
    expect(computeSPUnlockedTier(rows)).toBe(2);
  });

  it('threshold constant matches the design doc', () => {
    expect(SP_TIER_UNLOCK_THRESHOLD).toBe(0.5);
  });
});

// -----------------------------------------------------------------
// Circle of fourths re-export
// -----------------------------------------------------------------

describe('CIRCLE_OF_FOURTHS', () => {
  it('walks 12 keys in the spec order (C → F → Bb → ... → G)', () => {
    expect(CIRCLE_OF_FOURTHS).toEqual([
      'C', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'B', 'E', 'A', 'D', 'G',
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
    expect(relativeMajorOf('Eb')).toBe('Gb');
    expect(relativeMajorOf('E')).toBe('G');
    expect(relativeMajorOf('F')).toBe('Ab');
    expect(relativeMajorOf('Gb')).toBe('A');
    expect(relativeMajorOf('G')).toBe('Bb');
    expect(relativeMajorOf('Ab')).toBe('B');
    expect(relativeMajorOf('A')).toBe('C');
    expect(relativeMajorOf('Bb')).toBe('Db');
    expect(relativeMajorOf('B')).toBe('D');
  });

  it('accepts sharp-side enharmonic spellings and emits flat-side canonical', () => {
    // C# minor → E major (3 semitones up from Db = E).
    expect(relativeMajorOf('C#')).toBe('E');
    expect(relativeMajorOf('D#')).toBe('Gb');
    expect(relativeMajorOf('F#')).toBe('A');
    expect(relativeMajorOf('G#')).toBe('B');
    expect(relativeMajorOf('A#')).toBe('Db');
  });

  it('returns the input verbatim when the root is unrecognisable', () => {
    expect(relativeMajorOf('not-a-key')).toBe('not-a-key');
    expect(relativeMajorOf('')).toBe('');
  });
});
