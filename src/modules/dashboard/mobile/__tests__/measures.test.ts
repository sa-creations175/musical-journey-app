/**
 * The one rule the three measures share, and the one they must not.
 *
 * NOTHING HERE IS ABOUT LAYOUT. Whether a 1.5px bar reads at arm's
 * length on a phone, and whether the three-way control is thumb-sized,
 * are questions jsdom cannot answer. What it can answer is whether the
 * number that ORDERS the list is the same number that DRAWS the bar,
 * and whether longer really is better on all three.
 */
import { describe, expect, it } from 'vitest';
import type { TreeNode } from '../../read/tree';
import { FRESHNESS_STEP_DEFAULT_DAYS } from '../freshnessScale';
import {
  MEASURES,
  measureFraction,
  measureText,
  sortByMeasure,
  type Measure,
} from '../measures';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 7, 25, 12);
const STEP = FRESHNESS_STEP_DEFAULT_DAYS;

function node(over: Partial<TreeNode> = {}): TreeNode {
  return {
    id: 'n', label: 'Node', depth: 1, children: [],
    itemRefs: [], accuracyKind: 'measured', mixedKinds: false,
    excludedFromParentTotals: false, endsGroup: false,
    score: null, gradedLeafCount: 0, coveredItems: 0, totalItems: 0,
    engagementCount: 0,
    recency: { mostRecentAt: NOW, stalestAt: NOW, hasUntouched: false },
    ...over,
  };
}

const frac = (n: TreeNode, m: Measure) => measureFraction(n, m, NOW, STEP);

describe('longer is always better', () => {
  it('holds for coverage', () => {
    expect(frac(node({ coveredItems: 10, totalItems: 10 }), 'coverage')).toBe(1);
    expect(frac(node({ coveredItems: 0, totalItems: 10 }), 'coverage')).toBe(0);
  });

  it('holds for accuracy', () => {
    expect(frac(node({ score: 100 }), 'accuracy')).toBe(1);
    expect(frac(node({ score: 0 }), 'accuracy')).toBe(0);
  });

  it('holds for freshness, which is the one that could have broken it', () => {
    // The raw number is DAYS SINCE, where bigger is worse. Full today,
    // empty never — inverted once, here, rather than at a render site.
    expect(frac(node({
      recency: { mostRecentAt: NOW, stalestAt: NOW, hasUntouched: false },
    }), 'freshness')).toBe(1);
    expect(frac(node({
      recency: { mostRecentAt: null, stalestAt: null, hasUntouched: true },
    }), 'freshness')).toBe(0);
  });

  it('never returns anything outside 0–1, on any measure', () => {
    // A width built from this goes straight into a percentage.
    const wild = node({
      coveredItems: 99, totalItems: 10, score: 400,
      recency: { mostRecentAt: NOW + 10 * DAY, stalestAt: NOW, hasUntouched: false },
    });
    for (const m of MEASURES) {
      const f = frac(wild, m.id);
      expect(f, m.id).toBeGreaterThanOrEqual(0);
      expect(f, m.id).toBeLessThanOrEqual(1);
    }
  });
});

describe('the list sorts by the number the bar draws', () => {
  const row = (label: string, over: Partial<TreeNode>) =>
    ({ label, node: node(over) });

  it('puts the shortest bar first, on every measure', () => {
    // Each row is worse than the last on ALL THREE, recency included —
    // a fixture that varied only coverage would tie on freshness and
    // fall through to the alphabetical tie-break, which would pass here
    // while proving nothing about the freshness ordering.
    const rows = [
      row('full', {
        coveredItems: 10, totalItems: 10, score: 100,
        recency: { mostRecentAt: NOW, stalestAt: NOW, hasUntouched: false },
      }),
      row('empty', {
        coveredItems: 0, totalItems: 10, score: 0,
        recency: { mostRecentAt: null, stalestAt: null, hasUntouched: true },
      }),
      row('half', {
        coveredItems: 5, totalItems: 10, score: 50,
        recency: { mostRecentAt: NOW - 10 * DAY, stalestAt: NOW, hasUntouched: false },
      }),
    ];
    for (const m of MEASURES) {
      expect(sortByMeasure(rows, m.id, NOW, STEP).map(r => r.label), m.id)
        .toEqual(['empty', 'half', 'full']);
    }
  });

  it('orders by the SAME function that draws — not a parallel one', () => {
    // THE DEFECT THIS CATCHES: a list ordered by one measure and drawn
    // by another comes out with jumbled bars, and the reader concludes
    // the sort is broken. Asserted as a property over the sorted list
    // rather than on a fixture, so it holds for any input.
    const rows = [
      row('a', { coveredItems: 3, totalItems: 10, score: 90 }),
      row('b', { coveredItems: 9, totalItems: 10, score: 20 }),
      row('c', { coveredItems: 6, totalItems: 10, score: 55 }),
    ];
    for (const m of MEASURES) {
      const sorted = sortByMeasure(rows, m.id, NOW, STEP);
      const widths = sorted.map(r => measureFraction(r.node, m.id, NOW, STEP));
      expect([...widths].sort((x, y) => x - y), m.id).toEqual(widths);
    }
  });

  it('breaks a tie on the name, so the order does not wander', () => {
    const rows = [
      row('zebra', { coveredItems: 5, totalItems: 10 }),
      row('apple', { coveredItems: 5, totalItems: 10 }),
    ];
    expect(sortByMeasure(rows, 'coverage', NOW, STEP).map(r => r.label))
      .toEqual(['apple', 'zebra']);
  });
});

describe('the numbers beside the bar', () => {
  it('says what a coverage bar is a picture of', () => {
    expect(measureText(node({ coveredItems: 3, totalItems: 12 }), 'coverage', NOW, STEP))
      .toBe('25% of 12');
  });

  it('distinguishes no score from a score of zero', () => {
    // Both draw an empty bar. The text is what tells them apart, which
    // is the whole reason an empty bar is allowed to mean two things.
    expect(measureText(node({ score: null }), 'accuracy', NOW, STEP)).toBe('—');
    expect(measureText(node({ score: 0 }), 'accuracy', NOW, STEP)).toBe('0%');
  });

  it('names the freshness rung rather than a day count', () => {
    expect(measureText(node({
      recency: { mostRecentAt: NOW - 10 * DAY, stalestAt: NOW, hasUntouched: false },
    }), 'freshness', NOW, STEP)).toBe('within 2 weeks');
  });
});
