import { describe, it, expect } from 'vitest';
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  cardsByCategory,
} from '../catalog';

describe('HF new categories — Tritone Pairs', () => {
  const cards = cardsByCategory('tritone-pairs');

  it('registers the category (label + order)', () => {
    expect(CATEGORY_LABELS['tritone-pairs']).toBe('Tritone Pairs');
    expect(CATEGORY_ORDER).toContain('tritone-pairs');
  });

  it('has 12 cards (6 pairs × both directions)', () => {
    expect(cards).toHaveLength(12);
  });

  it('every card is a "Tritone of …?" with a correct answer + 3 decoys', () => {
    for (const c of cards) {
      expect(c.category).toBe('tritone-pairs');
      expect(c.question.startsWith('Tritone of ')).toBe(true);
      expect(c.correctAnswer.length).toBeGreaterThan(0);
      expect(c.decoys).toHaveLength(3);
      // No decoy is the correct answer (would make MC unfair).
      expect(c.decoys).not.toContain(c.correctAnswer);
    }
  });

  it('is its own inverse — C↔F# both directions', () => {
    const byQ = (q: string) => cards.find(c => c.question === q);
    expect(byQ('Tritone of C?')?.correctAnswer).toBe('F#');
    expect(byQ('Tritone of F#?')?.correctAnswer).toBe('C');
  });
});

describe('HF new categories — Enharmonic Equivalents', () => {
  const cards = cardsByCategory('enharmonic-equivalents');

  it('registers the category (label + order)', () => {
    expect(CATEGORY_LABELS['enharmonic-equivalents']).toBe('Enharmonic Equivalents');
    expect(CATEGORY_ORDER).toContain('enharmonic-equivalents');
  });

  it('has 30 cards (9 note pairs + 6 interval pairs, both directions)', () => {
    expect(cards).toHaveLength(30);
  });

  it('note + interval equivalents drill both directions', () => {
    const byQ = (q: string) => cards.find(c => c.question === q);
    expect(byQ('Enharmonic equivalent of Ab?')?.correctAnswer).toBe('G#');
    expect(byQ('Enharmonic equivalent of G#?')?.correctAnswer).toBe('Ab');
    expect(byQ('Enharmonic equivalent of #5?')?.correctAnswer).toBe('b6');
    expect(byQ('Enharmonic equivalent of b6?')?.correctAnswer).toBe('#5');
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
