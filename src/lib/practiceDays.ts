/**
 * Which days a module was practised, and the streak that follows.
 *
 * =====================================================================
 * READ FROM THE DATES ALREADY RECORDED. NOTHING NEW IS WRITTEN.
 *
 * Every module has kept timestamps since it shipped — they are just
 * kept in different tables, because the modules measure different
 * things:
 *
 *   attempts          answered drills — harmonic fluency, the four ear
 *                     training sub-modules, reading, production's
 *                     vocabulary
 *   drillSessions     timed drills — shapes & patterns
 *   songPracticeLog   played sessions — song repertoire
 *
 * So this file owns the one mapping from a module to its dates, and
 * every streak and every calendar reads through it. The alternative —
 * each surface knowing which table its module uses — is how two
 * surfaces come to disagree about whether yesterday counted.
 * =====================================================================
 *
 * A DAY IS A LOCAL DAY KEY, the same `localDayKey` the daily goal and
 * the calendar already use, so "yesterday" means the same thing in all
 * three.
 */
import { db, type AttemptRecord } from './db';
import { localDayKey, previousDayKey } from './dailyGoal';
import { EAR_TRAINING_SUBMODULES } from './moduleMeta';
import {
  isNumericGoal,
  type ModuleDailyGoal,
} from './goalConfig';

/** What one day holds, per module. */
export interface PracticeDay {
  /** Attempts answered that day. 0 for a module that records none. */
  answers: number;
  /** Minutes recorded that day. 0 for a module that records none. */
  minutes: number;
}

export type PracticeDays = ReadonlyMap<string, PracticeDay>;

const EMPTY: PracticeDay = { answers: 0, minutes: 0 };

function add(days: Map<string, PracticeDay>, key: string, patch: Partial<PracticeDay>): void {
  const prev = days.get(key) ?? EMPTY;
  days.set(key, {
    answers: prev.answers + (patch.answers ?? 0),
    minutes: prev.minutes + (patch.minutes ?? 0),
  });
}

/**
 * The attempt module ids a module home counts as its own.
 *
 * Ear training is the one that is not itself: its home sits above four
 * sub-modules that each write under their own id, so a day it was
 * practised is a day ANY of them was.
 */
export function attemptModuleIds(moduleId: string): string[] {
  return moduleId === 'ear-training'
    ? EAR_TRAINING_SUBMODULES.map(m => m.id)
    : [moduleId];
}

/**
 * Every day this module has been practised, with what was recorded.
 *
 * Whole-table reads, deliberately: a streak is over all of history, so
 * there is no window to narrow to, and these tables are small enough
 * that the module home already reads several of them whole.
 */
export async function loadPracticeDays(moduleId: string): Promise<PracticeDays> {
  const days = new Map<string, PracticeDay>();

  if (moduleId === 'shapes-and-patterns') {
    // Timed drills. Seconds, stored per session; the goal speaks in
    // minutes, so the conversion happens once, here.
    const sessions = await db.drillSessions.toArray();
    for (const s of sessions) {
      add(days, localDayKey(new Date(s.timestamp)), {
        minutes: s.durationSeconds / 60,
      });
    }
    return days;
  }

  if (moduleId === 'repertoire') {
    const logs = await db.songPracticeLog.toArray();
    for (const l of logs) {
      add(days, localDayKey(new Date(l.timestamp)), { minutes: l.durationMin });
    }
    return days;
  }

  const ids = attemptModuleIds(moduleId);
  const attempts: AttemptRecord[] = await db.attempts
    .where('moduleId').anyOf(ids).toArray();
  for (const a of attempts) {
    add(days, localDayKey(new Date(a.timestamp)), { answers: 1 });
  }
  return days;
}

/** True when this day's record clears the module's goal. */
export function dayClearsGoal(day: PracticeDay | undefined, goal: ModuleDailyGoal): boolean {
  if (day === undefined) return false;
  if (!isNumericGoal(goal)) {
    // ANY PRACTICE: the day counts if anything at all was recorded.
    // Never a comparison against a number — see `ModuleDailyGoal`.
    return day.answers > 0 || day.minutes > 0;
  }
  return goal.unit === 'answers'
    ? day.answers >= goal.amount
    : day.minutes >= goal.amount;
}

/**
 * Consecutive days ending today, or yesterday.
 *
 * YESTERDAY KEEPS THE CHAIN ALIVE, the same allowance
 * `computeDayStreak` makes: a streak should not be reported as broken
 * at one minute past midnight, before the day has been had.
 *
 * BOUNDED BY THE RECORD ITSELF. The walk can only continue while a day
 * is present in `days`, and `days` is finite — so unlike the goal-based
 * walk this one cannot run away whatever the goal says.
 */
export function dayStreakFrom(
  days: PracticeDays,
  goal: ModuleDailyGoal,
  today: string = localDayKey(),
): number {
  let cursor = today;
  if (!dayClearsGoal(days.get(cursor), goal)) cursor = previousDayKey(cursor);
  let streak = 0;
  while (dayClearsGoal(days.get(cursor), goal)) {
    streak += 1;
    cursor = previousDayKey(cursor);
  }
  return streak;
}

/** The day keys themselves, for a calendar to shade. */
export function practisedDayKeys(days: PracticeDays): Set<string> {
  const out = new Set<string>();
  for (const [key, day] of days) {
    if (day.answers > 0 || day.minutes > 0) out.add(key);
  }
  return out;
}
