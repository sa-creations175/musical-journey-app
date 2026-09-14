/**
 * Every Diatonic Chord Qualities card reveals the chart, on its own cell.
 *
 * =====================================================================
 * THE DECK AND THE CHART MUST AGREE, SO THIS JOINS THEM.
 *
 * The deck's answers and the chart's cells are two derivations of the
 * same fact. A card opening on a cell whose chord is not the card's
 * answer would contradict the answer it has just shown — so every
 * degree card is walked to its cell and the symbols compared.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import { FLASHCARDS } from '../catalog';
import { diatonicCell } from '../diatonicCell';
import { seventhOn } from '../../../lib/chordQualitiesByScale';

const SOURCES: Record<string, string> = import.meta.glob(
  ['../HarmonicFluencySession.tsx', '../../harmonic-diary/HarmonicDiary.tsx'],
  { eager: true, query: '?raw', import: 'default' },
);
const source = (suffix: string) => Object.entries(SOURCES).find(([p]) => p.endsWith(suffix))![1];

const DECK = FLASHCARDS.filter(c => c.category === 'diatonic-qualities');

describe('each card opens on its own cell', () => {
  it('finds a cell for every card in the deck', () => {
    for (const card of DECK) expect(diatonicCell(card), card.id).not.toBeNull();
  });

  it('lands every degree card on the chord it answers', () => {
    for (const card of DECK) {
      const symbol = card.correctAnswer.match(/\(([^)]+)\)$/)?.[1];
      if (symbol === undefined) continue;
      const cell = diatonicCell(card)!;
      expect(seventhOn(cell.scale, cell.degree).symbol, card.id).toBe(symbol);
    }
  });

  it('opens nothing for a card from another deck', () => {
    for (const card of FLASHCARDS.filter(c => c.category !== 'diatonic-qualities').slice(0, 50)) {
      expect(diatonicCell(card), card.id).toBeNull();
    }
  });
});

describe('where the chart is drawn', () => {
  it('is the reveal, through the ungated footer, folded', () => {
    const src = source('HarmonicFluencySession.tsx');
    expect(src).toContain('<ChordQualitiesChart');
    expect(src).toContain('diatonicCell(card)');
    expect(src).toMatch(/<ChordQualitiesChart[^>]*modesFolded/);
  });

  it('has a second door at the top of the diary, beside the naming link', () => {
    const src = source('HarmonicDiary.tsx');
    expect(src).toMatch(/<ChordNamingInfo variant="link" \/>\s*<ChordQualitiesLink \/>/);
  });
});
