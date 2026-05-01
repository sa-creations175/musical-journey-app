import { useEffect, useState } from 'react';
import Field from './Field';
import { inputClass } from './formStyles';
import { CategoryPillButton } from './GoalCreationFlow';

/**
 * Phase 2 step 5c — shared dimension primitives for YearlyAnchorFlow.
 *
 * These are the building blocks used by per-module dimension
 * components (5c.1 Ear Training, 5c.2 Harmonic Fluency, 5c.3 Shapes
 * & Patterns, 5c.4 Songs, 5c.5 Production, 5c.6 Practice
 * consistency). The contract is intentionally minimal — primitives
 * own their own visual treatment and accept structured state via
 * `value` / `onChange` props; per-module components compose them.
 *
 * Components shipped here:
 *
 *   DimensionSection      — wrapper with title + question copy
 *   BreadthYesNoPicker    — Yes / No toggle with inline-revealed
 *                           multi-pick group selector
 *   AccuracySlider        — 50–95 % range slider with displayed
 *                           current value
 *   ConsistencyControl    — count input + per-week / per-month
 *                           toggle
 *   CountInput            — labelled positive-integer input with
 *                           optional suffix
 *
 * Plus the shared `BreadthState` discriminated union used by
 * Breadth / Mastery state coupling per the locked design — see
 * `pruneMasteryToBreadth` for the coordinated update rule.
 */

// =====================================================================
// Shared types
// =====================================================================

/**
 * Breadth dimension state, shared across modules with multi-group
 * breadth (Ear Training, Harmonic Fluency, Shapes & Patterns,
 * Production). `'all'` = work through every item in the module;
 * `'subset'` = only the listed groupIds. `groupIds` are
 * module-defined strings (e.g. 'intervals' for ET, 'foundational'
 * for HF) — typed loosely here because the shared widget doesn't
 * own the per-module identifiers.
 */
export type BreadthState =
  | { kind: 'all' }
  | { kind: 'subset'; groupIds: string[] };

export interface BreadthGroupOption {
  id: string;
  label: string;
  /** Accent hex used by `CategoryPillButton` in `'accent'` selected
   *  style. Per-group accents (e.g. HF's slate-blue / deep-rose /
   *  teal / forest-green) flow through here so the picker reads the
   *  same as the existing accuracy-specific picker. ET / S&P /
   *  Production typically pass the single module accent for all
   *  groups. */
  accentHex: string;
}

/**
 * Coordinated update rule — when Breadth changes, Mastery's group
 * selection is filtered to the new Breadth scope in the same call
 * site. Pure function so the rule is unit-testable without React
 * state. Per the design call: pruning is destructive — selections
 * dropped on a Breadth narrowing do not return when Breadth widens.
 *
 * Returns the input array reference unchanged when no pruning is
 * needed (Breadth is `'all'`) so `===` checks short-circuit.
 */
export function pruneMasteryToBreadth(
  breadth: BreadthState,
  masteryGroupIds: ReadonlyArray<string>,
): string[] {
  if (breadth.kind === 'all') return [...masteryGroupIds];
  const allowed = new Set(breadth.groupIds);
  return masteryGroupIds.filter(id => allowed.has(id));
}

// =====================================================================
// DimensionSection — title + question wrapper
// =====================================================================

/**
 * Section container used for each dimension on Screen 1. Title +
 * optional question copy + content slot. First-of-type drops the
 * top border + padding so the section sits flush under the screen
 * header.
 *
 * Accepts an optional `id` ("breadth" / "mastery" / "depth" /
 * "consistency" / "weeklyFloor" / "monthlyFloor" / "aspiration")
 * which is mounted as `id="anchor-dim-${id}"` on the section
 * element. `useFocusDimension` reads this attribute via
 * getElementById to scroll the matching section into view when
 * Screen 2's per-dimension Edit link routes back to Screen 1.
 */
export function DimensionSection({
  title,
  question,
  id,
  children,
}: {
  title: string;
  question?: string;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id ? `anchor-dim-${id}` : undefined}
      className="border-t border-neutral-200 dark:border-neutral-800 pt-5 first:border-t-0 first:pt-0 scroll-mt-20"
    >
      <h3 className="text-base font-medium text-neutral-800 dark:text-neutral-100 mb-1">
        {title}
      </h3>
      {question && (
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-3">
          {question}
        </p>
      )}
      {children}
    </section>
  );
}

/**
 * Scrolls the dimension section matching `focusDimension` into view
 * on mount and whenever `focusDimension` changes. Resolution is by
 * DOM id (`anchor-dim-${focusDimension}`) — DimensionSection mounts
 * the matching id attribute. `scroll-mt-20` on the section accounts
 * for the modal header.
 *
 * No-op when focusDimension is null/undefined or no matching element
 * exists. Behavior is `smooth` so the navigation reads as
 * intentional, not jarring.
 */
export function useFocusDimension(focusDimension: string | null | undefined): void {
  useEffect(() => {
    if (!focusDimension) return;
    const el = document.getElementById(`anchor-dim-${focusDimension}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [focusDimension]);
}

// =====================================================================
// BreadthYesNoPicker
// =====================================================================

/**
 * Yes / No toggle with inline-revealed multi-pick group selector.
 * "Yes" sets state to `{ kind: 'all' }`; "No" sets state to
 * `{ kind: 'subset', groupIds: [] }` and reveals the picker. The
 * selector uses `CategoryPillButton` in `'accent'` selected style
 * so per-group accents persist visibly in both selected and
 * unselected states.
 *
 * The "No → empty groupIds" intermediate state is intentional —
 * the user has declared they want a subset but hasn't yet picked
 * which. Validation gates upstream block advance until at least one
 * group is picked.
 */
export function BreadthYesNoPicker({
  yesLabel,
  noLabel,
  groups,
  value,
  onChange,
}: {
  yesLabel: string;
  noLabel: string;
  groups: ReadonlyArray<BreadthGroupOption>;
  value: BreadthState;
  onChange: (next: BreadthState) => void;
}) {
  const isAll = value.kind === 'all';
  const subsetIds: ReadonlyArray<string> = value.kind === 'subset' ? value.groupIds : [];

  const setAll = () => onChange({ kind: 'all' });
  const setSubset = () => onChange({ kind: 'subset', groupIds: [] });

  const toggleGroup = (id: string) => {
    if (value.kind !== 'subset') return;
    const next = subsetIds.includes(id)
      ? subsetIds.filter(g => g !== id)
      : [...subsetIds, id];
    onChange({ kind: 'subset', groupIds: next });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-200 cursor-pointer">
          <input
            type="radio"
            checked={isAll}
            onChange={setAll}
            className="accent-teal-600"
          />
          {yesLabel}
        </label>
        <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-200 cursor-pointer">
          <input
            type="radio"
            checked={!isAll}
            onChange={setSubset}
            className="accent-teal-600"
          />
          {noLabel}
        </label>
      </div>
      {!isAll && (
        <div className="flex flex-wrap gap-2 pt-1">
          {groups.map(g => (
            <CategoryPillButton
              key={g.id}
              label={g.label}
              accentHex={g.accentHex}
              active={subsetIds.includes(g.id)}
              onClick={() => toggleGroup(g.id)}
              selectedStyle="accent"
            />
          ))}
        </div>
      )}
    </div>
  );
}

// =====================================================================
// AccuracySlider
// =====================================================================

/**
 * Slider + paired numeric text input for an accuracy percentage.
 * The slider gives quick rough adjustment in 5% steps; the text
 * input lets users type an exact integer.
 *
 * Sync rules:
 *   - moving the slider updates the text immediately
 *   - typing a fully-formed in-range integer commits eagerly
 *     (slider follows)
 *   - intermediate typing (e.g., "3" on the way to "30", or
 *     out-of-range values) shows in the text without
 *     committing; on blur we clamp to [min, max] and snap
 *   - blur with empty / non-numeric input snaps back to the
 *     last committed value
 *
 * Defaults: 50–100 in 5% slider steps; integer text input. Apply
 * to both YearlyAnchorFlow's Depth dimension and GoalCreationFlow's
 * accuracy step — same component, same behavior.
 */
export function AccuracySlider({
  value,
  onChange,
  min = 50,
  max = 100,
  step = 5,
  label = 'Target accuracy',
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
}) {
  const [draft, setDraft] = useState(String(value));

  // Keep the text in sync when the slider (or any external
  // caller) changes the committed value.
  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const clamp = (n: number) => Math.max(min, Math.min(max, n));

  const commitOnBlur = (raw: string) => {
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) {
      // Empty / junk → snap back to the last committed value.
      setDraft(String(value));
      return;
    }
    const clamped = clamp(n);
    if (clamped !== value) onChange(clamped);
    setDraft(String(clamped));
  };

  const tryEagerCommit = (raw: string) => {
    // Commit only when the input is a fully-formed integer in
    // range. Intermediate keystrokes ("3" before "30",
    // out-of-range "150") show in the text but don't move the
    // slider until valid.
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) return;
    if (String(n) !== raw.trim()) return;
    if (n < min || n > max) return;
    if (n !== value) onChange(n);
  };

  return (
    <Field label={label}>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="flex-1"
          aria-label={label}
        />
        <div className="flex items-center gap-1 shrink-0">
          <input
            type="number"
            min={min}
            max={max}
            step={1}
            value={draft}
            onChange={e => {
              setDraft(e.target.value);
              tryEagerCommit(e.target.value);
            }}
            onBlur={e => commitOnBlur(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                (e.currentTarget as HTMLInputElement).blur();
              }
            }}
            className="w-14 px-2 py-1 text-sm rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-200 tabular-nums text-right"
            aria-label={`${label} numeric input`}
          />
          <span className="text-sm text-neutral-500" aria-hidden>
            %
          </span>
        </div>
      </div>
    </Field>
  );
}

// =====================================================================
// ConsistencyControl
// =====================================================================

export type ConsistencyCadence = 'week' | 'month';

/**
 * Count input + per-week / per-month toggle. The unit label
 * ('sessions' / 'minutes' / 'hours' / 'days') varies per module
 * and is passed in as the `unit` prop.
 *
 * Cadence default per the design: per-week. Per-month is one click
 * away on every module per the cross-app consistency principle.
 */
export function ConsistencyControl({
  count,
  cadence,
  unit,
  onChange,
  min = 1,
  max = 999,
}: {
  count: number;
  cadence: ConsistencyCadence;
  unit: string;
  onChange: (next: { count: number; cadence: ConsistencyCadence }) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={min}
          max={max}
          value={count}
          onChange={e => onChange({
            count: clampInt(Number(e.target.value), min, max),
            cadence,
          })}
          className={`${inputClass} w-20`}
          aria-label={`${unit} per ${cadence}`}
        />
        <span className="text-sm text-neutral-700 dark:text-neutral-200">{unit}</span>
        <span className="text-sm text-neutral-500 dark:text-neutral-400">per</span>
      </div>
      <div className="flex rounded-md border border-neutral-300 dark:border-neutral-700 overflow-hidden">
        {(['week', 'month'] as ConsistencyCadence[]).map(c => {
          const active = c === cadence;
          return (
            <button
              key={c}
              type="button"
              onClick={() => onChange({ count, cadence: c })}
              aria-pressed={active}
              className={[
                'px-3 py-1.5 text-sm transition',
                active
                  ? 'bg-teal-600 text-white'
                  : 'bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800',
              ].join(' ')}
            >
              {c}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// =====================================================================
// CountInput
// =====================================================================

/**
 * Labelled positive-integer input with optional trailing suffix
 * (e.g. "songs", "lessons"). Used by Songs (Comfortable / Solid /
 * Internalized counts), Practice consistency (weekly / monthly /
 * aspiration), and any module's Consistency count when paired with
 * `ConsistencyControl`'s cadence toggle separately.
 *
 * Stays uncontrolled-ish for the duration of a typing burst — the
 * parent passes `value` and the input renders that, but bad inputs
 * (negative, NaN, beyond max) clamp on commit only via the Number()
 * + clamp in onChange.
 */
export function CountInput({
  label,
  value,
  onChange,
  min = 0,
  max = 999,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  suffix?: string;
}) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={e => onChange(clampInt(Number(e.target.value), min, max))}
          className={`${inputClass} w-24`}
        />
        {suffix && (
          <span className="text-sm text-neutral-700 dark:text-neutral-200">{suffix}</span>
        )}
      </div>
    </Field>
  );
}

// =====================================================================
// Internals
// =====================================================================

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  const i = Math.round(n);
  if (i < min) return min;
  if (i > max) return max;
  return i;
}

