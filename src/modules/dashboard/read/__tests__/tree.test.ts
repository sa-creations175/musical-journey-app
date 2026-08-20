/**
 * The roll-ups, asserted on the mechanism rather than on a rendered
 * figure: which leaves feed a parent's score, what a parent does when
 * nothing under it is graded, and whether the tree's shape can move a
 * number it should not.
 */
import { describe, expect, it } from 'vitest';
import {
  buildModuleTree,
  coverageFraction,
  daysSince,
  flatten,
  leavesOf,
  nodesAtDepth,
} from '../tree';
import type { CatalogItem, ModuleCatalog } from '../catalogs';
import { readingCatalog, scalesModesCatalog } from '../catalogs';
import { statsForAttemptCatalog } from '../adapters';
import { emptyItemStats, type ItemStats } from '../itemStats';
import type { AttemptRecord } from '../../../../lib/db';

const NOW = 1_700_000_000_000;
const DAY = 86_400_000;

function item(id: string, path: string[], refs = [id]): CatalogItem {
  return { id, label: id, path, itemRefs: refs };
}

function catalog(items: CatalogItem[], patch: Partial<ModuleCatalog> = {}): ModuleCatalog {
  return {
    sourceId: 'test', moduleId: 'test', label: 'test', accuracyKind: 'measured', items, ...patch,
  };
}

function stats(patch: Partial<ItemStats>): ItemStats {
  return { ...emptyItemStats('x'), ...patch };
}

describe('shape', () => {
  it('groups by the catalog path and nothing else', () => {
    const tree = buildModuleTree(
      catalog([
        item('a', ['test', 'g1']),
        item('b', ['test', 'g1']),
        item('c', ['test', 'g2']),
      ]),
      [stats({}), stats({}), stats({})],
    );
    expect(tree.children.map(c => c.label)).toEqual(['g1', 'g2']);
    expect(tree.children[0].children).toHaveLength(2);
    expect(leavesOf(tree)).toHaveLength(3);
  });

  it('handles uneven depth within one module', () => {
    // Chord progressions is the real case: key detection sits one level
    // down, full-progression rows two.
    const tree = buildModuleTree(
      catalog([
        item('shallow', ['test', 'g1']),
        item('deep', ['test', 'g2', 'sub']),
      ]),
      [stats({}), stats({})],
    );
    expect(nodesAtDepth(tree, 1).map(n => n.label)).toEqual(['g1', 'g2']);
    expect(leavesOf(tree).map(n => n.depth)).toEqual([2, 3]);
  });

  it('refuses stats that do not line up with the catalog', () => {
    // A silent mismatch would attach one item's numbers to another's
    // label, which is the worst failure this file could have.
    expect(() => buildModuleTree(catalog([item('a', ['test'])]), []))
      .toThrow(/1 rows but 0 stats/);
  });
});

describe('accuracy roll-up', () => {
  it('averages graded leaves, one vote per item', () => {
    const tree = buildModuleTree(
      catalog([item('a', ['test']), item('b', ['test'])]),
      [stats({ score: 100 }), stats({ score: 0 })],
    );
    expect(tree.score).toBe(50);
    expect(tree.gradedLeafCount).toBe(2);
  });

  it('ignores ungraded leaves rather than counting them as zero', () => {
    // A dash is "no signal"; 0 is "you got it wrong". Averaging a dash
    // in as 0 would turn one into the other.
    const tree = buildModuleTree(
      catalog([item('a', ['test']), item('b', ['test'])]),
      [stats({ score: 80 }), stats({ score: null })],
    );
    expect(tree.score).toBe(80);
    expect(tree.gradedLeafCount).toBe(1);
  });

  it('reads a dash when nothing under it is graded', () => {
    const tree = buildModuleTree(
      catalog([item('a', ['test']), item('b', ['test'])]),
      [stats({ score: null }), stats({ score: null })],
    );
    expect(tree.score).toBeNull();
  });

  it('is depth-invariant — grouping levels cannot move the number', () => {
    // THE PROPERTY. Averaging immediate children instead would let a
    // one-item category outweigh a fifty-item one, so inserting a level
    // would silently change the figure above it.
    const flatTree = buildModuleTree(
      catalog([
        item('a', ['test']), item('b', ['test']), item('c', ['test']),
      ]),
      [stats({ score: 90 }), stats({ score: 90 }), stats({ score: 0 })],
    );
    const nestedTree = buildModuleTree(
      catalog([
        item('a', ['test', 'big']), item('b', ['test', 'big']),
        item('c', ['test', 'small']),
      ]),
      [stats({ score: 90 }), stats({ score: 90 }), stats({ score: 0 })],
    );
    expect(nestedTree.score).toBe(flatTree.score);
    expect(nestedTree.score).toBe(60);
    // The two categories themselves read very differently, which is the
    // point of having them.
    expect(nestedTree.children.map(c => c.score)).toEqual([90, 0]);
  });

  it('does not let one heavily drilled item speak for a category', () => {
    // One vote per ITEM, not per attempt. Pooling attempts would read
    // ~93% here and hide the weak card entirely.
    const tree = buildModuleTree(
      catalog([item('drilled', ['test']), item('neglected', ['test'])]),
      [
        stats({ score: 95, windowTotal: 20, engagementCount: 200 }),
        stats({ score: 20, windowTotal: 5, engagementCount: 5 }),
      ],
    );
    expect(tree.score).toBe(57.5);
  });
});

describe('coverage roll-up', () => {
  it('counts items, not rows', () => {
    // A merged row contributes every stored ref it holds — the catalog
    // is the denominator and the catalog counts them separately.
    const tree = buildModuleTree(
      catalog([item('merged', ['test'], ['r1', 'r2']), item('plain', ['test'])]),
      [stats({ covered: true }), stats({ covered: false })],
    );
    expect(tree.totalItems).toBe(3);
    expect(tree.coveredItems).toBe(2);
    expect(coverageFraction(tree)).toBeCloseTo(2 / 3);
  });

  it('is null for a node holding nothing', () => {
    expect(coverageFraction(buildModuleTree(catalog([]), []))).toBeNull();
  });

  it('sums through every level', () => {
    const tree = buildModuleTree(
      catalog([
        item('a', ['test', 'g1', 'sub']),
        item('b', ['test', 'g1', 'sub']),
        item('c', ['test', 'g2']),
      ]),
      [stats({ covered: true }), stats({ covered: false }), stats({ covered: true })],
    );
    expect(tree.totalItems).toBe(3);
    expect(tree.coveredItems).toBe(2);
    expect(tree.children[0].coveredItems).toBe(1);
  });
});

describe('recency roll-up', () => {
  it('carries most-recent and stalest separately', () => {
    const tree = buildModuleTree(
      catalog([item('a', ['test']), item('b', ['test']), item('c', ['test'])]),
      [
        stats({ lastAt: NOW - DAY }),
        stats({ lastAt: NOW - 61 * DAY }),
        stats({ lastAt: NOW - 12 * DAY }),
      ],
    );
    expect(daysSince(tree.recency.mostRecentAt, NOW)).toBe(1);
    expect(daysSince(tree.recency.stalestAt, NOW)).toBe(61);
    expect(tree.recency.hasUntouched).toBe(false);
  });

  it('flags never-touched descendants instead of faking a stalest', () => {
    // "Never" is not a number of days. Rendering it as one would be a
    // lie, and rendering it as 0 would say "practised today".
    const tree = buildModuleTree(
      catalog([item('a', ['test']), item('b', ['test'])]),
      [stats({ lastAt: NOW - DAY }), stats({ lastAt: null })],
    );
    expect(tree.recency.hasUntouched).toBe(true);
    expect(tree.recency.stalestAt).toBe(NOW - DAY);
    expect(daysSince(null, NOW)).toBeNull();
  });

  it('goes fully null when nothing under it has ever been touched', () => {
    const tree = buildModuleTree(
      catalog([item('a', ['test'])]), [stats({ lastAt: null })],
    );
    expect(tree.recency.mostRecentAt).toBeNull();
    expect(tree.recency.stalestAt).toBeNull();
    expect(tree.recency.hasUntouched).toBe(true);
  });
});

describe('against the real catalogs', () => {
  function attempt(patch: Partial<AttemptRecord>): AttemptRecord {
    return {
      moduleId: 'scales-modes', itemId: 'ionian-tab1',
      correct: true, timestamp: NOW, ...patch,
    } as AttemptRecord;
  }

  it('scales & modes folds to mode → tab', () => {
    const tree = buildModuleTree(
      scalesModesCatalog,
      statsForAttemptCatalog(scalesModesCatalog, []),
    );
    expect(tree.totalItems).toBe(18);
    // The catalog now hangs under the ear-training module row, so the
    // submodule sits one level down: ear training > scales & modes >
    // mode > tab.
    const submodule = tree.children[0];
    expect(submodule.label).toBe('scales & modes');
    expect(submodule.children).toHaveLength(9);
    expect(submodule.children.every(m => m.children.length === 2)).toBe(true);
    expect(submodule.children[0].children.map(t => t.label))
      .toEqual(['hear simple scale', 'hear mode in context']);
  });

  it('an untouched module reads dash, zero coverage, never', () => {
    const tree = buildModuleTree(
      scalesModesCatalog, statsForAttemptCatalog(scalesModesCatalog, []),
    );
    expect(tree.score).toBeNull();
    expect(coverageFraction(tree)).toBe(0);
    expect(tree.recency.mostRecentAt).toBeNull();
    expect(tree.recency.hasUntouched).toBe(true);
  });

  it('one drilled tab moves only its own branch', () => {
    const tree = buildModuleTree(
      scalesModesCatalog,
      statsForAttemptCatalog(scalesModesCatalog, [
        attempt({ itemId: 'dorian-tab2', correct: true }),
        attempt({ itemId: 'dorian-tab2', correct: false, timestamp: NOW + 1 }),
      ]),
    );
    const dorian = flatten(tree).find(c => c.label === 'Dorian')!;
    expect(dorian.score).toBe(50);
    expect(dorian.gradedLeafCount).toBe(1);
    // The module average is that one graded leaf, not 50% of 18 items.
    expect(tree.score).toBe(50);
    expect(tree.gradedLeafCount).toBe(1);
    // Coverage is unmoved: two attempts is below the threshold.
    expect(tree.coveredItems).toBe(0);
  });

  it('reading keeps 188 items across fewer rows', () => {
    const tree = buildModuleTree(
      readingCatalog, statsForAttemptCatalog(readingCatalog, []),
    );
    expect(tree.totalItems).toBe(188);
    expect(leavesOf(tree).length).toBeLessThan(188);
  });

  it('a covered merged row contributes both of its items', () => {
    // Reading's conceptual-knowledge row aggregates count and which.
    // Covering it covers two of the 78, not one.
    const refs = ['sig:2s:major:count', 'sig:2s:major:which'];
    const attempts = refs.flatMap((ref, r) =>
      Array.from({ length: 2 }, (_, i) => attempt({
        moduleId: 'reading', itemId: ref, timestamp: NOW - (r * 10 + i) * 1000,
      })));
    const tree = buildModuleTree(
      readingCatalog, statsForAttemptCatalog(readingCatalog, attempts),
    );
    const row = flatten(tree).find(n => n.id.endsWith('2s:major:conceptual'))!;
    expect(row.stats!.engagementCount).toBe(4);
    expect(row.totalItems).toBe(2);
    expect(row.coveredItems).toBe(2);
  });
});

describe('engagement count roll-up', () => {
  it('sums every engagement, so 0% can be told from never opened', () => {
    // A percentage alone cannot distinguish "worked on, nothing
    // consolidated" from "never opened" — both read 0%, and that gap
    // would make real practice look like neglect.
    const tree = buildModuleTree(
      catalog([item('a', ['test']), item('b', ['test'])]),
      [
        stats({ engagementCount: 22, covered: false }),
        stats({ engagementCount: 2, covered: false }),
      ],
    );
    expect(tree.coveredItems).toBe(0);
    expect(tree.engagementCount).toBe(24);
  });

  it('distinguishes a worked-on module from an untouched one', () => {
    const untouched = buildModuleTree(
      catalog([item('a', ['test'])]), [stats({ engagementCount: 0 })],
    );
    expect(untouched.engagementCount).toBe(0);
  });

  it('counts focus-protected and ungraded engagements too', () => {
    // Both stay out of accuracy and both are real practice, so the
    // attempt readout has to include them or it contradicts coverage.
    const tree = buildModuleTree(
      catalog([item('a', ['test'])]),
      [stats({ engagementCount: 9, excludedCount: 9, score: null })],
    );
    expect(tree.engagementCount).toBe(9);
    expect(tree.score).toBeNull();
  });
});
