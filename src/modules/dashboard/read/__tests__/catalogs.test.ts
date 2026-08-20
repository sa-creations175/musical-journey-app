/**
 * Catalog sizes are the denominators every dashboard percentage is
 * divided by, so these pin them. A drift here is a number changing
 * meaning, not a test being fussy.
 *
 * They assert the mechanism too: that rows and items are counted
 * separately where they differ, that a merged row aggregates its refs,
 * and that the refs match what the app actually stores.
 */
import { describe, expect, it } from 'vitest';
import {
  STATIC_CATALOGS,
  catalogBySourceId,
  catalogItemCount,
  catalogRefSet,
  catalogRowCount,
  chordProgressionsCatalog,
  harmonicFluencyCatalog,
  intervalsCatalog,
  mentalVizCatalog,
  productionLessonsCatalog,
  productionVocabularyCatalog,
  readingCatalog,
  scalesModesCatalog,
  shapesCatalog,
} from '../catalogs';
import { enumerateAllReadingItems } from '../../../reading/catalog';
import { itemRefForAttempt } from '../canonicalItemId';
import { LESSON_COVERAGE_RULE } from '../itemStats';

describe('catalog sizes — the denominators', () => {
  it('intervals: 13 × 2 directions = 26', () => {
    expect(catalogItemCount(intervalsCatalog)).toBe(26);
  });

  it('scales & modes: 9 modes × 2 tabs = 18', () => {
    expect(catalogItemCount(scalesModesCatalog)).toBe(18);
    expect(scalesModesCatalog.items.filter(i => i.label === 'hear simple scale')).toHaveLength(9);
    expect(scalesModesCatalog.items.filter(i => i.label === 'hear mode in context')).toHaveLength(9);
  });

  it('harmonic fluency: 375 cards', () => {
    expect(catalogItemCount(harmonicFluencyCatalog)).toBe(375);
  });

  it('production vocabulary: 199 cards', () => {
    expect(catalogItemCount(productionVocabularyCatalog)).toBe(199);
  });

  it('production lessons: 56, and coverage is "tried it" not a count', () => {
    expect(catalogItemCount(productionLessonsCatalog)).toBe(56);
    expect(productionLessonsCatalog.coverageRule).toBe(LESSON_COVERAGE_RULE);
    expect(productionLessonsCatalog.accuracyKind).toBe('self-rated');
  });

  it('shapes & patterns: 648 chord shapes + 96 scales + 372 VL = 1116', () => {
    expect(catalogItemCount(shapesCatalog)).toBe(1116);
    const refs = catalogRefSet(shapesCatalog);
    expect([...refs].filter(r => r.startsWith('chord-shape:'))).toHaveLength(648);
    expect([...refs].filter(r => r.startsWith('scale:'))).toHaveLength(96);
    expect([...refs].filter(r => r.startsWith('vl:'))).toHaveLength(372);
  });

  it('shapes excludes supplementary rows — 648 gating, not 720', () => {
    // The 72 two-handed seventh rows are drillable but do not gate
    // acquisition. That gap is the whole reason 720 and 648 differ.
    const refs = catalogRefSet(shapesCatalog);
    expect([...refs].some(r => r.endsWith(':supplementary'))).toBe(false);
  });

  it('mental visualisation: 504, and its own module row', () => {
    expect(catalogItemCount(mentalVizCatalog)).toBe(504);
    // Its own sourceId, not folded into shapes-and-patterns — it is
    // deliberately excluded from S&P coverage (RULE_LEGIBILITY 1.6).
    expect(mentalVizCatalog.sourceId).toBe('mental-viz');
    expect(shapesCatalog.sourceId).toBe('shapes-and-patterns');
  });
});

describe('reading — 78 signature items over 52 rows', () => {
  it('counts every stored item, matching the reading catalog', () => {
    expect(catalogItemCount(readingCatalog)).toBe(enumerateAllReadingItems().length);
    expect(catalogItemCount(readingCatalog)).toBe(188);
  });

  it('merges count and which into one conceptual-knowledge row', () => {
    const conceptual = readingCatalog.items.filter(i => i.label === 'conceptual knowledge');
    const visual = readingCatalog.items.filter(i => i.label === 'visual recognition');
    // 13 signatures × 2 modes = 26 keys, two rows each.
    expect(conceptual).toHaveLength(26);
    expect(visual).toHaveLength(26);
    // The merged row carries BOTH stored refs; the denominator still
    // counts them separately.
    expect(conceptual.every(i => i.itemRefs.length === 2)).toBe(true);
    expect(visual.every(i => i.itemRefs.length === 1)).toBe(true);
  });

  it('keeps 78 items while showing 52 rows', () => {
    const sigRows = readingCatalog.items.filter(i => i.path[1] === 'key signature recognition');
    expect(sigRows).toHaveLength(52);
    expect(sigRows.reduce((n, i) => n + i.itemRefs.length, 0)).toBe(78);
  });

  it('covers all three stored directions exactly once', () => {
    const refs = catalogRefSet(readingCatalog);
    const dirs = [...refs].filter(r => r.startsWith('sig:'));
    expect(dirs.filter(r => r.endsWith(':name'))).toHaveLength(26);
    expect(dirs.filter(r => r.endsWith(':count'))).toHaveLength(26);
    expect(dirs.filter(r => r.endsWith(':which'))).toHaveLength(26);
  });
});

describe('chord progressions — three sub-drills, one moduleId', () => {
  const refs = [...catalogRefSet(chordProgressionsCatalog)];

  it('chord motion denominator is 132, not the 42 on screen', () => {
    // 12 chromatic degrees × 11 destinations. The 42 is
    // activePool.length after the diatonic-only filter, which is the
    // default scope and so looks like the catalog.
    expect(refs.filter(r => r.startsWith('motion:'))).toHaveLength(132);
  });

  it('motion-first is a sibling sub-skill on the same 132 denominator', () => {
    expect(refs.filter(r => r.startsWith('motion-first:'))).toHaveLength(132);
    const firstRows = chordProgressionsCatalog.items.filter(
      i => i.path[2] === 'first chord',
    );
    expect(firstRows).toHaveLength(132);
  });

  it('excludes motion-mode — scaffold aggregates are not musical items', () => {
    expect(refs.some(r => r.startsWith('motion-mode:'))).toBe(false);
  });

  it('grades inversions only on slash progressions', () => {
    const inversionRows = refs.filter(r => r.endsWith('-inversion'));
    const patternRows = refs.filter(r => r.endsWith('-pattern'));
    // Every progression has a pattern row; only some have inversion.
    expect(inversionRows.length).toBeGreaterThan(0);
    expect(inversionRows.length).toBeLessThan(patternRows.length);
  });

  it('has a key-detection row per key', () => {
    expect(refs.filter(r => r.startsWith('key-detection:'))).toHaveLength(12);
  });
});

describe('catalog refs match what the app stores', () => {
  it('interval refs compose the id with the direction column', () => {
    // Attempts keep direction in its own column; the catalog treats
    // asc and desc as separate items, so the ref has to recombine them.
    const refs = catalogRefSet(intervalsCatalog);
    expect(refs.has(itemRefForAttempt({
      moduleId: 'intervals', itemId: 'M3', direction: 'asc',
    }))).toBe(true);
    expect(refs.has(itemRefForAttempt({
      moduleId: 'intervals', itemId: 'M3', direction: 'desc',
    }))).toBe(true);
    // A pre-direction-field row reads as ascending.
    expect(refs.has(itemRefForAttempt({
      moduleId: 'intervals', itemId: 'M3',
    }))).toBe(true);
  });

  it('chord-recognition refs are chord:inversion, as attempts store them', () => {
    const refs = catalogRefSet(catalogBySourceId('chord-recognition')!);
    expect(refs.has(itemRefForAttempt({
      moduleId: 'chord-recognition', itemId: 'maj:0',
    }))).toBe(true);
    // Legacy bare ids fold onto the same ref.
    expect(refs.has(itemRefForAttempt({
      moduleId: 'chord-recognition', itemId: 'maj',
    }))).toBe(true);
  });
});

describe('catalog invariants', () => {
  it('every row id and every stored ref is unique within its catalog', () => {
    for (const catalog of STATIC_CATALOGS) {
      const ids = catalog.items.map(i => i.id);
      expect(new Set(ids).size, `${catalog.sourceId} row ids`).toBe(ids.length);
      const refs = catalog.items.flatMap(i => [...i.itemRefs]);
      expect(new Set(refs).size, `${catalog.sourceId} item refs`).toBe(refs.length);
    }
  });

  it('every row has a label and a path', () => {
    for (const catalog of STATIC_CATALOGS) {
      for (const item of catalog.items) {
        expect(item.label, `${catalog.sourceId}/${item.id}`).toBeTruthy();
        expect(item.path.length, `${catalog.sourceId}/${item.id}`).toBeGreaterThan(0);
        expect(item.itemRefs.length).toBeGreaterThan(0);
      }
    }
  });

  it('rows and items agree except where a row deliberately merges', () => {
    for (const catalog of STATIC_CATALOGS) {
      if (catalog.sourceId === 'reading') {
        expect(catalogRowCount(catalog)).toBeLessThan(catalogItemCount(catalog));
      } else {
        expect(catalogRowCount(catalog)).toBe(catalogItemCount(catalog));
      }
    }
  });

  it('source ids are unique — a catalog is addressable', () => {
    const ids = STATIC_CATALOGS.map(c => c.sourceId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
