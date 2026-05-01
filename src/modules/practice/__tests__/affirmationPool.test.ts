/**
 * Phase 3 Step 4h — affirmation pool helper tests.
 */
import { describe, expect, it } from 'vitest';
import { cleanAffirmationPool, pickRandomAffirmation } from '../affirmationPool';

describe('pickRandomAffirmation', () => {
  it('returns null for empty pool', () => {
    expect(pickRandomAffirmation([])).toBeNull();
  });

  it('always returns the only entry for a single-item pool', () => {
    expect(pickRandomAffirmation(['I am steady.'])).toBe('I am steady.');
  });

  it('honors an injected rng deterministically', () => {
    const pool = ['a', 'b', 'c', 'd'];
    expect(pickRandomAffirmation(pool, () => 0)).toBe('a');
    expect(pickRandomAffirmation(pool, () => 0.5)).toBe('c');
    expect(pickRandomAffirmation(pool, () => 0.9999)).toBe('d');
  });

  it('clamps an rng of 1.0 to the last entry (not out-of-bounds)', () => {
    expect(pickRandomAffirmation(['x', 'y'], () => 1)).toBe('y');
  });
});

describe('cleanAffirmationPool', () => {
  it('drops null / undefined / blank entries', () => {
    expect(
      cleanAffirmationPool(['I am here.', '', '   ', null, undefined, 'I can grow.']),
    ).toEqual(['I am here.', 'I can grow.']);
  });

  it('trims whitespace around entries', () => {
    expect(cleanAffirmationPool(['  hello  '])).toEqual(['hello']);
  });

  it('empty input → empty output', () => {
    expect(cleanAffirmationPool([])).toEqual([]);
  });
});
