import {
  defaultHarmonicFluency,
  type HarmonicFluencyTarget,
} from '../GoalCreationFlow';

export interface MonthlySuggestion<T> {
  /** Pre-populated target slice the focus section renders. The user
   *  can edit it via the focus controls, or replace it entirely. */
  target: T;
  /** 1–2 short context lines explaining why this is the suggestion. */
  contextLines: string[];
  /** Optional targetDate override (epoch ms). When the suggestion
   *  implies a longer horizon than the scope's default end-of-period
   *  (e.g. Shapes' inversion-redesign suggesting 3 months for triad
   *  coverage), the body uses this override instead of
   *  defaultTargetDate(scope). User can still edit via the date
   *  picker. */
  defaultTargetDate?: number;
}

/**
 * Build the monthly Harmonic Fluency suggestion. v1 (clean-slate):
 * baseline foundational / math group, cover-to-acquired, no
 * accuracy or consistency targets enabled — the user opts in to
 * those via the "Also add" pills if they want them. Future
 * iterations can read the user's existing progress (which group
 * has the most untouched cards, has the foundational group been
 * acquired already?) and advance the suggestion accordingly.
 */
export function suggestHfMonthly(): MonthlySuggestion<HarmonicFluencyTarget> {
  const target = defaultHarmonicFluency();
  target.coverageEnabled = true;
  target.coverageScope = 'specific';
  target.coverageGroupIds = ['foundational'];

  return {
    target,
    contextLines: [
      'Start with foundational scale-degree math, named notes, and key signatures.',
      'Reach the acquired stage on all 130 cards in this group.',
    ],
  };
}
