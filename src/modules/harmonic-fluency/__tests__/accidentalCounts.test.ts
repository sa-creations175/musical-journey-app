/**
 * "G major has _____ sharps" — twelve hand-written cards, hand-counted
 * decoys, and the same defect scale-degree math had.
 *
 * ---------------------------------------------------------------
 * SIX FAILED AND TWELVE WERE CONVERTED, WHICH IS THE POINT.
 *
 * ks-2, ks-3, ks-4, ks-8, ks-9 and ks-10 listed the answer flanked —
 * 1 against 2, 0 and 3 — so three options were consecutive and the
 * answer sat between them. The other six were clean by luck: nobody
 * applied a rule to them, their hand-counted decoys simply happened not
 * to form a run. Converting only the six that tripped would leave the
 * other six one edit away from tripping.
 * ---------------------------------------------------------------
 */
import { describe, expect, it } from 'vitest';
import { FLASHCARDS } from '../catalog';
import { BLIND_RULES, rankTarget, sortedRank } from '../decoyGuard';

const COUNT_CARDS = FLASHCARDS.filter(
  c => c.category === 'key-signatures' && /^\d$/.test(c.correctAnswer),
);
const DECOY_COUNT = 3;
const HIGHEST = 7;

describe('the accidental-count cards', () => {
  it('covers all twelve', () => {
    expect(COUNT_CARDS.map(c => c.id)).toEqual([
      'ks-1', 'ks-2', 'ks-3', 'ks-4', 'ks-5', 'ks-6',
      'ks-7', 'ks-8', 'ks-9', 'ks-10', 'ks-11', 'ks-12',
    ]);
  });

  it('puts every answer at the rank its identity asked for', () => {
    for (const card of COUNT_CARDS) {
      const n = Number(card.correctAnswer);
      const wanted = rankTarget(
        card.id,
        Math.max(0, DECOY_COUNT - (HIGHEST - n)),
        Math.min(DECOY_COUNT, n),
      );
      expect(sortedRank(card.correctAnswer, card.decoys)).toBe(wanted);
    }
  });

  it('never lets the answer be the middle of three consecutive', () => {
    const rule = BLIND_RULES.find(r => r.id === 'middle-of-3')!;
    const caught = COUNT_CARDS.filter(
      c => rule.pick([c.correctAnswer, ...c.decoys]) === c.correctAnswer,
    );
    expect(caught.map(c => c.id)).toEqual([]);
  });

  it('names only counts a key signature can actually have', () => {
    // Seven is real — C♯ major has seven sharps — and eight is not.
    for (const card of COUNT_CARDS) {
      for (const d of card.decoys) {
        expect(Number(d)).toBeGreaterThanOrEqual(0);
        expect(Number(d)).toBeLessThanOrEqual(HIGHEST);
      }
      expect(new Set(card.decoys).size).toBe(DECOY_COUNT);
      expect(card.decoys).not.toContain(card.correctAnswer);
    }
  });

  it('uses more than one rank across the family', () => {
    const used = new Set(COUNT_CARDS.map(c => sortedRank(c.correctAnswer, c.decoys)));
    expect(used.size).toBeGreaterThan(1);
  });

  it('leaves the questions and explanations alone', () => {
    // The conversion replaced decoys and nothing else. These two are
    // the copy that would go missing if it ever became a rewrite.
    const g = COUNT_CARDS.find(c => c.id === 'ks-2')!;
    expect(g.question).toBe('G major has _____ sharps');
    expect(g.explanation).toContain('G major has one sharp: F#');
    const eb = COUNT_CARDS.find(c => c.id === 'ks-10')!;
    expect(eb.question).toBe('Eb major has _____ flats');
    expect(eb.explanation).toContain('Bb, Eb, Ab');
  });
});
