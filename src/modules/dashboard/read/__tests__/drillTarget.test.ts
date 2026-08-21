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
import { buildMergedTree, buildModuleTree, flatten, leavesOf } from '../tree';
import {
  earTrainingCatalogs,
  intervalsCatalog,
  readingCatalog,
  scalesModesCatalog,
} from '../catalogs';
import { statsForAttemptCatalog } from '../adapters';

function treeFor(catalog: Parameters<typeof buildModuleTree>[0]) {
  return buildModuleTree(catalog, statsForAttemptCatalog(catalog, []));
}

/** Ear training as the SCREEN builds it: four catalogs, one module
 *  tree, every row carrying the module id `ear-training`. */
function earTrainingTree() {
  return buildMergedTree('ear-training', 'ear training', earTrainingCatalogs.map(
    catalog => ({ catalog, stats: statsForAttemptCatalog(catalog, []) }),
  ));
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
    // Intervals now hangs under the ear-training module row, so its
    // direction rows sit one level deeper than they used to.
    const descending = flatten(tree).find(c => c.label === 'Descending')!;
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
    const conceptual = leavesOf(tree).find(n => n.label === 'Conceptual Knowledge')!;
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
    const mode = flatten(tree).find(n => n.depth === 2)!;
    const target = drillTargetFor(mode, 'scales-modes');
    expect(target.kind).toBe('navigate');
    if (target.kind !== 'navigate') throw new Error('unreachable');
    expect(target.reason).toBe('no-filter-mechanism');
    expect(target.route).toBe('/ear-training/scales-modes');
  });

  it('summarises as unfiltered so a row cannot overclaim', () => {
    const summary = drillTargetSummary(
      drillTargetFor(flatten(tree).find(n => n.depth === 2)!, 'scales-modes'),
    );
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
      { sourceId: 'repertoire', moduleId: 'repertoire', label: 'r', accuracyKind: 'measured', items: [] }, [],
    );
    const target = drillTargetFor(empty, 'repertoire');
    if (target.kind !== 'navigate') throw new Error('expected navigate');
    expect(target.reason).toBe('nothing-to-drill');
  });

  it('an unknown id does not produce a broken route', () => {
    // No source of its own AND an unrecognised module - the only way
    // left to reach the fallback, now that a node knows its catalog.
    const orphan = { ...treeFor(scalesModesCatalog), sourceId: undefined };
    const target = drillTargetFor(orphan, 'not-a-module');
    if (target.kind !== 'navigate') throw new Error('expected navigate');
    expect(target.reason).toBe('nothing-to-drill');
    expect(target.route).toBe('/');
  });
});

// ── The merged module, which is where this used to fall over ─────────

describe('a row resolves against its own catalog, not its module', () => {
  const tree = earTrainingTree();

  it('the fixture really does hide the source from the caller', () => {
    // GUARD THE GUARD. Every assertion below is worthless if these
    // rows carry `intervals` as their module id, because then passing
    // the module id would have worked all along.
    const intervals = tree.children.find(n => n.label === 'Intervals')!;
    expect(intervals.sourceId).toBe('intervals');
    expect(tree.id).toBe('ear-training');
    expect(tree.children.map(n => n.label)).toContain('Chord Recognition');
  });

  it('drills intervals from a row whose caller only knows ear-training', () => {
    // THE DEAD TAP. `ROUTES` and `FOCUS_KEY_FORMAT` are keyed on the
    // CATALOG (`intervals`); the screen walks a merged tree and holds
    // the MODULE (`ear-training`). Resolving on what the caller passed
    // sent every ear-training row - intervals included - to
    // `nothing-to-drill` with route `/`, which is the dashboard the tap
    // started on.
    const tree2 = earTrainingTree();
    const descending = flatten(tree2).find(
      n => n.label === 'Descending' && n.sourceId === 'intervals',
    )!;
    const target = drillTargetFor(descending, 'ear-training');
    expect(target.kind).toBe('filtered');
    if (target.kind !== 'filtered') throw new Error('unreachable');
    expect(target.route).toBe('/ear-training/intervals');
    expect(target.focusKeys).toHaveLength(13);
    expect(target.focusKeys.every(k => k.includes('|desc'))).toBe(true);
  });

  it('still refuses to filter a sibling catalog that cannot be', () => {
    // The fix must not make everything under ear training filterable -
    // only what its own catalog supports.
    const mode = flatten(tree).find(n => n.sourceId === 'scales-modes' && n.depth === 2)!;
    const target = drillTargetFor(mode, 'ear-training');
    if (target.kind !== 'navigate') throw new Error('expected navigate');
    expect(target.reason).toBe('no-filter-mechanism');
    expect(target.route).toBe('/ear-training/scales-modes');
  });

  it('opens the module itself where the row spans all four', () => {
    // No single source, so no drill - and the module id is what is
    // left to route on. Before the route existed this was `/` too.
    expect(tree.sourceId).toBeUndefined();
    const target = drillTargetFor(tree, 'ear-training');
    if (target.kind !== 'navigate') throw new Error('expected navigate');
    expect(target.reason).toBe('whole-module');
    expect(target.route).toBe('/ear-training');
  });
});
