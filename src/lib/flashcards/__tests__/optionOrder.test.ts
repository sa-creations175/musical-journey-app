/**
 * The shuffle: deterministic, and uniform over ALL orderings.
 *
 * The uniformity test is the one that matters. A seeded rotation passes
 * every other test in this file — it is deterministic, it is a
 * permutation, and it spreads the answer evenly across the four slots.
 * What it cannot do is reach more than four of the twenty-four
 * orderings, which is the property this deck actually needed.
 */
import { describe, expect, it } from 'vitest';
import { renderedOptions, shuffleSeeded } from '../optionOrder';

const OPTS = ['a', 'b', 'c', 'd'] as const;
const SEEDS = Array.from({ length: 4000 }, (_, i) => `card-${i}`);

describe('shuffleSeeded', () => {
  it('is deterministic for a given seed', () => {
    expect(shuffleSeeded(OPTS, 'nn-7')).toEqual(shuffleSeeded(OPTS, 'nn-7'));
  });

  it('gives different seeds different orderings', () => {
    // Not a permutation-quality claim — just that the seed is read at
    // all. A shuffle ignoring its seed would pass every other test.
    const orders = new Set(SEEDS.slice(0, 50).map(s => shuffleSeeded(OPTS, s).join('')));
    expect(orders.size).toBeGreaterThan(1);
  });

  it('keeps every element exactly once', () => {
    // ASYMMETRIC FIXTURE: repeated values would let a shuffle that drops
    // one element and duplicates another pass a sorted comparison.
    const items = ['x', 'yy', 'zzz', 'wwww'];
    for (const s of SEEDS.slice(0, 200)) {
      expect(shuffleSeeded(items, s).slice().sort()).toEqual([...items].sort());
    }
  });

  it('reaches all 24 orderings of four items, not 4', () => {
    // =================================================================
    // THIS IS WHY IT IS FISHER-YATES AND NOT A ROTATION.
    //
    // A rotation of four items reaches exactly four orderings — abcd,
    // bcda, cdab, dabc — and in every one of them the three decoys hold
    // a FIXED RELATIVE ORDER. That is a pattern a reader absorbs over a
    // few hundred reps without ever being able to state it, which is
    // the class of tell this deck has spent its history removing.
    //
    // 24 is asserted exactly. "More than 4" would pass for a shuffle
    // that reached 8 and left a subtler version of the same structure.
    // =================================================================
    const seen = new Set(SEEDS.map(s => shuffleSeeded(OPTS, s).join('')));
    expect(seen.size).toBe(24);
  });

  it('spreads each element across all four slots roughly evenly', () => {
    // The property the guard's bound assumes. Checked here on synthetic
    // seeds so a failure points at the shuffle rather than at a deck.
    const slots = [0, 0, 0, 0];
    for (const s of SEEDS) slots[shuffleSeeded(OPTS, s).indexOf('a')] += 1;
    for (const count of slots) {
      // ±20% of the 1000 expected. Wide, because this is asserting the
      // absence of a mechanism, not measuring a distribution.
      expect(count).toBeGreaterThan(SEEDS.length / 4 * 0.8);
      expect(count).toBeLessThan(SEEDS.length / 4 * 1.2);
    }
  });

  it('handles the degenerate lengths without special-casing them', () => {
    expect(shuffleSeeded([], 'x')).toEqual([]);
    expect(shuffleSeeded(['only'], 'x')).toEqual(['only']);
  });

  it('does not mutate its input', () => {
    const items = [...OPTS];
    shuffleSeeded(items, 'seed');
    expect(items).toEqual([...OPTS]);
  });
});

describe('renderedOptions', () => {
  it('puts the answer somewhere other than always first', () => {
    // The bug, stated at its smallest. The old comparator keyed on one
    // character with a stable sort, so options sharing a first letter
    // tied and fell back to input order — answer first, every time.
    const tied = SEEDS.slice(0, 200).map(s =>
      renderedOptions(s, 'A Aeolian', ['A Dorian', 'A Locrian', 'A Phrygian']));
    const first = tied.filter(o => o[0] === 'A Aeolian').length;
    expect(first).toBeLessThan(tied.length);
    expect(first).toBeGreaterThan(0);
  });

  it('is seeded on the id, so a re-render shows the same order', () => {
    const a = renderedOptions('pr-3', 'I–V–vi–IV', ['I–vi–IV–V', 'vi–IV–I–V', 'IV–I–V–vi']);
    const b = renderedOptions('pr-3', 'I–V–vi–IV', ['I–vi–IV–V', 'vi–IV–I–V', 'IV–I–V–vi']);
    expect(a).toEqual(b);
  });
});
