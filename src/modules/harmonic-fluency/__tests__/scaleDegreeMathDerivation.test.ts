/**
 * The shortcut's presence follows the PAIRING RULE, not a list.
 *
 * ---------------------------------------------------------------
 * WHY THIS NEEDS ITS OWN FILE AND A MOCK.
 *
 * `invertsSmaller(n)` is true for 5, 6 and 7. So is `[5,6,7].includes(n)`.
 * The two are indistinguishable while `INTERVAL_PAIR_SUM` is 9 — which
 * is exactly when nobody notices the decision stopped being derived.
 *
 * So this moves the constant to a value it has never had and asserts
 * that WHICH CARDS carry the line moves with it. A hardcoded list fails
 * here and cannot be made to pass without reading the rule.
 *
 * At a pair sum of 7, the pairs are 2↔5, 3↔4, and inverting is smaller
 * only for 4, 5, 6 and 7 — a different set from [5,6,7], with the 4
 * gaining a shortcut and nothing losing one.
 * ---------------------------------------------------------------
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../intervalInversion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../intervalInversion')>();
  const SUM = 7;
  return {
    ...actual,
    INTERVAL_PAIR_SUM: SUM,
    invertedOrdinal: (n: number) => SUM - n,
    invertsSmaller: (n: number) => SUM - n < n,
  };
});

const { FLASHCARDS } = await import('../catalog');

const ordinalOf = (q: string) => Number(q.match(/a (\d)(?:nd|rd|th)/)![1]);

describe('with the pairing constant moved to 7', () => {
  // The ORIGINAL 84 only. The category also holds the 168
  // quality-carrying cards, whose questions read "a minor 6th" rather
  // than "a 6th" — `ordinalOf` cannot parse those, and the inversion
  // shortcut this file is about is not part of their method.
  const CARDS = FLASHCARDS.filter(
    c => c.category === 'scale-degree-math' && /^sdm-\d-(up|down)-\d(nd|rd|th)$/.test(c.id),
  );

  it('the 4th GAINS a shortcut, because 7 − 4 = 3 is now smaller', () => {
    const fourths = CARDS.filter(c => ordinalOf(c.question) === 4);
    expect(fourths.length).toBeGreaterThan(0);
    for (const c of fourths) expect(c.explanation, c.id).toContain('Shortcut:');
  });

  it('the set carrying a shortcut follows the rule, not [5,6,7]', () => {
    const carrying = new Set(CARDS
      .filter(c => (c.explanation ?? '').includes('Shortcut:'))
      .map(c => ordinalOf(c.question)));
    // 7 − n < n holds for 4, 5, 6, 7 — not the [5,6,7] a literal list
    // would still be producing.
    expect([...carrying].sort()).toEqual([4, 5, 6, 7]);
  });

  it('and the inverted interval named in the line follows too', () => {
    // A 6th inverts to a 1st at this sum — nonsense musically, which is
    // the point: the text is reading the constant, not a table.
    const fifth = CARDS.find(c => ordinalOf(c.question) === 5)!;
    expect(fifth.explanation).toContain('a 2nd');
  });
});
