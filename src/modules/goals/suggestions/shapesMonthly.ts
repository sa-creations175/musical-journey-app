import {
  defaultShapesPatterns,
  type ShapesPatternsTarget,
} from '../GoalCreationFlow';
import type { MonthlySuggestion } from './hfMonthly';

/**
 * Build the monthly Shapes & Patterns suggestion. v1 (clean-slate):
 * coverage on the **triads** sub-group — the 6 triad qualities × 12
 * keys = 72 items, the foundational tier of the chord-shape matrix.
 * The user can extend to sevenths / extensions / special / scales /
 * voice-leading from the picker, but defaulting to triads keeps the
 * starting commitment scoped to the closest pedagogical anchor for
 * a self-taught keyboardist building chord vocabulary from scratch.
 *
 * Coverage scope is 'specific' with chord_shape_triads picked.
 * Proficiency and consistency stay off by default — surfaced as
 * "Also add" pills if the user wants them.
 */
export function suggestShapesMonthly(): MonthlySuggestion<ShapesPatternsTarget> {
  const target = defaultShapesPatterns();
  target.coverageEnabled = true;
  target.coverageScope = 'specific';
  target.coverageGroupIds = ['chord_shape_triads'];

  return {
    target,
    contextLines: [
      'Start with triads — the 6 triad qualities across the 12-key matrix.',
      'Reach the acquired stage on every triad × key combination.',
    ],
  };
}
