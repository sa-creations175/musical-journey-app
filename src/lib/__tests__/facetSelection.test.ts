/**
 * OR within a facet, AND across facets — asserted where they DIFFER.
 *
 * A fixture where the union and the intersection happen to coincide
 * proves nothing: an implementation that OR'd everything would pass it.
 * Every semantics test below uses a selection whose two readings give
 * different answers.
 */
import { describe, expect, it } from 'vitest';
import {
  NO_SELECTION, appliedKeys, resolveFacets, toggleFacetValue,
  type Facet,
} from '../facetSelection';

/**
 * ASYMMETRIC FIXTURE.
 *
 * Facet sizes differ (3 values vs 2), the values hold different numbers
 * of keys, and the two facets cut across each other rather than nesting
 * — so an implementation that returned either facet's union, or that
 * intersected in the wrong order, produces a different answer.
 */
const COLOUR: Facet = {
  id: 'colour',
  label: 'colour',
  values: [
    { id: 'red', label: 'red', keys: ['a', 'b', 'c'] },
    { id: 'blue', label: 'blue', keys: ['d', 'e'] },
    { id: 'green', label: 'green', keys: ['f'] },
  ],
};

const SIZE: Facet = {
  id: 'size',
  label: 'size',
  values: [
    { id: 'small', label: 'small', keys: ['a', 'd', 'f'] },
    { id: 'large', label: 'large', keys: ['b', 'c', 'e'] },
  ],
};

const FACETS = [COLOUR, SIZE];

describe('nothing selected does not constrain', () => {
  it('reports un-narrowed rather than empty', () => {
    const r = resolveFacets(FACETS, NO_SELECTION);
    expect(r.narrowed).toBe(false);
    expect(r.keys).toEqual([]);
    // The distinction that matters: "serve everything" is null, and so
    // is "keep what you had" — the caller tells them apart by narrowed.
    expect(appliedKeys(r)).toBeNull();
  });

  it('leaves an untouched facet out of the intersection', () => {
    // Only colour is selected. If an unselected facet contributed an
    // empty set, this would resolve to nothing.
    const r = resolveFacets(FACETS, { colour: ['red'] });
    expect(r.narrowed).toBe(true);
    expect(r.keys).toEqual(['a', 'b', 'c']);
  });
});

describe('OR within a facet', () => {
  it('unions the selected values', () => {
    const r = resolveFacets(FACETS, { colour: ['red', 'green'] });
    expect(r.keys).toEqual(['a', 'b', 'c', 'f']);
  });

  it('dedupes a key two values both name', () => {
    const overlapping: Facet = {
      id: 'x', label: 'x',
      values: [
        { id: 'p', label: 'p', keys: ['k1', 'k2'] },
        { id: 'q', label: 'q', keys: ['k2', 'k3'] },
      ],
    };
    expect(resolveFacets([overlapping], { x: ['p', 'q'] }).keys)
      .toEqual(['k1', 'k2', 'k3']);
  });
});

describe('AND across facets', () => {
  it('intersects, and the intersection DIFFERS from the union', () => {
    // (red OR blue) AND large.
    const selection = { colour: ['red', 'blue'], size: ['large'] };
    const r = resolveFacets(FACETS, selection);
    expect(r.keys).toEqual(['b', 'c', 'e']);

    // The union of the same selection would be a, b, c, d, e — five
    // keys, not three. An implementation that OR'd everything gives
    // that, so this comparison is what separates the two readings.
    const union = new Set([
      ...COLOUR.values.filter(v => selection.colour.includes(v.id)).flatMap(v => v.keys),
      ...SIZE.values.filter(v => selection.size.includes(v.id)).flatMap(v => v.keys),
    ]);
    expect(union.size).toBe(5);
    expect(r.keys.length).toBeLessThan(union.size);
  });

  it('narrows further as a second facet value is added', () => {
    // Adding a value INSIDE a facet widens; adding a facet narrows.
    const oneFacet = resolveFacets(FACETS, { colour: ['red'] }).keys.length;
    const twoFacets = resolveFacets(FACETS, { colour: ['red'], size: ['small'] }).keys.length;
    expect(twoFacets).toBeLessThan(oneFacet);
    expect(resolveFacets(FACETS, { colour: ['red'], size: ['small'] }).keys).toEqual(['a']);
  });

  it('keeps the first constraining facet’s order', () => {
    // Deterministic without sorting — sorting would impose an order the
    // caller never asked for. ASYMMETRIC: the expected order is not
    // alphabetical by accident, it is colour's order.
    const r = resolveFacets(FACETS, { size: ['large'], colour: ['red', 'blue'] });
    expect(r.keys).toEqual(['b', 'c', 'e']);
  });
});

describe('a selection that resolves to nothing', () => {
  it('is narrowed but empty, and is NOT applied', () => {
    // green is {f}; large is {b,c,e}. No overlap.
    const r = resolveFacets(FACETS, { colour: ['green'], size: ['large'] });
    expect(r.narrowed).toBe(true);
    expect(r.keys).toEqual([]);
    // Null here means "keep serving what you were", which is a
    // different instruction from the null of an untouched strip.
    expect(appliedKeys(r)).toBeNull();
  });
});

describe('toggling', () => {
  it('selects, then deselects the same value', () => {
    const once = toggleFacetValue(NO_SELECTION, 'colour', 'red');
    expect(once).toEqual({ colour: ['red'] });
    const twice = toggleFacetValue(once, 'colour', 'red');
    // The facet is REMOVED, not left empty, so tapping a lone chip
    // twice returns to untouched rather than to "none of these".
    expect(twice).toEqual({});
    expect(resolveFacets(FACETS, twice).narrowed).toBe(false);
  });

  it('accumulates within a facet and keeps facets independent', () => {
    let sel = toggleFacetValue(NO_SELECTION, 'colour', 'red');
    sel = toggleFacetValue(sel, 'colour', 'blue');
    sel = toggleFacetValue(sel, 'size', 'large');
    expect(sel).toEqual({ colour: ['red', 'blue'], size: ['large'] });
    sel = toggleFacetValue(sel, 'colour', 'red');
    expect(sel).toEqual({ colour: ['blue'], size: ['large'] });
  });
});

describe('a stale selection cannot empty the pool silently', () => {
  it('ignores value ids the facet does not offer', () => {
    // A selection surviving a catalog change would otherwise intersect
    // against keys nothing can serve.
    const r = resolveFacets(FACETS, { colour: ['puce'] });
    expect(r.narrowed).toBe(false);
    expect(r.keys).toEqual([]);
  });
});
