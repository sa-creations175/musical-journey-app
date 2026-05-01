/**
 * Phase 3 Step 2h — Lived-with window helper for songs.
 *
 * "Lived with" describes how recently a user has been actively
 * engaging with a song at the cell level (section × key matrix
 * interactions). The algorithm uses this to:
 *
 *   - prefer songs the user is already in motion on, rather than
 *     pulling them away mid-stride to start something new;
 *   - surface songs that have started decaying so they don't slip;
 *   - fall back to honest "last touched" reasoning for the
 *     "Why this plan?" panel.
 *
 * Decay bands match the schema's existing `solidDecayState` model
 * (db.ts SongKey: solid → fading → lapsed):
 *
 *   never    — no engagement on record.
 *   solid    — engaged within the last 14 days.
 *   fading   — 14–29 days since last engagement (warning band).
 *   lapsed   — 30+ days since last engagement (retest territory).
 *
 * 6j logs `songKeyEngagements` rows at session end; this module is
 * the pure read side. Tests pass timestamps directly — no DB access.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const LIVED_WITH_WINDOW_DAYS = 14;
export const FADING_THRESHOLD_DAYS = 14;
export const LAPSED_THRESHOLD_DAYS = 30;

export type LivedWithBand = 'never' | 'solid' | 'fading' | 'lapsed';

/**
 * Days since `lastEngagedAt` (floored). null lastEngagedAt → null
 * return so callers can distinguish "never engaged" from "engaged
 * 0 days ago."
 */
export function daysSinceLastEngagement(
  lastEngagedAt: number | null,
  now: number,
): number | null {
  if (lastEngagedAt === null) return null;
  return Math.max(0, Math.floor((now - lastEngagedAt) / MS_PER_DAY));
}

/**
 * Decay band based on time since last engagement. Mirrors the
 * SongKey solidDecayState progression so the algorithm and the Song
 * Repertoire UI agree on what counts as fresh / fading / lapsed.
 */
export function livedWithBand(
  lastEngagedAt: number | null,
  now: number,
): LivedWithBand {
  const days = daysSinceLastEngagement(lastEngagedAt, now);
  if (days === null) return 'never';
  if (days < FADING_THRESHOLD_DAYS) return 'solid';
  if (days < LAPSED_THRESHOLD_DAYS) return 'fading';
  return 'lapsed';
}

/**
 * True when the user has engaged within the lived-with window
 * (default 14 days). Algorithm uses this to bias toward in-motion
 * songs.
 */
export function isLivedWith(
  lastEngagedAt: number | null,
  now: number,
  windowDays: number = LIVED_WITH_WINDOW_DAYS,
): boolean {
  const days = daysSinceLastEngagement(lastEngagedAt, now);
  return days !== null && days < windowDays;
}

/**
 * Count engagements within a rolling window. Useful for surfacing
 * "this song has had 4 sessions touch it in the last 14 days" in
 * the reasoning panel and for heat-grid decay rules.
 *
 * Pure: pass an array of engagement timestamps; the function counts
 * how many fall in `[now - windowDays, now]`.
 */
export function countEngagementsInWindow(
  engagementTimestamps: ReadonlyArray<number>,
  now: number,
  windowDays: number = LIVED_WITH_WINDOW_DAYS,
): number {
  // Strict on the past boundary so a 14-day-ago timestamp lands in
  // the 'fading' band, matching livedWithBand's `< FADING_THRESHOLD_DAYS`
  // semantics. Inclusive on `now` so a fresh engagement just logged
  // counts.
  const cutoff = now - windowDays * MS_PER_DAY;
  let count = 0;
  for (const t of engagementTimestamps) {
    if (t > cutoff && t <= now) count += 1;
  }
  return count;
}

/**
 * Pick the most recent engagement timestamp from a list. null when
 * the list is empty. Used by the algorithm to derive a song's
 * lastEngagedAt from raw cell-level engagement records when the
 * pre-rolled SongKey field isn't trusted (e.g., during migration).
 */
export function mostRecentEngagement(
  engagementTimestamps: ReadonlyArray<number>,
): number | null {
  if (engagementTimestamps.length === 0) return null;
  let max = engagementTimestamps[0];
  for (const t of engagementTimestamps) if (t > max) max = t;
  return max;
}
