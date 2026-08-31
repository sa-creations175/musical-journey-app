/**
 * What a square is waiting on, and what it says when only some of it
 * has been done.
 *
 * THE CASE THIS FILE EXISTS FOR is the last line of the last describe:
 * one Mastered inversion inside a square of twelve targets must not
 * make the square Mastered. Rolling up the rows that EXIST would do
 * exactly that, and it is the failure Lowest was chosen to prevent —
 * so the enumeration has to come from the catalog rather than from the
 * database.
 */
import { describe, expect, it } from 'vitest';
import type { SpacingState } from '../../../lib/db';
import { bandVerdictLabel } from '../../../lib/spacing/banding';
import {
  chordCellTargets, countFluentPlus, itemCellTargets, rowsByRefHand,
  sectionCells, verdictForTargets,
} from '../cellTargets';
import { SCALE_CELLS } from '../scaleSkills';
import { CHORD_QUALITIES, KEYS } from '../catalog';
import { MENTAL_VIZ_ITEMS } from '../mentalVizLibrary';

type Entry = Record<string, unknown>;
const rep = (feel: 1 | 2 | 3 | 4, extra: Entry = {}): Entry => ({
  t: feel, kind: 'rating',
  rating: feel === 4 ? 'flying' : feel === 3 ? 'cruising' : 'crawling',
  feel, ...extra,
});
const passedTest = (feel: 3 | 4) =>
  [rep(feel, { fromTest: true, sessionId: 's' }),
    rep(feel, { fromTest: true, sessionId: 's' }),
    rep(feel, { fromTest: true, sessionId: 's' })];

const rowFor = (
  itemRef: string, hand: string, performanceHistory: Entry[],
): SpacingState => ({ itemRef, hand, performanceHistory } as unknown as SpacingState);

describe('a chord square knows what is under it', () => {
  it('a triad is four inversion states across three hands', () => {
    const targets = chordCellTargets('maj', 'C');
    expect(targets).toHaveLength(12);
    expect(new Set(targets.map(t => t.itemRef))).toEqual(new Set([
      'chord-shape:maj:C:root',
      'chord-shape:maj:C:inv1',
      'chord-shape:maj:C:inv2',
      'chord-shape:maj:C:fluid',
    ]));
    expect(new Set(targets.map(t => t.hand))).toEqual(new Set(['left', 'right', 'both']));
  });

  it('a seventh is five, and supplementary is NOT one of them', () => {
    const refs = new Set(chordCellTargets('maj7', 'F').map(t => t.itemRef));
    expect(refs.size).toBe(5);
    expect(refs.has('chord-shape:maj7:F:inv3')).toBe(true);
    // Extra material, not a rung of the square. Counting it would hold
    // every seventh back on something the square is not claiming.
    expect(refs.has('chord-shape:maj7:F:supplementary')).toBe(false);
  });

  it('an unknown quality falls back to the bare ref rather than inventing states', () => {
    const targets = chordCellTargets('not-a-quality', 'C');
    expect(new Set(targets.map(t => t.itemRef)))
      .toEqual(new Set(['chord-shape:not-a-quality:C']));
  });
});

describe('a one-item square is its hands', () => {
  it('a scale is three', () => {
    expect(itemCellTargets('scale:major:C').map(t => t.hand))
      .toEqual(['left', 'right', 'both']);
  });

  it('voice leading is `both` alone — it has no other hand to wait for', () => {
    expect(itemCellTargets('vl:major-251:C')).toEqual([
      { itemRef: 'vl:major-251:C', hand: 'both' },
    ]);
  });
});

describe('the square says the lowest of its targets', () => {
  const targets = chordCellTargets('maj', 'C');

  it('nothing drilled at all reads Not Started', () => {
    expect(bandVerdictLabel(verdictForTargets(targets, rowsByRefHand([]))))
      .toBe('Not Started');
  });

  it('ONE Mastered target among twelve does not make the square Mastered', () => {
    // The whole reason the targets are enumerated from the catalog. A
    // rollup over rows-that-exist would find one row, all banded, and
    // call the square Mastered on the strength of a twelfth of it.
    const rows = rowsByRefHand([
      rowFor('chord-shape:maj:C:root', 'left', passedTest(4)),
    ]);
    expect(bandVerdictLabel(verdictForTargets(targets, rows))).toBe('Started');
  });

  it('every target Fluent reads Fluent', () => {
    const rows = rowsByRefHand(
      targets.map(t => rowFor(t.itemRef, t.hand, passedTest(3))),
    );
    expect(bandVerdictLabel(verdictForTargets(targets, rows))).toBe('Fluent');
  });

  it('one weak target among eleven strong ones sets the word', () => {
    const rows = rowsByRefHand(targets.map((t, i) => rowFor(
      t.itemRef, t.hand, i === 7 ? passedTest(3) : passedTest(4),
    )));
    expect(bandVerdictLabel(verdictForTargets(targets, rows))).toBe('Fluent');
  });

  it('a supplementary row cannot drag a seventh square down', () => {
    const sevenths = chordCellTargets('maj7', 'F');
    const rows = rowsByRefHand([
      ...sevenths.map(t => rowFor(t.itemRef, t.hand, passedTest(4))),
      // Never opened, and it must not matter.
      rowFor('chord-shape:maj7:F:supplementary', 'both', []),
    ]);
    expect(bandVerdictLabel(verdictForTargets(sevenths, rows))).toBe('Mastered');
  });
});

describe('a section is a list of cells, from the catalog', () => {
  it('scales, voice leading and mental viz are one cell per item', () => {
    expect(sectionCells('scales')).toHaveLength(SCALE_CELLS.length);
    expect(sectionCells('mental-viz')).toHaveLength(MENTAL_VIZ_ITEMS.length);
    // Every one of those cells has exactly the hands its item is
    // drilled on — three for a scale, one for voice leading.
    expect(sectionCells('scales')[0]).toHaveLength(3);
    expect(sectionCells('voice-leading')[0]).toHaveLength(1);
  });

  it('chord shapes are quality × key — the states are INSIDE a cell', () => {
    const cells = sectionCells('chord-shapes');
    expect(cells).toHaveLength(CHORD_QUALITIES.length * KEYS.length);
    // A triad cell carries twelve targets. If this ever equalled the
    // cell count, the states would have escaped to the outside again.
    expect(cells[0]).toHaveLength(12);
  });

  it('enumerates cells nobody has touched', () => {
    // A denominator that came from the database would shrink to
    // whatever had been drilled.
    expect(sectionCells('scales').length).toBeGreaterThan(0);
    expect(countFluentPlus(sectionCells('scales'), new Map()))
      .toEqual({ total: SCALE_CELLS.length, fluentPlus: 0 });
  });
});

describe('counting Fluent+ cells', () => {
  const targets = chordCellTargets('maj', 'C');

  it('counts a cell once, however many targets are under it', () => {
    const rows = rowsByRefHand(
      targets.map(t => rowFor(t.itemRef, t.hand, passedTest(4))),
    );
    expect(countFluentPlus([targets], rows)).toEqual({ total: 1, fluentPlus: 1 });
  });

  it('does not count a cell one target short', () => {
    const rows = rowsByRefHand(
      targets.slice(0, -1).map(t => rowFor(t.itemRef, t.hand, passedTest(4))),
    );
    expect(countFluentPlus([targets], rows)).toEqual({ total: 1, fluentPlus: 0 });
  });

  it('does not count Developing', () => {
    // Practice with no test caps at Developing, which is below the
    // line. Three Clean practice reps on every target.
    const practice = [
      { t: 1, kind: 'rating', rating: 'cruising', feel: 3, fromTest: false },
      { t: 2, kind: 'rating', rating: 'cruising', feel: 3, fromTest: false },
      { t: 3, kind: 'rating', rating: 'cruising', feel: 3, fromTest: false },
    ];
    const rows = rowsByRefHand(
      targets.map(t => rowFor(t.itemRef, t.hand, practice)),
    );
    expect(bandVerdictLabel(verdictForTargets(targets, rows))).toBe('Developing');
    expect(countFluentPlus([targets], rows).fluentPlus).toBe(0);
  });
});
