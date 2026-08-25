/**
 * The two interval facets, asserted FROM the catalog.
 *
 * =====================================================================
 * NO SECOND COPY OF THE MEMBERSHIP.
 *
 * The obvious test writes the three consonance groups out again and
 * checks the catalog matches. That proves the two lists agree and
 * nothing else — and when a tag is wrong, the natural fix is to edit
 * whichever copy is nearer, so the pair stays consistent while both are
 * wrong. Every expectation here is either a COUNT or a STRUCTURAL
 * property computed from the tags themselves.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import { INTERVAL_SEEDS, type Consonance, type Distance } from '../seed';

const CONSONANCE: ReadonlyArray<Consonance> = ['perfect', 'imperfect', 'dissonant'];
const DISTANCE: ReadonlyArray<Distance> = ['near', 'middle', 'far'];

/** Ids grouped by whatever facet the accessor reads. */
function groupBy<T extends string>(read: (s: typeof INTERVAL_SEEDS[number]) => T) {
  const out = new Map<T, string[]>();
  for (const seed of INTERVAL_SEEDS) {
    const key = read(seed);
    out.set(key, [...(out.get(key) ?? []), seed.id]);
  }
  return out;
}

const byConsonance = groupBy(s => s.consonance);
const byDistance = groupBy(s => s.distance);

describe('the catalog is the size these counts assume', () => {
  it('holds thirteen intervals', () => {
    // Asserted FIRST and on its own. Every group count below is a claim
    // about a 13-item catalog; if the catalog grows, the right response
    // is to re-derive the grouping, not to adjust the expected numbers
    // until they add up again.
    expect(INTERVAL_SEEDS).toHaveLength(13);
  });
});

describe('every interval carries exactly one value of each facet', () => {
  it('tags all thirteen, with no missing field', () => {
    for (const seed of INTERVAL_SEEDS) {
      // Object.hasOwn, not toHaveProperty(x, undefined) — a key present
      // and undefined is a different state from a key absent, and only
      // this tells them apart.
      expect(Object.hasOwn(seed, 'consonance'), seed.id).toBe(true);
      expect(Object.hasOwn(seed, 'distance'), seed.id).toBe(true);
    }
  });

  it('uses only the declared values', () => {
    for (const seed of INTERVAL_SEEDS) {
      expect(CONSONANCE, seed.id).toContain(seed.consonance);
      expect(DISTANCE, seed.id).toContain(seed.distance);
    }
  });

  it('places each interval in exactly one group per facet', () => {
    // Derived from the tags: an id appearing under two values would
    // make the flattened group lists longer than the catalog.
    for (const [facet, groups] of [
      ['consonance', byConsonance] as const,
      ['distance', byDistance] as const,
    ]) {
      const flat = [...groups.values()].flat();
      expect(flat.length, facet).toBe(INTERVAL_SEEDS.length);
      expect(new Set(flat).size, facet).toBe(INTERVAL_SEEDS.length);
    }
  });
});

describe('group sizes, computed from the tagged catalog', () => {
  it('splits consonance 4 / 4 / 5', () => {
    expect(CONSONANCE.map(v => byConsonance.get(v)?.length ?? 0)).toEqual([4, 4, 5]);
  });

  it('splits distance 5 / 3 / 5', () => {
    expect(DISTANCE.map(v => byDistance.get(v)?.length ?? 0)).toEqual([5, 3, 5]);
  });

  it('accounts for every interval in both facets', () => {
    const total = (m: Map<string, string[]>) =>
      [...m.values()].reduce((n, ids) => n + ids.length, 0);
    expect(total(byConsonance)).toBe(INTERVAL_SEEDS.length);
    expect(total(byDistance)).toBe(INTERVAL_SEEDS.length);
  });

  it('leaves no declared value empty', () => {
    // A count test alone passes if a value is never used and another
    // absorbs its members — the totals still add up.
    for (const v of CONSONANCE) expect(byConsonance.get(v) ?? [], v).not.toHaveLength(0);
    for (const v of DISTANCE) expect(byDistance.get(v) ?? [], v).not.toHaveLength(0);
  });
});

describe('the two facets are independent', () => {
  it('has a consonance group spanning more than one distance', () => {
    // So a later reader cannot assume one facet implies the other and
    // collapse them into a single field. Derived: find any consonance
    // group whose members carry more than one distance.
    const spans = CONSONANCE.filter(c => {
      const distances = new Set(
        INTERVAL_SEEDS.filter(s => s.consonance === c).map(s => s.distance),
      );
      return distances.size > 1;
    });
    expect(spans.length).toBeGreaterThan(0);
  });

  it('has a distance group spanning more than one consonance', () => {
    // The same claim from the other side. One direction alone would
    // permit a hierarchy — consonance nested inside distance — which is
    // still an implication.
    const spans = DISTANCE.filter(d => {
      const consonances = new Set(
        INTERVAL_SEEDS.filter(s => s.distance === d).map(s => s.consonance),
      );
      return consonances.size > 1;
    });
    expect(spans.length).toBeGreaterThan(0);
  });

  it('realises more facet pairs than either facet has values', () => {
    // The strongest form: if either facet determined the other there
    // would be at most three distinct pairs.
    const pairs = new Set(INTERVAL_SEEDS.map(s => `${s.consonance}|${s.distance}`));
    expect(pairs.size).toBeGreaterThan(CONSONANCE.length);
    expect(pairs.size).toBeGreaterThan(DISTANCE.length);
  });
});

describe('the facets stay out of the stored row', () => {
  it('is catalog data, so nothing persists a second copy', async () => {
    // `seedIntervals` spreads the seed into `db.intervals`. Holding the
    // facets back is what stops every reader's database carrying a copy
    // that only a re-seed could refresh.
    const src = Object.values(import.meta.glob('/src/modules/ear-training/intervals/seed.ts', {
      query: '?raw', import: 'default', eager: true,
    }) as Record<string, string>)[0];
    expect(src).toContain('const { consonance: _consonance, distance: _distance, ...stored } = seed;');
    expect(src).toContain('...stored,');
  });
});
