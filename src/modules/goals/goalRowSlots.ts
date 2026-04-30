import type { Goal } from '../../lib/db';
import type { LayerDef } from './Goals';

/**
 * Phase 2 step 6a — Goal row slot resolution helpers.
 *
 * The redesigned goal row reserves two distinct slots:
 *
 *   - Progress slot   = "where am I" (raw numerator / denominator)
 *   - Feasibility slot = "will I make it" (Step 7 fills this in)
 *
 * Both slots appear in collapsed AND expanded states so users can
 * glance the full picture without expanding every row. Step 6a
 * keeps the feasibility slot inert (placeholder pill) so Step 7
 * can drop in real data without retrofitting the layout.
 *
 * Aspirational layers (`two_to_three_year`, `lifetime`) are open-
 * text reflections — no measurable progress, no feasibility. Both
 * slots are skipped entirely on those rows.
 */

export type ProgressSlotState =
  | { kind: 'hidden' }
  | { kind: 'not-started'; targetValue: number; targetUnit: string | null }
  | { kind: 'in-progress'; currentValue: number; targetValue: number; targetUnit: string | null }
  | { kind: 'umbrella' };

/**
 * Whether to render the slot pair at all. Driven by layer type so
 * by-timeframe sections can hide slots for aspirational layers
 * (2–3 year, lifetime) without each row needing to know its layer.
 */
export function shouldShowSlots(layerType: LayerDef['type']): boolean {
  return layerType === 'measurable';
}

/**
 * Resolve the progress slot's display state.
 *
 * - `hidden`      — slot suppressed (aspirational, or no target at all)
 * - `not-started` — measurable target exists, currentValue is 0
 * - `in-progress` — measurable target with non-zero progress
 * - `umbrella`    — umbrella record without a target of its own;
 *                   slot still reserved (layout invariant) but no
 *                   numbers shown — rollup logic lands later.
 */
export function progressSlotState(
  goal: Goal,
  layerType: LayerDef['type'],
): ProgressSlotState {
  if (!shouldShowSlots(layerType)) return { kind: 'hidden' };

  if (goal.isUmbrella && goal.targetValue === null) {
    return { kind: 'umbrella' };
  }

  if (goal.targetValue === null || goal.targetValue === undefined) {
    return { kind: 'hidden' };
  }

  if (goal.currentValue > 0) {
    return {
      kind: 'in-progress',
      currentValue: goal.currentValue,
      targetValue: goal.targetValue,
      targetUnit: goal.targetUnit,
    };
  }

  return {
    kind: 'not-started',
    targetValue: goal.targetValue,
    targetUnit: goal.targetUnit,
  };
}

/**
 * Compact text for the collapsed-row progress slot.
 *
 *   in-progress → "43/143"
 *   not-started → "Not started"
 *   umbrella    → "—"
 *   hidden      → null (caller skips render)
 */
export function progressSlotText(state: ProgressSlotState): string | null {
  switch (state.kind) {
    case 'in-progress':
      return `${formatNumber(state.currentValue)}/${formatNumber(state.targetValue)}`;
    case 'not-started':
      return 'Not started';
    case 'umbrella':
      return '—';
    case 'hidden':
      return null;
  }
}

/**
 * Percentage 0–100 for the expanded-row progress bar. Returns null
 * when there's no fill to draw (umbrella rollup, hidden, or
 * not-started — caller renders the bar empty + "Not started" label
 * instead of computing 0%).
 */
export function progressSlotPercent(state: ProgressSlotState): number | null {
  if (state.kind !== 'in-progress') return null;
  if (state.targetValue <= 0) return null;
  const pct = (state.currentValue / state.targetValue) * 100;
  return Math.max(0, Math.min(100, pct));
}

function formatNumber(n: number): string {
  // Integer-looking values stay clean; fractional values show up
  // to one decimal so a "1.2/3 hrs" weekly hour goal still reads
  // truthfully without rendering a spurious .0 on whole counts.
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(1);
}
