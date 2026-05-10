import {
  defaultShapesPatterns,
  type ShapesPatternsTarget,
} from '../GoalCreationFlow';
import type { MonthlySuggestion } from './hfMonthly';

/**
 * Build the monthly Shapes & Patterns suggestion. Phase 4 inversion
 * redesign:
 *
 * Pre-selects the **triad inversions** group — 6 triad qualities ×
 * 12 keys × 4 inversion states (root / inv1 / inv2 / fluid) = 288
 * items. Each inversion is its own trackable acquisition target so
 * "C major triad acquired" requires demonstrated competence on all
 * four states.
 *
 * Default targetDate is widened to ~3 months from now (~13 weeks)
 * to keep the weekly commitment honest at ~1h57m/week. A user
 * with more time can shorten the date; a user starting from scratch
 * gets a defensible pace from day one.
 *
 * Suggested per-month focus (kept in contextLines, not enforced —
 * Layer 2 quality-level granularity in the picker is deferred):
 *   · Month 1: major + minor triads (96 items)
 *   · Month 2: add diminished + augmented (48 more)
 *   · Month 3: add sus2 + sus4 (48 more) → all 288 covered
 *
 * Proficiency and consistency stay off by default — surfaced as
 * "Also add" pills if the user wants them.
 */
export function suggestShapesMonthly(now: number = Date.now()): MonthlySuggestion<ShapesPatternsTarget> {
  const target = defaultShapesPatterns();
  target.coverageEnabled = true;
  target.coverageScope = 'specific';
  target.coverageGroupIds = ['chord_shape_triads'];

  // ~13-week horizon (3 months) so 288 triad-inversion items pace
  // out to ~1h57m/week — the spec's defensible commitment alongside
  // Repertoire as the primary focus.
  const threeMonthsOut = new Date(now);
  threeMonthsOut.setMonth(threeMonthsOut.getMonth() + 3);
  threeMonthsOut.setHours(23, 59, 59, 999);

  return {
    target,
    defaultTargetDate: threeMonthsOut.getTime(),
    contextLines: [
      'Cover all 288 triad-inversion items across 12 keys — each inversion (root, 1st, 2nd, fluid) tracked separately so every position is accounted for.',
      'Suggested pacing over 3 months: month 1 major + minor triads (96 items), month 2 add diminished + augmented (48), month 3 add sus2 + sus4 (48). About 1h57m/week.',
    ],
  };
}
