import { db } from './db';
import { localDayKey, nextLocalMidnight, startOfLocalDay } from './dailyGoal';
import { getPref } from './userPrefs';
import { dailyGoalKey, defaultDailyGoal } from './goalConfig';

// Upserts today's row in dailySummaries for the given module.
// Pulls the current goal (from userPrefs) and today's attempt counts
// (from the attempts table) and writes a snapshot. Called after every
// attempt in the module's quiz AND whenever the goal changes, so the
// row always reflects the most recent state. Past days stay frozen
// because no more attempts fire on those dates.
export async function updateDailySummary(moduleId: string): Promise<void> {
  const today = localDayKey();
  const start = startOfLocalDay();
  const end = nextLocalMidnight();
  const todays = await db.attempts
    .where('timestamp').between(start, end, true, false)
    .and(a => a.moduleId === moduleId)
    .toArray();
  const correctCount = todays.filter(a => a.correct).length;
  const wrongCount = todays.length - correctCount;
  const dailyGoal = await getPref<number>(dailyGoalKey(moduleId), defaultDailyGoal(moduleId));
  // goalMet is attempts-based: total attempts (correct + wrong) vs. goal.
  // Mirrors DailyGoalBar / computeDayStreak / classifyDay.
  const goalMet = correctCount + wrongCount >= dailyGoal;
  await db.dailySummaries.put({
    date: today,
    moduleId,
    correctCount,
    wrongCount,
    dailyGoal,
    goalMet,
  });
}
