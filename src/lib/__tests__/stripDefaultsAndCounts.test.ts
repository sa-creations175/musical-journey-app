/**
 * The lit-everything default, and the two counts that must not merge.
 *
 * =====================================================================
 * BOTH NUMBERS LIVE IN THIS FILE ON PURPOSE.
 *
 * The strip's count and the coverage denominator are the same shape and
 * answer different questions:
 *
 *   strip count     what you are about to drill, NOW, with your
 *                   settings. Moves with the inversion preference.
 *   coverage total  what can EVER be asked, regardless of settings.
 *                   Must not move, or the dashboard reports progress
 *                   nobody made.
 *
 * Keeping them side by side is the point — the next person tempted to
 * share one function between them reads the distinction before the
 * temptation.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import {
  NO_SELECTION, allSelected, appliedKeys, resolveFacets,
} from '../facetSelection';
import { intervalFacetList, allIntervalKeys } from '../../modules/ear-training/intervals/facets';
import {
  chordRecognitionFacets, servedRefsFor,
} from '../../modules/ear-training/chord-recognition/facets';
import {
  chordProgressionFacets, selectionFromStoredTier,
} from '../../modules/ear-training/chord-progressions/facets';
import { CHORD_SEEDS } from '../../modules/ear-training/chord-recognition/seed';
import { PROGRESSIONS } from '../../modules/ear-training/chord-progressions/catalog';
import { earTrainingCounts } from '../moduleItemCounts';
import type { ChordData } from '../db';
import type { Inversion } from '../../modules/ear-training/chord-recognition/inversionUtils';

const chords = CHORD_SEEDS.map(s => ({ ...s, correct: 0, total: 0 })) as ChordData[];

describe('the fresh-load state lights every chip', () => {
  // ASYMMETRIC: three drills with different facet counts and different
  // pool sizes, so a helper that happened to work for one is not enough.
  const cases = [
    ['intervals', intervalFacetList(), allIntervalKeys().length],
    ['chord recognition', chordRecognitionFacets(chords, [0, 1, 2, 3]), null],
    ['chord progressions', chordProgressionFacets(), PROGRESSIONS.length],
  ] as const;

  for (const [name, facets, expectedPool] of cases) {
    it(`${name}: every value selected, resolving to the whole pool`, () => {
      const lit = allSelected(facets);
      // Half one: every value of every facet is in the selection.
      for (const facet of facets) {
        expect(lit[facet.id], `${name}/${facet.id}`).toEqual(facet.values.map(v => v.id));
      }
      // Half two: it resolves to the same pool as selecting nothing.
      // Equality alone would pass on a UI that still started empty,
      // which is why both halves are here.
      const empty = resolveFacets(facets, NO_SELECTION);
      const full = resolveFacets(facets, lit);
      expect(empty.narrowed).toBe(false);
      expect(full.narrowed).toBe(true);
      const everyKey = new Set(facets[0].values.flatMap(v => v.keys));
      expect(new Set(full.keys)).toEqual(everyKey);
      if (expectedPool !== null) expect(full.keys).toHaveLength(expectedPool);
    });
  }
});

describe('a stored selection beats the lit-everything default', () => {
  const facets = chordProgressionFacets();

  it('carries a stored single tier through, rather than lighting all', () => {
    const stored = selectionFromStoredTier(3, facets);
    expect(stored).not.toBeNull();
    expect(stored!.tier).toEqual(['3']);
    // ASYMMETRIC: narrower than the default, so "stored wins" is
    // observable rather than coincidental.
    expect(resolveFacets(facets, stored!).keys.length)
      .toBeLessThan(resolveFacets(facets, allSelected(facets)).keys.length);
  });

  it('reads a stored string tier, which is how the pref was written', () => {
    expect(selectionFromStoredTier('3', facets)!.tier).toEqual(['3']);
  });

  it("treats a stored 'all' as every tier", () => {
    const stored = selectionFromStoredTier('all', facets)!;
    expect(stored.tier).toEqual(facets[0].values.map(v => v.id));
  });

  it('falls back rather than selecting nothing for an unknown tier', () => {
    // A tier the catalog no longer holds would otherwise resolve to an
    // empty pool and leave the reader staring at a strip they did not
    // set. Null means "no usable stored value", and the caller lights
    // everything.
    expect(selectionFromStoredTier(99, facets)).toBeNull();
    expect(selectionFromStoredTier(undefined, facets)).toBeNull();
    expect(selectionFromStoredTier({ tier: 3 }, facets)).toBeNull();
  });
});

describe('the strip count and the coverage total are different numbers', () => {
  const narrow: Inversion[] = [0];
  const wide: Inversion[] = [0, 1, 2, 3];

  it('moves the strip count when the inversion setting changes', () => {
    const servedNarrow = chords.reduce((n, c) => n + servedRefsFor(c, narrow).length, 0);
    const servedWide = chords.reduce((n, c) => n + servedRefsFor(c, wide).length, 0);
    // Root-only serves one ref per chord; the full drawer serves every
    // reachable inversion.
    expect(servedNarrow).toBe(chords.length);
    expect(servedWide).toBeGreaterThan(servedNarrow);
  });

  it('does NOT move the coverage total when it changes', () => {
    // The same setting, the other number. This is the assertion that
    // stops one function being shared between them.
    const before = earTrainingCounts().chordRecognition;
    const servedNarrow = chords.reduce((n, c) => n + servedRefsFor(c, narrow).length, 0);
    const servedWide = chords.reduce((n, c) => n + servedRefsFor(c, wide).length, 0);
    expect(servedNarrow).not.toBe(servedWide);
    expect(earTrainingCounts().chordRecognition).toBe(before);
    // And it equals neither, because it answers a third question:
    // everything reachable, whatever the drawer says.
    expect(before).not.toBe(servedNarrow);
  });

  it('counts chord x inversion, never chord qualities', () => {
    // The label this replaced said "30 in pool" over a pool of 51.
    const facets = chordRecognitionFacets(chords, wide);
    const lit = resolveFacets(facets, allSelected(facets));
    expect(lit.keys.length).toBeGreaterThan(chords.length);
    expect(appliedKeys(lit)).not.toBeNull();
  });
});
