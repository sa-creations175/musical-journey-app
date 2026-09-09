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

// GENERATED SINCE COMMIT 8, and the derivation moved with them: the
// hand-written twelve retired and thirteen took their place, G♭ major
// included. The claims below are unchanged — they were always about the
// derivation rather than about which twelve cards used it.
const COUNT_CARDS = FLASHCARDS.filter(c => c.id.startsWith('ks-count-'));
const DECOY_COUNT = 3;
const HIGHEST = 7;

describe('the accidental-count cards', () => {
  it('covers all thirteen', () => {
    // F♯ major and G♭ major are two keys with two answers — six sharps
    // and six flats — which is the clearest place in the deck that
    // ruling 40 is a musical claim rather than a spelling preference.
    expect(COUNT_CARDS).toHaveLength(13);
    const bySix = COUNT_CARDS.filter(c => c.correctAnswer === '6');
    expect(bySix.map(c => c.question).sort()).toEqual([
      'F♯ major has _____ sharps',
      'G♭ major has _____ flats',
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

  it('asks what it always asked, and names the accidentals it counts', () => {
    // The question wording is the hand-written cards' own, generated.
    // The explanation now DERIVES which accidentals rather than listing
    // them per key — the first n of the one order the deck teaches on
    // `ks-21` and `ks-22`.
    const g = COUNT_CARDS.find(c => c.id === 'ks-count-G')!;
    expect(g.question).toBe('G major has _____ sharps');
    expect(g.explanation).toContain('G major has 1 sharp: F♯');
    const eb = COUNT_CARDS.find(c => c.id === 'ks-count-Eb')!;
    expect(eb.question).toBe('E♭ major has _____ flats');
    expect(eb.explanation).toContain('B♭ E♭ A♭');
  });
});
