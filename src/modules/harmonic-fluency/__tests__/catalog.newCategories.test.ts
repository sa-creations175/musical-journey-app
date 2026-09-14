import { describe, it, expect } from 'vitest';
import { CATEGORY_LABELS, CATEGORY_ORDER, cardsByCategory } from '../catalog';

describe('HF new categories — Enharmonic Equivalents', () => {
  const cards = cardsByCategory('enharmonic-equivalents');

  it('registers the category (label + order)', () => {
    expect(CATEGORY_LABELS['enharmonic-equivalents']).toBe('Enharmonic Equivalents');
    expect(CATEGORY_ORDER).toContain('enharmonic-equivalents');
  });

  it('has 35 cards (9 note pairs ×2 + 4 two-way ×2 + 3 three-way ×3)', () => {
    expect(cards).toHaveLength(35);
  });

  it('note + interval equivalents drill both directions (incl. three-way)', () => {
    const byQ = (q: string) => cards.find(c => c.question === q);
    expect(byQ('Enharmonic equivalent of A♭?')?.correctAnswer).toBe('G♯');
    expect(byQ('Enharmonic equivalent of G♯?')?.correctAnswer).toBe('A♭');
    // Two-way interval pair.
    expect(byQ('Enharmonic equivalent of 2?')?.correctAnswer).toBe('9');
    expect(byQ('Enharmonic equivalent of 9?')?.correctAnswer).toBe('2');
    // Three-way: the answer lists both alternates.
    expect(byQ('Enharmonic equivalent of ♯4?')?.correctAnswer).toBe('♭5 / ♯11');
    expect(byQ('Enharmonic equivalent of ♭5?')?.correctAnswer).toBe('♯4 / ♯11');
  });

  it('every card has a correct answer + 3 decoys that exclude it', () => {
    for (const c of cards) {
      expect(c.category).toBe('enharmonic-equivalents');
      expect(c.correctAnswer.length).toBeGreaterThan(0);
      expect(c.decoys).toHaveLength(3);
      expect(c.decoys).not.toContain(c.correctAnswer);
    }
  });
});
