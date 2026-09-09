/**
 * The group → category mapping, now that it lives once.
 *
 * =====================================================================
 * THE FAILURE THIS EXISTS TO CATCH IS A CATEGORY IN NO GROUP.
 *
 * Every coverage denominator, every goal scope and the whole cold-start
 * walk are sums over these four lists. A category that generates cards
 * and is in none of them is invisible to all three, and NOTHING ELSE
 * NOTICES: the deck total still adds up, the grid still draws, the
 * category page still loads. Modal Improvisation shipped that way for
 * one commit.
 *
 * So the assertion is over the DECK, not over the lists.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import { CATEGORY_ORDER, FLASHCARDS, type FlashcardCategory } from '../catalog';
import {
  HARMONIC_FLUENCY_GROUPS, HF_CATEGORIES_BY_GROUP, HF_CATEGORIES_BY_UNIT,
  HF_UNIT_TO_COUNT_GROUP,
} from '../coverageGroups';
import { harmonicFluencyCounts } from '../../../lib/moduleItemCounts';
import { HF_GROUP_CATEGORIES } from '../../goals/progress';
import { HF_GROUP_ORDER } from '../../../lib/sessionAlgorithm/coldStart';

const GROUPED = HARMONIC_FLUENCY_GROUPS.flatMap(g => [...g.categories]);

describe('every category the deck holds is in a group', () => {
  it('leaves none of them out', () => {
    const missing = [...new Set(FLASHCARDS.map(c => c.category))]
      .filter(c => !GROUPED.includes(c));
    expect(missing).toEqual([]);
  });

  it('leaves none of the REACHABLE ones out either', () => {
    // `CATEGORY_ORDER` is what a reader can navigate to. A category
    // with a page and no group would be drillable and uncounted.
    const missing = CATEGORY_ORDER.filter(c => !GROUPED.includes(c));
    expect(missing).toEqual([]);
  });

  it('groups no category the deck does not hold', () => {
    // The other direction, and it is the one that had actually
    // drifted: `reverse-key-pivots` sat under Functional / Applied for
    // a week after its cards folded into `degree-notes`, offering a
    // goal target that could never be met.
    const live = new Set(FLASHCARDS.map(c => c.category));
    expect(GROUPED.filter(c => !live.has(c as FlashcardCategory))).toEqual([]);
  });

  it('puts each category in exactly one group', () => {
    const twice = GROUPED.filter((c, i) => GROUPED.indexOf(c) !== i);
    expect(twice).toEqual([]);
  });
});

describe('the readings all come off the one list', () => {
  it('sums to the deck, group by group', () => {
    const counts = harmonicFluencyCounts();
    for (const group of HARMONIC_FLUENCY_GROUPS) {
      expect(counts.byGroup[group.id], group.id).toBe(
        group.categories.reduce((n, c) => n + (counts.byCategory[c] ?? 0), 0),
      );
    }
    expect(
      HARMONIC_FLUENCY_GROUPS.reduce((n, g) => n + counts.byGroup[g.id], 0),
    ).toBe(counts.total);
  });

  it('gives the stored unit and the counts field the same categories', () => {
    // These were two hand-maintained tables with a drift guard between
    // them. They are two fields of one row now, and this is what makes
    // that checkable rather than merely stated.
    for (const group of HARMONIC_FLUENCY_GROUPS) {
      expect(HF_CATEGORIES_BY_UNIT[group.unit], group.unit)
        .toEqual(HF_CATEGORIES_BY_GROUP[group.id]);
      expect(HF_UNIT_TO_COUNT_GROUP[group.unit]).toBe(group.id);
    }
  });

  it('is what `goals/progress` serves, not a copy of it', () => {
    expect(HF_GROUP_CATEGORIES).toBe(HF_CATEGORIES_BY_UNIT);
  });

  it('walks the cold start in the list\'s own order', () => {
    expect(HF_GROUP_ORDER).toEqual(HARMONIC_FLUENCY_GROUPS.map(g => g.unit));
  });
});
