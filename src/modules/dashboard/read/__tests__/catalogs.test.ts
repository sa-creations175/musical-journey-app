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
  titleCase,
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
    expect(scalesModesCatalog.items.filter(i => i.label === 'Hear Simple Scale')).toHaveLength(9);
    expect(scalesModesCatalog.items.filter(i => i.label === 'Hear Mode In Context')).toHaveLength(9);
  });

  it('chord recognition: 114 — chord x inversion, per chord size', () => {
    // 6 triads x 3 inversions + 24 four-note chords x 4. Never pinned
    // before, and a report of mine said 104 from an estimate that was
    // never checked.
    expect(catalogItemCount(chordRecognitionCatalog)).toBe(114);
  });

  it('harmonic fluency: 409 cards', () => {
    expect(catalogItemCount(harmonicFluencyCatalog)).toBe(409);
  });

  it('production vocabulary: 199 cards', () => {
    expect(catalogItemCount(productionVocabularyCatalog)).toBe(199);
  });

  it('production lessons: 56, and coverage is "tried it" not a count', () => {
    expect(catalogItemCount(productionLessonsCatalog)).toBe(56);
    expect(productionLessonsCatalog.coverageRule).toBe(LESSON_COVERAGE_RULE);
    expect(productionLessonsCatalog.accuracyKind).toBe('self-rated');
  });

  it('shapes & patterns: 720 chord shapes + 96 scales + 372 VL = 1188', () => {
    expect(catalogItemCount(shapesCatalog)).toBe(1188);
    const refs = catalogRefSet(shapesCatalog);
    expect([...refs].filter(r => r.startsWith('chord-shape:'))).toHaveLength(720);
    expect([...refs].filter(r => r.startsWith('scale:'))).toHaveLength(96);
    expect([...refs].filter(r => r.startsWith('vl:'))).toHaveLength(372);
  });

  it('INCLUDES the 72 supplementary rows — 720, not 648', () => {
    // Reversed 20 Aug 2026. The two-handed LH-root + RH-triad row is
    // how a seventh chord actually gets played, so it is a shape to own
    // rather than a tool for practising the other five. 6 sevenths ×
    // 12 keys = 72, and the catalog is 720 rather than 648.
    const refs = [...catalogRefSet(shapesCatalog)];
    expect(refs.filter(r => r.endsWith(':supplementary'))).toHaveLength(72);
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
    const conceptual = readingCatalog.items.filter(i => i.label === 'Conceptual Knowledge');
    const visual = readingCatalog.items.filter(i => i.label === 'Visual Recognition');
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
      i => i.path[1] === 'Key Signature Recognition',
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
      i => i.path[3] === 'First Chord',
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

describe('titleCase — first letter of each word, nothing else touched', () => {
  it('capitalises a word start', () => {
    expect(titleCase('scale degree math')).toBe('Scale Degree Math');
    expect(titleCase('note recognition')).toBe('Note Recognition');
  });

  it('leaves the rest of every word exactly as stored', () => {
    // Lowercasing the tail is what a naive Title Case does, and it
    // destroys meaning that lives in the case.
    expect(titleCase('EQ')).toBe('EQ');
    expect(titleCase('AI era')).toBe('AI Era');
    expect(titleCase('Ear-Theory Crossover')).toBe('Ear-Theory Crossover');
    expect(titleCase('major 7th · treble clef')).toBe('Major 7th · Treble Clef');
    expect(titleCase('2nd inversion')).toBe('2nd Inversion');
  });

  it('does not break a word at an apostrophe', () => {
    expect(titleCase("ain't nobody")).toBe("Ain't Nobody");
    expect(titleCase('don’t look back')).toBe('Don’t Look Back');
  });

  it('leaves a flat or sharp attached to a degree alone', () => {
    // THE CASE IS THE MEANING. `b3` is a flat third; `B3` is a note two
    // octaves below middle C. Chord-motion rows are built from these,
    // and scale cells carry them mid-label.
    expect(titleCase('b3')).toBe('b3');
    expect(titleCase('b2 → 3')).toBe('b2 → 3');
    // Roman spelling too: `bVII` is a flat-seven chord.
    expect(titleCase('bVII in a major key')).toBe('bVII In A Major Key');
    expect(titleCase('eb minor pentatonic — from b3'))
      .toBe('Eb Minor Pentatonic — From b3');
    // A `b` that is NOT an accidental still starts a word.
    expect(titleCase('bass clef')).toBe('Bass Clef');
    expect(titleCase('below the staff')).toBe('Below The Staff');
  });

  it('breaks on punctuation and dashes, not only on spaces', () => {
    expect(titleCase('voice-leading')).toBe('Voice-Leading');
    expect(titleCase('root–fifth')).toBe('Root–Fifth');
    expect(titleCase('delay & saturation')).toBe('Delay & Saturation');
    expect(titleCase('root + ♭7')).toBe('Root + ♭7');
  });

  it('is idempotent — applying it twice changes nothing', () => {
    for (const s of ['delay & saturation', 'EQ', 'b2 → 3', "ain't nobody"]) {
      expect(titleCase(titleCase(s)), s).toBe(titleCase(s));
    }
  });
});

describe('the capitalisation convention, across every catalog', () => {
  const segments = STATIC_CATALOGS.flatMap(
    c => c.items.flatMap(i => [...i.path.slice(1)]),
  );

  it('Title Cases every path segment below the module header', () => {
    // GUARD THE GUARD. `expect(s).toBe(titleCase(s))` passes vacuously
    // if titleCase is the identity, or if every segment happens to be a
    // single already-capitalised word. Assert first that the fixture
    // holds multi-word segments that Title Case genuinely acted on.
    expect(segments.some(s => /^\p{Lu}\p{L}* \p{Lu}/u.test(s))).toBe(true);
    expect(segments.some(s => s.toLowerCase() !== s)).toBe(true);

    for (const catalog of STATIC_CATALOGS) {
      for (const item of catalog.items) {
        for (const segment of item.path.slice(1)) {
          expect(segment, `${catalog.sourceId} · ${segment}`).toBe(titleCase(segment));
        }
      }
    }
  });

  it('leaves path[0] — the module header — lowercase', () => {
    // The row component uppercases depth 0 in CSS, and the same strings
    // are what the module filter pills read, where lowercase matches
    // every other control. Title Casing here would change nothing on the
    // header and would put Title Case on a row of controls that has none.
    for (const catalog of STATIC_CATALOGS) {
      for (const item of catalog.items) {
        expect(item.path[0], catalog.sourceId).toBe(item.path[0].toLowerCase());
      }
    }
  });

  it('starts every row label with a capital, bar two stated exceptions', () => {
    const lower = new Map<string, string[]>();
    for (const catalog of STATIC_CATALOGS) {
      for (const item of catalog.items) {
        const first = /^\p{L}/u.exec(item.label);
        // A leading accidental is notation, not a word — see titleCase.
        if (!first || /^[b#][\d\p{Lu}]/u.test(item.label)) continue;
        if (first[0] !== first[0].toLowerCase()) continue;
        const bucket = lower.get(catalog.sourceId) ?? [];
        bucket.push(item.label);
        lower.set(catalog.sourceId, bucket);
      }
    }

    // EXCEPTION ONE, and it is a known gap rather than a decision. The
    // 96 scale cells and 372 voice-leading cells still render their
    // stored itemRef as their label (`major:C`) — RULE_LEGIBILITY
    // §1.8b's predicted recurrence, and not a capitalisation problem,
    // because casing a raw ref would not make it a label. Pinned at its
    // exact size so it cannot grow quietly, and so closing it fails here
    // and asks for this number to go rather than passing silently.
    expect(lower.get('shapes-and-patterns')).toHaveLength(468);

    // EXCEPTION TWO, and it is correct as it stands. Harmonic fluency's
    // leaf label is the card's whole QUESTION, left as written — and two
    // of them open on a lowercase chord symbol, because in roman-numeral
    // notation the case IS the quality. `bVII` is a flat-seven major and
    // `iv` a minor four; capitalising either names a different chord.
    //
    // `bVII` is skipped above as an accidental, so `iv` is the one that
    // reaches here. Pinned by count and by content so the exemption
    // stays this row rather than becoming a blanket pass for the module.
    expect(lower.get('harmonic-fluency')).toHaveLength(1);
    expect(lower.get('harmonic-fluency')![0]).toMatch(/^iv /);

    expect([...lower.keys()].sort()).toEqual(['harmonic-fluency', 'shapes-and-patterns']);
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
    //
    // Compared against the TITLE CASED label, because that is the
    // dashboard's convention for everything below a module header. The
    // id comparison stays case-sensitive on purpose: `maj` reaching a
    // row is the defect whether or not something capitalised it first.
    for (const q of READING_CHORD_QUALITIES) {
      const row = rows.find(i => i.itemRefs[0].startsWith(`chord:${q.id}:`))!;
      expect(row.label, q.id).toContain(titleCase(q.label));
      if (q.id !== q.label) {
        expect(row.label.split(/[\s·]+/), q.id).not.toContain(q.id);
      }
    }
  });

  it('names a chord row by the three things the picker asks', () => {
    const labels = labelsIn('Chord Identification');
    expect(labels).toContain('Root Position · Major · Treble Clef');
    expect(labels).toContain('Third Inversion · Minor 7th · Bass Clef');
  });

  it('omits the root, because the root is the variable being tested', () => {
    // A row naming one root would describe a card that only sometimes
    // appears.
    for (const label of labelsIn('Chord Identification')) {
      expect(label, label).not.toMatch(/\b[A-G][#b♯♭]?\b/);
    }
  });

  it('drops the position on open shapes, agreeing with renderCard', () => {
    // They ARE a voicing, so "root position" adds nothing — which is
    // what renderCard already decides for their captions.
    const open = READING_CHORD_QUALITIES.filter(q => q.family === 'open');
    for (const q of open) {
      const row = rows.find(i => i.itemRefs[0].startsWith(`chord:${q.id}:`))!;
      expect(row.label, q.id).not.toContain('Root Position');
      expect(row.label).toContain(titleCase(q.label));
    }
  });

  it('uses the corrected interval names for the two that under-specified', () => {
    // [0,10] is a MINOR seventh and [0,16] a MAJOR tenth; the old
    // labels each described two different shapes.
    const labels = labelsIn('Chord Identification');
    expect(labels.some(l => l.includes('Root + ♭7'))).toBe(true);
    expect(labels.some(l => l.includes('Root + Major 10th'))).toBe(true);
    expect(labels.some(l => l.toLowerCase().includes('root–seventh'))).toBe(false);
  });

  it('names a note row by its pitch, not by a staff coordinate', () => {
    const labels = labelsIn('Note Recognition');
    expect(labels).toContain('Treble · A3');
    expect(labels.some(l => /-\d/.test(l))).toBe(false);
  });

  it('names a shape row by its inversion in words', () => {
    expect(labelsIn('Notation Shapes')).toContain('Triad · First Inversion');
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
      'Note Recognition',
      'Key Signature Recognition',
      'Notation Shapes',
      'Chord Identification',
    ]);
  });
});
