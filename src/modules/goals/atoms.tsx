import type { ReactNode } from 'react';
import Field from './Field';
import { inputClass } from './formStyles';

/**
 * Shared form atoms across the goal-creation surfaces — pulled out
 * of GoalCreationFlow so the upcoming GoalSuggestionFlow (weekly /
 * monthly / quarterly) can reuse them without duplicating, and so
 * the long wizard file stops growing.
 *
 * Behavior is identical to the inline definitions that previously
 * lived in GoalCreationFlow.tsx — this is a no-output-change
 * extraction. Tests / visual checks should yield byte-identical
 * rendered markup.
 */

// ---------------------------------------------------------------------
// ToggleCard + CheckboxIndicator
// ---------------------------------------------------------------------

export function ToggleCard({
  title,
  hint,
  enabled,
  onToggle,
  children,
}: {
  title: string;
  hint: string;
  enabled: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className={`rounded-md border transition ${
        enabled
          ? 'border-fluent/40 bg-fluent/5'
          : 'border-neutral-200 dark:border-neutral-800'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={enabled}
        aria-expanded={enabled}
        className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800/40 rounded-t-md"
      >
        <CheckboxIndicator checked={enabled} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
            {title}
          </div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            {hint}
          </div>
        </div>
      </button>
      {enabled && (
        <div className="px-3 pb-3 pt-2 border-t border-fluent/30 flex flex-col gap-3">
          {children}
        </div>
      )}
    </div>
  );
}

export function CheckboxIndicator({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`h-4 w-4 shrink-0 rounded border flex items-center justify-center transition ${
        checked
          ? 'bg-fluent border-fluent text-white'
          : 'border-neutral-400 dark:border-neutral-600 bg-white dark:bg-neutral-900'
      }`}
    >
      {checked && (
        <svg viewBox="0 0 10 10" className="w-2.5 h-2.5 fill-current">
          <path d="M3.7 7.5 L1 4.8 L1.9 3.9 L3.7 5.7 L8.1 1.3 L9 2.2 Z" />
        </svg>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------
// PillButton — basic neutral pill
// ---------------------------------------------------------------------

export function PillButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        'px-3 py-1.5 text-sm rounded-md border transition',
        active
          ? 'border-fluent bg-fluent/10 text-fluent'
          : 'border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 hover:border-fluent/60',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------
// CategoryPillButton — accent-aware variant
// ---------------------------------------------------------------------

/**
 * Accent-aware variant of PillButton for the Harmonic Fluency group
 * grid. At rest: 33-alpha border in the group's accent hex (subtle
 * differentiation between the four sections). Hover: full accent.
 * Selected: full fluent (parent module accent) — the chosen category
 * reads as "selected for this HF goal" rather than "selected within
 * its group", and gives all 12 buttons a single shared selected
 * treatment regardless of which group they belong to.
 */
export function CategoryPillButton({
  label,
  accentHex,
  active,
  onClick,
  selectedStyle = 'fluent',
}: {
  label: string;
  accentHex: string;
  active: boolean;
  onClick: () => void;
  /** 'fluent' (default): selected pills use the global fluent accent
   *  regardless of `accentHex`. Used by the HF accuracy-specific
   *  picker — the chosen category reads as "selected for this goal",
   *  not "selected within its group", giving all 12 buttons a single
   *  shared selected treatment.
   *
   *  'accent': selected pills use `accentHex` directly (border, tint,
   *  text). Used by the coverage pickers where the GROUP IS the
   *  entity being selected, so the group's identity should persist
   *  visibly in both selected and unselected states. Unselected
   *  pills also use `accentHex` at full opacity (vs. the 33-alpha
   *  rest border in 'fluent' mode) so per-group color is clear at
   *  4-pill scale rather than washed out. */
  selectedStyle?: 'fluent' | 'accent';
}) {
  if (selectedStyle === 'accent') {
    // Selected gets THREE concurrent contrast bumps over unselected so
    // the difference reads at a glance:
    //   1. Stronger background tint (~33% alpha vs no fill).
    //   2. Bolder text weight (semibold vs normal).
    //   3. Thicker border (2px vs 1px) — compensated by negative
    //      margin so layout doesn't shift between states.
    // Unselected stays accent-colored (border + text) to preserve the
    // group's identity at rest, per the design's "GROUP IS the entity
    // being selected" framing.
    const activeBg = `${accentHex}33`;
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        style={active
          ? {
              borderColor: accentHex,
              borderWidth: '2px',
              backgroundColor: activeBg,
              color: accentHex,
              margin: '-1px', // offset thicker border so layout doesn't reflow
            }
          : { borderColor: accentHex, color: accentHex }
        }
        className={`px-3 py-1.5 text-sm rounded-md border transition text-left ${
          active ? 'font-semibold' : ''
        }`}
      >
        {label}
      </button>
    );
  }

  // 'fluent' branch — original behavior, unchanged.
  const restBorder = `${accentHex}33`;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      onMouseEnter={active ? undefined : (e) => {
        e.currentTarget.style.borderColor = accentHex;
      }}
      onMouseLeave={active ? undefined : (e) => {
        e.currentTarget.style.borderColor = restBorder;
      }}
      style={active ? undefined : { borderColor: restBorder }}
      className={[
        'px-3 py-1.5 text-sm rounded-md border transition text-left',
        active
          ? 'border-fluent bg-fluent/10 text-fluent'
          : 'text-neutral-700 dark:text-neutral-200',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------
// TargetPreview — fluent-tinted preview line
// ---------------------------------------------------------------------

/**
 * Shared preview block — fluent-tinted card with the natural-language
 * goal text, or an empty-state hint. Used by the per-module previews
 * (ear training, harmonic fluency, and future modules) so the
 * presentation stays identical across surfaces while each owns its
 * own text-rendering helper.
 */
export function TargetPreview({ text }: { text: string | null }) {
  return (
    <div className="rounded-md border border-fluent/30 bg-fluent/5 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-fluent mb-0.5">Preview</div>
      <div className="text-sm text-neutral-800 dark:text-neutral-100">
        {text ?? <span className="text-neutral-500 italic">Pick a target above to preview your goal.</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// ConsistencyTargetCard — generic across modules
// ---------------------------------------------------------------------

/**
 * Generic over any target shape that carries the standard consistency
 * triple. Both EarTrainingTarget and HarmonicFluencyTarget satisfy
 * this — and any future module's accuracy+consistency target can
 * reuse the card by adopting the same field names.
 */
export interface ConsistencyFields {
  consistencyEnabled: boolean;
  consistencyCount: number;
  consistencyCadence: 'week' | 'month';
}

export function ConsistencyTargetCard<T extends ConsistencyFields>({
  target,
  onChange,
  unitMode = 'days',
  cardTitle,
  hint,
  coverageWeeklyMinutes = null,
  perDayMinutesOverride = null,
}: {
  target: T;
  onChange: (next: T) => void;
  /** Days mode (HF / ET / Shapes / Repertoire): clamps the count to
   *  1–7 and frames the input as "days per week". When
   *  `coverageWeeklyMinutes` is provided the card renders an inline
   *  per-day time estimate (= weekly minutes ÷ days). When neither
   *  coverage minutes nor a per-day override are supplied, the card
   *  shows a hint pointing the user back to the coverage card.
   *
   *  Lessons mode (Production only): the count means lessons per
   *  week. No per-day estimate, no empty-coverage hint — lesson
   *  depth is highly variable. */
  unitMode?: 'days' | 'lessons';
  /** Card-header title. Sensible per-mode defaults: 'Practice days'
   *  for days mode, 'Lesson target' for lessons mode. */
  cardTitle?: string;
  /** Card-header hint text. Defaults to mode-appropriate copy. */
  hint?: string;
  /** Coverage-derived weekly time commitment in minutes. When
   *  provided in days mode, the card divides by the days count to
   *  render an inline per-day estimate. Null means "no coverage set
   *  yet" — the card shows the empty-coverage hint. */
  coverageWeeklyMinutes?: number | null;
  /** Override the per-day minutes calculation entirely. Used by
   *  Repertoire, which has no coverage-derived time to divide from
   *  but does have a known per-session default. */
  perDayMinutesOverride?: number | null;
}) {
  const isDays = unitMode === 'days';
  const resolvedTitle = cardTitle ?? (isDays ? 'Practice days' : 'Lesson target');
  const resolvedHint =
    hint
    ?? (isDays
      ? 'Spread practice across the week — days matter more than total time.'
      : 'Lessons completed per week. Depth varies; no per-lesson time estimate.');

  const toggle = () => onChange({ ...target, consistencyEnabled: !target.consistencyEnabled });
  const setCount = (raw: number) => {
    const n = Number.isFinite(raw) ? raw : 0;
    // Days mode clamps at 7. Lessons mode is open-ended but we keep
    // 0 → "" editing fluency in both.
    const clamped = isDays ? Math.min(n, 7) : n;
    // Force cadence to 'week' on every onChange so the field stays
    // consistent even though we no longer render a picker.
    onChange({ ...target, consistencyCount: clamped, consistencyCadence: 'week' });
  };

  // Per-day estimate: only meaningful in days mode with a positive
  // day count and a non-null source of minutes. Override wins when
  // both are set (Repertoire uses the override; HF/ET/Shapes
  // typically use coverageWeeklyMinutes).
  const days = target.consistencyCount;
  const perDayMinutes =
    !isDays || days <= 0
      ? null
      : perDayMinutesOverride != null
        ? perDayMinutesOverride
        : coverageWeeklyMinutes != null && coverageWeeklyMinutes > 0
          ? coverageWeeklyMinutes / days
          : null;

  // Empty-coverage hint: shown only in days mode when nothing
  // upstream can feed the per-day estimate.
  const showEmptyCoverageHint =
    isDays
    && days > 0
    && perDayMinutesOverride == null
    && (coverageWeeklyMinutes == null || coverageWeeklyMinutes <= 0);

  const fieldLabel = isDays ? 'Days' : 'Lessons';
  const cadenceWord = isDays ? 'per week' : 'per week';

  return (
    <ToggleCard
      title={resolvedTitle}
      hint={resolvedHint}
      enabled={target.consistencyEnabled}
      onToggle={toggle}
    >
      <div className="flex items-end gap-2 flex-wrap">
        <Field label={fieldLabel}>
          <input
            type="number"
            min={1}
            max={isDays ? 7 : undefined}
            value={target.consistencyCount === 0 ? '' : target.consistencyCount}
            onChange={e => setCount(Number(e.target.value))}
            className={`${inputClass()} w-20`}
            aria-label={`${fieldLabel} per week`}
          />
        </Field>
        <span className="text-sm text-neutral-700 dark:text-neutral-200 pb-2">
          {cadenceWord}
        </span>
        {perDayMinutes != null && (
          <span className="pb-2 text-xs text-neutral-500 dark:text-neutral-400 tabular-nums">
            · ~{Math.max(1, Math.round(perDayMinutes))} min/day
          </span>
        )}
      </div>
      {showEmptyCoverageHint && (
        <p className="text-xs text-neutral-500 dark:text-neutral-400 italic">
          Add a coverage target above to see your estimated time per day.
        </p>
      )}
    </ToggleCard>
  );
}

// ---------------------------------------------------------------------
// InfoTip — small ⓘ icon with hover tooltip
// ---------------------------------------------------------------------

/**
 * A 12px circled "i" with a native `title` tooltip. Plain English
 * explanation on hover; same string read by screen readers via
 * the title attribute. Used in the by-module view next to pace
 * pills and time estimates so the user can ask "what does this
 * mean?" without leaving the row.
 */
export function InfoTip({ text }: { text: string }) {
  return (
    <span
      title={text}
      aria-label={text}
      className="inline-flex items-center justify-center text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 cursor-help"
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 16 16"
        fill="currentColor"
        aria-hidden
      >
        <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zm0 1a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11zm0 2.25a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5zM7.25 7h1.5v5h-1.5V7z" />
      </svg>
    </span>
  );
}

// ---------------------------------------------------------------------
// PacePill — green / amber / red status pill for the by-module view
// ---------------------------------------------------------------------

export type PacePillColor = 'green' | 'amber' | 'red';

/**
 * Compact pace pill. Rendered next to weekly-goal rows whose unit
 * supports the attempts-vs-pro-rated-target comparison (coverage,
 * attempts, sessions, lessons). Days/consistency goals render a
 * muted "X of Y days" text count instead — see the by-module view.
 *
 * Color semantics:
 *   green — on or ahead of pace
 *   amber — within ~15% below pace (at-risk)
 *   red   — materially behind pace
 *
 * `label` is the short word inside the pill (e.g. "on pace",
 * "amber", "behind"). The companion InfoTip explains the math
 * in plain English.
 */
export function PacePill({
  color,
  label,
}: {
  color: PacePillColor;
  label: string;
}) {
  const classes = {
    green:
      'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300',
    amber:
      'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300',
    red:
      'bg-rose-100 dark:bg-rose-900/30 text-rose-800 dark:text-rose-300',
  }[color];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums ${classes}`}
    >
      {label}
    </span>
  );
}
