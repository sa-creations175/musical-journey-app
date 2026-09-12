/**
 * The goals count and the dashboard denominator, held together.
 *
 * =====================================================================
 * COMPARING THE TWO DERIVATIONS, NOT BOTH AGAINST 51.
 *
 * Asserting each equals 51 would pass on two independent hand-written
 * 51s — which is exactly the state this fixes, one step later. What has
 * to be true is that they come from the same place, so the test
 * compares them to each other and then proves they MOVE together.
 * =====================================================================
 */
import { afterEach, describe, expect, it } from 'vitest';
import { earTrainingCounts } from '../moduleItemCounts';
import { chordRecognitionCatalog } from '../../modules/dashboard/read/catalogs';
import { CHORD_SEEDS } from '../../modules/ear-training/chord-recognition/seed';
import {
  INVERSION_EXCLUDED_CHORD_IDS, reachableChordRefs,
} from '../../modules/ear-training/chord-recognition/inversionUtils';

/** The exclusion set is a live Set; a test that widens it must put it
 *  back, or every later test in the run sees a different catalog. */
const originallyExcluded = [...INVERSION_EXCLUDED_CHORD_IDS];
afterEach(() => {
  const live = INVERSION_EXCLUDED_CHORD_IDS as Set<string>;
  live.clear();
  for (const id of originallyExcluded) live.add(id);
});

describe('the two counts agree', () => {
  it('gives the goals layer the dashboard’s reachable denominator', () => {
    expect(earTrainingCounts().chordRecognition)
      .toBe(chordRecognitionCatalog.items.length);
  });

  it('counts root positions plus reachable inversions', () => {
    // The arithmetic stated once so a reader can check it — 27 roots
    // plus 21 non-root, all of them triads and sevenths.
    const refs = reachableChordRefs(CHORD_SEEDS);
    const roots = refs.filter(r => r.endsWith(':0'));
    const nonRoot = refs.filter(r => !r.endsWith(':0'));
    expect(roots).toHaveLength(CHORD_SEEDS.length);
    expect(roots).toHaveLength(27);
    expect(nonRoot).toHaveLength(21);
    expect(earTrainingCounts().chordRecognition).toBe(48);
  });

  it('draws no non-root row from dominant or extension tiers', () => {
    const byId = new Map(CHORD_SEEDS.map(c => [c.id, c]));
    for (const ref of reachableChordRefs(CHORD_SEEDS)) {
      const [id, inv] = ref.split(':');
      if (inv === '0') continue;
      const tier = byId.get(id)!.tier;
      expect(['foundational', 'seventh'], ref).toContain(tier);
    }
  });
});

describe('widening an exclusion moves both numbers', () => {
  it('drops the goals count and the shared enumeration together', () => {
    // THE PROPERTY THAT STOPS THEM DRIFTING APART AGAIN.
    const beforeGoals = earTrainingCounts().chordRecognition;
    const beforeRefs = reachableChordRefs(CHORD_SEEDS).length;
    expect(beforeGoals).toBe(beforeRefs);

    // maj7 is inversion-trained and has four positions, so excluding it
    // removes exactly three non-root rows. ASYMMETRIC: a chord with a
    // different number of inversions would move the total by a
    // different amount, which is what makes the delta meaningful.
    (INVERSION_EXCLUDED_CHORD_IDS as Set<string>).add('maj7');

    const afterGoals = earTrainingCounts().chordRecognition;
    const afterRefs = reachableChordRefs(CHORD_SEEDS).length;
    expect(afterGoals).toBe(afterRefs);
    expect(beforeGoals - afterGoals).toBe(3);
  });

  it('narrowing the exclusions moves them up together', () => {
    // The other direction, because a shared function could in principle
    // be shared for shrinking and not for growing.
    (INVERSION_EXCLUDED_CHORD_IDS as Set<string>).delete('dim7');
    const goals = earTrainingCounts().chordRecognition;
    const refs = reachableChordRefs(CHORD_SEEDS).length;
    expect(goals).toBe(refs);
    // dim7 is a four-note seventh: three non-root rows return.
    expect(goals).toBe(48 + 3);
  });

  it('is the same function the dashboard catalog is built from', () => {
    // `chordRecognitionCatalog` is a module-level const, so it cannot be
    // rebuilt mid-test to watch it move. What CAN be asserted is that
    // its rows are exactly the shared enumeration — so anything that
    // moves the enumeration moves the catalog on the next load, and no
    // second rule sits between them.
    const catalog = [...chordRecognitionCatalog.items.flatMap(i => i.itemRefs)].sort();
    const shared = [...reachableChordRefs(CHORD_SEEDS)].sort();
    expect(catalog).toEqual(shared);
  });
});
