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
 * baseline foundational / math group, cover-to-acquired. The
 * consistency target is on by default (5 days/week) via
 * `defaultHarmonicFluency()` — spreading flashcard work across days
 * matters more for retention than total time. The user can toggle
 * accuracy or change the days count via the body.
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
      'Default: 5 days/week — frequent short sessions over occasional long ones.',
    ],
  };
}
