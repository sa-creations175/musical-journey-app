import {
  defaultEarTraining,
  type EarTrainingTarget,
} from '../GoalCreationFlow';
import type { MonthlySuggestion } from './hfMonthly';

/**
 * Build the monthly Ear Training suggestion. v1 (clean-slate):
 * intervals + chord recognition (the foundational ear-training
 * surfaces — interval ID is the most fundamental ear skill, and
 * triad chord recognition lives inside the chord-recognition
 * group's foundational tier). Coverage scope is 'specific' with
 * both groups picked; the user can drop one in the focus section
 * if both feels like too much, or extend to chord-progressions /
 * scales-modes once the foundational pair is settled.
 *
 * Accuracy and consistency stay off by default — surfaced as
 * "Also add" pills if the user wants them.
 */
export function suggestEtMonthly(): MonthlySuggestion<EarTrainingTarget> {
  const target = defaultEarTraining();
  target.coverageEnabled = true;
  target.coverageScope = 'specific';
  target.coverageGroupIds = ['intervals', 'chord-recognition'];

  return {
    target,
    contextLines: [
      'Start with the foundational ear-training surfaces: intervals and chord recognition.',
      'Reach the acquired stage on every item in both groups.',
    ],
  };
}
