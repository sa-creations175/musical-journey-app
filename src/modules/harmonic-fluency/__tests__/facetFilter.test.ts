/**
 * Scoping practice below the level of a category.
 *
 * =====================================================================
 * THE TRITONE IS THE WORKED EXAMPLE AND THE REASON THIS EXISTS.
 *
 * The deck holds tritone cards in more than one category and there was
 * no way to gather them, because nothing said which cards were about a
 * tritone. The assertions below are written against the FACETS rather
 * than against a card count, so they keep meaning what they mean when
 * the deck grows.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { FLASHCARDS } from '../catalog';
import { buildSession } from '../sessionQueue';
import {
  FACET_PARAM_PREFIX, availableValues, cardMatchesFacets, filterByFacets,
  isFacetName, isFiltering, offerableFacets, readFacetFilter, withFacetValues,
} from '../facetFilter';

describe('reading a filter out of the URL', () => {
  it('takes one parameter per facet', () => {
    const params = new URLSearchParams('f.key=Eb,Ab&f.degree=b6');
    expect(readFacetFilter(params)).toEqual({ key: ['Eb', 'Ab'], degree: ['b6'] });
  });

  it('ignores parameters that are not facets', () => {
    // `?also=` shares this query string and must survive untouched.
    const params = new URLSearchParams('also=named-notes&f.key=Eb&detail=1');
    expect(readFacetFilter(params)).toEqual({ key: ['Eb'] });
  });

  it('drops a facet this build no longer has, rather than drilling everything', () => {
    // A stale link should narrow by what it still understands. Treating
    // an unknown facet as "no filter" would silently serve the whole
    // deck to someone who asked for one corner of it.
    const params = new URLSearchParams('f.wibble=7&f.key=Eb');
    expect(readFacetFilter(params)).toEqual({ key: ['Eb'] });
  });

  it('treats an empty value list as not asking', () => {
    expect(readFacetFilter(new URLSearchParams('f.key='))).toEqual({});
    expect(isFiltering(readFacetFilter(new URLSearchParams()))).toBe(false);
  });

  it('knows which names are real facets', () => {
    expect(isFacetName('key')).toBe(true);
    expect(isFacetName('semitones')).toBe(true);
    expect(isFacetName('shape')).toBe(false);
  });
});

describe('writing a filter back', () => {
  it('leaves every other parameter alone', () => {
    const before = new URLSearchParams('also=modes&detail=1');
    const after = withFacetValues(before, 'key', ['Eb']);
    expect(after.get('also')).toBe('modes');
    expect(after.get('detail')).toBe('1');
    expect(after.get(`${FACET_PARAM_PREFIX}key`)).toBe('Eb');
  });

  it('removes the parameter rather than writing an empty one', () => {
    // "Filtered by nothing" and "not filtered" have to be one URL, or
    // the back button starts surprising people.
    const params = withFacetValues(new URLSearchParams('f.key=Eb'), 'key', []);
    expect(params.has('f.key')).toBe(false);
    expect(params.toString()).toBe('');
  });

  it('round-trips whatever it wrote', () => {
    const params = withFacetValues(new URLSearchParams(), 'degree', ['b6', '6']);
    expect(readFacetFilter(params)).toEqual({ degree: ['b6', '6'] });
  });

  it('survives a sharp, which is a fragment marker in a URL', () => {
    const params = withFacetValues(new URLSearchParams(), 'degree', ['#4']);
    const round = new URLSearchParams(params.toString());
    expect(readFacetFilter(round)).toEqual({ degree: ['#4'] });
  });
});

describe('what a filter does to a card', () => {
  it('passes everything when nothing is filtered', () => {
    for (const card of FLASHCARDS.slice(0, 50)) {
      expect(cardMatchesFacets(card, {}), card.id).toBe(true);
    }
  });

  it('excludes a card that never made the claim being asked about', () => {
    // A prose card carries no facets. It is not "a tritone card we
    // could not prove"; it is not a tritone card.
    const prose = FLASHCARDS.find(c => c.facets === undefined)!;
    expect(cardMatchesFacets(prose, { semitones: ['6'] })).toBe(false);
  });

  it('reads values within a facet as alternatives', () => {
    const both = filterByFacets(FLASHCARDS, { key: ['Eb', 'Ab'] });
    const one = filterByFacets(FLASHCARDS, { key: ['Eb'] });
    expect(both.length).toBeGreaterThan(one.length);
    for (const card of both) expect(['Eb', 'Ab']).toContain(card.facets!.key);
  });

  it('reads separate facets as narrowing', () => {
    const key = filterByFacets(FLASHCARDS, { key: ['Eb'] });
    const both = filterByFacets(FLASHCARDS, { key: ['Eb'], degree: ['5'] });
    expect(both.length).toBeLessThanOrEqual(key.length);
    for (const card of both) {
      expect(card.facets!.key).toBe('Eb');
      expect(card.facets!.degree).toBe('5');
    }
  });
});

describe('the tritone, gathered', () => {
  it('reaches more than one category', () => {
    // The whole point. Before this, the twelve in Tritone Pairs were
    // the most anyone could gather.
    const tritones = filterByFacets(FLASHCARDS, { semitones: ['6'] });
    const categories = new Set(tritones.map(c => c.category));
    expect(categories.size).toBeGreaterThan(1);
    // Tritone Pairs was one of the three and is folded in — its twelve
    // questions are the ♯4 and ♭5 cards of Degrees And Notes now.
    expect(categories.has('degree-notes')).toBe(true);
    expect(categories.has('intervals')).toBe(true);
  });

  it('gathers more than any one category holds', () => {
    const gathered = filterByFacets(FLASHCARDS, { semitones: ['6'] });
    const perCategory = new Map<string, number>();
    for (const c of gathered) {
      perCategory.set(c.category, (perCategory.get(c.category) ?? 0) + 1);
    }
    expect(gathered.length).toBeGreaterThan(Math.max(...perCategory.values()));
  });

  it('gathers nothing that is not six semitones', () => {
    for (const card of filterByFacets(FLASHCARDS, { semitones: ['6'] })) {
      expect(card.facets!.semitones, card.id).toBe(6);
    }
  });
});

describe('diatonic and chromatic', () => {
  it('separates the plain degrees from the altered ones', () => {
    // "Diatonic only" is the seven unaltered degrees; "anything
    // chromatic" is the whole vocabulary. Both are value sets over one
    // facet rather than a second concept.
    const diatonic = filterByFacets(FLASHCARDS, {
      degree: ['1', '2', '3', '4', '5', '6', '7'],
    });
    expect(diatonic.length).toBeGreaterThan(0);
    for (const card of diatonic) {
      expect(card.facets!.degree, card.id).not.toMatch(/[b#]/);
    }
  });
});

describe('what the control offers', () => {
  it('offers only values the cards in play actually hold', () => {
    // A control built from the declared vocabulary would show twelve
    // keys on a category that asks about none. Interval cards are
    // anchored on a NOTE and named in no key at all.
    const intervals = FLASHCARDS.filter(c => c.category === 'intervals');
    expect(availableValues(intervals, 'key')).toEqual([]);
    expect(availableValues(intervals, 'note').length).toBe(12);
  });

  it('offers no facet that cannot change what is on screen', () => {
    // Every card in Progression Vocabulary that carries a progression
    // carries the same one, so a progression filter over that category
    // alone is a label, not a control.
    const progressions = FLASHCARDS.filter(c => c.category === 'progressions');
    expect(offerableFacets(progressions)).not.toContain('progression');
    expect(offerableFacets(progressions)).toContain('key');
  });

  it('offers more as more categories are lit', () => {
    const one = FLASHCARDS.filter(c => c.category === 'progressions');
    const two = FLASHCARDS.filter(c =>
      c.category === 'progressions' || c.category === 'intervals');
    expect(offerableFacets(two).length).toBeGreaterThan(offerableFacets(one).length);
  });
});

describe('the queue', () => {
  it('narrows to the filter', async () => {
    const session = await buildSession({
      categories: [], target: 500, facets: { semitones: ['6'] },
    });
    expect(session.cards.length).toBeGreaterThan(0);
    for (const card of session.cards) {
      expect(card.facets!.semitones, card.id).toBe(6);
    }
  });

  it('narrows within the categories, never instead of them', async () => {
    // The chip row says which categories; the filter says which of
    // their cards. A filter must not reach outside the pool.
    const inCategory = FLASHCARDS.filter(c => c.category === 'enharmonic-equivalents');
    const session = await buildSession({
      categories: ['enharmonic-equivalents'], target: 500,
      facets: { enharmonicKind: ['note'] },
    });
    for (const card of session.cards) {
      expect(card.category).toBe('enharmonic-equivalents');
    }
    expect(session.cards.length)
      .toBe(inCategory.filter(c => c.facets?.enharmonicKind === 'note').length);
  });

  it('serves the whole pool when nothing is filtered', async () => {
    // The existing behaviour, unchanged — this is the assertion that
    // says the chip row still works exactly as it did.
    const withEmpty = await buildSession({
      categories: ['enharmonic-equivalents'], target: 500, facets: {},
    });
    const without = await buildSession({
      categories: ['enharmonic-equivalents'], target: 500,
    });
    // THE SAME CARDS, not the same order — an unseen queue is
    // shuffled, so comparing order would fail for a reason that has
    // nothing to do with filtering.
    expect(withEmpty.cards.map(c => c.id).sort())
      .toEqual(without.cards.map(c => c.id).sort());
    expect(without.cards.length)
      .toBe(FLASHCARDS.filter(c => c.category === 'enharmonic-equivalents').length);
  });
});
