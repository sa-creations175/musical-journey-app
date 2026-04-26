import type { PracticeSessionTimeOfDay } from '../../lib/db';

/**
 * Auto-label a session's time-of-day from its wall-clock start.
 * Bands are spec-locked (PRACTICE_SESSIONS_DESIGN_3.md):
 *
 *   late_night : 12am – 4am  (4am exclusive)
 *   morning    : 4am – 12pm  (12pm exclusive)
 *   midday     : 12pm – 6pm  (6pm exclusive)
 *   evening    : 6pm – 12am  (midnight exclusive)
 *
 * Day profiles only let users plan for morning / midday / evening;
 * late_night is for after-the-fact classification of sessions that
 * happened to start in the small hours.
 */
export function timeOfDayFor(epochMs: number): PracticeSessionTimeOfDay {
  const hour = new Date(epochMs).getHours();
  if (hour < 4)  return 'late_night';
  if (hour < 12) return 'morning';
  if (hour < 18) return 'midday';
  return 'evening';
}
