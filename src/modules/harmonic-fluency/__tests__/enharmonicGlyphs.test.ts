/**
 * The Enharmonic Equivalents cards write ♭ and ♯ (Silas, 14 Sep 2026).
 *
 * The text changes; the card does not. Ids, axes and skill tags keep their
 * stored spellings, because the facet chips, the grid's columns and the
 * card's sound are keyed by them.
 */
import { describe, expect, it } from 'vitest';
import { ENHARMONIC_SPELLINGS, FLASHCARDS } from '../catalog';

const cards = FLASHCARDS.filter(c => c.category === 'enharmonic-equivalents');

describe('the Enharmonic Equivalents cards', () => {
  it('are the same thirty-five, under the same ids', () => {
    expect(cards).toHaveLength(35);
    expect(cards.map(c => c.id)).toEqual([
      ...Array.from({ length: 18 }, (_, i) => `enh-n-${i + 1}`),
      ...Array.from({ length: 17 }, (_, i) => `enh-i-${i + 19}`),
    ]);
  });

  it('write ♭ and ♯, never b and #, in question, answer, decoys and explanation', () => {
    for (const c of cards) {
      for (const text of [c.question, c.correctAnswer, ...c.decoys, c.explanation ?? '']) {
        expect(text, c.id).not.toContain('#');
        expect(text, c.id).not.toMatch(/(^|[^A-Za-z])[A-G]b(?![a-z])/);
        expect(text, c.id).not.toMatch(/(^|[^A-Za-z])b\d/);
      }
    }
  });

  it('keep the stored spellings on the axis, which the chips and the grid read', () => {
    expect(new Set(cards.map(c => String(c.axis!.spelling)))).toEqual(new Set(ENHARMONIC_SPELLINGS));
    expect(cards.find(c => c.question === 'Enharmonic equivalent of A♭?')!.axis!.spelling).toBe('Ab');
    expect(cards.find(c => c.question === 'Enharmonic equivalent of ♯4?')!.correctAnswer).toBe('♭5 / ♯11');
  });
});
