/**
 * Phase 3 Step 7a — count practice sessions logged earlier today.
 *
 * Drives the "Continuing today's plan" gate in Q3 of the input
 * questionnaire (Step 3d) and the session-role detection in
 * Step 2g. Local-day boundary, midnight to midnight; late-night
 * sessions (per the time-of-day windows table in db.ts) roll up
 * under the previous calendar day's metrics so they don't bleed
 * into "today" before the user actually wakes up.
 */
import { db } from '../../lib/db';

export async function countEarlierSessionsToday(
  now: number = Date.now(),
): Promise<number> {
  const startOfToday = startOfLocalDay(now);
  const sessions = await db.practiceSessions
    .where('startedAt')
    .aboveOrEqual(startOfToday)
    .toArray();
  return sessions.filter(s => s.startedAt <= now).length;
}

/** Local-midnight start of the day containing `now`. */
export function startOfLocalDay(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
