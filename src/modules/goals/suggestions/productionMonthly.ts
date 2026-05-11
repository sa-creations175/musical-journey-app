import {
  defaultProduction,
  type ProductionTarget,
} from '../GoalCreationFlow';
import type { MonthlySuggestion } from './hfMonthly';

/**
 * Build the monthly Production suggestion. v1 (clean-slate):
 * complete the workflow-foundations path (the first path in the
 * production curriculum) plus 3 lessons/week consistency.
 *
 * "Next lessons in current path" reduces to "workflow-foundations"
 * for clean-slate users; once we have progress data, the suggestion
 * can advance to whichever path the user is mid-way through, and
 * narrow to a specific lesson count if the path is mostly complete.
 *
 * Coverage stays off; the path-completion target is the more
 * natural single-path framing (and uses an existing metric the
 * encoder already handles).
 */
export function suggestProductionMonthly(): MonthlySuggestion<ProductionTarget> {
  const target = defaultProduction();
  target.completionEnabled = true;
  target.completionScope = 'path';
  target.pathId = 'workflow-foundations';
  target.consistencyEnabled = true;
  target.consistencyCount = 3;
  target.consistencyCadence = 'week';

  return {
    target,
    contextLines: [
      'Work through workflow foundations — the first lessons of the production path.',
      'Plus 3 lessons/week to keep momentum.',
    ],
  };
}
