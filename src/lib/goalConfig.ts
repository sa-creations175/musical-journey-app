export const DEFAULT_DAILY_GOAL = 30;
export const MIN_DAILY_GOAL = 5;
export const MAX_DAILY_GOAL = 200;

// Pref keys are per-module so each module tracks its own goal.
// Matches the naming given in the spec: dailyGoalIntervals, dailyGoalChordRecognition, etc.
export function dailyGoalKey(moduleId: string): string {
  const pascal = moduleId.charAt(0).toUpperCase() + moduleId.slice(1);
  return `dailyGoal${pascal}`;
}

export function isValidGoal(n: number): boolean {
  return Number.isInteger(n) && n >= MIN_DAILY_GOAL && n <= MAX_DAILY_GOAL;
}
