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
import TreeRow, { COLUMN_RULE_CLASS, COLUMN_WIDTHS } from './TreeRow';
import DashboardControls from './DashboardControls';
import { useDashboardData } from './useDashboardData';
import {
  DEFAULT_VIEW_STATE,
  decodeViewState,
  encodeViewState,
  expansionKey,
  pruneExpansion,
  withExpansionToggled,
  withModuleCollapsed,
  type DashboardViewState,
} from './read/urlState';
import { moduleMetaById } from '../../lib/moduleMeta';
import {
  flatView,
  groupedView,
  moduleIdResolver,
  sortNodes,
  type FilterContext,
  type ModuleTree,
} from './read/query';
import {
  drillTargetFor,
  smallPoolPromptFor,
  type FilteredDrillTarget,
  type SmallPoolPrompt,
} from './read/drillTarget';
import type { TreeNode } from './read/tree';
import {
  highlightFor,
  toggleComparison,
  type Comparison,
} from './compare';
import ColumnLegend, { ColumnHelpButton } from './ColumnLegend';
import type { ColumnTopic } from './bands';
import type { RowNoteContext } from './read/affordances';

/**
 * The column headers, sitting under the controls inside the sticky
 * container.
 *
 * Sticky because a 55-row list puts the top off screen almost
 * immediately, and three right-aligned number columns are
 * indistinguishable by position alone once it is gone.
 *
 * Widths come from `COLUMN_WIDTHS`, shared with the row. A header that
 * drifts by a few pixels is worse than no header: it points at the
 * wrong column with total confidence.
 *
 * The score column reads "accuracy / fluency" because the column
 * genuinely carries both and ONE header spans every block. Most rows
 * are measured; Shapes & Patterns and the production lessons branch are
 * self-rated, and each cell already carries its own kind. The two
 * legends behind the `?` say which is which — naming only one here would
 * make the other read as the same thing.
 *
 * Each number column carries its own `?`, because each carries its own
 * rules and the answer belongs at the question. One panel is open at a
 * time, which is the screen's state, not the header's.
 */
function ColumnHeaders({
  openTopic, onToggleTopic,
}: {
  openTopic: ColumnTopic | null;
  onToggleTopic: (topic: ColumnTopic) => void;
}) {
  const help = (topic: ColumnTopic) => (
    <ColumnHelpButton
      topic={topic}
      open={openTopic === topic}
      onToggle={() => onToggleTopic(topic)}
    />
  );
  return (
    <div
      data-testid="column-headers"
      role="row"
      className="flex items-center gap-2 border-b border-neutral-300 px-2 pb-1
        text-[10px] uppercase tracking-wider text-neutral-400
        dark:border-neutral-700"
    >
      {/* Matches the row's 3px accent edge so the columns line up. */}
      <span aria-hidden="true" className="w-[3px] shrink-0" />
      <span className="flex-1 min-w-0">skill</span>
      <span className={`${COLUMN_RULE_CLASS} ${COLUMN_WIDTHS.score} shrink-0
        flex items-center justify-end`}>
        accuracy / fluency{help('score')}
      </span>
      <span className={`${COLUMN_RULE_CLASS} ${COLUMN_WIDTHS.coverage} shrink-0
        flex items-center justify-end`}>
        coverage{help('coverage')}
      </span>
      <span className={`${COLUMN_RULE_CLASS} ${COLUMN_WIDTHS.recency} shrink-0
        flex items-center justify-end`}>
        recency{help('recency')}
      </span>
      <span className={`${COLUMN_WIDTHS.compare} shrink-0`} aria-hidden="true" />
      <span className={`${COLUMN_WIDTHS.drill} shrink-0 text-right`}>drill</span>
    </div>
  );
}

/** The module's own colour, for its header row. Undefined for a module
 *  with no meta entry, which renders untinted rather than guessing. */
function accentFor(moduleId: string): string | undefined {
  return moduleMetaById(moduleId)?.accentHex;
}

/** A row to render: the node, where it sits, and how to address it. */
interface VisibleRow {
  node: TreeNode;
  moduleId: string;
  /** Index path from the module root — the URL's address for it. */
  indexPath: number[];
  /**
   * This row's ancestors, root first.
   *
   * Carried because the under-4 prompt has to climb: a row whose pool
   * is too small to count offers the nearest ancestor whose pool is
   * not, and only the walk knows where a row sits.
   */
  ancestors: TreeNode[];
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
  ancestors: TreeNode[],
): VisibleRow[] {
  const key = expansionKey(moduleId, basePath);
  if (basePath.length > 0 && !expanded.has(key)) return [];
  const out: VisibleRow[] = [];
  // Children render in SORTED order but are addressed by their built
  // index, so re-sorting cannot move which rows are open.
  const indexOf = new Map(node.children.map((child, i) => [child, i]));
  const chain = [...ancestors, node];
  for (const child of sortChildren(node.children)) {
    const indexPath = [...basePath, indexOf.get(child)!];
    out.push({ node: child, moduleId, indexPath, ancestors: chain });
    out.push(
      ...visibleDescendants(child, moduleId, indexPath, expanded, sortChildren, chain),
    );
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
  /**
   * Which column's rules are open, if any.
   *
   * Component state, not the URL — deliberately, and for the same
   * reason as the comparison. Reading what a column means is a
   * momentary question, not a view you would want to come back to or
   * send to someone.
   *
   * One at a time. Two open panels would push the whole list off screen
   * to answer a question about one column.
   */
  const [openTopic, setOpenTopic] = useState<ColumnTopic | null>(null);
  const onToggleTopic = useCallback((topic: ColumnTopic) => {
    setOpenTopic(current => (current === topic ? null : topic));
  }, []);
  /**
   * Which row's explanation is expanded, if any.
   *
   * By node id rather than by position, so a sort or a filter cannot
   * move the open panel onto a different row. Component state and one
   * at a time, for the same reasons as the column panel above.
   */
  const [openInfoId, setOpenInfoId] = useState<string | null>(null);
  const onToggleInfo = useCallback((nodeId: string) => {
    setOpenInfoId(current => (current === nodeId ? null : nodeId));
  }, []);

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

  // Memoised so a stable object reaches every memoised row rather than
  // a fresh literal that re-renders all of them on every keystroke.
  const noteContext: RowNoteContext = useMemo(() => ({
    ungroupableProgressionAttempts: dashboard?.ungroupableProgressionAttempts ?? 0,
  }), [dashboard]);

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
            ancestors: [module.root],
            moduleLabel: row.moduleLabel,
          },
          ...visibleDescendants(
            row.node, row.moduleId, base, expanded, sortChildren, [module.root],
          ),
        ];
      });
    }

    return groupedView(modules, viewSpec, ctx).flatMap(({ module, submodules }) => {
      const out: VisibleRow[] = [
        { node: module.root, moduleId: module.moduleId, indexPath: [], ancestors: [] },
      ];
      // A collapsed module renders as its header row alone. Six rows
      // instead of forty-four, which is a different way of looking at
      // the same screen rather than a way of hiding rows: nothing is
      // dropped, it is folded.
      if (state.collapsedModules.has(module.moduleId)) return out;
      const indexOf = new Map(
        module.root.children.map((child, i) => [child, i]),
      );
      for (const submodule of submodules) {
        const base = [indexOf.get(submodule)!];
        out.push({
          node: submodule,
          moduleId: module.moduleId,
          indexPath: base,
          ancestors: [module.root],
        });
        out.push(
          ...visibleDescendants(
            submodule, module.moduleId, base, expanded, sortChildren, [module.root],
          ),
        );
      }
      return out;
    });
  }, [
    modules, state.sort, state.filter, state.grouping, state.collapsedModules,
    ctx, expanded, sortChildren,
  ]);

  const onToggleExpand = useCallback((row: VisibleRow) => {
    // A module row folds the whole module; anything deeper toggles its
    // own key. The two use different state because a module is open by
    // default and everything else is closed - see
    // `DashboardViewState.collapsedModules`.
    setState(row.indexPath.length === 0
      ? withModuleCollapsed({ ...state, expanded }, row.moduleId)
      : withExpansionToggled(
        { ...state, expanded },
        expansionKey(row.moduleId, row.indexPath),
      ));
  }, [state, expanded, setState]);

  const onCompare = useCallback((row: VisibleRow) => {
    setComparison(current => toggleComparison(current, row.node));
  }, []);

  /**
   * The row whose pool is too small to count, if one was just tapped.
   *
   * Component state and one at a time, like the info panel: it answers
   * something you did a moment ago and is not a view worth coming back
   * to. Nothing has navigated when it opens — both ways out are in it.
   */
  const [smallPool, setSmallPool] = useState<
    { nodeId: string; prompt: SmallPoolPrompt } | null
  >(null);

  const goToDrill = useCallback((target: FilteredDrillTarget) => {
    navigate(`${target.route}?focus=${encodeURIComponent(target.focusKeys.join(','))}`);
  }, [navigate]);

  /**
   * Navigate to the drill.
   *
   * A filtered target carries its items in the URL as `focus`, in the
   * module's OWN key format — `M3|asc` for intervals, the stored ref
   * for reading — so the destination drill can restrict its pool
   * without the dashboard knowing how that drill works.
   *
   * Both drills read it now. What made this look wired when it was not
   * is that the ROW never reached them: `drillTargetFor` resolves on a
   * node's CATALOG and this loop only has the module, which for all
   * four ear-training catalogs is `ear-training`. The node carries its
   * own source, so the resolution no longer depends on what is passed
   * here.
   */
  const onDrill = useCallback((row: VisibleRow) => {
    const target = drillTargetFor(row.node, row.moduleId);
    if (target.kind === 'filtered' && target.focusKeys.length > 0) {
      // Under the minimum, say so before going. You tap a single weak
      // item BECAUSE it is weak, and that is the drill that will not
      // count; finding out afterwards means the work is already done.
      const prompt = smallPoolPromptFor(row.node, row.ancestors, row.moduleId);
      if (prompt) {
        setSmallPool({ nodeId: row.node.id, prompt });
        return;
      }
      goToDrill(target);
      return;
    }
    navigate(target.route);
  }, [navigate, goToDrill]);

  if (loading) {
    return (
      <div data-testid="dashboard-loading" className="p-6 text-sm text-neutral-500">
        Loading…
      </div>
    );
  }

  return (
    <div data-testid="dashboard-screen" className="pb-8">
      {/* Sticky, and it will host the column headers in step 7 — they
          have to stay visible on a 55-row list, where the top is off
          screen most of the time and position alone does not say which
          column is which. */}
      <div className="sticky top-0 z-10 bg-white/95 dark:bg-neutral-950/95 backdrop-blur">
        <DashboardControls
          state={{ ...state, expanded }}
          onChange={setState}
          openTopic={openTopic}
          onToggleTopic={onToggleTopic}
        />
        <ColumnHeaders openTopic={openTopic} onToggleTopic={onToggleTopic} />
        {/* BELOW the headers, not above: the panel explains the row of
            labels it sits under, and opening it must not shift them. */}
        {openTopic !== null && <ColumnLegend topic={openTopic} />}
      </div>
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
              expanded={
                row.indexPath.length === 0
                  ? !state.collapsedModules.has(row.moduleId)
                  : expanded.has(key)
              }
              {...(row.indexPath.length === 0
                ? { accentHex: accentFor(row.moduleId) }
                : {})}
              onToggleExpand={
                row.node.children.length > 0 ? () => onToggleExpand(row) : undefined
              }
              compareHighlight={highlightFor(comparison, row.node.id)}
              compareActive={comparison?.parentId === row.node.id}
              onCompare={() => onCompare(row)}
              onDrill={() => onDrill(row)}
              {...(smallPool?.nodeId === row.node.id
                ? {
                  drillPrompt: smallPool.prompt,
                  onDrillOffer: () => {
                    const offer = smallPool.prompt.offer;
                    setSmallPool(null);
                    if (offer) goToDrill(offer.target);
                  },
                  onDrillAnyway: () => {
                    const target = drillTargetFor(row.node, row.moduleId);
                    setSmallPool(null);
                    if (target.kind === 'filtered') goToDrill(target);
                  },
                  onDismissDrillPrompt: () => setSmallPool(null),
                }
                : {})}
              infoOpen={openInfoId === row.node.id}
              onToggleInfo={() => onToggleInfo(row.node.id)}
              noteContext={noteContext}
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
