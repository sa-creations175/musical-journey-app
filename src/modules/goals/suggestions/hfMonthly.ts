import {
  defaultHarmonicFluency,
  type HarmonicFluencyTarget,
} from '../GoalCreationFlow';
import { harmonicFluencyCounts } from '../../../lib/moduleItemCounts';

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
 * baseline Notes, Degrees, Scales & Keys group, cover-to-acquired. The
 * consistency target is on by default (5 days/week) via
 * `defaultHarmonicFluency()` — spreading flashcard work across days
 * matters more for retention than total time. The user can toggle
 * accuracy or change the days count via the body.
 */
export function suggestHfMonthly(): MonthlySuggestion<HarmonicFluencyTarget> {
  const target = defaultHarmonicFluency();
  target.coverageEnabled = true;
  target.coverageScope = 'specific';
  target.coverageGroupIds = ['notes-degrees-scales-keys'];
  const cards = harmonicFluencyCounts().byGroup.notesDegreesScalesKeys;

  return {
    target,
    contextLines: [
      'Start with Notes, Degrees, Scales & Keys: the notes of every key, scale-degree math, key signatures, intervals and modes.',
      `Reach the acquired stage on all ${cards} cards in this group.`,
      'Default: 5 days/week — frequent short sessions over occasional long ones.',
    ],
  };
}
