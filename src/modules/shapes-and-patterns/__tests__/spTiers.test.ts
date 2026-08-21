// @vitest-environment jsdom
/**
 * Pins the S&P tier registry, the catalog-anchored possible-cell
 * math, the ≥50% comfortable+ unlock walk, the circle-of-fourths
 * key ordering re-export, and the relative-major calculator that
 * Part 3 (scale mini-track) leans on.
 */
import { describe, expect, it } from 'vitest';
import type { SpacingState } from '../../../lib/db';
import { CHORD_QUALITIES } from '../catalog';
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
  it('tier 1 = 6 triads × 4 inversion states × 12 keys = 288', () => {
    // triad kind in INVERSION_STATES_FOR_CHORD_SHAPE_KIND has
    // ['root', 'inv1', 'inv2', 'fluid'] — all 4 gate acquisition.
    expect(tierTotalCells(1)).toBe(6 * 4 * 12);
  });

  it('tier 2 = 6 sevenths × 6 inversion states × 12 keys = 432', () => {
    // seventh kind has ['root', 'inv1', 'inv2', 'inv3', 'fluid',
    // 'supplementary'] and ALL SIX gate since 20 Aug 2026, when the
    // supplementary exclusion was reversed. 6 × 6 × 12 = 432.
    expect(tierTotalCells(2)).toBe(6 * 6 * 12);
  });

  it('the two tiers sum to the 720 catalog', () => {
    expect(tierTotalCells(1) + tierTotalCells(2)).toBe(720);
  });

  it('moved the tier-2 unlock bar from 180 cells to 216', () => {
    // A CONSEQUENCE TAKEN DELIBERATELY, pinned so it cannot drift back
    // unnoticed: unlock is 50% of the tier's cells, and the tier grew.
    expect(tierTotalCells(2) * SP_TIER_UNLOCK_THRESHOLD).toBe(216);
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

  it('stops at the first tier under threshold', () => {
    // T1 cleared; T2 only at 30% (108 / 360). The walk halts at T2.
    const rows = new Map<SPTier, SpacingState[]>([
      [1, comfortableRowsForTier(1, 144)],
      [2, comfortableRowsForTier(2, 108)],
    ]);
    expect(computeSPUnlockedTier(rows)).toBe(2);
  });

  it('returns MAX_TIER (2) when every tier is fully cleared', () => {
    const rows = new Map<SPTier, SpacingState[]>([
      [1, comfortableRowsForTier(1, 288)],
      [2, comfortableRowsForTier(2, 360)],
    ]);
    expect(computeSPUnlockedTier(rows)).toBe(SP_MAX_TIER);
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
