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
  ['mode-of',          /^mo-mode-of-/,  33, ['degree', 'key']],
  // 44 before ruling 30 — eleven keys x four shapes. Seven shapes now,
  // across twelve keys, less the three C cards that are hand-written.
  ['slash',            /^sc-\d-/,       81, ['key', 'shape']],
  // `pivot top-ups` WAS HERE. Reverse Key Pivots folded into
  // `degree-notes` on 3 Sep 2026 and its three top-ups went with it;
  // `retiredCategoryMigration` reads the generator now.
  ['progression 1564', /^pr-1564-/,      6, ['key', 'shape']],
  ['relative minor',   /^ks-relative-/,  9, ['key', 'relation']],
  ['parallel minor',   /^ks-parallel-/,  8, ['key', 'relation']],
  ['interval top-ups', /^iv-[A-G][b#]?-\d/, 5, ['from', 'semitones', 'to']],
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
    // Eleven roots per shape plus the relative set — 36, not 41: the
    // five formula cards carry no root.
    expect(cards).toHaveLength(36);
    const shapes = new Set(cards.map(c => c.axis!.shape));
    expect([...shapes].sort()).toEqual(['major', 'minor', 'relative']);
  });

  it('keeps the three functional-harmony shapes apart', () => {
    // All three key on root. Without `shape` they would collide in one
    // cell and two of every three cards would be invisible.
    const fh = FLASHCARDS.filter(c => c.category === 'functional-harmony'
      && Object.hasOwn(c, 'axis'));
    const cells = new Set(fh.map(c => `${c.axis!.key}|${c.axis!.shape}`));
    expect(cells.size).toBe(fh.length);
  });

  it('lands the interval top-ups in the SAME grid as the main generator', () => {
    // Same field names, so the five top-ups are extra cells rather than
    // a parallel category that quietly falls to the tail.
    const main = byPrefix(/^iv-\d+$/)[0].axis!;
    const topUp = byPrefix(/^iv-[A-G][b#]?-\d/)[0].axis!;
    expect(Object.keys(main).sort()).toEqual(Object.keys(topUp).sort());
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
    // Only the five formula cards, which carry no coordinates.
    expect(tail).toHaveLength(5);
    for (const t of tail) expect(t.axis).toBeUndefined();
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
  it('offers all twelve keys even where a generator skipped some', () => {
    // Relative-minor top-ups cover nine of twelve; the axis still
    // offers twelve, because it is a claim about the key set rather
    // than a picture of which cards exist.
    const { grid } = place(CATEGORY_LABELS['key-signatures']);
    // TWELVE, AND IT WAS THIRTEEN. F♯ and G♭ were separate columns
    // while the two generator families each wrote their own spelling
    // into a card's coordinates. Both write the identity now, so one
    // column holds the pitch and the header spells it.
    expect(grid!.columns).toHaveLength(12);
    expect(grid!.columns).toContain('F#');
    expect(grid!.columns).not.toContain('Gb');
    const used = new Set(byPrefix(/^ks-relative-/).map(c => String(c.axis!.key)));
    expect(used.size).toBe(9);
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
