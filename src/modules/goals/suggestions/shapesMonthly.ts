import {
  defaultShapesPatterns,
  type ShapesPatternsTarget,
} from '../GoalCreationFlow';
import type { MonthlySuggestion } from './hfMonthly';

/**
 * Build the monthly Shapes & Patterns suggestion. v1 (clean-slate):
 * coverage on the chord_shape_drills activity area — this is the
 * 12-key matrix where foundational triads (and beyond) live. Coverage
 * scope is 'specific' with chord_shape_drills picked; the user can
 * extend to scale_drills / voice_leading once chord shapes are
 * settled, or narrow to a specific shape × key via the focus section.
 *
 * Note: the existing ShapesPatternsTarget shape doesn't model
 * "all foundational triads" at the chord-quality-tier level. The
 * coverage scope works at the activity-area level; tier-narrowing
 * would need a new field. For v1 the broad chord_shape_drills group
 * is the closest expressible match — the user can refine via the
 * proficiency target's specific scope (which DOES support shape ×
 * key, so picking 'maj' across all 12 keys is one click away).
 *
 * Proficiency and consistency stay off by default — surfaced as
 * "Also add" pills if the user wants them.
 */
export function suggestShapesMonthly(): MonthlySuggestion<ShapesPatternsTarget> {
  const target = defaultShapesPatterns();
  target.coverageEnabled = true;
  target.coverageScope = 'specific';
  target.coverageGroupIds = ['chord_shape_drills'];

  return {
    target,
    contextLines: [
      'Start with chord shape drills — foundational triads across the 12-key matrix.',
      'Reach the acquired stage on every chord shape × key combination.',
    ],
  };
}
