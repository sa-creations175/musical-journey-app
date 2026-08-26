/**
 * What grouping changes about the ORDER, which is the only part of it
 * a test can see.
 *
 * NOT A LAYOUT TEST. Whether six headings and forty rows scroll
 * comfortably on a phone, and whether the toggle is findable at the
 * right of the measure control, are questions for an actual device.
 * What is checked here is the claim the two modes make: grouped orders
 * within each module, flat orders across all of them — and that flat is
 * genuinely a different answer rather than the same list re-labelled.
 */
import { describe, expect, it } from 'vitest';
import type { TreeNode } from '../../read/tree';
import { FRESHNESS_STEP_DEFAULT_DAYS } from '../freshnessScale';
import { sortByMeasure } from '../measures';

const NOW = Date.UTC(2026, 7, 25, 12);
const STEP = FRESHNESS_STEP_DEFAULT_DAYS;

function node(coveredItems: number): TreeNode {
  return {
    id: `n${coveredItems}`, label: 'Node', depth: 1, children: [],
    itemRefs: [], accuracyKind: 'measured', mixedKinds: false,
    excludedFromParentTotals: false, endsGroup: false,
    score: null, gradedLeafCount: 0, coveredItems, totalItems: 10,
    engagementCount: 0,
    recency: { mostRecentAt: NOW, stalestAt: NOW, hasUntouched: false },
  };
}

/** Two modules whose rows INTERLEAVE when mixed — which is what makes
 *  the flat ordering visibly different from the grouped one. */
const ROWS = [
  { moduleId: 'alpha', label: 'a-high', node: node(9) },
  { moduleId: 'alpha', label: 'a-low', node: node(2) },
  { moduleId: 'beta', label: 'b-mid', node: node(5) },
  { moduleId: 'beta', label: 'b-lowest', node: node(1) },
];

const groupOrder = () => {
  const byModule = new Map<string, typeof ROWS>();
  for (const row of ROWS) {
    const list = byModule.get(row.moduleId) ?? [];
    list.push(row);
    byModule.set(row.moduleId, list);
  }
  return [...byModule.entries()].flatMap(([, group]) =>
    sortByMeasure(group, 'coverage', NOW, STEP).map(r => r.label));
};

describe('grouped and flat are different answers', () => {
  it('orders within each module when grouped, module order held', () => {
    // Worst first INSIDE each module, and the modules stay in the order
    // they arrived — sorting the groups too would rearrange the whole
    // page on every tab change.
    expect(groupOrder()).toEqual(['a-low', 'a-high', 'b-lowest', 'b-mid']);
  });

  it('orders across every module when flat', () => {
    expect(sortByMeasure(ROWS, 'coverage', NOW, STEP).map(r => r.label))
      .toEqual(['b-lowest', 'a-low', 'b-mid', 'a-high']);
  });

  it('really does interleave — the two are not the same list', () => {
    // The assertion that makes the two above worth having: a fixture
    // whose modules did not interleave would produce identical orders
    // and both tests would pass on a broken toggle.
    expect(sortByMeasure(ROWS, 'coverage', NOW, STEP).map(r => r.label))
      .not.toEqual(groupOrder());
  });

  it('puts the single weakest row of the whole app first when flat', () => {
    // The question flat exists to answer, and the one a grouped list
    // cannot: six separate orderings have no single worst row.
    const flat = sortByMeasure(ROWS, 'coverage', NOW, STEP);
    expect(flat[0].label).toBe('b-lowest');
    expect(groupOrder()[0]).not.toBe('b-lowest');
  });
});
