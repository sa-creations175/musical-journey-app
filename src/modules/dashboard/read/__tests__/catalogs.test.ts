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
  chordRecognitionCatalog,
  harmonicFluencyCatalog,
  intervalsCatalog,
  mentalVizCatalog,
  productionLessonsCatalog,
  productionVocabularyCatalog,
  readingCatalog,
  scalesModesCatalog,
  shapesCatalog,
} from '../catalogs';
import {
  enumerateAllReadingItems,
  CHORD_QUALITIES as READING_CHORD_QUALITIES,
} from '../../../reading/catalog';
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

  it('chord recognition: 114 — chord x inversion, per chord size', () => {
    // 6 triads x 3 inversions + 24 four-note chords x 4. Never pinned
    // before, and a report of mine said 104 from an estimate that was
    // never checked.
    expect(catalogItemCount(chordRecognitionCatalog)).toBe(114);
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
    const sigRows = readingCatalog.items.filter(
      i => i.path[1] === 'key signature recognition',
    );
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
      i => i.path[3] === 'first chord',
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

describe('reading labels are read off the catalog, never built from ids', () => {
  const rows = readingCatalog.items;
  const labelsIn = (skill: string) =>
    rows.filter(i => i.path[1] === skill).map(i => i.label);

  it('never leaks a raw catalog id into a row label', () => {
    // THE DEFECT THIS PINS. The dashboard is the first surface that
    // renders every catalog id in the app, so an id that was only ever
    // a key becomes a label the moment someone interpolates it.
    //
    // An id that HAPPENS to equal its own label — `octave` — is not a
    // leak; it is the label, and it arrived through `q.label`.
    for (const q of READING_CHORD_QUALITIES) {
      const row = rows.find(i => i.itemRefs[0].startsWith(`chord:${q.id}:`))!;
      expect(row.label, q.id).toContain(q.label);
      if (q.id !== q.label) {
        expect(row.label.split(/[\s·]+/), q.id).not.toContain(q.id);
      }
    }
  });

  it('names a chord row by the three things the picker asks', () => {
    const labels = labelsIn('chord identification');
    expect(labels).toContain('root position · major · treble clef');
    expect(labels).toContain('third inversion · minor 7th · bass clef');
  });

  it('omits the root, because the root is the variable being tested', () => {
    // A row naming one root would describe a card that only sometimes
    // appears.
    for (const label of labelsIn('chord identification')) {
      expect(label, label).not.toMatch(/\b[A-G][#b♯♭]?\b/);
    }
  });

  it('drops the position on open shapes, agreeing with renderCard', () => {
    // They ARE a voicing, so "root position" adds nothing — which is
    // what renderCard already decides for their captions.
    const open = READING_CHORD_QUALITIES.filter(q => q.family === 'open');
    for (const q of open) {
      const row = rows.find(i => i.itemRefs[0].startsWith(`chord:${q.id}:`))!;
      expect(row.label, q.id).not.toContain('root position');
      expect(row.label).toContain(q.label);
    }
  });

  it('uses the corrected interval names for the two that under-specified', () => {
    // [0,10] is a MINOR seventh and [0,16] a MAJOR tenth; the old
    // labels each described two different shapes.
    const labels = labelsIn('chord identification');
    expect(labels.some(l => l.includes('root + ♭7'))).toBe(true);
    expect(labels.some(l => l.includes('root + major 10th'))).toBe(true);
    expect(labels.some(l => l.includes('root–seventh'))).toBe(false);
  });

  it('names a note row by its pitch, not by a staff coordinate', () => {
    const labels = labelsIn('note recognition');
    expect(labels).toContain('treble · A3');
    expect(labels.some(l => /-\d/.test(l))).toBe(false);
  });

  it('names a shape row by its inversion in words', () => {
    expect(labelsIn('notation shapes')).toContain('triad · first inversion');
  });
});

describe('the reading tree is ordered by what depends on what', () => {
  it('puts notation shapes before chord identification', () => {
    // Shapes is the prerequisite: the silhouette pre-read that chord
    // identification builds a full answer on. Listing the dependent
    // skill first buries the thing it depends on.
    const order: string[] = [];
    for (const item of readingCatalog.items) {
      const skill = item.path[1];
      if (skill && order[order.length - 1] !== skill) order.push(skill);
    }
    expect(order).toEqual([
      'note recognition',
      'key signature recognition',
      'notation shapes',
      'chord identification',
    ]);
  });
});
