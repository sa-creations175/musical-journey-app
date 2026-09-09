/**
 * Where the family shows up once it exists — the grid, the row's own
 * description, the coverage counts and the practice schedule.
 *
 * Asserted separately from the cards, because every one of these is a
 * list the family has to be ADDED to. A category that generates 126
 * cards and appears in none of them is a family a reader cannot find,
 * and nothing about the cards themselves would say so.
 */
import { describe, expect, it } from 'vitest';
import { CATEGORY_LABELS, CATEGORY_ORDER, FLASHCARDS } from '../catalog';
import { THIRTEEN_KEYS } from '../catalogExpansions';
import {
  MODAL_CHORDS, MODAL_IMPROV_CATEGORY_NAME, MODAL_IMPROV_DESCRIPTION,
  MODAL_IMPROV_STOPS,
} from '../modalImprovisation';
import { HARMONIC_FLUENCY_GRIDS } from '../progressGrids';
import { isCategory, categoryPath } from '../categoryRoutes';
import { facetValueLabel } from '../facetDisplay';
import { placeItems } from '../../../components/moduleHome/placeItems';
import { resolveView, SINGLE_ROW } from '../../../components/moduleHome/axis';
import type { SkillRecord } from '../../skills/registry';
import { harmonicFluencyCounts } from '../../../lib/moduleItemCounts';
import { skillDescriptionFor } from '../../dashboard/read/affordances';
import { spacingTree } from '../../../lib/spacing/tree';
import type { TreeNode } from '../../dashboard/read/tree';
import { harmonicFluencyColdStartOrder } from '../../../lib/sessionAlgorithm/coldStart';

const CARDS = FLASHCARDS.filter(c => c.category === 'modal-improvisation');

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

describe('the Progress Detail grid', () => {
  const spec = HARMONIC_FLUENCY_GRIDS[MODAL_IMPROV_CATEGORY_NAME];

  it('is thirteen keys across and ten chords down', () => {
    expect(spec).toBeDefined();
    expect(spec.columns.views[0].values).toEqual(THIRTEEN_KEYS);
    expect(spec.rows!.views[0].values).toEqual(MODAL_CHORDS.map(c => c.id));
  });

  it('labels a row with the chord\'s number, not its name', () => {
    // "D7" is the 5 of 5 in G and the 4 in A. The number is the one
    // word that means the same thing down a column of thirteen keys.
    const label = spec.rows!.labelFor!;
    expect(MODAL_CHORDS.map(c => label(c.id)))
      .toEqual(['2', '3', '4', '5', '6', '5 of 2', '5 of 3', '5 of 4',
        '5 of 5', '5 of 6']);
  });

  it('places every card, with nothing in the tail', () => {
    const items = CARDS.map(asRecord);
    const placed = placeItems(
      items, spec, resolveView(spec.columns, null),
      spec.rows ? resolveView(spec.rows, null) : SINGLE_ROW,
    );
    expect(placed.tail).toHaveLength(0);
    const cells = [...placed.grid!.cells.values()]
      .flatMap(col => [...col.values()].flat());
    expect(cells).toHaveLength(126);
  });

  it('leaves exactly the four stopped cells empty', () => {
    const items = CARDS.map(asRecord);
    const placed = placeItems(
      items, spec, resolveView(spec.columns, null),
      spec.rows ? resolveView(spec.rows, null) : SINGLE_ROW,
    );
    const empty: string[] = [];
    for (const key of THIRTEEN_KEYS) {
      for (const chord of MODAL_CHORDS) {
        const cell = placed.grid!.cells.get(key)?.get(chord.id) ?? [];
        if (cell.length === 0) empty.push(`${key}|${chord.id}`);
      }
    }
    expect(empty).toEqual(MODAL_IMPROV_STOPS.map(s => `${s.key}|${s.chord}`));
  });
});

describe('the filter row reaches it without a new chip family', () => {
  it('reads the borrowed chords back as the prototype names them', () => {
    for (const chord of MODAL_CHORDS.filter(c => c.kind === 'borrow')) {
      expect(facetValueLabel('progression', chord.facet!)).toBe(chord.num);
    }
  });

  it('gathers a chip across both families that carry it', () => {
    // The 5 of 5 chip finds Functional Harmony's cards AND this
    // family's — ruling 26's argument, applied by reusing the value
    // rather than minting a second one.
    const cards = FLASHCARDS.filter(c => c.facets?.progression === 'V/V');
    const categories = new Set(cards.map(c => c.category));
    expect([...categories].sort()).toEqual(['functional-harmony', 'modal-improvisation']);
  });
});

describe('the row a reader can reach', () => {
  it('has a place in the order and an address', () => {
    expect(CATEGORY_ORDER).toContain('modal-improvisation');
    expect(isCategory('modal-improvisation')).toBe(true);
    expect(categoryPath('modal-improvisation')).toBe('/harmonic-fluency/modal-improvisation');
  });

  it('says what it is, in the prototype\'s own words', () => {
    // The key is the joined path, which `affordances.test.ts` already
    // asserts resolves to a real node in an assembled tree.
    const described = skillDescriptionFor(
      {
        id: `harmonic-fluency/${MODAL_IMPROV_CATEGORY_NAME}`,
        label: MODAL_IMPROV_CATEGORY_NAME,
      } as TreeNode,
      'harmonic-fluency',
    );
    expect(described?.text).toBe(MODAL_IMPROV_DESCRIPTION);
    expect(described?.inheritedFrom).toBeUndefined();
    // Straight off the prototype's `<p class="sub">`, uncorrected —
    // including "Hear It", where the button reads "Hear it".
    expect(MODAL_IMPROV_DESCRIPTION.startsWith('Pick a key and a chord')).toBe(true);
    expect(MODAL_IMPROV_DESCRIPTION).toContain('press Hear It');
  });
});

describe('the counts and the schedule', () => {
  it('counts the family into Functional / Applied', () => {
    const counts = harmonicFluencyCounts();
    expect(counts.byCategory['modal-improvisation']).toBe(126);
    expect(counts.byGroup.functionalApplied).toBe(
      counts.byCategory['functional-harmony']
      + counts.byCategory.progressions
      + counts.byCategory['modal-improvisation'],
    );
  });

  it('gives the family its own node in the spacing tree', () => {
    const hf = spacingTree().find(n => n.id === 'harmonic-fluency')!;
    const node = (hf.children ?? [])
      .find(n => n.id === 'harmonic-fluency.modal-improvisation');
    expect(node).toBeDefined();
    expect(node!.label).toBe(MODAL_IMPROV_CATEGORY_NAME);
    // The node claims its own cards and no others, which is what makes
    // a pace set on this row mean this row.
    for (const c of CARDS) expect(node!.itemRefMatch!(c.id), c.id).toBe(true);
    expect(node!.itemRefMatch!('pr-prog-2-5-1-C')).toBe(false);
  });

  it('walks every card in the cold start, exactly once', () => {
    // THE GROUP MAPPING LIVES IN FOUR PLACES and this is what notices
    // when only three of them are updated: the family generated its
    // cards, showed its grid, and was silently absent from the walk.
    const order = harmonicFluencyColdStartOrder();
    const ours = order.filter(id => id.startsWith('mi-modal-'));
    expect(ours).toHaveLength(126);
    expect(new Set(order).size).toBe(FLASHCARDS.length);
  });
});
