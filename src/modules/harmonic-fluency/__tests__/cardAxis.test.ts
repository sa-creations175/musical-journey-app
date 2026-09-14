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
  CATEGORY_LABELS, ENHARMONIC_INTERVAL_GROUPS, ENHARMONIC_NOTE_PAIRS, ENHARMONIC_SPELLINGS, FLASHCARDS, INTERVAL_SEMITONES, type FlashcardCategory,
} from '../catalog';

const inCategory = (c: FlashcardCategory) => FLASHCARDS.filter(f => f.category === c);

/** Cards a GENERATOR produced, told apart from hand-written ones by id
 *  prefix — the positional ids are exactly the generated ones. */
const generated = (c: FlashcardCategory, prefix: RegExp) =>
  inCategory(c).filter(f => prefix.test(f.id));

describe('intervals', () => {
  // `iv-{from}-up-{span}` since ruling 43. The positional `iv-1` shape
  // retired with the twenty hand-picked pairs it numbered.
  const cards = generated('intervals', /^iv-[^-]+-up-\d+$/);

  it('carries from, to, the computed span and the movement', () => {
    // 13 notes x 12 distances, none missing: the six that need a
    // double accidental write one, glossed.
    expect(cards.length).toBe(143);
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
    // SIX ONE-OFFS, down from twenty, AND EVERY ONE OF THEM NAMES NO
    // KEY. A progression is in every key or it is not in the deck, so
    // the ones that could be generated were and the rest went. What is
    // left asks about a progression in the abstract — the rotation, the
    // plagal vamp, the 12-bar structure, the two pedals, the Coltrane
    // cycle — and none carries coordinates. Inventing them to force a
    // 1x1 grid would be making structure up.
    const pr = inCategory('progressions').filter(c => /^pr-\d+$/.test(c.id));
    expect(pr.length).toBe(6);
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
    // THIRTEEN OF SIXTEEN CATEGORIES. Scale degree math joined them: it
    // is generated from a triple loop and always held its coordinates
    // in `facts`, so the axis was one line rather than new structure.
    // The ones with none — diatonic qualities and chord construction,
    // and ear theory until it retired on 14 Sep 2026 — are hand-written
    // and vary by nothing a grid could show. They render as the flat list, which is the answer for them
    // rather than a gap.
    const withAxis = FLASHCARDS.filter(c => Object.hasOwn(c, 'axis'));
    const byCategory = new Map<string, number>();
    for (const c of withAxis) {
      byCategory.set(c.category, (byCategory.get(c.category) ?? 0) + 1);
    }
    expect(Object.fromEntries([...byCategory].sort())).toEqual({
      // Spell the chord in a key, 14 Sep 2026: thirteen keys, seven degrees.
      'chord-construction': 91,
      'enharmonic-equivalents': 35,
      'scale-degree-math': 168,
      // 33 before the 2-5-1 moved to Progression Vocabulary — eleven
      // cards each for ii-V-I, V/V and V/vi. Two generators now, and
      // twelve keys each since `fh-11` and `fh-12` folded into the key of
      // C's generated cards on 14 Sep 2026.
      'functional-harmony': 24,
      // 156 for a day: thirteen notes by twelve distances. The octave
      // went for asking nothing — "the interval from D♭ to D♭" — so it
      // is eleven distances now.
      'intervals': 143,
      // 17 before commit 8 — nine relative top-ups and eight parallel.
      // Three generated sets over thirteen keys now (count, the
      // relative pair both ways, and a count-to-key card per mode),
      // plus the eight parallel ones, which are untouched.
      'key-signatures': 73,
      // 33 before ruling 42 — three modes in eleven keys. Every mode
      // in every key now, and F♯ major and G♭ major are two of them.
      // Scales & Modes since 14 Sep 2026: 91 generated mode cards and the
      // 38 pentatonic cards, every one with coordinates.
      'modes': 129,
      // Ruling 43: every note by every distance, less the six
      // combinations that would need a double accidental.
      'degree-notes': 625,
      // 6 before commit 8 — one shape in six keys. Six named
      // progressions across thirteen keys now, under a prefix that has
      // never existed.
      'progressions': 78,
      // 44 before ruling 30: eleven keys x four shapes. Seven shapes
      // across thirteen keys now — ruling 37 took the three
      // hand-written C cards that kept the generator out of that key,
      // and ruling 40 made F♯ major and G♭ major two of the thirteen.
      'slash-chords': 91,
      // Thirteen keys by ten chords. It was 126 for an afternoon —
      // four cards whose own key could not give them a fair set of
      // wrong answers — until the pool reached one key next door. See
      // `MODAL_IMPROV_WIDENED`.
      'modal-improvisation': 130,
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
  it('offers columns for values no card in the category uses', async () => {
    const { HARMONIC_FLUENCY_GRIDS } = await import('../progressGrids');
    // INTERVALS, since 14 Sep 2026. Functional Harmony was the example
    // while the key of C had no generated secondary dominant; `fh-11` and
    // `fh-12` folded into generated C cards and it reaches all twelve
    // keys now. Intervals offer thirteen distances and use eleven: the
    // unison and octave cards went on 9 Sep for answering themselves.
    const grid = HARMONIC_FLUENCY_GRIDS[CATEGORY_LABELS.intervals];
    const used = new Set(
      inCategory('intervals')
        .filter(c => c.axis?.semitones !== undefined)
        .map(c => String(c.axis!.semitones)),
    );
    const offered = grid.columns.views[0].values.map(String);
    // ASYMMETRIC: the cards use fewer distances than the axis offers,
    // so a column list collected off the cards would be SHORTER.
    expect(offered.length).toBeGreaterThan(used.size);
    for (const s of INTERVAL_SEMITONES) expect(offered).toContain(String(s));
  });

  it('keeps both key views over the same twelve', async () => {
    const { HARMONIC_FLUENCY_GRIDS } = await import('../progressGrids');
    const { viewsAgree } = await import('../../../components/moduleHome/axis');
    // FUNCTIONAL HARMONY, which still uses `keyAxis` — the thing under
    // test. The regenerated families' thirteen keys cannot be ordered
    // by a wheel that holds twelve, so they have one view;
    // `identitySplit` pins that.
    const grid = HARMONIC_FLUENCY_GRIDS[CATEGORY_LABELS['functional-harmony']];
    expect(grid.columns.views).toHaveLength(2);
    expect(viewsAgree(grid.columns)).toBe(true);
    // And they really are different orders, or the toggle is decoration.
    expect(grid.columns.views[0].values).not.toEqual(grid.columns.views[1].values);
  });
});
