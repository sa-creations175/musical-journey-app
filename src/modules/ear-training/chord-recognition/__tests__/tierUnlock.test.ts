// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { SpacingState } from '../../../../lib/db';
import {
  computeUnlockedTier,
  getEligibleItems,
  classifyForMix,
  MIX_WEIGHT,
} from '../tierUnlock';
import { CHORD_RECOGNITION_TIERS, toAttemptForm } from '../chordRecognitionTiers';

// -----------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------

/** Build a stats map covering every item in a tier with the same
 *  (correct, total) values. Saves repetition in the tier-completion
 *  fixtures. */
function statsForEntireTier(tier: 1 | 2 | 3 | 4 | 5, correct: number, total: number) {
  const map = new Map<string, { correct: number; total: number }>();
  for (const item of CHORD_RECOGNITION_TIERS[tier]) {
    map.set(toAttemptForm(item), { correct, total });
  }
  return map;
}

/** Merge several per-tier stats fixtures into one. */
function mergeStats(...maps: Array<ReadonlyMap<string, { correct: number; total: number }>>) {
  const out = new Map<string, { correct: number; total: number }>();
  for (const m of maps) for (const [k, v] of m) out.set(k, v);
  return out;
}

/** Build a minimal SpacingState fixture row. The row's existence is
 *  the only signal `getEligibleItems` reads. */
function row(itemRef: string, moduleRef = 'chord-recognition'): SpacingState {
  return {
    id: `${itemRef}\x00${moduleRef}`,
    itemRef,
    moduleRef,
    memoryType: 'declarative',
    hand: 'both',
    acquisitionStage: 'acquiring',
    currentIntervalDays: 0,
    lastEngagedAt: null,
    nextDueAt: null,
    performanceHistory: [],
  };
}

// -----------------------------------------------------------------
// computeUnlockedTier
// -----------------------------------------------------------------

describe('computeUnlockedTier', () => {
  it('returns 1 when the user has zero attempts', () => {
    expect(computeUnlockedTier(new Map())).toBe(1);
  });

  it('returns 1 when only some tier-1 items meet criteria', () => {
    // Two of six tier-1 items cleared — not enough.
    const partial = new Map([
      ['maj:0', { correct: 9, total: 10 }],
      ['min:0', { correct: 8, total: 10 }],
    ]);
    expect(computeUnlockedTier(partial)).toBe(1);
  });

  it('returns 1 when tier-1 items have enough accuracy but too few attempts', () => {
    // 100% accuracy across all six tier-1 items but only 9 attempts
    // each — fails the volume floor.
    const map = statsForEntireTier(1, 9, 9);
    expect(computeUnlockedTier(map)).toBe(1);
  });

  it('returns 1 when tier-1 items have enough attempts but below accuracy threshold', () => {
    // 74% < 0.75. One bad item is enough to block.
    const map = statsForEntireTier(1, 10, 10);
    map.set('maj:0', { correct: 7, total: 10 });
    expect(computeUnlockedTier(map)).toBe(1);
  });

  it('returns 2 when every tier-1 item clears both thresholds', () => {
    // 8/10 = 80% — passes both floors.
    const map = statsForEntireTier(1, 8, 10);
    expect(computeUnlockedTier(map)).toBe(2);
  });

  it('returns 2 when tier 1 clears but tier 2 is partially complete', () => {
    const map = mergeStats(
      statsForEntireTier(1, 10, 10),
      // Half of tier 2 done — not enough.
      new Map([
        ['maj7:0', { correct: 10, total: 10 }],
        ['min7:0', { correct: 10, total: 10 }],
        ['dom7:0', { correct: 10, total: 10 }],
      ]),
    );
    expect(computeUnlockedTier(map)).toBe(2);
  });

  it('cascades up through multiple tiers when each one fully clears', () => {
    const map = mergeStats(
      statsForEntireTier(1, 10, 10),
      statsForEntireTier(2, 10, 10),
      statsForEntireTier(3, 10, 10),
    );
    expect(computeUnlockedTier(map)).toBe(4);
  });

  it('returns MAX_TIER (5) when every tier is fully cleared', () => {
    const map = mergeStats(
      statsForEntireTier(1, 10, 10),
      statsForEntireTier(2, 10, 10),
      statsForEntireTier(3, 10, 10),
      statsForEntireTier(4, 10, 10),
      statsForEntireTier(5, 10, 10),
    );
    expect(computeUnlockedTier(map)).toBe(5);
  });

  it('exact threshold values pass — 10 attempts at exactly 75% clear', () => {
    // 0.75 ≥ 0.75 — must clear (the comparison is inclusive).
    const map = statsForEntireTier(1, 9, 12); // 75%
    // 12 attempts ≥ 10, accuracy 0.75 ≥ 0.75 — all pass.
    expect(computeUnlockedTier(map)).toBe(2);
  });

  it('does not advance when even one item in the current tier is short', () => {
    // All tier-2 items cleared except m7b5 which sits at 5/10 — under threshold.
    const map = mergeStats(
      statsForEntireTier(1, 10, 10),
      statsForEntireTier(2, 10, 10),
    );
    map.set('m7b5:0', { correct: 5, total: 10 });
    expect(computeUnlockedTier(map)).toBe(2);
  });
});

// -----------------------------------------------------------------
// getEligibleItems
// -----------------------------------------------------------------

describe('getEligibleItems', () => {
  it('returns the first three tier-1 items when the user has zero history', () => {
    const eligible = getEligibleItems(1, []);
    expect(eligible).toEqual(['maj:0', 'min:0', 'dim:0']);
  });

  it('returns all introduced tier-1 items plus the staged batch of fresh ones', () => {
    // User has touched maj and min. Tier 1 has 6 items. Fresh items
    // remaining: dim, aug, sus2, sus4. Staged batch = first 3.
    const rows = [row('maj:0'), row('min:0')];
    const eligible = getEligibleItems(1, rows);
    expect(eligible).toEqual([
      'maj:0', 'min:0',         // introduced
      'dim:0', 'aug:0', 'sus2:0', // staged batch (next 3)
    ]);
  });

  it('introduces all remaining items when fewer than 3 are left fresh', () => {
    // Only one tier-1 item is fresh — staged batch = 1.
    const rows = [
      row('maj:0'), row('min:0'), row('dim:0'),
      row('aug:0'), row('sus2:0'),
    ];
    const eligible = getEligibleItems(1, rows);
    expect(eligible).toEqual([
      'maj:0', 'min:0', 'dim:0', 'aug:0', 'sus2:0', // introduced
      'sus4:0',                                      // last fresh
    ]);
  });

  it('returns only introduced items when the entire current tier is touched', () => {
    // All six tier-1 items introduced and unlock state still tier 1 —
    // user worked through the staged batches but hasn't earned tier 2.
    const rows = CHORD_RECOGNITION_TIERS[1].map(item => row(toAttemptForm(item)));
    const eligible = getEligibleItems(1, rows);
    expect(eligible).toEqual([
      'maj:0', 'min:0', 'dim:0', 'aug:0', 'sus2:0', 'sus4:0',
    ]);
  });

  it('includes prior tiers (introduced only) as review when a new tier is unlocked', () => {
    // Tier 2 unlocked. User has touched 3 of 6 tier-1 items and
    // 0 tier-2 items. Eligible: 3 tier-1 reviewers + staged batch of
    // 3 fresh tier-2 items.
    const rows = [row('maj:0'), row('min:0'), row('dim:0')];
    const eligible = getEligibleItems(2, rows);
    expect(eligible).toEqual([
      // Review (introduced T1 only — T1 items not touched stay out)
      'maj:0', 'min:0', 'dim:0',
      // Fresh batch from T2 (first three in declaration order)
      'maj7:0', 'min7:0', 'dom7:0',
    ]);
  });

  it('excludes T1 items the user never touched, even when T2 is unlocked', () => {
    // Tier 2 unlocked; user touched 2 of 6 tier-1 items. The other
    // 4 tier-1 items stay out of the eligible set (deliberate
    // practice path, not auto-injected).
    const rows = [row('maj:0'), row('maj7:0'), row('min7:0')];
    const eligible = getEligibleItems(2, rows);
    expect(eligible).toEqual([
      'maj:0',                       // sole introduced T1 reviewer
      'maj7:0', 'min7:0',            // introduced T2
      'dom7:0', 'dim7:0', 'm7b5:0',  // next 3 fresh from T2
    ]);
  });

  it('ignores spacingState rows from other modules', () => {
    // A row keyed to 'intervals' shouldn't influence chord-recognition
    // eligibility — even if its itemRef collides with one of ours.
    const rows = [row('maj:0', 'intervals')];
    const eligible = getEligibleItems(1, rows);
    expect(eligible).toEqual(['maj:0', 'min:0', 'dim:0']);
  });

  it('ignores rows for items outside the tier system', () => {
    // dim7:1 isn't in any tier (only T2 has dim7:0). A stray row for
    // it shouldn't appear in the eligible set, even after being
    // "introduced".
    const rows = [row('dim7:1'), row('maj:0')];
    const eligible = getEligibleItems(1, rows);
    expect(eligible).toEqual([
      'maj:0',                   // introduced T1
      'min:0', 'dim:0', 'aug:0', // staged batch
    ]);
  });

  it('staged batch advances as the user introduces items', () => {
    // Simulate the cohort marching forward: after touching the
    // first staged batch (maj, min, dim) the next call should
    // surface aug, sus2, sus4.
    const rowsAfterFirstBatch = [row('maj:0'), row('min:0'), row('dim:0')];
    const eligible = getEligibleItems(1, rowsAfterFirstBatch);
    expect(eligible).toEqual([
      'maj:0', 'min:0', 'dim:0', // introduced
      'aug:0', 'sus2:0', 'sus4:0', // next staged batch
    ]);
  });
});

// -----------------------------------------------------------------
// classifyForMix + MIX_WEIGHT
// -----------------------------------------------------------------

describe('classifyForMix', () => {
  it('classifies tier-below items as review', () => {
    expect(classifyForMix('maj:0', 2, [row('maj:0')])).toBe('review');
  });

  it('classifies current-tier introduced items as current', () => {
    expect(classifyForMix('maj7:0', 2, [row('maj7:0')])).toBe('current');
  });

  it('classifies current-tier untouched items as fresh', () => {
    expect(classifyForMix('maj7:0', 2, [])).toBe('fresh');
  });

  it('classifies items above the unlocked tier as untracked', () => {
    // dom13 is tier 5 — locked when only tier 2 is unlocked.
    expect(classifyForMix('dom13:0', 2, [])).toBe('untracked');
  });

  it('classifies items outside the tier system as untracked', () => {
    expect(classifyForMix('dim7:1', 5, [])).toBe('untracked');
  });
});

describe('MIX_WEIGHT', () => {
  it('matches the spec values', () => {
    expect(MIX_WEIGHT.review).toBe(0.2);
    expect(MIX_WEIGHT.current).toBe(0.7);
    expect(MIX_WEIGHT.fresh).toBe(0.1);
  });
});
