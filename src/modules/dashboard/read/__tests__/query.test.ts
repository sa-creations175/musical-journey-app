/**
 * Sorting and filtering, asserted on the mechanism: where an absent
 * value lands, which side of the recency pair each direction reads, and
 * that a filter cannot quietly narrow what a row contains.
 */
import { describe, expect, it } from 'vitest';
import { buildModuleTree, type TreeNode } from '../tree';
import type { CatalogItem, ModuleCatalog } from '../catalogs';
import { emptyItemStats, type ItemStats } from '../itemStats';
import {
  DEFAULT_SORT,
  filterNodes,
  flatView,
  groupedView,
  matchesFilter,
  moduleIdResolver,
  sortNodes,
  type FilterContext,
  type ModuleTree,
} from '../query';

const NOW = 1_700_000_000_000;
const DAY = 86_400_000;
const ctx: FilterContext = { now: NOW };
/** The old default. Tests that want a real sort say so. */
const WORST_ACCURACY = { field: 'accuracy', direction: 'worst-first' } as const;

function stats(patch: Partial<ItemStats>): ItemStats {
  return { ...emptyItemStats('x'), ...patch };
}

/** A module whose submodules are named and given leaf stats directly. */
function moduleOf(
  sourceId: string,
  groups: Record<string, ItemStats[]>,
): ModuleTree {
  const items: CatalogItem[] = [];
  const rows: ItemStats[] = [];
  for (const [group, groupStats] of Object.entries(groups)) {
    groupStats.forEach((s, i) => {
      const id = `${group}-${i}`;
      items.push({ id, label: id, path: [sourceId, group], itemRefs: [id] });
      rows.push({ ...s, itemRef: id });
    });
  }
  const catalog: ModuleCatalog = {
    sourceId, moduleId: sourceId, label: sourceId, accuracyKind: 'measured', items,
  };
  return {
    moduleId: sourceId,
    moduleLabel: sourceId,
    root: buildModuleTree(catalog, rows),
  };
}

function labels(nodes: ReadonlyArray<TreeNode>): string[] {
  return nodes.map(n => n.label);
}

// ── Sorting ──────────────────────────────────────────────────────────

describe('sorting on accuracy', () => {
  const mod = moduleOf('m', {
    weak: [stats({ score: 20 })],
    strong: [stats({ score: 95 })],
    middling: [stats({ score: 60 })],
    ungraded: [stats({ score: null })],
  });
  const subs = mod.root.children;

  it('worst first puts the low number at the top', () => {
    // Explicit, not DEFAULT_SORT: the default is `natural`, which is
    // deliberately not a sort at all.
    expect(labels(sortNodes(subs, WORST_ACCURACY, NOW)).slice(0, 3))
      .toEqual(['weak', 'middling', 'strong']);
  });

  it('the default leaves everything in catalog order', () => {
    // `natural` is the DEFAULT and means "as the catalog defines".
    // Making a real sort the default is what put module rows out of
    // nav order on load.
    expect(DEFAULT_SORT.field).toBe('natural');
    expect(labels(sortNodes(subs, DEFAULT_SORT, NOW))).toEqual(labels(subs));
  });

  it('leaves catalog order alone whatever the direction says', () => {
    // The direction control is disabled under `natural`, but a URL can
    // still carry one, and it must not flip anything.
    expect(labels(sortNodes(subs, { field: 'natural', direction: 'best-first' }, NOW)))
      .toEqual(labels(subs));
  });

  it('best first reverses it', () => {
    expect(labels(sortNodes(subs, { field: 'accuracy', direction: 'best-first' }, NOW))
      .slice(0, 3)).toEqual(['strong', 'middling', 'weak']);
  });

  it('sorts a dash last in BOTH directions', () => {
    // "Worst accuracy first" asks about items you have data on. Filling
    // the top of that list with ungraded rows would bury the ones
    // actually going badly.
    for (const direction of ['worst-first', 'best-first'] as const) {
      const sorted = labels(sortNodes(subs, { field: 'accuracy', direction }, NOW));
      expect(sorted[sorted.length - 1]).toBe('ungraded');
    }
  });

  it('is stable, so equal rows keep catalog order', () => {
    const tied = moduleOf('m', {
      a: [stats({ score: 50 })],
      b: [stats({ score: 50 })],
      c: [stats({ score: 50 })],
    });
    expect(labels(sortNodes(tied.root.children, WORST_ACCURACY, NOW)))
      .toEqual(['a', 'b', 'c']);
  });
});

describe('sorting on recency', () => {
  const mod = moduleOf('m', {
    fresh: [stats({ lastAt: NOW - DAY })],
    stale: [stats({ lastAt: NOW - 61 * DAY })],
    mixed: [stats({ lastAt: NOW - 2 * DAY }), stats({ lastAt: NOW - 40 * DAY })],
    never: [stats({ lastAt: null })],
  });
  const subs = mod.root.children;

  it('worst first reads the STALEST side of the pair', () => {
    // `mixed` was touched two days ago but has a 40-day-old item, so
    // stalest-first must rank it on the 40, not the 2.
    const sorted = labels(sortNodes(subs, { field: 'recency', direction: 'worst-first' }, NOW));
    expect(sorted.indexOf('mixed')).toBeLessThan(sorted.indexOf('fresh'));
    expect(sorted.indexOf('stale')).toBeLessThan(sorted.indexOf('mixed'));
  });

  it('best first reads the MOST RECENT side', () => {
    // Same `mixed` node, now ranked on the 2 days.
    const sorted = labels(sortNodes(subs, { field: 'recency', direction: 'best-first' }, NOW));
    expect(sorted[0]).toBe('fresh');
    expect(sorted.indexOf('mixed')).toBeLessThan(sorted.indexOf('stale'));
  });

  it('ranks never-touched as staler than any date, not as absent', () => {
    // The one place an absent value is a real answer: never IS staler
    // than 61 days ago.
    const sorted = labels(sortNodes(subs, { field: 'recency', direction: 'worst-first' }, NOW));
    expect(sorted[0]).toBe('never');
  });

  it('but sorts never-touched last when asking for most recent', () => {
    const sorted = labels(sortNodes(subs, { field: 'recency', direction: 'best-first' }, NOW));
    expect(sorted[sorted.length - 1]).toBe('never');
  });
});

describe('sorting on coverage', () => {
  it('worst first is least covered first', () => {
    const mod = moduleOf('m', {
      bare: [stats({ covered: false }), stats({ covered: false })],
      half: [stats({ covered: true }), stats({ covered: false })],
      done: [stats({ covered: true }), stats({ covered: true })],
    });
    expect(labels(sortNodes(mod.root.children, { field: 'coverage', direction: 'worst-first' }, NOW)))
      .toEqual(['bare', 'half', 'done']);
  });
});

// ── Filtering ────────────────────────────────────────────────────────

describe('filters', () => {
  const mod = moduleOf('m', {
    weak: [stats({ score: 40, lastAt: NOW - DAY, covered: true })],
    strong: [stats({ score: 90, lastAt: NOW - DAY, covered: true })],
    ungraded: [stats({ score: null, lastAt: NOW - DAY, covered: true })],
    ancient: [stats({ score: 90, lastAt: NOW - 90 * DAY, covered: false })],
    never: [stats({ score: null, lastAt: null, covered: false })],
  });
  const byLabel = (label: string) => mod.root.children.find(c => c.label === label)!;

  it('accuracy below excludes a dash — it is not on the scale', () => {
    const spec = { accuracyBelow: 70 };
    expect(matchesFilter(byLabel('weak'), spec, ctx)).toBe(true);
    expect(matchesFilter(byLabel('strong'), spec, ctx)).toBe(false);
    expect(matchesFilter(byLabel('ungraded'), spec, ctx)).toBe(false);
  });

  it('not practised in N days matches a never-touched row', () => {
    // Never practised is true of "not practised in 30 days".
    const spec = { notPractisedInDays: 30 };
    expect(matchesFilter(byLabel('ancient'), spec, ctx)).toBe(true);
    expect(matchesFilter(byLabel('never'), spec, ctx)).toBe(true);
    expect(matchesFilter(byLabel('weak'), spec, ctx)).toBe(false);
  });

  it('reads the most recent side, not the stalest', () => {
    // "Not practised in 30 days" asks whether ANYTHING here was
    // touched. A category with one fresh item has been practised.
    const mixed = moduleOf('m', {
      mixed: [stats({ lastAt: NOW - DAY }), stats({ lastAt: NOW - 90 * DAY })],
    }).root.children[0];
    expect(matchesFilter(mixed, { notPractisedInDays: 30 }, ctx)).toBe(false);
  });

  it('coverage below works on the node s own items', () => {
    expect(matchesFilter(byLabel('ancient'), { coverageBelow: 50 }, ctx)).toBe(true);
    expect(matchesFilter(byLabel('weak'), { coverageBelow: 50 }, ctx)).toBe(false);
  });

  it('has due items matches on the stored refs, not the row id', () => {
    const due = new Set(byLabel('weak').itemRefs);
    const withDue: FilterContext = { now: NOW, dueRefs: due };
    expect(matchesFilter(byLabel('weak'), { hasDueItems: true }, withDue)).toBe(true);
    expect(matchesFilter(byLabel('strong'), { hasDueItems: true }, withDue)).toBe(false);
  });

  it('returns nothing from modules that write no spacing state', () => {
    // The due filter simply finds nothing there, rather than every row
    // needing a dash.
    expect(matchesFilter(byLabel('weak'), { hasDueItems: true }, { now: NOW })).toBe(false);
  });

  it('match all needs every filter; match any needs one', () => {
    const spec = { accuracyBelow: 70, notPractisedInDays: 30 };
    // weak is inaccurate but fresh; ancient is stale but accurate.
    expect(matchesFilter(byLabel('weak'), { ...spec, match: 'all' }, ctx)).toBe(false);
    expect(matchesFilter(byLabel('weak'), { ...spec, match: 'any' }, ctx)).toBe(true);
    expect(matchesFilter(byLabel('ancient'), { ...spec, match: 'all' }, ctx)).toBe(false);
    expect(matchesFilter(byLabel('ancient'), { ...spec, match: 'any' }, ctx)).toBe(true);
  });

  it('an empty spec matches everything under either switch', () => {
    for (const match of ['all', 'any'] as const) {
      expect(filterNodes(mod.root.children, { match }, ctx))
        .toHaveLength(mod.root.children.length);
    }
  });

  it('does not narrow what a surviving row contains', () => {
    // Filtering the list must not prune the tree under a match, or an
    // expanded row would disagree with the number on the row above it.
    const childCount = byLabel('weak').children.length;
    expect(childCount).toBeGreaterThan(0);
    filterNodes(mod.root.children, { accuracyBelow: 70 }, ctx);
    expect(byLabel('weak').children).toHaveLength(childCount);
  });
});

// ── The two views ────────────────────────────────────────────────────

describe('grouped view', () => {
  const modules = [
    moduleOf('alpha', { weak: [stats({ score: 30 })], ok: [stats({ score: 80 })] }),
    moduleOf('beta', { great: [stats({ score: 99 })] }),
  ];
  const spec = { sort: WORST_ACCURACY, filter: {}, grouping: true };

  it('reorders modules and sorts submodules inside them', () => {
    const view = groupedView(modules, spec, ctx);
    // alpha averages 55, beta 99 — worst module first.
    expect(view.map(v => v.module.moduleId)).toEqual(['alpha', 'beta']);
    expect(labels(view[0].submodules)).toEqual(['weak', 'ok']);
  });

  it('keeps a module row whose submodules match, even when its own average does not', () => {
    // A module row summarises what is under it. Hiding it because its
    // average misses a threshold would hide the submodules that match,
    // which is what the list is being scanned for.
    const view = groupedView(modules, { ...spec, filter: { accuracyBelow: 50 } }, ctx);
    const alpha = view.find(v => v.module.moduleId === 'alpha')!;
    expect(labels(alpha.submodules)).toEqual(['weak']);
    expect(view.find(v => v.module.moduleId === 'beta')!.submodules).toEqual([]);
  });
});

describe('flat view', () => {
  const modules = [
    moduleOf('alpha', { weak: [stats({ score: 30 })], ok: [stats({ score: 80 })] }),
    moduleOf('beta', { worst: [stats({ score: 10 })] }),
  ];
  const spec = { sort: WORST_ACCURACY, filter: {}, grouping: false };

  it('interleaves submodules across modules and carries the module name', () => {
    const rows = flatView(modules, spec, ctx);
    expect(rows.map(r => `${r.moduleLabel}/${r.node.label}`))
      .toEqual(['beta/worst', 'alpha/weak', 'alpha/ok']);
  });

  it('filters by module without a resolver being supplied', () => {
    const rows = flatView(modules, { ...spec, filter: { modules: ['alpha'] } }, ctx);
    expect(rows.map(r => r.moduleId)).toEqual(['alpha', 'alpha']);
  });

  it('resolves module ids for the grouped view too', () => {
    const resolve = moduleIdResolver(modules);
    expect(resolve(modules[0].root.children[0])).toBe('alpha');
    expect(resolve(modules[1].root.children[0])).toBe('beta');
  });
});
