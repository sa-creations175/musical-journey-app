/**
 * One row of the dashboard table.
 *
 * Four cells - name, score, coverage, recency - plus the two controls
 * that hang off a row: the compare toggle and the drill affordance.
 *
 * Presentational. It takes a node and callbacks and owns no state; the
 * screen owns expansion, comparison and everything in the URL. That is
 * what lets a row be rendered in isolation and asserted on.
 */
import { memo } from 'react';
import {
  BAND_TEXT_CLASS,
  NO_VALUE,
  bandFor,
  formatCoverage,
  formatRecency,
  formatScore,
} from './bands';
import { daysSince, type TreeNode } from './read/tree';
import { drillTargetFor, drillTargetSummary } from './read/drillTarget';

export interface TreeRowProps {
  node: TreeNode;
  moduleId: string;
  now: number;
  expanded: boolean;
  /** Absent on a leaf. */
  onToggleExpand?: () => void;
  /** Highlight from the active comparison, if this row is one of the
   *  two extremes among its siblings. */
  compareHighlight?: 'weakest' | 'strongest';
  /** True when THIS row's compare control is the active one. */
  compareActive?: boolean;
  onCompare?: () => void;
  onDrill?: () => void;
  /** Trailing module name, for the flat grouping-off view. */
  moduleLabel?: string;
}

/** Row background by depth. Indentation carries the structure; the
 *  shade keeps it readable when a branch runs past a screen height. */
const DEPTH_SHADE = [
  'bg-white dark:bg-neutral-950',
  'bg-neutral-50/60 dark:bg-neutral-900/40',
  'bg-neutral-100/60 dark:bg-neutral-900/70',
  'bg-neutral-100 dark:bg-neutral-900',
];

const COMPARE_TINT: Readonly<Record<'weakest' | 'strongest', string>> = {
  weakest: 'bg-rose-50 dark:bg-rose-950/40',
  strongest: 'bg-emerald-50 dark:bg-emerald-950/40',
};

function TreeRowImpl({
  node, moduleId, now, expanded, onToggleExpand,
  compareHighlight, compareActive, onCompare, onDrill, moduleLabel,
}: TreeRowProps) {
  const isLeaf = node.children.length === 0;
  const band = bandFor(node.score, node.accuracyKind);
  const target = drillTargetFor(node, moduleId);
  const summary = drillTargetSummary(target);

  // The compare tint replaces the depth shade rather than layering, so
  // two backgrounds can never fight.
  const background = compareHighlight
    ? COMPARE_TINT[compareHighlight]
    : DEPTH_SHADE[Math.min(node.depth, DEPTH_SHADE.length - 1)];

  return (
    <div
      data-testid="tree-row"
      data-depth={node.depth}
      data-node-id={node.id}
      data-compare={compareHighlight ?? undefined}
      className={`flex items-center gap-2 border-b border-neutral-200/60 dark:border-neutral-800/60 px-2 py-1 text-[13px] ${background}`}
    >
      {/* Name, indented by depth. */}
      <div
        className="flex-1 min-w-0 flex items-center gap-1"
        style={{ paddingLeft: `${node.depth * 14}px` }}
      >
        {/* A chevron only where there is something to toggle. Rendering
            one without a handler - on a module row, whose submodules
            always show - would be a control that looks live and does
            nothing. */}
        {isLeaf || !onToggleExpand ? (
          <span aria-hidden="true" className="inline-block w-4 shrink-0" />
        ) : (
          <button
            type="button"
            data-testid="expand-toggle"
            onClick={onToggleExpand}
            aria-expanded={expanded}
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${node.label}`}
            className="w-4 shrink-0 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
          >
            {expanded ? '▾' : '▸'}
          </button>
        )}
        <span className="truncate" title={node.label}>{node.label}</span>
        {moduleLabel && (
          <span
            data-testid="row-module-label"
            className="ml-1 shrink-0 text-[10px] uppercase tracking-wide text-neutral-400"
          >
            {moduleLabel}
          </span>
        )}
      </div>

      {/* Score. The header says whether this is accuracy or fluency;
          the cell never spells out a unit, so a self-rated 75 cannot
          read as "75% correct". */}
      <div
        data-testid="cell-score"
        data-band={band ?? 'none'}
        data-kind={node.accuracyKind}
        className={`w-16 shrink-0 text-right tabular-nums ${
          band ? BAND_TEXT_CLASS[band] : 'text-neutral-400'
        }`}
      >
        {formatScore(node.score)}
      </div>

      <div
        data-testid="cell-coverage"
        className="w-36 shrink-0 text-right tabular-nums text-neutral-600 dark:text-neutral-400"
      >
        {formatCoverage({
          isLeaf,
          coveredItems: node.coveredItems,
          totalItems: node.totalItems,
          engagementCount: node.engagementCount,
        })}
      </div>

      <div
        data-testid="cell-recency"
        className="w-24 shrink-0 text-right tabular-nums text-neutral-600 dark:text-neutral-400"
      >
        {formatRecency({
          isLeaf,
          mostRecentDays: daysSince(node.recency.mostRecentAt, now),
          stalestDays: daysSince(node.recency.stalestAt, now),
          hasUntouched: node.recency.hasUntouched,
        })}
      </div>

      {/* Compare: parents only. Comparing a leaf's children is a
          question about nothing. */}
      <div className="w-6 shrink-0 text-center">
        {!isLeaf && onCompare && (
          <button
            type="button"
            data-testid="compare-toggle"
            data-active={compareActive ? 'true' : 'false'}
            onClick={onCompare}
            aria-pressed={compareActive ?? false}
            aria-label={`Compare children of ${node.label}`}
            className={`text-[11px] ${
              compareActive
                ? 'text-fluent'
                : 'text-neutral-300 hover:text-neutral-600 dark:text-neutral-600 dark:hover:text-neutral-300'
            }`}
          >
            ⇕
          </button>
        )}
      </div>

      {/* The drill affordance. Its LABEL is where `filtered: false` is
          surfaced: a row must never imply it will narrow a drill it
          cannot narrow, and the button has to say something anyway, so
          it says the honest thing. A badge on every unfilterable row
          would be decoration on four rows in five. */}
      <button
        type="button"
        data-testid="drill-affordance"
        data-filtered={summary.filtered ? 'true' : 'false'}
        onClick={onDrill}
        aria-label={`${drillLabel(summary)} — ${node.label}`}
        className="w-24 shrink-0 text-right text-[11px] text-neutral-400 hover:text-fluent"
      >
        {drillLabel(summary)}
      </button>
    </div>
  );
}

/** What pressing the row will actually do. */
export function drillLabel(
  summary: ReturnType<typeof drillTargetSummary>,
): string {
  if (!summary.filtered) return 'open module';
  return `drill ${summary.itemCount} item${summary.itemCount === 1 ? '' : 's'}`;
}

/** Column headers. Exported so the screen and the row cannot disagree
 *  about which cell is which width. */
export const COLUMN_WIDTHS = {
  score: 'w-16',
  coverage: 'w-36',
  recency: 'w-24',
} as const;

export { NO_VALUE };

/** Memoised: a few hundred rows re-render on every sort change, and
 *  nothing here depends on anything but its props. */
export default memo(TreeRowImpl);
