/**
 * View state in the URL.
 *
 * Two things carry real risk here and both have their own section: that
 * expansion indices address BUILT order rather than sorted order, and
 * that a malformed URL degrades to the default rather than to a blank
 * screen or a filter nobody asked for.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VIEW_STATE,
  activeFilterCount,
  decodeViewState,
  encodeViewState,
  expansionKey,
  isDefaultViewState,
  parseExpansionKey,
  pruneExpansion,
  withExpansionToggled,
  withModuleCollapsed,
  type DashboardViewState,
} from '../urlState';
import { buildModuleTree } from '../tree';
import { filterNodes, sortNodes, type ModuleTree } from '../query';
import { scalesModesCatalog } from '../catalogs';
import { statsForAttemptCatalog } from '../adapters';
import { emptyItemStats } from '../itemStats';

const NOW = 1_700_000_000_000;

function state(patch: Partial<DashboardViewState> = {}): DashboardViewState {
  return { ...DEFAULT_VIEW_STATE, ...patch };
}

function roundTrip(s: DashboardViewState): DashboardViewState {
  return decodeViewState(new URLSearchParams(encodeViewState(s).toString()));
}

/**
 * The scales & modes SUBMODULE as its own tree.
 *
 * The real catalog hangs under the ear-training module row now, so
 * these fixtures use the submodule directly - the index-path property
 * is about children within a node, and testing it needs a node whose
 * children vary.
 */
function scalesModes(): ModuleTree {
  const full = buildModuleTree(
    scalesModesCatalog, statsForAttemptCatalog(scalesModesCatalog, []),
  );
  return {
    moduleId: 'scales-modes',
    moduleLabel: 'scales & modes',
    root: full.children[0],
  };
}

// ── The property that matters ────────────────────────────────────────

describe('expansion indices address built order, never sorted order', () => {
  /**
   * A module whose children have DIFFERENT stats, so sorting actually
   * reorders them. With uniform stats the sort is a stable no-op and
   * this whole section would pass for the wrong reason.
   */
  function varied(): ModuleTree {
    const scores = [10, 90, 50, 70, 30, 100, 20, 80, 40];
    const items = scalesModesCatalog.items;
    const stats = items.map((item, i) => ({
      ...emptyItemStats(item.id),
      score: scores[Math.floor(i / 2) % scores.length],
      lastAt: NOW - (i + 1) * 86_400_000,
      engagementCount: i + 1,
      covered: i % 3 === 0,
    }));
    return {
      moduleId: 'scales-modes',
      moduleLabel: 'scales & modes',
      root: buildModuleTree(scalesModesCatalog, stats).children[0],
    };
  }

  it('sorting genuinely reorders this fixture', () => {
    // Guards the guard: if the fixture stops varying, every assertion
    // below becomes vacuous.
    const module = varied();
    const sorted = sortNodes(
      module.root.children, { field: 'accuracy', direction: 'worst-first' }, NOW,
    );
    expect(sorted.map(n => n.label))
      .not.toEqual(module.root.children.map(n => n.label));
  });

  it('leaves the tree untouched however the list is sorted', () => {
    // THE BUG THIS PREVENTS: if sortNodes reordered in place, indices
    // would address the sorted array, and changing the sort control
    // would silently move which rows are open. It would look like the
    // tree collapsing at random.
    const module = varied();
    const built = module.root.children.map(c => c.label);

    for (const direction of ['worst-first', 'best-first'] as const) {
      for (const field of ['accuracy', 'coverage', 'recency'] as const) {
        sortNodes(module.root.children, { field, direction }, NOW);
        expect(module.root.children.map(c => c.label), `${field}/${direction}`)
          .toEqual(built);
      }
    }
  });

  it('resolves the same node after sorting as before', () => {
    const module = varied();
    const before = module.root.children[3].label;
    sortNodes(module.root.children, { field: 'accuracy', direction: 'worst-first' }, NOW);
    expect(module.root.children[3].label).toBe(before);
    expect(pruneExpansion(
      new Set([expansionKey('scales-modes', [3])]), [module],
    ).size).toBe(1);
  });

  it('returns a new array rather than reordering in place', () => {
    const module = varied();
    const children = module.root.children;
    const sorted = sortNodes(children, { field: 'accuracy', direction: 'best-first' }, NOW);
    expect(sorted).not.toBe(children);
  });
});

// ── Keys ─────────────────────────────────────────────────────────────

describe('expansion keys', () => {
  it('round-trips a module id and an index path', () => {
    const key = expansionKey('scales-modes', [2, 5, 1]);
    expect(key).toBe('scales-modes~2.5.1');
    expect(parseExpansionKey(key)).toEqual({
      moduleId: 'scales-modes', indexPath: [2, 5, 1],
    });
  });

  it('handles a module id containing a hyphen or a dot', () => {
    // Splitting on the wrong separator would silently address a
    // different module.
    expect(parseExpansionKey('production-lessons~0')).toEqual({
      moduleId: 'production-lessons', indexPath: [0],
    });
  });

  it('rejects malformed keys rather than half-parsing them', () => {
    for (const bad of ['', '~', 'mod~', '~1', 'mod~a', 'mod~-1', 'mod~1.x', 'no-tilde']) {
      expect(parseExpansionKey(bad), bad).toBeNull();
    }
  });

  it('toggles on and off', () => {
    const key = expansionKey('m', [0]);
    const on = withExpansionToggled(state(), key);
    expect(on.expanded.has(key)).toBe(true);
    expect(withExpansionToggled(on, key).expanded.has(key)).toBe(false);
    // Immutable — the screen re-renders off a new object.
    expect(state().expanded.has(key)).toBe(false);
  });
});

describe('pruneExpansion', () => {
  const modules = [scalesModes()];

  it('keeps a key that addresses a node with children', () => {
    expect([...pruneExpansion(new Set([expansionKey('scales-modes', [0])]), modules)])
      .toEqual(['scales-modes~0']);
  });

  it('drops a path that runs off the end of a shorter catalog', () => {
    // Catalogs grow and shrink by design. A stale path is dropped, not
    // guessed at.
    expect(pruneExpansion(new Set([expansionKey('scales-modes', [99])]), modules).size)
      .toBe(0);
  });

  it('drops a key naming a module that no longer exists', () => {
    expect(pruneExpansion(new Set([expansionKey('gone', [0])]), modules).size).toBe(0);
  });

  it('drops a key pointing at a leaf', () => {
    // A leaf has no chevron. Keeping the entry would render one on a
    // row with nothing under it.
    const leafKey = expansionKey('scales-modes', [0, 0]);
    expect(pruneExpansion(new Set([leafKey]), modules).size).toBe(0);
  });

  it('drops malformed keys without discarding the good ones alongside', () => {
    const good = expansionKey('scales-modes', [1]);
    expect([...pruneExpansion(new Set([good, 'junk', 'x~y']), modules)]).toEqual([good]);
  });
});

// ── Encoding ─────────────────────────────────────────────────────────

describe('encoding', () => {
  it('emits nothing at all for the default view', () => {
    // A clean URL is what the reset button produces.
    expect(encodeViewState(DEFAULT_VIEW_STATE).toString()).toBe('');
    expect(isDefaultViewState(DEFAULT_VIEW_STATE)).toBe(true);
  });

  it('is stable, so the URL does not churn between renders', () => {
    // An unstable encoding would push a history entry on every render.
    const s = state({
      filter: { match: 'any', modules: ['reading', 'intervals'], accuracyBelow: 70 },
      expanded: new Set(['b~1', 'a~0']),
    });
    expect(encodeViewState(s).toString()).toBe(encodeViewState(s).toString());
    // Sets and arrays are order-independent on the way in.
    const reordered = state({
      filter: { match: 'any', modules: ['intervals', 'reading'], accuracyBelow: 70 },
      expanded: new Set(['a~0', 'b~1']),
    });
    expect(encodeViewState(reordered).toString()).toBe(encodeViewState(s).toString());
  });

  it('round-trips every field', () => {
    const s = state({
      sort: { field: 'recency', direction: 'best-first' },
      grouping: false,
      filter: {
        accuracyBelow: 70, coverageBelow: 50, notPractisedInDays: 30,
        hasDueItems: true, modules: ['reading'], match: 'any',
      },
      expanded: new Set(['reading~0', 'reading~1.2']),
    });
    const out = roundTrip(s);
    expect(out.sort).toEqual(s.sort);
    expect(out.grouping).toBe(false);
    expect(out.filter).toEqual(s.filter);
    expect([...out.expanded].sort()).toEqual([...s.expanded].sort());
  });

  it('round-trips a filter of zero rather than dropping it', () => {
    // `accuracy below 0` matches nothing, which is a real thing to ask
    // for. Treating 0 as absent would silently widen the list.
    const out = roundTrip(state({ filter: { match: 'all', accuracyBelow: 0 } }));
    expect(out.filter.accuracyBelow).toBe(0);
  });
});

describe('decoding is total', () => {
  it('gives the default view for an empty query', () => {
    expect(decodeViewState(new URLSearchParams())).toEqual(DEFAULT_VIEW_STATE);
  });

  it('falls back per field rather than throwing', () => {
    // A hand-edited or truncated URL opens the default dashboard, not
    // a blank screen.
    const out = decodeViewState(new URLSearchParams('sort=zz&flat=maybe&any=yes'));
    expect(out.sort).toEqual(DEFAULT_VIEW_STATE.sort);
    expect(out.grouping).toBe(true);
    expect(out.filter.match).toBe('all');
  });

  it('ignores a junk number rather than coercing it to zero', () => {
    // `acc=banana` becoming 0 would filter out every row and look like
    // a broken dashboard.
    const out = decodeViewState(new URLSearchParams('acc=banana&cov=-5&stale='));
    expect(out.filter.accuracyBelow).toBeUndefined();
    expect(out.filter.coverageBelow).toBeUndefined();
    expect(out.filter.notPractisedInDays).toBeUndefined();
  });

  it('keeps a half-readable sort rather than discarding both halves', () => {
    const out = decodeViewState(new URLSearchParams('sort=rz'));
    expect(out.sort.field).toBe('recency');
    expect(out.sort.direction).toBe(DEFAULT_VIEW_STATE.sort.direction);
  });

  it('drops malformed expansion entries and keeps the rest', () => {
    const out = decodeViewState(new URLSearchParams('open=a~0,,junk,b~1.2'));
    expect([...out.expanded].sort()).toEqual(['a~0', 'b~1.2']);
  });
});

describe('activeFilterCount', () => {
  it('counts filters, not the match switch', () => {
    // The switch narrows nothing on its own, so badging it would
    // overstate how filtered the list is.
    expect(activeFilterCount({ match: 'any' })).toBe(0);
    expect(activeFilterCount({ match: 'all', accuracyBelow: 70, hasDueItems: true })).toBe(2);
    expect(activeFilterCount({ match: 'all', modules: [] })).toBe(0);
  });

  it('counts a zero threshold as active', () => {
    expect(activeFilterCount({ match: 'all', coverageBelow: 0 })).toBe(1);
  });
});

describe('expansion survives filtering', () => {
  it('keys still resolve when the displayed list has been narrowed', () => {
    // filterNodes narrows the LIST and never prunes the tree, so an
    // index path stays valid with filters active. If filtering ever
    // pruned children instead, expanded rows would vanish whenever a
    // filter was applied.
    const module = scalesModes();
    const key = expansionKey('scales-modes', [3]);
    const displayed = filterNodes(
      module.root.children, { accuracyBelow: 70, match: 'all' }, { now: NOW },
    );
    expect(displayed).toHaveLength(0);
    expect(pruneExpansion(new Set([key]), [module]).has(key)).toBe(true);
  });
});

describe('collapsed modules', () => {
  it('records what was CLOSED, so the default view stays clean', () => {
    // Modules are open by default. Encoding the open ones would put six
    // ids in the query string before anything happened.
    expect(encodeViewState(DEFAULT_VIEW_STATE).toString()).toBe('');
    const folded = withModuleCollapsed(state(), 'ear-training');
    expect(encodeViewState(folded).get('closed')).toBe('ear-training');
  });

  it('toggles back off', () => {
    const folded = withModuleCollapsed(state(), 'reading');
    expect(withModuleCollapsed(folded, 'reading').collapsedModules.size).toBe(0);
  });

  it('round-trips several, in a stable order', () => {
    const a = state({ collapsedModules: new Set(['production', 'reading']) });
    const b = state({ collapsedModules: new Set(['reading', 'production']) });
    expect(encodeViewState(a).toString()).toBe(encodeViewState(b).toString());
    expect([...roundTrip(a).collapsedModules].sort()).toEqual(['production', 'reading']);
  });

  it('is independent of expansion', () => {
    // Different state because they mean opposite things: a module is
    // open unless named, everything else is closed unless named.
    const both = withExpansionToggled(
      withModuleCollapsed(state(), 'reading'),
      expansionKey('reading', [0]),
    );
    const out = roundTrip(both);
    expect([...out.collapsedModules]).toEqual(['reading']);
    expect([...out.expanded]).toEqual(['reading~0']);
  });

  it('keeps an unknown module id rather than dropping it', () => {
    // Unlike an expansion path, a module id cannot address the wrong
    // row — it either matches or does nothing. Dropping it would lose
    // a fold across a catalog change that a later change would restore.
    expect([...roundTrip(state({
      collapsedModules: new Set(['not-a-module']),
    })).collapsedModules]).toEqual(['not-a-module']);
  });
});
