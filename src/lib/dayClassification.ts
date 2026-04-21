import type { DailySummary } from './db';

// A practice day "counts" for display classification if it has at least
// this many attempts. (Streak logic is separate and still hinges on
// hitting the daily goal — see dailyGoal.ts#computeDayStreak.)
export const PRACTICE_DAY_MIN_ATTEMPTS = 5;

export type DayClass =
  | 'empty'
  | 'belowThreshold'
  | 'light'
  | 'solid'
  | 'goalMet'
  | 'goalCrushed';

export const DAY_CLASS_ORDER: DayClass[] = [
  'empty', 'belowThreshold', 'light', 'solid', 'goalMet', 'goalCrushed',
];

export function classifyDay(summary: DailySummary | undefined): DayClass {
  if (!summary) return 'empty';
  const attempts = summary.correctCount + summary.wrongCount;
  if (attempts === 0) return 'empty';
  if (attempts < PRACTICE_DAY_MIN_ATTEMPTS) return 'belowThreshold';
  const goal = summary.dailyGoal;
  if (goal <= 0) return 'light';
  // Progress is attempts-based — wrong answers count toward the goal
  // alongside correct ones (see DailyGoalBar / computeDayStreak).
  const pct = (attempts / goal) * 100;
  if (pct >= 150) return 'goalCrushed';
  if (pct >= 100) return 'goalMet';
  if (pct >= 50) return 'solid';
  return 'light';
}

export const DAY_CLASS_LABEL: Record<DayClass, string> = {
  empty: 'no practice',
  belowThreshold: 'below threshold (1–4 attempts)',
  light: 'light practice (< 50% of goal)',
  solid: 'solid practice (50–99% of goal)',
  goalMet: 'goal met',
  goalCrushed: 'goal crushed (150%+)',
};

// Cell background/text are driven by CSS custom properties defined in
// index.css (with `.dark` overrides), applied through inline style. We
// hit a bug earlier where Tailwind `bg-fluent` / `bg-mastered` classes
// existed in the generated CSS but weren't painting calendar cell
// backgrounds in the browser. Inline styles win over any class-based
// rule regardless of cascade / specificity / cache state, so the cells
// always paint. Dark-mode variants still work because CSS variables
// resolve against the current theme.
export interface DayClassStyle {
  backgroundColor: string;
  color: string;
}

export const DAY_CLASS_STYLE: Record<DayClass, DayClassStyle> = {
  empty:          { backgroundColor: 'var(--cal-empty-bg)',           color: 'var(--cal-empty-text)' },
  belowThreshold: { backgroundColor: 'var(--cal-below-bg)',           color: 'var(--cal-below-text)' },
  light:          { backgroundColor: 'var(--cal-light-bg)',           color: 'var(--cal-light-text)' },
  solid:          { backgroundColor: 'var(--cal-solid-bg)',           color: 'var(--cal-solid-text)' },
  goalMet:        { backgroundColor: 'var(--cal-goal-met-bg)',        color: 'var(--cal-goal-met-text)' },
  goalCrushed:    { backgroundColor: 'var(--cal-goal-crushed-bg)',    color: 'var(--cal-goal-crushed-text)' },
};
