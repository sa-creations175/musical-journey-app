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
import {
  drillTargetFor,
  drillTargetSummary,
  smallPoolPromptText,
  type SmallPoolPrompt,
} from './read/drillTarget';
import { FLUENCY_POOL_RULE } from '../../lib/fluencyPool';
import RowAffordance, { RowInfoButton } from './RowAffordance';
import type { RowNoteContext } from './read/affordances';

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
  /**
   * Whether this row's explanation is expanded beneath it.
   *
   * The screen owns it, so exactly one row can be open — the same
   * discipline as the comparison. A stack of open explanations would
   * push the list they explain off the screen.
   */
  infoOpen?: boolean;
  onToggleInfo?: () => void;
  /**
   * Set when this row was tapped and its pool is too small to count.
   *
   * Rendered beneath the row rather than as a modal: it is an answer to
   * something you just did, in the place you did it, and a dialog over
   * the list is the kind of thing that gets dismissed without being
   * read. Nothing has navigated yet - both ways out are in the panel.
   */
  drillPrompt?: SmallPoolPrompt;
  onDrillOffer?: () => void;
  onDrillAnyway?: () => void;
  onDismissDrillPrompt?: () => void;
  /** Counts the notes need that no node carries. */
  noteContext?: RowNoteContext;
  /**
   * The module's accent, for a depth-0 header row.
   *
   * TINT READS AS STRUCTURE, NOT STATUS. The row already carries meaning
   * in the score colour, and a tint strong enough to compete with a red
   * or green number would make the eye read the block as a verdict. So
   * the accent goes on a solid left edge - which says "a block starts
   * here" without occupying the same channel - and the row fill is a
   * wash at 10%, below the threshold where it competes.
   *
   * If the two ever cannot coexist, the score colour wins and the tint
   * gets quieter.
   */
  accentHex?: string;
}

/** Row background by depth. Indentation carries the structure; the
 *  shade keeps it readable when a branch runs past a screen height. */
const DEPTH_SHADE = [
  'bg-white dark:bg-neutral-950',
  'bg-neutral-50/60 dark:bg-neutral-900/40',
  'bg-neutral-100/60 dark:bg-neutral-900/70',
  'bg-neutral-100 dark:bg-neutral-900',
];

/** A hairline between the number columns. Light enough to guide the eye
 *  down a column without reading as a border. */
const COLUMN_RULE = 'border-l border-neutral-200/70 dark:border-neutral-800/70 pl-2';

const COMPARE_TINT: Readonly<Record<'weakest' | 'strongest', string>> = {
  weakest: 'bg-rose-50 dark:bg-rose-950/40',
  strongest: 'bg-emerald-50 dark:bg-emerald-950/40',
};

function TreeRowImpl({
  node, moduleId, now, expanded, onToggleExpand,
  compareHighlight, compareActive, onCompare, onDrill, moduleLabel, accentHex,
  infoOpen, onToggleInfo, noteContext,
  drillPrompt, onDrillOffer, onDrillAnyway, onDismissDrillPrompt,
}: TreeRowProps) {
  const isLeaf = node.children.length === 0;
  const isModuleRow = node.depth === 0;
  const band = bandFor(node.score, node.accuracyKind);
  const target = drillTargetFor(node, moduleId);
  const summary = drillTargetSummary(target);

  // The compare tint replaces the depth shade rather than layering, so
  // two backgrounds can never fight.
  const background = compareHighlight
    ? COMPARE_TINT[compareHighlight]
    : DEPTH_SHADE[Math.min(node.depth, DEPTH_SHADE.length - 1)];

  // A module header's wash and edge come from the accent as inline
  // style, because the colour is data rather than one of a fixed set of
  // classes. 1a is 10% - a wash in light mode and a lift in dark,
  // subtle enough in both that a red score still reads as the loudest
  // thing on the row.
  const headerStyle = isModuleRow && accentHex
    ? { backgroundColor: `${accentHex}1a`, borderLeftColor: accentHex }
    : undefined;

  return (
    <>
    <div
      data-testid="tree-row"
      data-depth={node.depth}
      data-node-id={node.id}
      data-compare={compareHighlight ?? undefined}
      data-module-row={isModuleRow ? 'true' : undefined}
      data-ends-group={node.endsGroup ? 'true' : undefined}
      style={headerStyle}
      className={[
        'flex items-center gap-2 border-b border-neutral-200/60 dark:border-neutral-800/60',
        isModuleRow
          // Taller, and a 3px accent edge so a block start is findable
          // by eye without reading a word.
          ? 'px-2 py-2 text-[12px] border-l-[3px] mt-2 first:mt-0'
          : 'px-2 py-1 text-[13px] border-l-[3px] border-l-transparent',
        // A group break: a heavier rule and a little air, so a pair
        // reads as a pair. Structure, not emphasis — it must not
        // compete with the module headers above it.
        node.endsGroup ? 'mb-1 border-b-neutral-300 dark:border-b-neutral-700' : '',
        headerStyle ? '' : background,
      ].join(' ')}
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
        <span
          className={`truncate ${
            isModuleRow ? 'uppercase tracking-wider font-semibold' : ''
          }`}
          title={node.label}
        >
          {node.label}
        </span>
        {onToggleInfo && (
          <RowInfoButton
            label={node.label}
            open={infoOpen ?? false}
            onToggle={onToggleInfo}
          />
        )}
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
        className={`${COLUMN_RULE} ${COLUMN_WIDTHS.score} shrink-0 text-right tabular-nums ${
          band ? BAND_TEXT_CLASS[band] : 'text-neutral-400'
        }`}
      >
        {formatScore(node.score)}
      </div>

      <div
        data-testid="cell-coverage"
        className={`${COLUMN_RULE} ${COLUMN_WIDTHS.coverage} shrink-0 text-right tabular-nums text-neutral-600 dark:text-neutral-400`}
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
        className={`${COLUMN_RULE} ${COLUMN_WIDTHS.recency} shrink-0 text-right tabular-nums text-neutral-600 dark:text-neutral-400`}
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
      <div className={`${COLUMN_WIDTHS.compare} shrink-0 text-center`}>
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
        aria-expanded={drillPrompt ? true : undefined}
        aria-label={`${drillLabel(summary, node.totalItems)} — ${node.label}`}
        className={`${DRILL_WIDTH} shrink-0 text-right text-[11px] text-neutral-400 hover:text-fluent`}
      >
        {drillLabel(summary, node.totalItems)}
      </button>
    </div>
    {/* Beneath the row, full width. The row itself is four fixed
        columns and an explanation does not fit in one of them. */}
    {infoOpen && (
      <RowAffordance
        node={node}
        moduleId={moduleId}
        {...(noteContext ? { noteContext } : {})}
      />
    )}
    {drillPrompt && (
      <SmallPoolPromptPanel
        prompt={drillPrompt}
        {...(onDrillOffer ? { onOffer: onDrillOffer } : {})}
        {...(onDrillAnyway ? { onAnyway: onDrillAnyway } : {})}
        {...(onDismissDrillPrompt ? { onDismiss: onDismissDrillPrompt } : {})}
      />
    )}
    </>
  );
}

/**
 * The under-4 prompt, beneath the row that raised it.
 *
 * BOTH WAYS OUT ARE OFFERED, and neither is styled as the mistake. A
 * one-item drill is a legitimate thing to want - it just will not move
 * the accuracy number, and that is all this says. Refusing it, or
 * hiding it behind the quieter of two buttons, would be the app
 * managing the practice rather than reporting on it.
 */
function SmallPoolPromptPanel({
  prompt, onOffer, onAnyway, onDismiss,
}: {
  prompt: SmallPoolPrompt;
  onOffer?: () => void;
  onAnyway?: () => void;
  onDismiss?: () => void;
}) {
  const text = smallPoolPromptText(prompt);
  return (
    <div
      data-testid="small-pool-prompt"
      role="group"
      aria-label="This drill would not count toward accuracy"
      className="px-3 py-2.5 text-xs bg-developing/5 border-l-2 border-developing/50 text-neutral-700 dark:text-neutral-200"
    >
      <p>
        <span className="font-medium">{text.size}</span>{' '}
        {FLUENCY_POOL_RULE}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {text.offer && (
          <button
            type="button"
            data-testid="small-pool-offer"
            onClick={onOffer}
            className="rounded border border-fluent/60 px-2 py-1 text-fluent hover:bg-fluent/10"
          >
            {text.offer}
          </button>
        )}
        <button
          type="button"
          data-testid="small-pool-anyway"
          onClick={onAnyway}
          className="rounded border border-neutral-300 dark:border-neutral-600 px-2 py-1 hover:border-neutral-500"
        >
          {text.proceed}
        </button>
        <button
          type="button"
          data-testid="small-pool-cancel"
          onClick={onDismiss}
          className="text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
        >
          cancel
        </button>
      </div>
    </div>
  );
}

/**
 * What pressing the row will actually do, and how much it covers.
 *
 * Both halves matter and they used to be uneven: a filterable row read
 * "drill 34 items", which doubled as a size, while an unfilterable one
 * read "open module" and said nothing about how big it was. Same
 * column, same word, same information — only the verb differs, because
 * only the verb is genuinely different.
 */
export function drillLabel(
  summary: ReturnType<typeof drillTargetSummary>,
  totalItems: number,
): string {
  const verb = summary.filtered
    ? `drill ${summary.itemCount}`
    : `open module · ${totalItems}`;
  const count = summary.filtered ? summary.itemCount : totalItems;
  return `${verb} item${count === 1 ? '' : 's'}`;
}

/**
 * Column widths, shared with the sticky header.
 *
 * Exported so the header and the rows cannot disagree: a header that
 * drifts by a few pixels is worse than no header, because it points at
 * the wrong column with total confidence.
 */
export const COLUMN_WIDTHS = {
  score: 'w-16',
  coverage: 'w-36',
  recency: 'w-24',
  compare: 'w-6',
  drill: 'w-32',
} as const;

const DRILL_WIDTH = COLUMN_WIDTHS.drill;

/** The classes a header cell needs to sit over its column. */
export const COLUMN_RULE_CLASS = COLUMN_RULE;

export { NO_VALUE };

/** Memoised: a few hundred rows re-render on every sort change, and
 *  nothing here depends on anything but its props. */
export default memo(TreeRowImpl);
