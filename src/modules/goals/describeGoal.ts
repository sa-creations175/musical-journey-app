import type { Goal, ProficiencyDefinition, Song } from '../../lib/db';
import { describeSongGoalTarget, isSongMetric } from './songTarget';

/**
 * Format a goal record as a short human-readable target string.
 * Used on Goals home (next to the description) and anywhere else
 * a goal needs a single-line summary of its target.
 *
 * Returns `null` when there's no measurable target — vision-scope
 * goals (lifetime / two_to_three_year) and any goal with
 * targetMetric / targetValue not set.
 *
 * Examples:
 *   targetMetric: 'items_at_level', targetValue: 3, targetUnit: 'rooted'
 *     → "3 items at Reasonably fluent"
 *
 *   targetMetric: 'hours_on_modules', targetValue: 10, targetUnit: 'hours'
 *     → "10 hours on selected modules"
 *
 *   targetMetric: 'count_completed', targetValue: 5, targetUnit: 'items'
 *     → "5 items completed"
 *
 *   targetMetric: 'custom', targetValue: 25, targetUnit: 'reps'
 *     → "25 reps"
 *
 *   targetMetric: 'song_whole_at_level', targetUnit: 'solid'
 *     → "Take Mirror to Solid in C" (when songLookup is supplied)
 *     → "Take song to Solid in original key" (fallback)
 *
 * `proficiencyDefinitions` is an optional lookup that lets the
 * formatter render the proper short_label for an `items_at_level`
 * goal whose targetUnit holds a level identifier. Without it, the
 * raw level string is used.
 *
 * `songLookup` is an optional callback that resolves a song record
 * by id — used to render song-mode goal targets with the song's
 * actual title and original key.
 */
export function describeGoalTarget(
  goal: Goal,
  proficiencyDefinitions?: ReadonlyArray<ProficiencyDefinition>,
  songLookup?: (songId: string) => Pick<Song, 'title' | 'key'> | undefined,
): string | null {
  // Song-mode goals are non-numeric for some shapes (Solid in
  // original key, Internalized, Key targets carry no targetValue),
  // so they short-circuit before the generic null-targetValue check.
  if (isSongMetric(goal.targetMetric)) {
    const song = resolveSongFromGoal(goal, songLookup);
    return describeSongGoalTarget(goal, song);
  }

  if (!goal.targetMetric || goal.targetValue === null || goal.targetValue === undefined) {
    return null;
  }

  const value = goal.targetValue;

  if (goal.targetMetric === 'items_at_level') {
    const levelId = goal.targetUnit;
    const label = levelId
      ? labelForLevel(levelId, proficiencyDefinitions) ?? levelId
      : 'a level';
    const noun = value === 1 ? 'item' : 'items';
    return `${value} ${noun} at ${label}`;
  }

  if (goal.targetMetric === 'hours_on_modules') {
    const noun = value === 1 ? 'hour' : 'hours';
    return `${value} ${noun} on selected modules`;
  }

  if (goal.targetMetric === 'count_completed') {
    const unit = goal.targetUnit ?? 'items';
    return `${value} ${unit} completed`;
  }

  // Custom: "<value> <unit>" (unit may be empty)
  const unit = goal.targetUnit?.trim();
  return unit ? `${value} ${unit}` : String(value);
}

/**
 * Given a list of proficiencyDefinitions, find a `short_label` for
 * the given level id. Returns the first match, prioritising the
 * (scope, level) pair when scope is provided. When no proficiency
 * definitions are loaded yet, returns null and callers fall back
 * to the raw level identifier.
 */
function labelForLevel(
  levelId: string,
  defs?: ReadonlyArray<ProficiencyDefinition>,
): string | null {
  if (!defs || defs.length === 0) return null;
  const match = defs.find(d => d.level === levelId);
  return match?.shortLabel ?? null;
}

/**
 * Resolve a song-mode goal's underlying Song record. The form
 * stores the song as a related-items skillId, so we look up the
 * first relatedItem that the caller's songLookup can resolve.
 * Returns undefined when no lookup was provided or the song record
 * isn't reachable (deleted song, sync still pending, etc.) — the
 * formatter falls back to a song-name-less phrasing.
 */
function resolveSongFromGoal(
  goal: Goal,
  songLookup?: (songId: string) => Pick<Song, 'title' | 'key'> | undefined,
): Pick<Song, 'title' | 'key'> | undefined {
  if (!songLookup) return undefined;
  for (const id of goal.relatedItems) {
    const found = songLookup(id);
    if (found) return found;
  }
  return undefined;
}
