/**
 * The Progression chips, and the card they filter to.
 *
 * =====================================================================
 * THE CHIP AND THE QUESTION ARE THE SAME PROGRESSION, SO THEY ARE THE
 * SAME STRING.
 *
 * The chip said "1 5 6 4" and the card's question said "1 · 5 · 6m · 4"
 * — one filter, one card, two spellings, and the chip was the one that
 * did not say the 6 is minor. Silas's ruling of 10 Sep 2026: one
 * spelling everywhere, chips included.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import { facetValueLabel } from '../facetDisplay';
import { FLASHCARDS } from '../catalog';
import { respellProgressionCard } from '../catalogExpansions';
import {
  DEFAULT_PROGRESSION_SPELLING, type ProgressionSpelling,
} from '../../../lib/progressionSpelling';

const chip = (v: string, s?: ProgressionSpelling) =>
  facetValueLabel('progression', v, s);

describe('a chip that is a progression is built from its chords', () => {
  it('reads the defaults the way the ruling names them', () => {
    expect(chip('1-5-6-4')).toBe('1-5-6m-4');
    expect(chip('1-6-4-5')).toBe('1-6m-4-5');
    expect(chip('1-6-2-5')).toBe('1-6m-2m-5');
    expect(chip('1-4-5')).toBe('1-4-5');
    expect(chip('backdoor')).toBe('4m-♭7-1 (backdoor)');
  });

  it('follows the separator, like everything else', () => {
    const dots: ProgressionSpelling = {
      ...DEFAULT_PROGRESSION_SPELLING, separator: 'dot',
    };
    expect(chip('1-5-6-4', dots)).toBe('1 · 5 · 6m · 4');
    expect(chip('backdoor', dots)).toBe('4m · ♭7 · 1 (backdoor)');
  });

  it("keeps the backdoor's borrowed 4 on 'only on spelled loops'", () => {
    const spelled: ProgressionSpelling = {
      ...DEFAULT_PROGRESSION_SPELLING, qualities: 'spelled',
    };
    // Named — its parenthetical is its name — so the other chords lose
    // their qualities and the borrowed 4 does not.
    expect(chip('backdoor', spelled)).toBe('4m-♭7-1 (backdoor)');
    // And an unnamed loop keeps all of them.
    expect(chip('1-5-6-4', spelled)).toBe('1-5-6m-4');
  });

  it('drops every quality on "off", the backdoor included', () => {
    const off: ProgressionSpelling = {
      ...DEFAULT_PROGRESSION_SPELLING, qualities: 'off',
    };
    expect(chip('1-5-6-4', off)).toBe('1-5-6-4');
    expect(chip('backdoor', off)).toBe('4-♭7-1 (backdoor)');
  });
});

describe('a chip that is a word stays a word', () => {
  it('leaves 2 5 1 and the secondary dominants alone', () => {
    // `ii-V-I` is Functional Harmony's chip as well as this deck's —
    // ruling 26 made the two share it — and "5 of 2" is not a row.
    expect(chip('ii-V-I')).toBe('2 5 1');
    expect(chip('V/ii')).toBe('5 of 2');
    expect(chip('V/vi')).toBe('5 of 6');
    expect(chip('gospel walk-up')).toBe('gospel walk-up');
  });
});

describe('the chip and the card it filters to agree', () => {
  it('spells the progression the same way in both places', () => {
    // THE ASSERTION THE FILE EXISTS FOR. For every facet with chords
    // behind it, the chip's row appears verbatim inside the question of
    // every card that facet selects.
    for (const facet of ['1-5-6-4', '1-6-4-5', '1-6-2-5', '1-4-5', 'backdoor']) {
      const cards = FLASHCARDS.filter(
        c => c.id.startsWith('pr-prog-') && c.axis?.shape === facet);
      expect(cards.length, facet).toBe(13);
      // The chip drops the backdoor's parenthetical to compare the row
      // itself, which is the part the question also carries.
      const row = chip(facet).replace(' (backdoor)', '');
      for (const card of cards) {
        const shown = respellProgressionCard(card)?.question ?? card.question;
        expect(shown, `${card.id} / ${facet}`).toContain(row);
      }
    }
  });

  it('holds under a spelling nobody has set yet', () => {
    const odd: ProgressionSpelling = {
      separator: 'space', qualities: 'spelled',
      halfDimTriad: 'dim', halfDimSeventh: 'm7♭5',
    };
    for (const facet of ['1-5-6-4', '1-6-2-5', 'backdoor']) {
      const row = chip(facet, odd).replace(' (backdoor)', '');
      const card = FLASHCARDS.find(
        c => c.id.startsWith('pr-prog-') && c.axis?.shape === facet)!;
      expect(respellProgressionCard(card, odd)!.question, facet).toContain(row);
    }
  });
});
