/**
 * The facet join, and the compile error that makes it necessary.
 *
 * =====================================================================
 * ONE OF THESE TESTS DOES NOT RUN, AND THAT IS THE POINT.
 *
 * VITEST DOES NOT TYPE-CHECK. The `@ts-expect-error` below is inert
 * under `vitest run` — it is checked by `tsc`, which is why
 * `npm run build` runs FIRST in this project's gate and why a green
 * test run alone would tell you nothing about it.
 *
 * The directive is load-bearing in the reverse direction too: if
 * someone widens `IntervalData` to carry the facets, the error it
 * expects stops happening, the directive becomes unused, and tsc fails
 * with "Unused '@ts-expect-error' directive". So the guard fires
 * whether the narrowing is removed or the field is added back.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import type { IntervalData } from '../../../../lib/db';
import { INTERVAL_SEEDS, intervalFacets } from '../seed';

/** A row shaped exactly as `db.intervals` stores one. */
const STORED_ROW: IntervalData = {
  id: 'P4',
  name: 'Perfect 4th',
  semitones: 5,
  ascAnchorDefault: 'Here Comes the Bride',
  descAnchorDefault: 'Oh Come All Ye Faithful',
  ascCorrect: 0,
  ascTotal: 0,
  descCorrect: 0,
  descTotal: 0,
};

describe('a stored row does not expose the facets', () => {
  it('is a compile error to reach for one', () => {
    // @ts-expect-error `IntervalData` has no `consonance`: the facets
    // are catalog data and are held back from the stored row, so this
    // must not compile. Reading it would return undefined at runtime
    // and a dashboard grouped by facet would render empty groups with
    // nothing to say why.
    const wrong = STORED_ROW.consonance;
    // Runtime confirmation of the same fact, since the directive above
    // is invisible to vitest.
    expect(wrong).toBeUndefined();
    expect(Object.hasOwn(STORED_ROW, 'consonance')).toBe(false);
    expect(Object.hasOwn(STORED_ROW, 'distance')).toBe(false);
  });
});

describe('the join returns the catalog values', () => {
  /**
   * An interval whose two facets DIFFER as strings, so a helper that
   * returned the wrong field would still fail.
   *
   * Chosen by searching the catalog rather than named, because naming
   * one would need this test to know the tagging — and the values are
   * read from the seed below, not written here.
   */
  const seed = INTERVAL_SEEDS.find(
    s => (s.consonance as string) !== (s.distance as string),
  )!;

  it('has a fixture whose two facets are distinguishable', () => {
    expect(seed).toBeDefined();
    expect(seed.consonance as string).not.toBe(seed.distance as string);
  });

  it('returns both facets for a stored row', () => {
    // Takes the ROW, which is the shape a consumer actually holds.
    expect(intervalFacets({ id: seed.id })).toEqual({
      consonance: seed.consonance,
      distance: seed.distance,
    });
  });

  it('returns each facet in its own field, not swapped', () => {
    const facets = intervalFacets(seed.id)!;
    expect(facets.consonance).toBe(seed.consonance);
    expect(facets.distance).toBe(seed.distance);
    // Explicit, because `toEqual` above passes on a swap only if the
    // two values are equal — which the fixture guard rules out, and
    // this states directly.
    expect(facets.consonance).not.toBe(seed.distance);
    expect(facets.distance).not.toBe(seed.consonance);
  });

  it('agrees with the catalog for every interval', () => {
    for (const s of INTERVAL_SEEDS) {
      expect(intervalFacets(s.id), s.id)
        .toEqual({ consonance: s.consonance, distance: s.distance });
    }
  });

  it('returns null for an id the catalog does not know', () => {
    // Not a guessed default: a facet has none, and an interval placed
    // in a group it was never tagged into is worse than one missing.
    expect(intervalFacets('not-an-interval')).toBeNull();
    expect(intervalFacets({ id: '' })).toBeNull();
  });
});
