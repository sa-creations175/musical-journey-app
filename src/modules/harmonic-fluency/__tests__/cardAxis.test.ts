/**
 * Coordinates from the generators, per category.
 *
 * ---------------------------------------------------------------
 * ONE CATEGORY AT A TIME, ON PURPOSE.
 *
 * A single "every card in the deck has an axis" assertion is wrong —
 * most categories legitimately have none. A single "some card has an
 * axis" assertion is worse: it passes while seven of the eight
 * generators silently ship without one. So each generator is asserted
 * on its own, by the values it was supposed to supply.
 * ---------------------------------------------------------------
 */
import { describe, expect, it } from 'vitest';
import {
  CATEGORY_LABELS, ENHARMONIC_INTERVAL_GROUPS, ENHARMONIC_NOTE_PAIRS,
  ENHARMONIC_SPELLINGS, FLASHCARDS, generateNamedNoteCards,
  generateReversePivotCards, generateTritonePairCards, HF_MAJOR_KEYS,
  SCALE_DEGREES,
  type FlashcardCategory,
} from '../catalog';

const inCategory = (c: FlashcardCategory) => FLASHCARDS.filter(f => f.category === c);

/** Cards a GENERATOR produced, told apart from hand-written ones by id
 *  prefix — the positional ids are exactly the generated ones. */
const generated = (c: FlashcardCategory, prefix: RegExp) =>
  inCategory(c).filter(f => prefix.test(f.id));

/**
 * RETIRED, AND STILL PINNED. Named Notes and Tritone Pairs are out of
 * the deck; their generators are not, because `retiredCategoryMigration`
 * reads them to prove which new card each retired one became. A
 * coordinate that drifted here would silently repoint a row, so these
 * two blocks read the generators directly and stay until commit 9
 * deletes both.
 */
describe('named notes (retired — read by the migration)', () => {
  const cards = generateNamedNoteCards().filter(f => /^nn-\d+$/.test(f.id));

  it('carries key and degree on every generated card', () => {
    expect(cards.length).toBe(24);
    for (const c of cards) {
      expect(Object.hasOwn(c, 'axis'), c.id).toBe(true);
      expect(Object.keys(c.axis!).sort()).toEqual(['degree', 'key']);
    }
  });

  it('takes coordinates from the pair, not from the id number', () => {
    // ASYMMETRIC: the pairs deliberately repeat keys with different
    // degrees and degrees with different keys, so a coordinate read off
    // the id's position would not reproduce this mapping.
    const byId = new Map(cards.map(c => [c.id, c.axis!]));
    expect(byId.get('nn-1')).toEqual({ key: 'C', degree: 5 });
    expect(byId.get('nn-13')).toEqual({ key: 'C', degree: 7 });
    expect(byId.get('nn-12')).toEqual({ key: 'F#', degree: 4 });
  });

  it('lands every card on the axis lists the grid passes', () => {
    for (const c of cards) {
      expect(HF_MAJOR_KEYS, c.id).toContain(c.axis!.key);
      expect(SCALE_DEGREES, c.id).toContain(c.axis!.degree);
    }
  });
});

describe('reverse key pivots (retired — read by the migration)', () => {
  const cards = generateReversePivotCards().filter(f => /^rkp-\d+$/.test(f.id));

  it('carries key and degree on every generated card', () => {
    expect(cards.length).toBe(24);
    for (const c of cards) {
      expect(Object.hasOwn(c, 'axis'), c.id).toBe(true);
      expect(Object.keys(c.axis!).sort()).toEqual(['degree', 'key']);
      expect(HF_MAJOR_KEYS).toContain(c.axis!.key);
      expect(SCALE_DEGREES).toContain(c.axis!.degree);
    }
  });

  it('names the ANSWER key, which the question never states', () => {
    // The question asks "X is the nth of which key?" — so the key is
    // the answer, and it is only in scope inside the generator.
    const c = cards[0];
    expect(c.correctAnswer).toContain(String(c.axis!.key));
  });
});

describe('intervals', () => {
  // `iv-{from}-up-{span}` since ruling 43. The positional `iv-1` shape
  // retired with the twenty hand-picked pairs it numbered.
  const cards = generated('intervals', /^iv-[^-]+-up-\d+$/);

  it('carries from, to, the computed span and the movement', () => {
    // 13 notes x 12 distances, less the six that would need a double
    // accidental.
    expect(cards.length).toBe(150);
    for (const c of cards) {
      expect(Object.hasOwn(c, 'axis'), c.id).toBe(true);
      // `movement` is absent on the octave and only there — the
      // movement vocabulary runs from the minor 2nd to the major 7th,
      // because a degree cannot move an octave and land somewhere else.
      const expected = c.axis!.semitones === 12
        ? ['from', 'semitones', 'to']
        : ['from', 'movement', 'semitones', 'to'];
      expect(Object.keys(c.axis!).sort(), c.id).toEqual(expected);
    }
  });

  it('records the span the generator computed, not one re-derived', () => {
    // ASYMMETRIC: C->G is 7 and G->D is also 7, but C->E is 4 — so a
    // constant or an id-derived value cannot satisfy all three.
    const by = new Map(cards.map(c => [`${c.axis!.from}->${c.axis!.to}`, c.axis!.semitones]));
    expect(by.get('C->G')).toBe(7);
    expect(by.get('C->E')).toBe(4);
    expect(by.get('G->F')).toBe(10);
  });
});

describe('tritone pairs (retired — read by the migration)', () => {
  const cards = generateTritonePairCards().filter(f => /^tt-\d+$/.test(f.id));

  it('carries the note and its partner', () => {
    expect(cards.length).toBe(12);
    for (const c of cards) {
      expect(Object.hasOwn(c, 'axis'), c.id).toBe(true);
      expect(Object.keys(c.axis!).sort()).toEqual(['note', 'partner']);
    }
  });

  it('gives each note exactly one partner, and never itself', () => {
    for (const c of cards) expect(c.axis!.note).not.toBe(c.axis!.partner);
    expect(new Set(cards.map(c => c.axis!.note)).size).toBe(12);
  });
});

describe('enharmonic equivalents', () => {
  const notes = generated('enharmonic-equivalents', /^enh-n-\d+$/);
  const degrees = generated('enharmonic-equivalents', /^enh-i-\d+$/);

  it('carries a spelling and a kind on both generators', () => {
    expect(notes.length).toBe(18);
    expect(degrees.length).toBe(17);
    for (const c of notes) {
      expect(Object.keys(c.axis!).sort()).toEqual(['equivalent', 'kind', 'spelling']);
      expect(c.axis!.kind).toBe('note');
    }
    for (const c of degrees) {
      expect(Object.keys(c.axis!).sort()).toEqual(['group', 'kind', 'spelling']);
      expect(c.axis!.kind).toBe('interval');
    }
  });

  it('puts the two cards of one pair in DIFFERENT cells', () => {
    // Both directions of Ab/G# exist. Coordinates keyed on the pair
    // rather than on the note asked about would collide, and one of the
    // two would vanish behind the other in its cell.
    const ab = notes.filter(c => c.axis!.spelling === 'Ab' || c.axis!.spelling === 'G#');
    expect(ab).toHaveLength(2);
    expect(new Set(ab.map(c => c.axis!.spelling)).size).toBe(2);
  });

  it('lands every spelling on the exported axis list', () => {
    // The list is DERIVED from the same two source tables the generator
    // reads, so this cannot pass by coincidence.
    for (const c of [...notes, ...degrees]) {
      expect(ENHARMONIC_SPELLINGS, c.id).toContain(c.axis!.spelling);
    }
    expect(ENHARMONIC_SPELLINGS.length)
      .toBe(ENHARMONIC_NOTE_PAIRS.length * 2
        + ENHARMONIC_INTERVAL_GROUPS.reduce((n, g) => n + g.members.length, 0));
  });
});

describe('absent means flat list, not broken', () => {
  it('leaves the hand-written cards without an axis', () => {
    // The twenty progression one-offs and every hand-written card carry
    // none, and that is the answer rather than a gap — inventing
    // coordinates to force a 1x1 grid would be making structure up.
    const pr = inCategory('progressions').filter(c => /^pr-\d+$/.test(c.id));
    expect(pr.length).toBe(20);
    for (const c of pr) expect(Object.hasOwn(c, 'axis'), c.id).toBe(false);
  });

  it('keeps every card in the deck valid with or without one', () => {
    // The field is optional; nothing reads it unguarded.
    for (const c of FLASHCARDS) {
      expect(typeof c.id).toBe('string');
      if (Object.hasOwn(c, 'axis')) expect(typeof c.axis).toBe('object');
    }
  });

  it('pins how many cards carry coordinates, per category', () => {
    // A count over the whole deck, so a generator that quietly stopped
    // supplying them shows up here even if its own test was deleted.
    //
    // TWELVE OF FIFTEEN CATEGORIES. Scale degree math joined them: it
    // is generated from a triple loop and always held its coordinates
    // in `facts`, so the axis was one line rather than new structure.
    // The three with none — diatonic qualities, chord construction,
    // ear theory — are hand-written and vary by nothing a grid could
    // show. They render as the flat list, which is the answer for them
    // rather than a gap.
    const withAxis = FLASHCARDS.filter(c => Object.hasOwn(c, 'axis'));
    const byCategory = new Map<string, number>();
    for (const c of withAxis) {
      byCategory.set(c.category, (byCategory.get(c.category) ?? 0) + 1);
    }
    expect(Object.fromEntries([...byCategory].sort())).toEqual({
      'enharmonic-equivalents': 35,
      'scale-degree-math': 168,
      'functional-harmony': 33,
      'intervals': 150,
      'key-signatures': 17,
      // 33 before ruling 42 — three modes in eleven keys. Every mode
      // in every key now, and F♯ major and G♭ major are two of them.
      'modes': 91,
      // Ruling 43: every note by every distance, less the six
      // combinations that would need a double accidental.
      'degree-notes': 625,
      'pentatonic-scales': 36,
      'progressions': 6,
      // 44 before ruling 30: eleven keys x four shapes. Seven shapes
      // across twelve keys now — ruling 37 took the three hand-written
      // C cards that were keeping the generator out of that key.
      'slash-chords': 84,
    });
  });
});

describe('scale degree math is 7 degrees x 24 movements', () => {
  it('offers exactly the 24 movements, in the generator\u2019s order', async () => {
    const { HARMONIC_FLUENCY_GRIDS } = await import('../progressGrids');
    const { DEGREE_MOVEMENTS, movementId } = await import('../scaleDegreeQualityCards');
    const { INTERVAL_QUALITIES, DIRECTIONS } = await import('../scaleDegreeQuality');

    const grid = HARMONIC_FLUENCY_GRIDS[CATEGORY_LABELS['scale-degree-math']];
    expect(grid.columns.views[0].values.map(String))
      .toEqual(DEGREE_MOVEMENTS.map(m => m.id));
    // And the list itself is the product of the two the generator
    // walks, not a third copy of them.
    expect(DEGREE_MOVEMENTS.map(m => m.id)).toEqual(
      INTERVAL_QUALITIES.flatMap(q => DIRECTIONS.map(d => movementId(q, d))),
    );
    expect(DEGREE_MOVEMENTS).toHaveLength(24);
    expect(grid.rows!.views[0].values).toHaveLength(7);
  });

  it('lays the movements ACROSS and the degrees down', async () => {
    // The stored orientation. Transposing it is the reader's call at
    // render time, not a fact about the catalogue — see ProgressDetail.
    const { HARMONIC_FLUENCY_GRIDS } = await import('../progressGrids');
    const grid = HARMONIC_FLUENCY_GRIDS[CATEGORY_LABELS['scale-degree-math']];
    expect(grid.columns.field).toBe('movement');
    expect(grid.rows!.field).toBe('degree');
  });

  it('keeps the movement labels the generator wrote', async () => {
    // The generator's words, not re-spelled beside the grid.
    const { HARMONIC_FLUENCY_GRIDS } = await import('../progressGrids');
    const { DEGREE_MOVEMENTS } = await import('../scaleDegreeQualityCards');
    const { axisLabel } = await import('../../../components/moduleHome/axis');
    const grid = HARMONIC_FLUENCY_GRIDS[CATEGORY_LABELS['scale-degree-math']];
    for (const m of DEGREE_MOVEMENTS) {
      expect(axisLabel(grid.columns, m.id)).toBe(m.label);
    }
  });

  it('lands every one of the 168 in a cell', async () => {
    // NOTHING IN THE TAIL. A coordinate the axis does not offer falls
    // out of the grid silently, so the count is what says the two
    // lists agree — and 7 x 24 = 168 says no cell holds two.
    const { HARMONIC_FLUENCY_GRIDS } = await import('../progressGrids');
    const grid = HARMONIC_FLUENCY_GRIDS[CATEGORY_LABELS['scale-degree-math']];
    const columns = new Set(grid.columns.views[0].values.map(String));
    const rows = new Set(grid.rows!.views[0].values.map(String));

    const cards = inCategory('scale-degree-math');
    expect(cards).toHaveLength(168);
    const cells = new Set<string>();
    for (const c of cards) {
      expect(c.axis, c.id).toBeDefined();
      expect(columns.has(String(c.axis!.movement)), c.id).toBe(true);
      expect(rows.has(String(c.axis!.degree)), c.id).toBe(true);
      cells.add(`${c.axis!.degree}|${c.axis!.movement}`);
    }
    expect(cells.size).toBe(168);
  });
});

describe('the grid reads the passed list, not the coordinates present', () => {
  it('offers columns for keys no card in the category uses', async () => {
    const { HARMONIC_FLUENCY_GRIDS } = await import('../progressGrids');
    // Progression Vocabulary, since Reverse Key Pivots retired: it
    // reaches six of the twelve keys and the axis still offers all
    // twelve, which is the asymmetry this needs.
    const grid = HARMONIC_FLUENCY_GRIDS[CATEGORY_LABELS.progressions];
    const used = new Set(
      inCategory('progressions')
        .filter(c => c.axis?.key !== undefined)
        .map(c => String(c.axis!.key)),
    );
    const offered = grid.columns.views[0].values.map(String);
    // ASYMMETRIC: the progressions use fewer keys than the axis offers,
    // so a column list collected off the cards would be SHORTER.
    expect(offered.length).toBeGreaterThan(used.size);
    for (const k of HF_MAJOR_KEYS) expect(offered).toContain(k);
  });

  it('keeps both key views over the same twelve', async () => {
    const { HARMONIC_FLUENCY_GRIDS } = await import('../progressGrids');
    const { viewsAgree } = await import('../../../components/moduleHome/axis');
    // SLASH CHORDS, NOT MODES. `keyAxis` is the thing under test, and
    // Mode Identification stopped using it under ruling 40 — its
    // thirteen keys cannot be ordered by a wheel that holds twelve, so
    // it has one view. `identitySplit` pins that.
    const grid = HARMONIC_FLUENCY_GRIDS[CATEGORY_LABELS['slash-chords']];
    expect(grid.columns.views).toHaveLength(2);
    expect(viewsAgree(grid.columns)).toBe(true);
    // And they really are different orders, or the toggle is decoration.
    expect(grid.columns.views[0].values).not.toEqual(grid.columns.views[1].values);
  });
});
