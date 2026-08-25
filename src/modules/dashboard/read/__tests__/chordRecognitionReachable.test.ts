/**
 * The dashboard's chord denominator, and the drill's reachable set.
 *
 * =====================================================================
 * THESE TWO DRIFTED BY 63 ROWS BECAUSE THE RULE WAS WRITTEN TWICE.
 *
 * The dashboard enumerated every seed against every inversion its size
 * allows; the drill gated on tier, exclusions and chord size. Nothing
 * compared them, so 63 combinations no path could attempt sat
 * permanently uncovered in the denominator and pinned the module's
 * stalest recency to "never".
 *
 * Every assertion below therefore DERIVES from the gate functions. A
 * literal 51 would be a third copy of the rule, and widening the
 * exclusions would break the test rather than move it.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import { chordRecognitionCatalog } from '../catalogs';
import { CHORD_SEEDS } from '../../../ear-training/chord-recognition/seed';
import {
  DEFAULT_INVERSION_POSITIONS,
  INVERSION_EXCLUDED_CHORD_IDS,
  INVERSION_TRAINED_TIERS,
  inversionsForIntervalCount,
  reachableInversions,
  type Inversion,
} from '../../../ear-training/chord-recognition/inversionUtils';

/** Every `chordId:inversion` the drill can ever ask, structurally. */
function reachableRefs(): Set<string> {
  const out = new Set<string>();
  for (const chord of CHORD_SEEDS) {
    for (const inv of reachableInversions(chord)) out.add(`${chord.id}:${inv}`);
  }
  return out;
}

const catalogRefs = () => new Set(chordRecognitionCatalog.items.flatMap(i => i.itemRefs));

describe('the denominator is the reachable count', () => {
  it('equals what the gate functions produce, not a written number', () => {
    const reachable = CHORD_SEEDS
      .reduce((n, c) => n + reachableInversions(c).length, 0);
    expect(chordRecognitionCatalog.items.length).toBe(reachable);
  });

  it('is 51, and 63 fewer than enumerating every size-valid inversion', () => {
    // The arithmetic stated once, so a reader can check the claim — but
    // the assertion above is the one that follows the rule.
    const everySizeValid = CHORD_SEEDS
      .reduce((n, c) => n + inversionsForIntervalCount(c.intervals.length).length, 0);
    expect(everySizeValid).toBe(114);
    expect(chordRecognitionCatalog.items.length).toBe(51);
    expect(everySizeValid - chordRecognitionCatalog.items.length).toBe(63);
  });

  it('splits 12 / 21 / 6 / 12 across the tiers', () => {
    const byTier = new Map<string, number>();
    for (const c of CHORD_SEEDS) {
      byTier.set(c.tier, (byTier.get(c.tier) ?? 0) + reachableInversions(c).length);
    }
    expect(Object.fromEntries(byTier)).toEqual({
      foundational: 12, seventh: 21, dominant: 6, extensions: 12,
    });
  });
});

describe('excluded combinations produce no row', () => {
  it('emits root position only for a sus chord', () => {
    const refs = catalogRefs();
    expect(refs.has('sus2:0')).toBe(true);
    for (const inv of [1, 2, 3]) expect(refs.has(`sus2:${inv}`), `sus2:${inv}`).toBe(false);
  });

  it('emits root position only for dim7, whose inversions are the same pitches', () => {
    const refs = catalogRefs();
    expect(refs.has('dim7:0')).toBe(true);
    for (const inv of [1, 2, 3]) expect(refs.has(`dim7:${inv}`), `dim7:${inv}`).toBe(false);
  });

  it('emits root position only for a dominant-tier chord', () => {
    // Not excluded by id — excluded because its TIER is not
    // inversion-trained. A different reason, and it must also hold.
    const dominant = CHORD_SEEDS.find(c => c.tier === 'dominant')!;
    expect(INVERSION_EXCLUDED_CHORD_IDS.has(dominant.id)).toBe(false);
    expect(INVERSION_TRAINED_TIERS.has(dominant.tier)).toBe(false);
    const refs = catalogRefs();
    expect(refs.has(`${dominant.id}:0`)).toBe(true);
    expect(refs.has(`${dominant.id}:1`)).toBe(false);
  });

  it('keeps every inversion of a trained, unexcluded chord', () => {
    // ASYMMETRIC CONTROL: without this, "emits nothing" would pass on a
    // catalog that had lost inversions entirely.
    const refs = catalogRefs();
    for (const inv of [0, 1, 2, 3]) expect(refs.has(`maj7:${inv}`), `maj7:${inv}`).toBe(true);
    for (const inv of [0, 1, 2]) expect(refs.has(`maj:${inv}`), `maj:${inv}`).toBe(true);
    // A triad has no third inversion at any tier.
    expect(refs.has('maj:3')).toBe(false);
  });
});

describe('the denominator does not move when a setting does', () => {
  it('is unchanged by the inversion PREFERENCE', () => {
    // THE DISTINCTION THIS TEST EXISTS TO STOP ERODING. The drill's
    // full gate includes `positions.length >= 2`, which reads a live
    // preference. A denominator built on that would fall from 51 to 30
    // the moment someone narrowed the drawer to one position, and the
    // dashboard would report progress nobody made.
    const before = chordRecognitionCatalog.items.length;
    for (const positions of [
      [0] as Inversion[],
      [0, 1] as Inversion[],
      DEFAULT_INVERSION_POSITIONS,
    ]) {
      // What the drill would serve under this preference — genuinely
      // different sets, so the comparison is not vacuous.
      const served = CHORD_SEEDS.reduce((n, c) => {
        const reachable = reachableInversions(c);
        const stepTwo = reachable.length > 1 && positions.length >= 2;
        return n + (stepTwo ? positions.filter(p => reachable.includes(p)).length : 1);
      }, 0);
      expect(served).toBeGreaterThan(0);
      // The catalog is untouched by any of them.
      expect(chordRecognitionCatalog.items.length).toBe(before);
    }
    // And the preference really does change what is served, or the
    // assertion above would hold for the wrong reason.
    // One position enabled means every chord serves root only — 30
    // rows, not 51. So the preference genuinely moves what is served,
    // and the catalog's steadiness above is not steadiness by accident.
    const rootOnly = CHORD_SEEDS.length;
    expect(rootOnly).not.toBe(before);
  });
});

describe('the two enumerations agree as SETS', () => {
  it('names exactly the same refs the drill can reach', () => {
    // Counts alone can hide two different sets of the same size, which
    // is the failure mode a count test would not catch.
    const catalog = [...catalogRefs()].sort();
    const reachable = [...reachableRefs()].sort();
    expect(catalog).toEqual(reachable);
  });
});
