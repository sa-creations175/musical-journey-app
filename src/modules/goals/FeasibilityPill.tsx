import type {
  FeasibilityRollup,
  GoalFeasibility,
  GoalFeasibilityStatus,
} from './progress';

/**
 * Phase 2 step 7d — collapsed-row feasibility pill.
 *
 * Replaces the inert dashed em-dash placeholder reserved in 6a /
 * 6c.1 with a real status pill. Status → icon + accent color
 * mapping is the pure helper `pillConfig`; the pill component
 * renders the visual.
 *
 * Aspirational, unknown, and "no actionable children" rows fall
 * back to the inert dashed-pill rendering — same shape as before
 * so the layout commitment from 6a is preserved.
 */

interface PillConfig {
  icon: string;
  label: string;
  textClass: string;
  borderClass: string;
}

/**
 * Pure status → display mapping. Returns null when the input
 * has no actionable status (caller renders the inert dashed
 * placeholder instead).
 */
export function pillConfig(
  status: GoalFeasibilityStatus | null,
): PillConfig | null {
  if (status === null) return null;
  switch (status) {
    case 'on_track':
      return {
        icon: '✓',
        label: 'On track',
        textClass: 'text-fluent',
        borderClass: 'border-fluent',
      };
    case 'at_risk':
      return {
        icon: '⚠',
        label: 'At risk',
        textClass: 'text-developing',
        borderClass: 'border-developing',
      };
    case 'critical':
      return {
        icon: '✗',
        label: 'Critical',
        textClass: 'text-needswork',
        borderClass: 'border-needswork',
      };
    case 'unrecoverable':
      return {
        icon: '⊘',
        label: 'Unrecoverable',
        textClass: 'text-neutral-400 dark:text-neutral-500',
        borderClass: 'border-neutral-300 dark:border-neutral-700',
      };
  }
}

/**
 * Resolve an umbrella's effective collapsed-pill status from
 * its rollup. Worst-case status wins for actionable children
 * (rollup.status); when no actionable children exist BUT some
 * are unrecoverable, the umbrella reads as unrecoverable. When
 * no measurable children exist at all, returns null → inert.
 */
export function resolveUmbrellaStatus(
  rollup: FeasibilityRollup,
): GoalFeasibilityStatus | null {
  if (rollup.status !== null) return rollup.status;
  if (rollup.breakdown.unrecoverable > 0) return 'unrecoverable';
  return null;
}

// ── Components ────────────────────────────────────────────────

const PILL_BASE_CLASSES =
  'inline-flex items-center justify-center text-xs rounded-full px-2 py-0.5 min-w-[3.5rem] h-5';

const INERT_CLASSES =
  'text-neutral-300 dark:text-neutral-600 border border-dashed border-neutral-300 dark:border-neutral-700';

/**
 * Standalone-goal pill — derives status from the goal's
 * feasibility kind/status. Aspirational and 'unknown' render as
 * inert (collapsed view doesn't surface the placeholder
 * message; that's a 7e expanded-detail concern).
 */
export function FeasibilityPill({
  feasibility,
}: {
  feasibility: GoalFeasibility | null;
}) {
  if (!feasibility || feasibility.kind !== 'measurable') {
    return <InertSlot />;
  }
  return <StatusPill status={feasibility.status} />;
}

/**
 * Umbrella pill — derives status from a rollup via
 * `resolveUmbrellaStatus`. All-unrecoverable umbrellas surface
 * the unrecoverable pill; rollups with no actionable children
 * AND no unrecoverables fall back to inert.
 */
export function UmbrellaFeasibilityPill({
  rollup,
}: {
  rollup: FeasibilityRollup;
}) {
  const status = resolveUmbrellaStatus(rollup);
  if (status === null) return <InertSlot />;
  return <StatusPill status={status} />;
}

function StatusPill({ status }: { status: GoalFeasibilityStatus }) {
  const cfg = pillConfig(status)!;
  return (
    <span
      data-feasibility-slot
      data-status={status}
      role="status"
      aria-label={cfg.label}
      title={cfg.label}
      className={`${PILL_BASE_CLASSES} border ${cfg.textClass} ${cfg.borderClass}`}
    >
      <span aria-hidden>{cfg.icon}</span>
    </span>
  );
}

function InertSlot() {
  return (
    <span
      data-feasibility-slot
      aria-hidden
      className={`${PILL_BASE_CLASSES} ${INERT_CLASSES}`}
    >
      —
    </span>
  );
}
