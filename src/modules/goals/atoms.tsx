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
    const tint = `${accentHex}1a`;
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        style={active
          ? { borderColor: accentHex, backgroundColor: tint, color: accentHex }
          : { borderColor: accentHex, color: accentHex }
        }
        className="px-3 py-1.5 text-sm rounded-md border transition text-left"
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
  unitLabel = 'Sessions',
  hint = 'Show up regularly — sessions per week or month.',
  cardTitle = 'Consistency target',
}: {
  target: T;
  onChange: (next: T) => void;
  /** Field label and ARIA label for the count input. Defaults to
   *  "Sessions" — modules that consume minutes (e.g., Shapes &
   *  Patterns) or hours (e.g., Production) override accordingly. */
  unitLabel?: string;
  /** Card-header hint text. Defaults to the sessions phrasing;
   *  override per module to keep the unit honest. */
  hint?: string;
  /** Card-header title. Defaults to "Consistency target" — Production
   *  overrides with "Time target" since hours-as-time reads more
   *  naturally there. */
  cardTitle?: string;
}) {
  const toggle = () => onChange({ ...target, consistencyEnabled: !target.consistencyEnabled });
  const setCount = (n: number) => {
    // Allow empty string to read as 0 from the input; clamp at 1
    // floor on save / preview but keep the raw value for editing fluency.
    onChange({ ...target, consistencyCount: Number.isFinite(n) ? n : 0 });
  };
  const setCadence = (c: 'week' | 'month') => {
    if (c === target.consistencyCadence) return;
    onChange({ ...target, consistencyCadence: c });
  };

  return (
    <ToggleCard
      title={cardTitle}
      hint={hint}
      enabled={target.consistencyEnabled}
      onToggle={toggle}
    >
      <div className="flex items-end gap-2">
        <Field label={unitLabel}>
          <input
            type="number"
            min={1}
            value={target.consistencyCount === 0 ? '' : target.consistencyCount}
            onChange={e => setCount(Number(e.target.value))}
            className={`${inputClass()} w-20`}
            aria-label={`${unitLabel} per cadence`}
          />
        </Field>
        <div className="flex gap-1.5 pb-[2px]">
          <PillButton
            label="per week"
            active={target.consistencyCadence === 'week'}
            onClick={() => setCadence('week')}
          />
          <PillButton
            label="per month"
            active={target.consistencyCadence === 'month'}
            onClick={() => setCadence('month')}
          />
        </div>
      </div>
    </ToggleCard>
  );
}
