/**
 * Coordinates from the KEY-INDEXED generators.
 *
 * Ten generators in catalogExpansions.ts plus three in pentatonics, all
 * looping over a root. Asserted per generator, because one assertion
 * over "cards with a key" passes while any single generator ships
 * without.
 */
import { describe, expect, it } from 'vitest';
import { CATEGORY_LABELS, FLASHCARDS } from '../catalog';
import { FLAT_TWELVE, MODE_BY_DEGREE, SLASH_SHAPES } from '../catalogExpansions';
import { HARMONIC_FLUENCY_GRIDS } from '../progressGrids';
import { placeItems } from '../../../components/moduleHome/placeItems';
import { resolveView, SINGLE_ROW } from '../../../components/moduleHome/axis';
import type { SkillRecord } from '../../skills/registry';
import { canonicaliseKey } from '../../repertoire/circleOfFourths';

const byPrefix = (re: RegExp) => FLASHCARDS.filter(c => re.test(c.id));

/** Each generator, the count it must produce, and the keys its axis
 *  must carry. ASYMMETRIC: the counts differ, so one wrong generator
 *  cannot hide behind another. */
const GENERATORS: ReadonlyArray<[string, RegExp, number, string[]]> = [
  ['ii-V-I',           /^fh-ii-v-i-/,   11, ['key', 'shape']],
  ['V/V',              /^fh-v-of-v-/,   11, ['key', 'shape']],
  ['V/vi',             /^fh-v-of-vi-/,  11, ['key', 'shape']],
  // 33 before ruling 42 — three modes in eleven keys. Thirteen keys by
  // seven modes now, under an id shape that has never existed, because
  // the old one could not tell F♯ major from G♭ major.
  ['mode-of',          /^mo-mode-/,     91, ['degree', 'key']],
  // 44 before ruling 30 — eleven keys x four shapes. Seven shapes
  // across twelve keys now; ruling 37 removed the three hand-written C
  // cards that were keeping the generator out of that key.
  // 44 before ruling 30, 84 before ruling 40. Seven shapes across
  // thirteen keys now, under a prefix that has never existed — the old
  // one could not tell F♯ major from G♭ major.
  ['slash',            /^sc-slash-/,    91, ['key', 'shape']],
  // `pivot top-ups` WAS HERE. Reverse Key Pivots folded into
  // `degree-notes` on 3 Sep 2026 and its three top-ups went with it;
  // `retiredCategoryMigration` reads the generator now.
  ['progression 1564', /^pr-1564-/,      6, ['key', 'shape']],
  // The relative top-ups retired in commit 8 into three generated sets
  // over thirteen keys. The parallel set is untouched — Silas has not
  // ruled on it — and gained only an `ask` row so it lands on the
  // grid's new six rows rather than in the tail.
  ['key count',        /^ks-count-/,    13, ['ask', 'key']],
  ['relative minor',   /^ks-relminor-/, 13, ['ask', 'key', 'relation']],
  ['relative major',   /^ks-relmajor-/, 13, ['ask', 'key']],
  ['major from count', /^ks-sig-major-/, 13, ['ask', 'key']],
  ['minor from count', /^ks-sig-minor-/, 13, ['ask', 'key']],
  ['parallel minor',   /^ks-parallel-/,  8, ['ask', 'key', 'relation']],
  // THE FIVE TOP-UPS RETIRED WITH THE TWENTY (ruling 43). The grid
  // that replaced them is every note by every distance, none missing;
  // `movement` rides along so the Distance chip gathers them beside the
  // movement cards.
  // The octave is the one span with no movement id, so it is excluded
  // here and asserted in its own test below.
  ['interval grid', /^iv-[^-]+-up-(?!12$)\d+$/, 143,
    ['from', 'movement', 'semitones', 'to']],
];

describe('every keyed generator supplies coordinates', () => {
  for (const [name, re, count, keys] of GENERATORS) {
    it(`${name}: ${count} cards, all carrying ${keys.join(' + ')}`, () => {
      const cards = byPrefix(re);
      expect(cards).toHaveLength(count);
      for (const c of cards) {
        expect(Object.hasOwn(c, 'axis'), c.id).toBe(true);
        expect(Object.keys(c.axis!).sort(), c.id).toEqual(keys);
      }
    });
  }

  it('pentatonics carries root and shape across all three shapes', () => {
    const cards = FLASHCARDS.filter(c => c.category === 'pentatonic-scales'
      && Object.hasOwn(c, 'axis'));
    // Commit 8: the five formula cards went, the twelve "share the
    // same" ones became thirteen lick cards, and major gained F♯.
    // Twelve minor + thirteen major + thirteen lick = 38, and every
    // card in the category now carries a root.
    expect(cards).toHaveLength(38);
    expect(cards).toHaveLength(
      FLASHCARDS.filter(c => c.category === 'pentatonic-scales').length,
    );
    const shapes = new Set(cards.map(c => c.axis!.shape));
    expect([...shapes].sort()).toEqual(['lick', 'major', 'minor']);
  });

  it('keeps the three functional-harmony shapes apart', () => {
    // All three key on root. Without `shape` they would collide in one
    // cell and two of every three cards would be invisible.
    const fh = FLASHCARDS.filter(c => c.category === 'functional-harmony'
      && Object.hasOwn(c, 'axis'));
    const cells = new Set(fh.map(c => `${c.axis!.key}|${c.axis!.shape}`));
    expect(cells.size).toBe(fh.length);
  });

  it('gives the octave no movement, and only the octave', () => {
    // The movement vocabulary runs from the minor 2nd to the major
    // 7th, because a degree cannot move an octave and land somewhere
    // else. Thirteen octave cards, one per start note.
    const octaves = byPrefix(/^iv-[^-]+-up-12$/);
    expect(octaves).toHaveLength(13);
    for (const c of octaves) {
      expect(Object.keys(c.axis!).sort(), c.id).toEqual(['from', 'semitones', 'to']);
    }
  });

  it('lands every interval card in ONE grid', () => {
    // Same field names on every card, so no card falls to the tail.
    // It used to be two generators — twenty hand-picked pairs and five
    // top-ups — and this asserted the two agreed. Ruling 43 makes it
    // one, and the claim becomes that the one is uniform.
    const cards = byPrefix(/^iv-[^-]+-up-\d+$/);
    const shapes = new Set(cards.map(c => Object.keys(c.axis!).sort().join('+')));
    expect([...shapes].sort()).toEqual([
      'from+movement+semitones+to',   // every distance the deck names
      'from+semitones+to',            // the octave, which it does not
    ]);
  });
});

/** A SkillRecord shell around a card, for placement tests. */
const asRecord = (c: typeof FLASHCARDS[number]): SkillRecord => ({
  skillId: `harmonic-fluency:card:${c.id}`,
  moduleId: 'harmonic-fluency',
  moduleLabel: 'harmonic fluency',
  moduleRoute: '/harmonic-fluency',
  itemId: c.id,
  name: c.question,
  category: CATEGORY_LABELS[c.category],
  skillType: 'theory',
  currentTier: 'untouched',
  freshness: 'fresh',
  daysSince: null,
  lastPracticed: null,
  totalTime: 0,
  tags: [],
  window: [],
  ...(c.axis ? { axis: c.axis } : {}),
});

const place = (categoryLabel: string) => {
  const grid = HARMONIC_FLUENCY_GRIDS[categoryLabel];
  const items = FLASHCARDS
    .filter(c => CATEGORY_LABELS[c.category] === categoryLabel)
    .map(asRecord);
  const colView = resolveView(grid.columns, null);
  const rowView = grid.rows ? resolveView(grid.rows, null) : SINGLE_ROW;
  const placed = placeItems(items, grid, colView, rowView);
  return { spec: grid, items, grid: placed.grid, tail: placed.tail };
};

describe('the grids place what the generators produced', () => {
  it('puts every keyed progression in the grid and the twenty in the tail', () => {
    // The grid-plus-tail shape, on the category that motivated it.
    const { grid, tail, items } = place(CATEGORY_LABELS.progressions);
    expect(items).toHaveLength(26);
    expect(tail).toHaveLength(20);
    expect(items.filter(i => i.axis !== undefined)).toHaveLength(6);
    const placed = [...grid!.cells.values()]
      .flatMap(col => [...col.values()].flat());
    expect(placed).toHaveLength(6);
  });

  it('places every pentatonic card, both spellings of the roots', () => {
    // The failure this guards: one root axis would drop C#/F#/G# or
    // Db/Gb/Ab into the tail depending on which list was chosen.
    const { tail } = place(CATEGORY_LABELS['pentatonic-scales']);
    // Nothing in the tail at all since commit 8: the five formula
    // cards were the only ones without coordinates and they are gone.
    expect(tail).toHaveLength(0);
  });

  it('places every mode, slash and functional-harmony card it should', () => {
    for (const label of [
      CATEGORY_LABELS.modes,
      CATEGORY_LABELS['slash-chords'],
      CATEGORY_LABELS['functional-harmony'],
    ]) {
      const { tail, items } = place(label);
      const withAxis = items.filter(i => i.axis !== undefined);
      // Everything with coordinates is placed; the tail is exactly the
      // hand-written remainder.
      expect(tail.length, label).toBe(items.length - withAxis.length);
    }
  });
});

describe('the axis order is the passed list', () => {
  it('offers all thirteen keys even where a generator covers fewer', () => {
    // The axis is a claim about the key set rather than a picture of
    // which cards exist: the parallel set still covers twelve and the
    // column for the thirteenth stays, empty and honest.
    const { grid } = place(CATEGORY_LABELS['key-signatures']);
    // THIRTEEN, AND IT WAS TWELVE, AND BEFORE THAT THIRTEEN — see the
    // argument on `thirteenKeyAxis`. It was twelve while every
    // coordinate was minted from the identity vocabulary; ruling 40
    // makes F♯ major and G♭ major two keys with two answers, so the
    // column holding both was answering two questions.
    expect(grid!.columns).toHaveLength(13);
    expect(grid!.columns).toContain('F#');
    expect(grid!.columns).toContain('Gb');
    const used = new Set(byPrefix(/^ks-parallel-/).map(c => String(c.axis!.key)));
    expect(used.size).toBe(8);
  });

  it('reads the slash-chord and mode row orders from their generators', () => {
    // ASYMMETRIC: neither list is alphabetical, so a grid that sorted
    // would differ.
    const slash = HARMONIC_FLUENCY_GRIDS[CATEGORY_LABELS['slash-chords']];
    expect(slash.rows!.views[0].values).toEqual(SLASH_SHAPES.map(s => s.id));
    expect(slash.rows!.views[0].values).not.toEqual([...SLASH_SHAPES.map(s => s.id)].sort());

    const modes = HARMONIC_FLUENCY_GRIDS[CATEGORY_LABELS.modes];
    expect(modes.rows!.views[0].values).toEqual(MODE_BY_DEGREE.map(m => Number(m.degree)));
  });

  it('uses the IDENTITY of whatever list the generator looped over', () => {
    // The generators still walk FLAT_TWELVE — the flat spelling is a
    // teaching choice and every word of every card still comes from it
    // — but a card's COORDINATE is the identity, so the axis and the
    // card cannot disagree about which column a G♭ card belongs in.
    const keyed = byPrefix(/^fh-ii-v-i-/).map(c => String(c.axis!.key));
    const identities = FLAT_TWELVE.map(k => canonicaliseKey(k) ?? k);
    expect(keyed).toEqual(identities.filter(k => keyed.includes(k)));
    expect(keyed).toContain('F#');
    expect(keyed).not.toContain('Gb');
  });
});
