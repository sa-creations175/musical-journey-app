import type { MonthlySuggestion } from './hfMonthly';

/**
 * Custom target shape for the monthly Practice Consistency
 * suggestion. The existing PracticeConsistencyTarget models a single
 * cadence (`days: number; cadence: 'week' | 'month'`) — but the spec
 * baseline carries TWO commitments:
 *
 *   1. Overall practice frequency: 6 days/week.
 *   2. Keyboard-session quality: at least 4 sessions/week, each
 *      ≥ 20 minutes long.
 *
 * The second isn't expressible in the existing single-number target.
 * Save logic for this compound shape (likely two linked goal records
 * sharing parent_goal_id) lives in the body component; the suggestion
 * fn just declares the intent. The two dimensions are tracked
 * separately because they answer different questions — frequency
 * ("did I show up?") vs sustained focus ("did I really practice?").
 */
export interface PracticeConsistencyMonthlyTarget {
  /** Days of practice activity per week (any module counts). Spec
   *  baseline: 6. */
  daysPerWeek: number;
  /** Specifically keyboard sessions — sessions with the keyboard
   *  context, where the actual instrument is at hand. Spec baseline:
   *  4 sessions per week. */
  keyboardSessionsPerWeek: number;
  /** Minimum keyboard-session duration to count toward the per-week
   *  count, in minutes. Spec baseline: 20. */
  keyboardSessionMinMinutes: number;
}

export function suggestPracticeConsistencyMonthly(): MonthlySuggestion<PracticeConsistencyMonthlyTarget> {
  return {
    target: {
      daysPerWeek: 6,
      keyboardSessionsPerWeek: 4,
      keyboardSessionMinMinutes: 20,
    },
    contextLines: [
      'Show up 6 days a week — any module counts.',
      'Plus at least 4 keyboard sessions a week, 20+ minutes each, where the instrument is at hand.',
    ],
  };
}
