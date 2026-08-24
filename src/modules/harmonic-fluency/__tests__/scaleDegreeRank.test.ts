/**
 * The answer's position among the options must not be the answer.
 *
 * ---------------------------------------------------------------
 * A BAN WOULD HAVE BEEN THE SAME BUG WEARING A DIFFERENT TELL.
 *
 * These 84 cards drew answer−1, answer+1 and an outlier, so the answer
 * was the middle of three consecutive numbers on 52 of them. The
 * obvious fix — forbid that shape — pushes every answer to an end, and
 * "never the middle" is just as learnable as "always the middle".
 *
 * So the target rank is DERIVED FROM THE CARD and cycles, and this
 * asserts the derivation rather than the tidiness of the result: the
 * rank each card achieves is the rank `rankTarget` asked for, given
 * what that card's answer could reach.
 * ---------------------------------------------------------------
 */
import { describe, expect, it } from 'vitest';
import { FLASHCARDS } from '../catalog';
import { BLIND_RULES, rankTarget, sortedRank } from '../decoyGuard';

// The ORIGINAL 84, by id shape. The category also holds the 168
// quality-carrying cards now, whose decoys are constrained differently
// — they must show the same degree number as the answer, so a rank
// target would fight that. Their leak-freeness is asserted in
// scaleDegreeQualityCards.test.ts instead.
const SDM = FLASHCARDS.filter(
  c => c.category === 'scale-degree-math' && /^sdm-\d-(up|down)-\d(nd|rd|th)$/.test(c.id),
);
const DECOY_COUNT = 3;

/** The window of ranks an answer can physically reach: `ans − 1`
 *  degrees sit below it, `7 − ans` above. */
const window = (ans: number) => ({
  low: Math.max(0, DECOY_COUNT - (7 - ans)),
  high: Math.min(DECOY_COUNT, ans - 1),
});

describe('scale-degree math rank rotation', () => {
  it('generates all 84 cards', () => {
    expect(SDM.length).toBe(84);
  });

  it('puts every answer at the rank its identity asked for', () => {
    for (const card of SDM) {
      const ans = Number(card.correctAnswer);
      const { low, high } = window(ans);
      expect(sortedRank(card.correctAnswer, card.decoys))
        .toBe(rankTarget(card.id, low, high));
    }
  });

  it('never lets the answer be the middle of three consecutive', () => {
    const rule = BLIND_RULES.find(r => r.id === 'middle-of-3')!;
    const caught = SDM.filter(
      c => rule.pick([c.correctAnswer, ...c.decoys]) === c.correctAnswer,
    );
    expect(caught.map(c => c.id)).toEqual([]);
  });

  it('uses every rank, so "never the middle" is not the new rule', () => {
    const used = new Set(SDM.map(c => sortedRank(c.correctAnswer, c.decoys)));
    expect([...used].sort()).toEqual([0, 1, 2, 3]);
  });

  it('spreads the ranks rather than favouring one', () => {
    // Not uniform, and it cannot be: answers of 1, 2, 6 and 7 have a
    // narrowed window. This asserts no rank runs away with the
    // category — a rank holding half the cards would be learnable.
    const counts = [0, 0, 0, 0];
    for (const c of SDM) counts[sortedRank(c.correctAnswer, c.decoys)]++;
    expect(Math.max(...counts)).toBeLessThan(SDM.length / 2);
    expect(Math.min(...counts)).toBeGreaterThan(0);
  });

  it('keeps the decoys to real scale degrees', () => {
    for (const card of SDM) {
      for (const d of card.decoys) {
        expect(Number(d)).toBeGreaterThanOrEqual(1);
        expect(Number(d)).toBeLessThanOrEqual(7);
      }
      expect(new Set(card.decoys).size).toBe(DECOY_COUNT);
      expect(card.decoys).not.toContain(card.correctAnswer);
    }
  });

  it('still prefers the opposite-direction degree where it can', () => {
    // The most instructive wrong answer — what you get for reading the
    // arrow backwards.
    //
    // IT SURVIVES ON EXACTLY HALF THE CARDS, AND THAT IS THE PRICE.
    // The opposite-direction degree sits on a fixed side of the answer,
    // so when the card's target rank needs decoys on the other side it
    // has to go. Biasing the rank to keep it would make rank correlate
    // with direction, which is a tell again. 42 of 84 measured; the
    // assertion is that it does not fall below half.
    const wrap = (n: number) => ((n - 1) % 7 + 7) % 7 + 1;
    let kept = 0;
    for (const card of SDM) {
      const m = /^sdm-(\d)-(up|down)-(\d)/.exec(card.id);
      if (m === null) continue;
      const startDeg = Number(m[1]);
      const step = Number(m[3]) - 1;
      const delta = m[2] === 'up' ? step : -step;
      if (card.decoys.includes(String(wrap(startDeg - delta)))) kept++;
    }
    expect(kept).toBeGreaterThanOrEqual(SDM.length / 2);
  });
});
