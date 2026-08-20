/**
 * Tap-to-drill resolution.
 *
 * The load-bearing assertion is the negative one: a row must never
 * report itself as filtered when the module it points at cannot be
 * told which items to serve.
 */
import { describe, expect, it } from 'vitest';
import {
  drillTargetFor,
  drillTargetSummary,
  filterableModules,
} from '../drillTarget';
import { buildModuleTree, flatten, leavesOf } from '../tree';
import { intervalsCatalog, readingCatalog, scalesModesCatalog } from '../catalogs';
import { statsForAttemptCatalog } from '../adapters';

function treeFor(catalog: Parameters<typeof buildModuleTree>[0]) {
  return buildModuleTree(catalog, statsForAttemptCatalog(catalog, []));
}

describe('intervals — the mechanism already exists', () => {
  const tree = treeFor(intervalsCatalog);

  it('translates catalog refs into the quiz s own focus keys', () => {
    // Catalog stores `M3:asc`; IntervalsQuiz.buildCandidates matches on
    // `M3|asc`. Getting this wrong would filter the pool to nothing and
    // look like a broken drill rather than a wrong separator.
    const leaf = leavesOf(tree).find(n => n.itemRefs[0] === 'M3:asc')!;
    const target = drillTargetFor(leaf, 'intervals');
    expect(target.kind).toBe('filtered');
    if (target.kind !== 'filtered') throw new Error('unreachable');
    expect(target.itemRefs).toEqual(['M3:asc']);
    expect(target.focusKeys).toEqual(['M3|asc']);
    expect(target.route).toBe('/ear-training/intervals');
  });

  it('a direction row drills every interval in that direction', () => {
    const descending = tree.children.find(c => c.label === 'descending')!;
    const target = drillTargetFor(descending, 'intervals');
    if (target.kind !== 'filtered') throw new Error('expected filtered');
    expect(target.focusKeys).toHaveLength(13);
    expect(target.focusKeys.every(k => k.endsWith('|desc'))).toBe(true);
  });

  it('a module row opens the module rather than drilling all of it', () => {
    const target = drillTargetFor(tree, 'intervals');
    expect(target.kind).toBe('navigate');
    if (target.kind !== 'navigate') throw new Error('unreachable');
    expect(target.reason).toBe('whole-module');
  });
});

describe('reading — refs pass through as they are', () => {
  const tree = treeFor(readingCatalog);

  it('hands optionsForItem the stored ref unchanged', () => {
    const leaf = flatten(tree).find(
      n => n.children.length === 0 && n.itemRefs[0]?.startsWith('sig:'),
    )!;
    const target = drillTargetFor(leaf, 'reading');
    if (target.kind !== 'filtered') throw new Error('expected filtered');
    expect(target.focusKeys).toEqual(target.itemRefs);
    expect(target.route).toBe('/reading');
  });

  it('a merged row hands over BOTH of its stored refs', () => {
    // Conceptual knowledge aggregates count and which. Drilling it must
    // serve both, not just the one the row id happens to resemble.
    const conceptual = leavesOf(tree).find(n => n.label === 'conceptual knowledge')!;
    const target = drillTargetFor(conceptual, 'reading');
    if (target.kind !== 'filtered') throw new Error('expected filtered');
    expect(target.itemRefs).toHaveLength(2);
    expect(target.itemRefs.some(r => r.endsWith(':count'))).toBe(true);
    expect(target.itemRefs.some(r => r.endsWith(':which'))).toBe(true);
  });
});

describe('modules with no filter mechanism', () => {
  const tree = treeFor(scalesModesCatalog);

  it('navigates, and says why, rather than pretending to filter', () => {
    // The failure this prevents: a row that opens the whole module
    // while implying it narrowed the drill.
    const mode = tree.children[0];
    const target = drillTargetFor(mode, 'scales-modes');
    expect(target.kind).toBe('navigate');
    if (target.kind !== 'navigate') throw new Error('unreachable');
    expect(target.reason).toBe('no-filter-mechanism');
    expect(target.route).toBe('/ear-training/scales-modes');
  });

  it('summarises as unfiltered so a row cannot overclaim', () => {
    const summary = drillTargetSummary(drillTargetFor(tree.children[0], 'scales-modes'));
    expect(summary.filtered).toBe(false);
    expect(summary.itemCount).toBe(0);
    expect(summary.reason).toBe('no-filter-mechanism');
  });

  it('names exactly the modules that can be filtered today', () => {
    // Two. The unevenness is accepted and stated, not discovered one
    // row at a time.
    expect(filterableModules().sort()).toEqual(['intervals', 'reading']);
  });
});

describe('degenerate rows', () => {
  it('an empty node has nothing to drill', () => {
    const empty = buildModuleTree(
      { sourceId: 'repertoire', label: 'r', accuracyKind: 'measured', items: [] }, [],
    );
    const target = drillTargetFor(empty, 'repertoire');
    if (target.kind !== 'navigate') throw new Error('expected navigate');
    expect(target.reason).toBe('nothing-to-drill');
  });

  it('an unknown module does not produce a broken route', () => {
    const tree = treeFor(scalesModesCatalog);
    const target = drillTargetFor(tree.children[0], 'not-a-module');
    if (target.kind !== 'navigate') throw new Error('expected navigate');
    expect(target.reason).toBe('nothing-to-drill');
    expect(target.route).toBe('/');
  });
});
