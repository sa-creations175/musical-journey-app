/**
 * The dashboard screen.
 *
 * Owns three things and delegates everything else: which rows are
 * visible (expansion, from the URL), which comparison is active
 * (component state, deliberately not in the URL), and the recursion
 * that turns a tree into a flat list of rows.
 *
 * Every number it shows is computed in `read/`. Every formatting
 * decision is in `bands.ts`. This file decides what is on screen and in
 * what order, and nothing else.
 *
 * Controls and the legibility affordances arrive in steps 6 and 7; the
 * view state they will drive is already wired here so those steps add
 * a surface rather than a mechanism.
 */
import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import TreeRow from './TreeRow';
import { useDashboardData } from './useDashboardData';
import {
  DEFAULT_VIEW_STATE,
  decodeViewState,
  encodeViewState,
  expansionKey,
  pruneExpansion,
  withExpansionToggled,
  type DashboardViewState,
} from './read/urlState';
import {
  flatView,
  groupedView,
  moduleIdResolver,
  sortNodes,
  type FilterContext,
  type ModuleTree,
} from './read/query';
import { drillTargetFor } from './read/drillTarget';
import type { TreeNode } from './read/tree';
import {
  highlightFor,
  toggleComparison,
  type Comparison,
} from './compare';

/** A row to render: the node, where it sits, and how to address it. */
interface VisibleRow {
  node: TreeNode;
  moduleId: string;
  /** Index path from the module root — the URL's address for it. */
  indexPath: number[];
  /** Trailing module name, flat view only. */
  moduleLabel?: string;
}

/**
 * Walk a node's descendants, emitting only what is open.
 *
 * The index path is built as it recurses, which is what keeps the URL's
 * addressing and the render in step: a row's key is derived from where
 * it sits in the BUILT tree, never from where a sort put it.
 */
function visibleDescendants(
  node: TreeNode,
  moduleId: string,
  basePath: number[],
  expanded: ReadonlySet<string>,
  sortChildren: (children: TreeNode[]) => TreeNode[],
): VisibleRow[] {
  const key = expansionKey(moduleId, basePath);
  if (basePath.length > 0 && !expanded.has(key)) return [];
  const out: VisibleRow[] = [];
  // Children render in SORTED order but are addressed by their built
  // index, so re-sorting cannot move which rows are open.
  const indexOf = new Map(node.children.map((child, i) => [child, i]));
  for (const child of sortChildren(node.children)) {
    const indexPath = [...basePath, indexOf.get(child)!];
    out.push({ node: child, moduleId, indexPath });
    out.push(...visibleDescendants(child, moduleId, indexPath, expanded, sortChildren));
  }
  return out;
}

export default function DashboardScreen({
  now = Date.now(),
}: { now?: number }) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { dashboard, loading } = useDashboardData(now);
  const [comparison, setComparison] = useState<Comparison | null>(null);

  const state = useMemo(() => decodeViewState(params), [params]);

  const setState = useCallback((next: DashboardViewState) => {
    // `replace` so adjusting a filter does not fill the back button
    // with every intermediate view.
    setParams(encodeViewState(next), { replace: true });
  }, [setParams]);

  const modules: ModuleTree[] = dashboard?.modules ?? [];

  // Stale entries are dropped once, against the trees actually built,
  // rather than at every lookup.
  const expanded = useMemo(
    () => pruneExpansion(state.expanded, modules),
    [state.expanded, modules],
  );

  const ctx: FilterContext = useMemo(() => ({
    now,
    dueRefs: dashboard?.dueRefs,
    moduleIdOf: moduleIdResolver(modules),
  }), [now, dashboard, modules]);

  // Descendants sort on the same field as the levels above them.
  // Catalog order below an expanded row while everything above is
  // sorted would read as the sort having stopped working.
  const sortChildren = useCallback(
    (children: TreeNode[]) => sortNodes(children, state.sort, now),
    [state.sort, now],
  );

  const rows: VisibleRow[] = useMemo(() => {
    if (modules.length === 0) return [];
    const viewSpec = { sort: state.sort, filter: state.filter, grouping: state.grouping };

    if (!state.grouping) {
      // One flat list of submodules across every module, each carrying
      // the module name that trails its row.
      return flatView(modules, viewSpec, ctx).flatMap(row => {
        const module = modules.find(m => m.moduleId === row.moduleId)!;
        const index = module.root.children.indexOf(row.node);
        const base = [index];
        return [
          {
            node: row.node,
            moduleId: row.moduleId,
            indexPath: base,
            moduleLabel: row.moduleLabel,
          },
          ...visibleDescendants(row.node, row.moduleId, base, expanded, sortChildren),
        ];
      });
    }

    return groupedView(modules, viewSpec, ctx).flatMap(({ module, submodules }) => {
      const out: VisibleRow[] = [
        { node: module.root, moduleId: module.moduleId, indexPath: [] },
      ];
      const indexOf = new Map(
        module.root.children.map((child, i) => [child, i]),
      );
      for (const submodule of submodules) {
        const base = [indexOf.get(submodule)!];
        out.push({ node: submodule, moduleId: module.moduleId, indexPath: base });
        out.push(
          ...visibleDescendants(submodule, module.moduleId, base, expanded, sortChildren),
        );
      }
      return out;
    });
  }, [modules, state.sort, state.filter, state.grouping, ctx, expanded, sortChildren]);

  const onToggleExpand = useCallback((row: VisibleRow) => {
    setState(withExpansionToggled(
      { ...state, expanded },
      expansionKey(row.moduleId, row.indexPath),
    ));
  }, [state, expanded, setState]);

  const onCompare = useCallback((row: VisibleRow) => {
    setComparison(current => toggleComparison(current, row.node));
  }, []);

  /**
   * Navigate to the drill.
   *
   * A filtered target carries its items in the URL as `focus`, in the
   * module's OWN key format — `M3|asc` for intervals, the stored ref
   * for reading — so the destination drill can restrict its pool
   * without the dashboard knowing how that drill works.
   *
   * NOTE: neither drill reads `focus` yet. Until they do, a row
   * labelled "drill 13 items" lands on the module with the items in the
   * query string and nothing consuming them. That is a gap on the drill
   * side, and it is why wiring those two reads is its own step rather
   * than something to leave implied.
   */
  const onDrill = useCallback((row: VisibleRow) => {
    const target = drillTargetFor(row.node, row.moduleId);
    if (target.kind === 'filtered' && target.focusKeys.length > 0) {
      navigate(`${target.route}?focus=${encodeURIComponent(target.focusKeys.join(','))}`);
      return;
    }
    navigate(target.route);
  }, [navigate]);

  if (loading) {
    return (
      <div data-testid="dashboard-loading" className="p-6 text-sm text-neutral-500">
        Loading…
      </div>
    );
  }

  return (
    <div data-testid="dashboard-screen" className="pb-8">
      <div
        data-testid="dashboard-rows"
        role="table"
        aria-label="Practice by module"
      >
        {rows.map(row => {
          const key = expansionKey(row.moduleId, row.indexPath);
          return (
            <TreeRow
              key={key}
              node={row.node}
              moduleId={row.moduleId}
              now={now}
              expanded={expanded.has(key)}
              /* Module rows carry no toggle: the screen opens at
                 submodule level every time, so their children always
                 show and a chevron there would do nothing. Collapsing
                 a whole module is a separate decision - see the note
                 on 44 default rows in the spec. */
              onToggleExpand={
                row.indexPath.length > 0 && row.node.children.length > 0
                  ? () => onToggleExpand(row)
                  : undefined
              }
              compareHighlight={highlightFor(comparison, row.node.id)}
              compareActive={comparison?.parentId === row.node.id}
              onCompare={() => onCompare(row)}
              onDrill={() => onDrill(row)}
              {...(row.moduleLabel ? { moduleLabel: row.moduleLabel } : {})}
            />
          );
        })}
        {rows.length === 0 && (
          <div data-testid="dashboard-empty" className="p-6 text-sm text-neutral-500">
            Nothing matches these filters.
          </div>
        )}
      </div>
    </div>
  );
}

export { DEFAULT_VIEW_STATE };
