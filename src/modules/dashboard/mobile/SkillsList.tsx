/**
 * One row per category, sorted by whatever the bar is showing.
 *
 * =====================================================================
 * THE BAR SHOWS WHAT IS SELECTED, AND THE LIST SORTS BY THE SAME
 * NUMBER.
 *
 * One control, two consequences, read from one function — see
 * `measureFraction`. A list ordered by one measure and drawn by another
 * is the specific failure that makes a sorted list look broken: the
 * bars come out jumbled and the reader concludes the sort is not
 * working, when what is not working is that there are two answers.
 *
 * LONGER IS ALWAYS BETTER, on all three. So the top of the list is
 * always the thing to look at, whichever measure is selected, and
 * "short bar" never has to be re-learned per tab.
 * =====================================================================
 *
 * THE COLOUR IS ALWAYS ACCURACY. On every tab, and on the Modules
 * strip. Length is the selected measure; colour is the tier. They are
 * two readings of two different things on purpose — a bar whose colour
 * changed with the tab would make green mean three things depending on
 * a control the reader may not have noticed, and a long red bar
 * ("covered everywhere, right nowhere") is a real and useful state that
 * only survives if the two axes stay independent.
 *
 * EVERY ROW CARRIES ITS NUMBERS AS TEXT. The bar is a shape and cannot
 * be read precisely; the text is the number it is a picture of.
 */
import { TIER_BAR_CLASS } from '../../../lib/tier';
import type { TreeNode } from '../read/tree';
import { tierForNode } from '../read/tierAdapter';
import { tierWord } from './tierLegend';
import {
  MEASURES,
  measureFraction,
  measureText,
  sortByMeasure,
  type Measure,
} from './measures';

/** One category, with the module it belongs to. */
export interface SkillRow {
  moduleId: string;
  /** The module's own name, shown when the list is not grouped. */
  moduleLabel: string;
  label: string;
  node: TreeNode;
}

export function MeasureSwitch({
  measure, onChange,
}: {
  measure: Measure;
  onChange: (m: Measure) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Sort by"
      data-testid="mobile-measure-switch"
      className="flex gap-1 p-0.5 rounded-lg bg-neutral-100 dark:bg-neutral-800"
    >
      {MEASURES.map(m => {
        const on = m.id === measure;
        return (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={on}
            data-testid={`mobile-measure-${m.id}`}
            onClick={() => onChange(m.id)}
            className={`flex-1 px-2 py-1 rounded-md text-xs font-medium transition ${
              on
                ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 shadow-sm'
                : 'text-neutral-500'
            }`}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Grouped by module, or one list mixed across all of them.
 *
 * =====================================================================
 * TWO QUESTIONS, AND THE GROUPING IS WHICH ONE IS BEING ASKED.
 *
 * GROUPED answers "how is each module doing" — the rows sit under their
 * module and the comparison is within it, so a weak row reads as weak
 * FOR THAT MODULE.
 *
 * FLAT answers "what is weakest anywhere" — every category in the app in
 * one order, so the worst thing is at the top regardless of which
 * module it belongs to. That question cannot be asked of a grouped
 * list at all: six separate orderings have no single worst row.
 *
 * GROUPED IS THE DEFAULT because it is the safer thing to land on. A
 * flat list opens on whichever category happens to be worst, which on a
 * new install is an arbitrary untouched one — true, and no use. Grouped
 * opens on structure.
 * =====================================================================
 */
export function GroupToggle({
  grouped, onChange,
}: {
  grouped: boolean;
  onChange: (grouped: boolean) => void;
}) {
  return (
    <button
      type="button"
      data-testid="mobile-group-toggle"
      data-grouped={grouped ? 'true' : 'false'}
      aria-pressed={grouped}
      onClick={() => onChange(!grouped)}
      className="text-[11px] text-neutral-500 hover:text-fluent underline"
    >
      {grouped ? 'Mixed' : 'By module'}
    </button>
  );
}

/**
 * The rows under their module headings.
 *
 * MODULE ORDER IS THE ORDER THEY ARRIVED IN, never the measure. Sorting
 * the groups as well as the rows would make the whole page rearrange on
 * every tab change, and the point of grouping is that the structure
 * holds still while the rows inside it move.
 */
export function GroupedSkills({
  rows, measure, now, stepDays, onOpen,
}: {
  rows: readonly SkillRow[];
  measure: Measure;
  now: number;
  stepDays: number;
  onOpen: (row: SkillRow) => void;
}) {
  const byModule = new Map<string, SkillRow[]>();
  for (const row of rows) {
    const list = byModule.get(row.moduleId) ?? [];
    list.push(row);
    byModule.set(row.moduleId, list);
  }
  return (
    <div className="space-y-3" data-testid="mobile-skills-grouped">
      {[...byModule.entries()].map(([moduleId, group]) => (
        <section key={moduleId} data-testid="mobile-skill-group" data-module={moduleId}>
          <h3 className="text-[11px] uppercase tracking-wide text-neutral-500 mb-1">
            {group[0].moduleLabel}
          </h3>
          <SkillsList
            rows={group}
            measure={measure}
            now={now}
            stepDays={stepDays}
            // The heading above already says which module this is.
            showModule={false}
            onOpen={onOpen}
          />
        </section>
      ))}
    </div>
  );
}

export default function SkillsList({
  rows, measure, now, stepDays, showModule, onOpen,
}: {
  rows: readonly SkillRow[];
  measure: Measure;
  now: number;
  stepDays: number;
  /** Trail the module's name on each row. False inside a group, where
   *  the heading above already says it. */
  showModule: boolean;
  onOpen: (row: SkillRow) => void;
}) {
  const sorted = sortByMeasure(rows, measure, now, stepDays);
  return (
    <div className="space-y-1" data-testid="mobile-skills">
      {sorted.map(row => (
        <SkillRowView
          key={`${row.moduleId}:${row.node.id}`}
          row={row}
          measure={measure}
          now={now}
          stepDays={stepDays}
          showModule={showModule}
          onOpen={() => onOpen(row)}
        />
      ))}
    </div>
  );
}

function SkillRowView({
  row, measure, now, stepDays, showModule, onOpen,
}: {
  row: SkillRow;
  measure: Measure;
  now: number;
  stepDays: number;
  showModule: boolean;
  onOpen: () => void;
}) {
  const tier = tierForNode(row.node, now);
  const fraction = measureFraction(row.node, measure, now, stepDays);
  const text = measureText(row.node, measure, now, stepDays);

  return (
    <button
      type="button"
      data-testid="mobile-skill-row"
      data-node={row.node.id}
      data-module={row.moduleId}
      data-tier={tier}
      data-measure={measure}
      onClick={onOpen}
      className="w-full text-left rounded-lg border border-black/[0.07] bg-white dark:bg-neutral-900 px-3 py-2 hover:border-fluent/40 transition"
    >
      <div className="flex items-baseline gap-2">
        <span className="text-sm min-w-0 truncate">{row.label}</span>
        <span
          data-testid="mobile-skill-value"
          className="ml-auto shrink-0 text-[11px] font-mono tabular-nums text-neutral-600 dark:text-neutral-300"
        >
          {text}
        </span>
      </div>

      {/* LENGTH IS THE MEASURE, COLOUR IS THE TIER. Over a neutral
          track, so an empty bar is visibly an empty bar rather than an
          absent one. */}
      <div className="mt-1.5 h-1.5 rounded-full overflow-hidden bg-neutral-200 dark:bg-neutral-800">
        <span
          aria-hidden
          data-testid="mobile-skill-bar"
          className={`block h-full ${TIER_BAR_CLASS[tier]}`}
          style={{ width: `${Math.round(fraction * 100)}%` }}
        />
      </div>

      <div className="mt-1 text-[10px] text-neutral-500">
        {/* The tier in words, because the colour alone is not a signal
            a reader should have to decode. */}
        {tierWord(tier)}
        {showModule && (
          <>
            <span className="text-neutral-400 mx-1">·</span>
            {row.moduleLabel}
          </>
        )}
      </div>
    </button>
  );
}
