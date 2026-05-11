import {
  defaultShapesPatterns,
  type ShapesPatternsTarget,
} from '../GoalCreationFlow';
import type { MonthlySuggestion } from './hfMonthly';

/**
 * Build the monthly Shapes & Patterns suggestion. Phase 4 inversion
 * redesign + Layer 2 quality granularity:
 *
 * Pre-selects **major + minor triads** — 2 qualities × 12 keys × 4
 * inversion states = 96 items. Each inversion (root / 1st / 2nd /
 * fluid) is its own trackable acquisition target so "C major triad
 * acquired" requires competence on all four states. Default
 * targetDate stays at end-of-month — 96 × 3 reps ÷ 4 weeks × 1.6
 * min/rep ≈ 1h 55m/week, a defensible commitment alongside
 * Repertoire as the primary focus.
 *
 * Suggested per-month progression (kept in contextLines as a
 * recommendation, not enforced — the user advances by editing the
 * goal each month):
 *   · Month 1 (default): major + minor triads (96 items)
 *   · Month 2: add diminished + augmented (48 more)
 *   · Month 3: add sus2 + sus4 (48 more) → all 288 triad inversions
 *   · Month 4+: begin seventh chords
 *
 * Layer 2 picker lets the user mix any combination of triad
 * qualities; the "Triad inversions" pill is a select-all shortcut
 * for all 6 qualities (288 items at once).
 *
 * Consistency is on by default (6 days/week) via
 * `defaultShapesPatterns()` — paired with Repertoire since both are
 * keyboard-dependent and happen together in Keys session blocks.
 * Proficiency stays off — surfaced as an "Also add" pill.
 */
export function suggestShapesMonthly(): MonthlySuggestion<ShapesPatternsTarget> {
  const target = defaultShapesPatterns();
  target.coverageEnabled = true;
  target.coverageScope = 'specific';
  target.coverageGroupIds = ['chord_shape_triads_maj', 'chord_shape_triads_min'];

  return {
    target,
    contextLines: [
      'Cover all 96 major + minor triad-inversion items across 12 keys — each inversion (root, 1st, 2nd, fluid) tracked separately.',
      'Suggested next months: month 2 add diminished + augmented (48 more), month 3 add sus2 + sus4 (48 more) → all 288 triad inversions covered. About 1h 55m/week to start.',
      'Default: 6 days/week — paired with Repertoire as the Keys session block.',
    ],
  };
}
