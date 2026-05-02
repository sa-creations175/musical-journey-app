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
