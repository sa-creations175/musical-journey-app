/**
 * The comparison.
 *
 * The question with a wrong answer available: what counts as weakest
 * when some children have no score. A dash is the absence of a
 * measurement, not the lowest one, and pointing the "weakest" tint at
 * the row that has said nothing would send you to the wrong place.
 */
import { describe, expect, it } from 'vitest';
import { compareChildren, highlightFor, toggleComparison } from '../compare';
import { buildModuleTree, type TreeNode } from '../read/tree';
import type { CatalogItem } from '../read/catalogs';
import { emptyItemStats, type ItemStats } from '../read/itemStats';

/**
 * `group` names the branch. Node ids are derived from the path, so two
 * fixtures sharing a group name would share an id — which real nodes
 * never do, since a path is unique within a module.
 */
function parentOf(scores: Array<number | null>, group = 'group'): TreeNode {
  const items: CatalogItem[] = scores.map((_, i) => ({
    id: `${group}-i${i}`, label: `item ${i}`, path: ['m', group],
    itemRefs: [`${group}-i${i}`],
  }));
  const stats: ItemStats[] = scores.map((score, i) => ({
    ...emptyItemStats(`${group}-i${i}`), score,
  }));
  return buildModuleTree(
    { sourceId: 'm', moduleId: 'm', label: 'm', accuracyKind: 'measured', items }, stats,
  ).children[0];
}

describe('compareChildren', () => {
  it('picks the weakest and strongest among the children', () => {
    const parent = parentOf([50, 90, 20, 70]);
    const result = compareChildren(parent)!;
    expect(result.weakestId).toBe(parent.children[2].id);
    expect(result.strongestId).toBe(parent.children[1].id);
    expect(result.parentId).toBe(parent.id);
  });

  it('ignores ungraded children rather than calling a dash the weakest', () => {
    // THE WRONG ANSWER THIS AVOIDS: an ungraded row is not the worst
    // thing here, it is the thing that has said nothing. Tinting it
    // weakest would point you at a row with no signal instead of at
    // the one going badly.
    const parent = parentOf([null, 40, null, 90]);
    const result = compareChildren(parent)!;
    expect(result.weakestId).toBe(parent.children[1].id);
    expect(result.strongestId).toBe(parent.children[3].id);
  });

  it('yields nothing when fewer than two children are graded', () => {
    // Highlighting one row as both the weakest and strongest of itself
    // is a comparison with no content, and tinting it green for being
    // the only one would flatter it.
    expect(compareChildren(parentOf([null, null, null]))).toBeNull();
    expect(compareChildren(parentOf([70, null, null]))).toBeNull();
  });

  it('yields nothing when every graded child is equal', () => {
    // A flat set has no extremes. Tinting two of three identical rows
    // would invent a difference.
    expect(compareChildren(parentOf([70, 70, 70]))).toBeNull();
  });

  it('breaks a tie toward the first child in tree order', () => {
    // Otherwise the tint would jump between equal rows for no visible
    // reason.
    const parent = parentOf([20, 20, 90, 90]);
    const result = compareChildren(parent)!;
    expect(result.weakestId).toBe(parent.children[0].id);
    expect(result.strongestId).toBe(parent.children[2].id);
  });

  it('yields nothing for a leaf', () => {
    const parent = parentOf([50, 90]);
    expect(compareChildren(parent.children[0])).toBeNull();
  });
});

describe('highlightFor', () => {
  it('marks exactly the two extremes and nothing else', () => {
    const parent = parentOf([50, 90, 20, 70]);
    const comparison = compareChildren(parent)!;
    const marks = parent.children.map(c => highlightFor(comparison, c.id));
    expect(marks).toEqual([undefined, 'strongest', 'weakest', undefined]);
    expect(marks.filter(Boolean)).toHaveLength(2);
  });

  it('marks nothing when there is no comparison', () => {
    const parent = parentOf([50, 90]);
    expect(parent.children.map(c => highlightFor(null, c.id)))
      .toEqual([undefined, undefined]);
  });
});

describe('toggleComparison', () => {
  it('sets a comparison on a fresh row', () => {
    const parent = parentOf([50, 90]);
    expect(toggleComparison(null, parent)?.parentId).toBe(parent.id);
  });

  it('clears when the same row is pressed again', () => {
    const parent = parentOf([50, 90]);
    const active = toggleComparison(null, parent);
    expect(toggleComparison(active, parent)).toBeNull();
  });

  it('moves to another row rather than keeping both', () => {
    // One comparison at a time. A second tinted pair would be a second
    // question nobody asked.
    const a = parentOf([50, 90], 'alpha');
    const b = parentOf([10, 20], 'beta');
    const active = toggleComparison(null, a)!;
    const moved = toggleComparison(active, b)!;
    expect(moved.parentId).toBe(b.id);
    expect(moved.parentId).not.toBe(a.id);
  });

  it('clears when the new row cannot be compared', () => {
    // Leaving the previous pair tinted elsewhere on screen would look
    // like the press did nothing.
    const a = parentOf([50, 90], 'alpha');
    const uncomparable = parentOf([null, null], 'beta');
    const active = toggleComparison(null, a)!;
    expect(toggleComparison(active, uncomparable)).toBeNull();
  });
});
