/**
 * The controls above the list: sort, grouping, five filters, the
 * all/any switch, and reset.
 *
 * Presentational and stateless. It takes the current view state and one
 * callback, and every change goes back through that callback into the
 * URL — so the controls have no opinion of their own that could drift
 * from what the list is actually showing.
 *
 * ─── Mobile ──────────────────────────────────────────────────────────
 *
 * Everything collapses behind one button with a count badge. Six
 * controls above the list does not fit a phone, and the gym case is the
 * one that matters most.
 *
 * The badge counts FILTERS, not the all/any switch: the switch narrows
 * nothing on its own, and badging it would overstate how filtered the
 * list is. Sort and grouping are not counted either — they reorder,
 * they do not hide.
 */
import { useId, useState } from 'react';
import {
  DEFAULT_VIEW_STATE,
  activeFilterCount,
  isDefaultViewState,
  type DashboardViewState,
} from './read/urlState';
import type { FilterSpec, SortField } from './read/query';
import { DASHBOARD_MODULE_ORDER, moduleLabelFor } from './read/catalogs';

export interface DashboardControlsProps {
  state: DashboardViewState;
  onChange: (next: DashboardViewState) => void;
}

const SORT_FIELDS: ReadonlyArray<{ id: SortField; label: string }> = [
  { id: 'accuracy', label: 'accuracy' },
  { id: 'coverage', label: 'coverage' },
  { id: 'recency', label: 'recency' },
];

/**
 * The direction control's words change with the field, because "worst"
 * means a different number in each column and the abstraction is not
 * worth the ambiguity. Recency in particular: "worst first" is stalest
 * first, which reads the RIGHT half of the two-number cell rather than
 * the left.
 */
const DIRECTION_WORDS: Readonly<Record<SortField, [string, string]>> = {
  accuracy: ['worst first', 'best first'],
  coverage: ['least covered', 'most covered'],
  recency: ['stalest first', 'most recent first'],
};

const CONTROL = 'text-[11px] rounded border px-2 py-1 transition';
const IDLE = 'border-neutral-300 text-neutral-600 hover:border-neutral-400 '
  + 'dark:border-neutral-700 dark:text-neutral-300 dark:hover:border-neutral-500';
const ACTIVE = 'border-fluent bg-fluent/10 text-fluent';

function Pill({
  active, onClick, children, testId, label,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  testId: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      data-active={active ? 'true' : 'false'}
      aria-pressed={active}
      {...(label ? { 'aria-label': label } : {})}
      onClick={onClick}
      className={`${CONTROL} ${active ? ACTIVE : IDLE}`}
    >
      {children}
    </button>
  );
}

/**
 * A threshold filter.
 *
 * Empty CLEARS the filter rather than setting it to zero. `accuracy
 * below 0` matches nothing, which is a real thing to ask for and a
 * terrible thing to arrive at by deleting a digit — the list would
 * empty and look broken.
 */
function ThresholdFilter({
  testId, label, suffix, value, onChange,
}: {
  testId: string;
  label: string;
  suffix: string;
  value: number | undefined;
  onChange: (next: number | undefined) => void;
}) {
  const id = useId();
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-neutral-600 dark:text-neutral-300">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        data-testid={testId}
        type="number"
        min={0}
        inputMode="numeric"
        value={value ?? ''}
        onChange={e => {
          const raw = e.target.value.trim();
          if (raw === '') { onChange(undefined); return; }
          const n = Number(raw);
          onChange(Number.isFinite(n) && n >= 0 ? n : undefined);
        }}
        className="w-14 rounded border border-neutral-300 bg-transparent px-1 py-0.5
          dark:border-neutral-700"
      />
      <span>{suffix}</span>
    </span>
  );
}

export default function DashboardControls({ state, onChange }: DashboardControlsProps) {
  const [open, setOpen] = useState(false);
  const filterCount = activeFilterCount(state.filter);
  const atDefault = isDefaultViewState(state);

  const setFilter = (patch: Partial<FilterSpec>) =>
    onChange({ ...state, filter: { ...state.filter, ...patch } });

  const [worstWord, bestWord] = DIRECTION_WORDS[state.sort.field];

  const body = (
    <div
      data-testid="controls-body"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2"
    >
      {/* Sort field */}
      <span className="inline-flex items-center gap-1">
        <span className="text-[10px] uppercase tracking-wide text-neutral-400">sort</span>
        {SORT_FIELDS.map(field => (
          <Pill
            key={field.id}
            testId={`sort-${field.id}`}
            active={state.sort.field === field.id}
            onClick={() => onChange({
              ...state, sort: { ...state.sort, field: field.id },
            })}
          >
            {field.label}
          </Pill>
        ))}
      </span>

      {/* Direction, worded for the field it applies to. */}
      <Pill
        testId="sort-direction"
        active={state.sort.direction === 'worst-first'}
        label={`Sort direction: ${
          state.sort.direction === 'worst-first' ? worstWord : bestWord
        }`}
        onClick={() => onChange({
          ...state,
          sort: {
            ...state.sort,
            direction: state.sort.direction === 'worst-first'
              ? 'best-first'
              : 'worst-first',
          },
        })}
      >
        {state.sort.direction === 'worst-first' ? worstWord : bestWord}
      </Pill>

      <Pill
        testId="grouping-toggle"
        active={state.grouping}
        label={state.grouping ? 'Grouped by module' : 'One flat list'}
        onClick={() => onChange({ ...state, grouping: !state.grouping })}
      >
        {state.grouping ? 'grouped' : 'flat'}
      </Pill>

      <span className="h-4 w-px bg-neutral-200 dark:bg-neutral-800" aria-hidden="true" />

      <ThresholdFilter
        testId="filter-accuracy"
        label="accuracy below"
        suffix="%"
        value={state.filter.accuracyBelow}
        onChange={v => setFilter({ accuracyBelow: v })}
      />
      <ThresholdFilter
        testId="filter-coverage"
        label="coverage below"
        suffix="%"
        value={state.filter.coverageBelow}
        onChange={v => setFilter({ coverageBelow: v })}
      />
      <ThresholdFilter
        testId="filter-stale"
        label="not practised in"
        suffix="days"
        value={state.filter.notPractisedInDays}
        onChange={v => setFilter({ notPractisedInDays: v })}
      />

      <Pill
        testId="filter-due"
        active={state.filter.hasDueItems === true}
        onClick={() => setFilter({
          hasDueItems: state.filter.hasDueItems ? undefined : true,
        })}
      >
        has due items
      </Pill>

      {/* Module filter. Modules are named, not numbered, so this is a
          set of toggles rather than a select — tapping two is one
          gesture each rather than a modifier key. */}
      <span className="inline-flex flex-wrap items-center gap-1">
        <span className="text-[10px] uppercase tracking-wide text-neutral-400">module</span>
        {DASHBOARD_MODULE_ORDER.map(moduleId => {
          const on = state.filter.modules?.includes(moduleId) ?? false;
          return (
            <Pill
              key={moduleId}
              testId={`filter-module-${moduleId}`}
              active={on}
              onClick={() => {
                const current = state.filter.modules ?? [];
                const next = on
                  ? current.filter(m => m !== moduleId)
                  : [...current, moduleId];
                setFilter({ modules: next.length > 0 ? next : undefined });
              }}
            >
              {moduleLabelFor(moduleId)}
            </Pill>
          );
        })}
      </span>

      {/* The switch. Its words say what it DOES rather than naming a
          boolean operator: "match all" and "match any" are the query,
          not the mechanism. */}
      <Pill
        testId="match-switch"
        active={state.filter.match === 'any'}
        label={state.filter.match === 'any'
          ? 'Rows matching any filter'
          : 'Rows matching every filter'}
        onClick={() => setFilter({
          match: state.filter.match === 'any' ? 'all' : 'any',
        })}
      >
        {state.filter.match === 'any' ? 'match any' : 'match all'}
      </Pill>

      <button
        type="button"
        data-testid="reset"
        disabled={atDefault}
        onClick={() => onChange(DEFAULT_VIEW_STATE)}
        className={`${CONTROL} ${IDLE} disabled:opacity-40 disabled:cursor-default`}
      >
        reset
      </button>
    </div>
  );

  return (
    <div data-testid="dashboard-controls">
      {/* Phone: one button, everything behind it. */}
      <button
        type="button"
        data-testid="controls-toggle"
        aria-expanded={open}
        aria-controls="dashboard-controls-body"
        onClick={() => setOpen(v => !v)}
        className={`${CONTROL} ${IDLE} sm:hidden my-2`}
      >
        controls
        {filterCount > 0 && (
          <span
            data-testid="filter-count-badge"
            className="ml-1 rounded-full bg-fluent px-1.5 text-white"
          >
            {filterCount}
          </span>
        )}
      </button>

      <div
        id="dashboard-controls-body"
        className={open ? 'block' : 'hidden sm:block'}
      >
        {body}
      </div>
    </div>
  );
}
