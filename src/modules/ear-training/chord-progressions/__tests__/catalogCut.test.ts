/**
 * The catalog is eight progressions, and everything downstream copes.
 *
 * =====================================================================
 * A CUT IS THE EASIEST CHANGE IN THE APP TO GET SILENTLY WRONG.
 *
 * Deleting sixty-one entries from a data file compiles, boots, and
 * looks right. What it can break is everything that assumed the list
 * was wide: a stage with nothing in it, a tier heading over an empty
 * group, a pool that filters down to nothing, a "pick a random one"
 * that divides by zero. None of those throws where you can see it.
 *
 * So this file asserts the shape of the survivors AND the things that
 * read them.
 *
 * =====================================================================
 * THE THREE ROTATIONS ARE THE POINT, NOT AN OVERSIGHT.
 *
 * 1-5-6-4, 6-4-1-5 and 4-1-5-6 are the same four chords entered by
 * three different doors. They look like duplicates in a list and are
 * not: an ear that names the loop from a 1 start routinely cannot name
 * it from a 6 start, and key detection is where that shows worst. The
 * ruling of 9 Sep 2026 keeps all three on purpose, which is worth a
 * test of its own so a later tidy-up has to argue with it.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import { MUST_KNOW_IDS, PROGRESSIONS, TIER_NAMES } from '../catalog';
import { PROGRESSION_STAGE, stageForProgression } from '../progressionStages';
import { catalogTiers, chordProgressionFacets } from '../facets';
import { computeUnlockedStage, itemsForStage } from '../progressionTierUnlock';
import { PATTERN_DECOY_COUNT, patternDecoyPool } from '../patternRound';

/** The eight Silas named on 9 Sep 2026. */
const SURVIVORS = [
  '1-4-5', '1-5-6-4', '1-6-4-5', '6-4-1-5', '1-6-2-5', '2-5-1',
  'backdoor', '4-1-5-6',
];

describe('the eight survivors', () => {
  it('is exactly the ruled list, and nothing has crept back in', () => {
    expect(PROGRESSIONS.map(p => p.id)).toEqual(SURVIVORS);
  });

  it('keeps the same loop entered three ways', () => {
    const loop = ['1-5-6-4', '6-4-1-5', '4-1-5-6'];
    for (const id of loop) {
      expect(PROGRESSIONS.map(p => p.id), id).toContain(id);
    }
    // Same four chords, three starting points: the degree sets match
    // and the orders do not.
    const sets = loop.map(id => [...PROGRESSIONS.find(p => p.id === id)!.scaleDegrees]);
    for (const s of sets) expect([...s].sort()).toEqual([0, 3, 4, 5]);
    expect(new Set(sets.map(s => s.join('-'))).size).toBe(3);
  });

  it('every entry is fully formed', () => {
    for (const p of PROGRESSIONS) {
      expect(p.numerals.length, p.id).toBe(p.scaleDegrees.length);
      expect(p.chordQualities.length, p.id).toBe(p.numerals.length);
      expect(p.durationPattern.length, p.id).toBe(p.numerals.length);
      expect(p.tierName, p.id).toBe(TIER_NAMES[p.tier]);
      expect(p.songExamples.length, p.id).toBeGreaterThan(0);
    }
  });

  it('still has must-knows, so the must-knows view is not blank', () => {
    expect(MUST_KNOW_IDS.length).toBeGreaterThan(0);
    for (const id of MUST_KNOW_IDS) expect(SURVIVORS).toContain(id);
  });
});

describe('nothing is named that no longer exists', () => {
  it('the stage map has one line per progression and no more', () => {
    // A stale line here is invisible: `stageForProgression` reads it
    // for an id nothing asks about, and the drill carries on.
    expect(Object.keys(PROGRESSION_STAGE).sort()).toEqual([...SURVIVORS].sort());
  });

  it('the tier names cover the tiers in use and no empty ones', () => {
    // The quiz's focus panel and the tracker's grouped view both walk
    // `TIER_NAMES`, so a name for an empty tier draws a heading over
    // nothing.
    expect(Object.keys(TIER_NAMES).map(Number).sort()).toEqual(catalogTiers());
    for (const tier of catalogTiers()) {
      expect(PROGRESSIONS.filter(p => p.tier === tier).length, String(tier))
        .toBeGreaterThan(0);
    }
  });

  it('the tier facet offers no empty chip', () => {
    const tierFacet = chordProgressionFacets()[0];
    expect(tierFacet.values.length).toBe(catalogTiers().length);
    for (const v of tierFacet.values) {
      expect(v.keys.length, v.id).toBeGreaterThan(0);
      for (const id of v.keys) expect(SURVIVORS).toContain(id);
    }
  });
});

describe('the stages are thin, and thin still works', () => {
  it('puts something in every stage', () => {
    for (const stage of [1, 2, 3, 4] as const) {
      expect(itemsForStage(stage).length, `stage ${stage}`).toBeGreaterThan(0);
    }
  });

  it('leaves stage 3 and stage 4 with one progression each', () => {
    expect(itemsForStage(3)).toEqual(['2-5-1']);
    expect(itemsForStage(4)).toEqual(['backdoor']);
  });

  it('clears a one-item stage on that one item', () => {
    // Stage 3 is `2-5-1` alone. Clearing it must open stage 4, with no
    // special case for a stage too small to fill the fresh batch.
    const cleared = new Map<string, { correct: number; total: number }>(
      [...itemsForStage(1), ...itemsForStage(2), ...itemsForStage(3)]
        .map(id => [id, { correct: 10, total: 10 }]),
    );
    expect(computeUnlockedStage(cleared)).toBe(4);
    // And one unfinished item in that stage of one holds the gate.
    const notQuite = new Map(cleared);
    notQuite.set('2-5-1', { correct: 5, total: 10 });
    expect(computeUnlockedStage(notQuite)).toBe(3);
  });

  it('agrees with the catalog about which stage each progression is in', () => {
    for (const p of PROGRESSIONS) {
      expect(p.stage, p.id).toBe(stageForProgression(p.id));
      expect(itemsForStage(p.stage), p.id).toContain(p.id);
    }
  });
});

describe('the bonus round still has wrong answers to offer', () => {
  it('fills every round from the eight, whichever one was played', () => {
    for (const active of PROGRESSIONS) {
      const pool = patternDecoyPool(active, PROGRESSIONS);
      expect(pool.length, active.id).toBeGreaterThanOrEqual(PATTERN_DECOY_COUNT);
      expect(pool.map(p => p.id), active.id).not.toContain(active.id);
    }
  });

  it('is why the fallback exists — the 4-1-5-6 has one neighbour', () => {
    // Guard the guard. Tier 3 holds one progression and tier 4 is
    // empty, so neighbouring tiers give `backdoor` and nothing else;
    // under the old rule that round offered two options.
    const active = PROGRESSIONS.find(p => p.id === '4-1-5-6')!;
    const near = PROGRESSIONS.filter(
      p => p.id !== active.id && Math.abs(p.tier - active.tier) <= 1,
    );
    expect(near.map(p => p.id)).toEqual(['backdoor']);
    expect(patternDecoyPool(active, PROGRESSIONS)).toHaveLength(7);
  });

  it('still prefers a neighbouring tier when there are enough there', () => {
    // A tier-1 progression has five tier-1 siblings plus the backdoor,
    // so the round stays inside the tiers either side of it.
    const active = PROGRESSIONS.find(p => p.id === '1-4-5')!;
    const pool = patternDecoyPool(active, PROGRESSIONS);
    expect(pool.map(p => p.id)).not.toContain('4-1-5-6');
    expect(pool.every(p => Math.abs(p.tier - active.tier) <= 1)).toBe(true);
  });
});

describe('key detection draws from the survivors, and the pool is thin', () => {
  /**
   * `KeyDetectionTab` builds its pool as `PROGRESSIONS.filter(p =>
   * p.tier <= 3)` — tiers 4 and up modulate or mask the tonal centre,
   * so they are held back. The filter is copied rather than imported
   * because the tab is a component and the constant is private to it;
   * the test that matters is that the RULE still selects something.
   */
  const curatedPool = PROGRESSIONS.filter(p => p.tier <= 3);

  it('has all eight, because no survivor sits above tier 3', () => {
    // Worth stating plainly: `backdoor` is STAGE 4 and TIER 2. The two
    // numbers are different things — stage is the unlock ladder, tier
    // is the genre bucket — and it is the tier the key-detection pool
    // reads, so the backdoor is in it.
    expect(curatedPool).toHaveLength(8);
    expect(curatedPool.map(p => p.id)).toEqual(PROGRESSIONS.map(p => p.id));
    expect(PROGRESSIONS.find(p => p.id === 'backdoor')!.tier).toBe(2);
    expect(stageForProgression('backdoor')).toBe(4);
  });

  it('is not empty, which is the only thing that would break the tab', () => {
    // The round picks at random from the pool; an empty one indexes
    // `undefined` and the tab renders a round with no progression in
    // it. Thin is accepted, zero is not.
    expect(curatedPool.length).toBeGreaterThan(0);
  });
});
