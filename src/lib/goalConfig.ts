export const DEFAULT_DAILY_GOAL = 30;
export const MIN_DAILY_GOAL = 5;
export const MAX_DAILY_GOAL = 200;

// Per-module default goals. Falls back to DEFAULT_DAILY_GOAL when a
// module isn't listed here. Kept intentionally modest — a full practice
// session usually spans several modules, so each bar should clear in
// normal practice; the overshoot indicator rewards bigger days.
const MODULE_DEFAULT_GOALS: Record<string, number> = {
  intervals: 10,
  'chord-recognition': 10,
  'chord-progressions': 8,
  'harmonic-fluency': 10,
  'scales-modes': 5,
  // Production attempts come from the Vocabulary activity. 10 mirrors
  // SESSION_TARGET in modules/production/VocabularySession.tsx — a
  // single completed session clears the bar.
  production: 10,
};

export function defaultDailyGoal(moduleId: string): number {
  return MODULE_DEFAULT_GOALS[moduleId] ?? DEFAULT_DAILY_GOAL;
}

// Convert a moduleId (hyphen-kebab) into CamelCase for userPrefs key
// construction. Example: 'chord-recognition' → 'ChordRecognition'.
function pascalModule(moduleId: string): string {
  return moduleId
    .split('-')
    .map(s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : ''))
    .join('');
}

// Pref keys are per-module. Examples:
//   intervals         → dailyGoalIntervals
//   chord-recognition → dailyGoalChordRecognition
export function dailyGoalKey(moduleId: string): string {
  return `dailyGoal${pascalModule(moduleId)}`;
}

// Focus-selection pref keys follow the same pattern, but lower-camel so
// they read as property-style identifiers. Examples:
//   intervals         → intervalsFocusSelection
//   chord-recognition → chordRecognitionFocusSelection
export function focusSelectionKey(moduleId: string): string {
  const pascal = pascalModule(moduleId);
  const camel = pascal.charAt(0).toLowerCase() + pascal.slice(1);
  return `${camel}FocusSelection`;
}

// Playback speed multiplier per module. 1.0 = normal; < 1 slower; > 1 faster.
// Chord-heavy modules default slower because complex voicings need more
// time for the ear to parse. Scales & Modes also has per-tab overrides
// (PREF_SCALE_SPEED / PREF_VAMP_SPEED) that take precedence over this
// module-level default within each tab.
const MODULE_DEFAULT_SPEEDS: Record<string, number> = {
  intervals: 1.0,
  'chord-recognition': 0.5,
  'chord-progressions': 0.85,
  'scales-modes': 0.75,
};

export function defaultSpeed(moduleId: string): number {
  return MODULE_DEFAULT_SPEEDS[moduleId] ?? 1.0;
}

// Examples:
//   intervals         → speedIntervals
//   chord-recognition → speedChordRecognition
//   bass-progressions → speedBassProgressions
export function speedPrefKey(moduleId: string): string {
  return `speed${pascalModule(moduleId)}`;
}

export function isValidGoal(n: number): boolean {
  return Number.isInteger(n) && n >= MIN_DAILY_GOAL && n <= MAX_DAILY_GOAL;
}

// =====================================================================
// Per-module daily goals — unit first, number second
// =====================================================================

/**
 * What a module's daily goal COUNTS.
 *
 * ---------------------------------------------------------------
 * "ANY PRACTICE" IS A MODE, NOT A THRESHOLD OF ZERO.
 *
 * `computeDayStreak` walks backwards while each day clears the goal, so
 * a goal of 0 clears on every day in history and the walk never ends —
 * that is the run that hung. Modelling "just show up" as `amount: 0`
 * puts that value one typo away from every streak on the app.
 *
 * So it is a separate unit with NO amount field at all: the numeric
 * path is unreachable from it by construction, not by remembering to
 * check. See `ModuleDailyGoal`.
 * ---------------------------------------------------------------
 */
export type DailyGoalUnit = 'any-practice' | 'answers' | 'minutes';

/**
 * A module's goal.
 *
 * A DISCRIMINATED UNION, deliberately. `{ unit, amount? }` would let
 * `amount` be read wherever the unit was not checked first; this shape
 * makes "read the number" impossible until the unit says there is one.
 */
export type ModuleDailyGoal =
  | { unit: 'any-practice' }
  | { unit: 'answers'; amount: number }
  | { unit: 'minutes'; amount: number };

/** The goal every module ships with. One constant, no per-module numbers. */
export const DEFAULT_MODULE_GOAL: ModuleDailyGoal = { unit: 'any-practice' };

/** The units a reader can pick, in the order they are offered. */
export const DAILY_GOAL_UNITS: ReadonlyArray<DailyGoalUnit> =
  ['any-practice', 'answers', 'minutes'];

export const DAILY_GOAL_UNIT_LABEL: Readonly<Record<DailyGoalUnit, string>> = {
  'any-practice': 'any practice',
  answers: 'answers',
  minutes: 'minutes',
};

/**
 * Pref key for the module's goal. Distinct from `dailyGoalKey`, which
 * addresses the older answers-only number the in-session bar reads —
 * two shapes under one key would make a stored number ambiguous.
 */
export function moduleGoalKey(moduleId: string): string {
  return `moduleGoal${pascalModule(moduleId)}`;
}

/** True when this goal carries a number to compare a day against. */
export function isNumericGoal(
  goal: ModuleDailyGoal,
): goal is { unit: 'answers' | 'minutes'; amount: number } {
  return goal.unit !== 'any-practice';
}

/** A goal amount that `computeDayStreak` can safely walk. */
export function isValidGoalAmount(amount: unknown): amount is number {
  return typeof amount === 'number'
    && Number.isInteger(amount)
    && amount > 0
    && amount <= MAX_DAILY_GOAL;
}

/**
 * A stored value, made safe to use.
 *
 * ANYTHING THAT IS NOT A VALID NUMERIC GOAL BECOMES "ANY PRACTICE" —
 * an older row, a hand-edited pref, a synced value from a future shape,
 * a zero. The fallback is the mode that cannot loop, so a bad row
 * degrades to "you practised that day" rather than to a hang.
 */
export function normaliseModuleGoal(raw: unknown): ModuleDailyGoal {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_MODULE_GOAL;
  const unit = (raw as { unit?: unknown }).unit;
  if (unit === 'answers' || unit === 'minutes') {
    const amount = (raw as { amount?: unknown }).amount;
    return isValidGoalAmount(amount) ? { unit, amount } : DEFAULT_MODULE_GOAL;
  }
  return DEFAULT_MODULE_GOAL;
}
