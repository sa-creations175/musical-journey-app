/**
 * Production Vocabulary is drawn by the same shell, so it had the same
 * defect — and this file says so out loud.
 *
 * =====================================================================
 * WHY A SECOND FILE RATHER THAN A SENTENCE IN THE OTHER ONE.
 *
 * The first-slot leak was never a harmonic-fluency bug. It lived in
 * `FlashcardSession`, which both decks render through, so Production
 * Vocabulary shipped the same tell without ever being measured: the
 * answer sat in the first of four slots on 105 of 199 cards — 52.8%,
 * against 52.5% for the harmonic-fluency deck. Two decks, one cause,
 * near-identical damage.
 *
 * One change fixed both, and "fixed both" is exactly the kind of claim
 * that rots quietly. A note in the harmonic-fluency guard saying "this
 * also covers Production" would stay green while somebody gave
 * Production its own picker, or reordered its options for layout, or
 * added a category of six terms. So the claim is a test, over the real
 * Production catalog, and it fails when it stops being true.
 *
 * This deck has NO decoy guard of its own — none of the eight catalog
 * rules is asserted here. That is a gap, and it is a different gap
 * from this one. This file covers the render order only, and says so
 * rather than implying broader cover it does not give.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import { PRODUCTION_VOCAB_FLASHCARDS } from '../vocabularyFlashcards';
import {
  positionBound, renderedRuleCounts, renderedRulesFor, type GuardedCard,
} from '../../harmonic-fluency/decoyGuard';
import { renderedOptions } from '../../../lib/flashcards/optionOrder';

const CARDS: GuardedCard[] = PRODUCTION_VOCAB_FLASHCARDS.map(c => ({
  id: c.id, category: c.category, correctAnswer: c.correctAnswer, decoys: c.decoys,
}));
const CATEGORIES = [...new Set(CARDS.map(c => c.category))].sort();

/** Same value, same reasoning as the harmonic-fluency guard. */
const POSITION_ALPHA = 0.001;

describe('production vocabulary: the answer is not drawn in a predictable slot', () => {
  const counts = renderedRuleCounts(CARDS);

  for (const category of CATEGORIES) {
    const e = counts.get(category)!;
    for (const rule of renderedRulesFor(category)) {
      const bound = positionBound(e.n, e.chance, POSITION_ALPHA);
      it(`${category} / ${rule.id}: at most ${bound} of ${e.n}`, () => {
        expect(e.hits.get(rule.id) ?? 0).toBeLessThanOrEqual(bound);
      });
    }
  }

  it('holds across the whole vocabulary, where the bound is tightest', () => {
    // Seventeen categories here average twelve cards each, so the
    // per-category ceilings are loose in absolute terms. The deck-wide
    // bound is the one that would actually catch a uniform skew.
    const all = renderedRuleCounts(
      CARDS.map(c => ({ ...c, category: 'deck' })),
    ).get('deck')!;
    const failures = renderedRulesFor('deck').map(r => ({
      rule: r.id,
      hits: all.hits.get(r.id) ?? 0,
      bound: positionBound(all.n, all.chance, POSITION_ALPHA),
      of: all.n,
    })).filter(f => f.hits > f.bound);
    expect(failures).toEqual([]);
  });

  it('would have failed on the order this replaced', () => {
    // =================================================================
    // THE REVERSAL, FOR THIS DECK SPECIFICALLY.
    //
    // The harmonic-fluency guard proves the rule catches the old
    // comparator on ITS deck. That proves nothing about this one — the
    // old order keyed on the first character of each option, and how
    // often that tied is a property of the CONTENT. Production's terms
    // could in principle have tied rarely enough to be fine.
    //
    // They did not: 105 of 199, against a ceiling of 69. Pinned here so
    // "the same change fixed Production too" is a measured claim about
    // Production rather than an inference from somewhere else.
    // =================================================================
    const oldOrder = (c: GuardedCard): string[] => {
      const opts = [c.correctAnswer, ...c.decoys];
      let h = 0;
      for (let i = 0; i < c.id.length; i++) h = (h * 31 + c.id.charCodeAt(i)) | 0;
      return [...opts].sort((a, b) =>
        (((a.charCodeAt(0) || 0) + h) % 97) - (((b.charCodeAt(0) || 0) + h) % 97));
    };
    const firstUnder = (order: (c: GuardedCard) => string[]) =>
      CARDS.filter(c => order(c)[0] === c.correctAnswer).length;

    const before = firstUnder(oldOrder);
    const after = firstUnder(c => renderedOptions(c.id, c.correctAnswer, c.decoys));
    const bound = positionBound(CARDS.length, 0.25, POSITION_ALPHA);

    expect(before).toBe(105);
    expect(before).toBeGreaterThan(bound);
    expect(after).toBeLessThanOrEqual(bound);
  });

  it('renders through the same shuffle the shell uses', () => {
    // The load-bearing assumption of this whole file. If Production
    // ever stops going through `renderedOptions`, every assertion above
    // keeps passing while measuring something the reader never sees —
    // which is precisely the failure that let the original leak sit
    // behind eight rules. Asserting the shell's own function is used is
    // the cheapest thing that notices.
    const c = CARDS[0];
    expect(renderedOptions(c.id, c.correctAnswer, c.decoys).slice().sort())
      .toEqual([c.correctAnswer, ...c.decoys].slice().sort());
  });
});
