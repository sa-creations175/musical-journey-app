/**
 * Scales & Modes is one family (Silas, 14 Sep 2026; walked in
 * `hf-home-groups-prototype.html`).
 *
 * Pentatonic Scales folded into Mode Identification under the id `modes`.
 * What moved is the family; what did not move is every card — its id, its
 * answer surface, its sound — and the meaning of a goal set before.
 */
import { describe, expect, it } from 'vitest';
import { CATEGORY_LABELS, CATEGORY_ORDER, FLASHCARDS } from '../catalog';
import { cardKind, isPentatonicCard, RETIRED_CATEGORY_HOME } from '../cardKind';
import { harmonicFluencyCards } from '../homeCards';
import { builtTargetFor } from '../builtAnswers/cardTargets';
import { cardSound } from '../cardAudio';
import { offerableFacets } from '../facetFilter';
import { HARMONIC_FLUENCY_GROUPS, hfUnitHoldsCard } from '../coverageGroups';
import { harmonicFluencyCounts } from '../../../lib/moduleItemCounts';

const family = FLASHCARDS.filter(c => c.category === 'modes');
const pent = FLASHCARDS.filter(isPentatonicCard);

describe('the family', () => {
  it('is 139 cards under one id, named Scales & Modes', () => {
    expect(family).toHaveLength(139);
    expect(pent).toHaveLength(38);
    expect(pent.every(c => c.category === 'modes')).toBe(true);
    expect(CATEGORY_LABELS.modes).toBe('Scales & Modes');
    expect(harmonicFluencyCounts().byCategory.modes).toBe(139);
  });

  it('names every one of its cards by the family', () => {
    expect(new Set(family.map(c => c.categoryName))).toEqual(new Set(['Scales & Modes']));
  });

  it('is one home card, one chip, and in one group', () => {
    expect(CATEGORY_ORDER).not.toContain('pentatonic-scales');
    expect(CATEGORY_ORDER.filter(c => c === 'modes')).toHaveLength(1);
    const card = harmonicFluencyCards([], new Map(), Date.now()).find(c => c.key === 'modes')!;
    expect(card.label).toBe('Scales & Modes');
    expect(card.itemCount).toBe(139);
    const holding = HARMONIC_FLUENCY_GROUPS.filter(g => g.categories.includes('modes'));
    expect(holding.map(g => g.unit)).toEqual(['notes-degrees-scales-keys']);
    expect(HARMONIC_FLUENCY_GROUPS.flatMap(g => g.categories)).not.toContain('pentatonic-scales');
  });

  it('offers the union of both families’ facet chips', () => {
    const offered = offerableFacets(family);
    for (const name of ['key', 'degree', 'note', 'pentatonic'] as const) {
      expect(offered, name).toContain(name);
    }
  });
});

describe('the cards did not change', () => {
  it('keeps every pentatonic id', () => {
    expect(pent.every(c => /^pent-(notes-(minor|major)|lick)-/.test(c.id))).toBe(true);
  });

  it('builds every pentatonic card on the keyboard and no mode card', () => {
    expect(pent.every(c => builtTargetFor(c)?.kind === 'scale')).toBe(true);
    expect(family.filter(c => !isPentatonicCard(c)).some(c => builtTargetFor(c) !== null))
      .toBe(false);
  });

  it('plays a pentatonic card as five notes and a mode card as seven over a pedal', () => {
    for (const c of pent) {
      const s = cardSound(c);
      expect(s?.steps, c.id).toHaveLength(5);
      expect(s?.pedal, c.id).toBeUndefined();
    }
    const mode = family.find(c => cardKind(c) === 'modes' && c.axis !== undefined)!;
    expect(cardSound(mode)?.pedal).toBe(-12);
  });
});

describe('what was stored against the old families', () => {
  it('resolves a goal or link naming either family to Scales & Modes', () => {
    expect(RETIRED_CATEGORY_HOME['pentatonic-scales']).toBe('modes');
    expect(RETIRED_CATEGORY_HOME.modes).toBeUndefined();
  });

  it('keeps a retired unit counting the cards it held that day', () => {
    // Foundational held Pentatonic Scales; Ear & Recognition held Mode
    // Identification. Neither gains or loses a card by the fold.
    const foundational = FLASHCARDS.filter(c => hfUnitHoldsCard('foundational', c));
    const ear = FLASHCARDS.filter(c => hfUnitHoldsCard('ear-recognition', c));
    expect(foundational.filter(isPentatonicCard)).toHaveLength(38);
    expect(ear.filter(isPentatonicCard)).toHaveLength(0);
    expect(ear.filter(c => c.category === 'modes')).toHaveLength(101);
  });

  it('counts a live unit by the family', () => {
    const live = FLASHCARDS.filter(c => hfUnitHoldsCard('notes-degrees-scales-keys', c));
    expect(live.filter(c => c.category === 'modes')).toHaveLength(139);
  });
});
