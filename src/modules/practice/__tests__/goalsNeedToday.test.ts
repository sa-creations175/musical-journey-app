// @vitest-environment jsdom
/**
 * Phase B Step 7 / 7b — GoalsNeedTodayScreen data layer tests.
 *
 * Fixture-driven: the pure `summarizeGoalsNeedToday` is the heart of
 * the screen's view-model and tests run literal ModuleWeeklyNeed
 * fixtures through it. Per-module minutes is the TODAY'S SLICE
 * (computeModuleSessionNeed) — the Step 7b fix — not the keystone's
 * weekly-remaining estimatedMinutesNeeded. The async wrapper gets a
 * focused integration test against a fake IndexedDB so we cover the
 * "practiced today?" + consistency-goal paths that the keystone
 * alone can't tell us about.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  loadGoalsNeedToday,
  startOfLocalDay,
  summarizeGoalsNeedToday,
  type GoalsNeedTodayEntry,
  type GoalsNeedTodaySummary,
  type SummarizeGoalsNeedTodayInput,
} from '../goalsNeedToday';
import type {
  ModuleWeeklyNeed,
  WeeklyPace,
} from '../../../lib/sessionAlgorithm/moduleWeeklyNeed';
import { db, type Goal, type PracticeSession } from '../../../lib/db';

function need(partial: Partial<ModuleWeeklyNeed> & {
  moduleId: ModuleWeeklyNeed['moduleId'];
}): ModuleWeeklyNeed {
  return {
    targetAttemptsThisWeek: 100,
    completedAttemptsThisWeek: 30,
    remainingAttempts: 70,
    estimatedMinutesNeeded: 35,
    pace: 'on-pace',
    overPractice: 'none',
    ...partial,
  };
}

/** Build a SummarizeGoalsNeedTodayInput with sensible defaults. The
 *  formula default (consistency 5, calendar 4 — mid-week) makes the
 *  example fixture's today-slice math come out to a clean number:
 *  HF (100/30, 5-day cadence, 4 days left, 30s seed) →
 *    daily_target = 20, fractional_days_done = 1.5,
 *    sessions_left = min(max(5-1.5,1), 4) = 3.5,
 *    attempts_today = ceil(70/3.5) = 20,
 *    time_today = 20 × 30 = 600s = 10 min. */
function input(
  partial: Partial<SummarizeGoalsNeedTodayInput> & {
    needs: ModuleWeeklyNeed[];
  },
): SummarizeGoalsNeedTodayInput {
  return {
    practicedToday: false,
    consistencyTargetDays: 5,
    calendarDaysRemainingInWeek: 4,
    ...partial,
  };
}

function entry(moduleId: GoalsNeedTodayEntry['moduleId']) {
  return (s: GoalsNeedTodaySummary) => s.entries.find(e => e.moduleId === moduleId)!;
}

// =====================================================================
// summarizeGoalsNeedToday — today's-slice math (Step 7b fix)
// =====================================================================

describe('summarizeGoalsNeedToday — today\'s slice replaces weekly remaining', () => {
  it('per-row minutes are today\'s slice, NOT estimatedMinutesNeeded', () => {
    // HF target 100, completed 30, 5-day cadence, 4 days left, 30s
    // seed. Weekly remaining = 70 attempts × 30s = 35 min. Today's
    // slice (the design-doc formula) = 20 attempts × 30s = 10 min.
    const out = summarizeGoalsNeedToday(input({
      needs: [need({
        moduleId: 'harmonic-fluency',
        targetAttemptsThisWeek: 100,
        completedAttemptsThisWeek: 30,
        remainingAttempts: 70,
        estimatedMinutesNeeded: 35, // weekly remaining
      })],
    }));
    const e = entry('harmonic-fluency')(out);
    expect(e.minutes).toBe(10);          // today's slice — NOT 35
    expect(e.attemptsToday).toBe(20);    // formula's attempts_today
    expect(e.perAttemptSeconds).toBe(30);
  });

  it('today\'s slice diverges from weekly remaining for a mid-week on-pace user', () => {
    const need100Done30: ModuleWeeklyNeed = need({
      moduleId: 'harmonic-fluency',
      targetAttemptsThisWeek: 100,
      completedAttemptsThisWeek: 30,
      remainingAttempts: 70,
      estimatedMinutesNeeded: 35,
    });
    const weeklyRemainingMinutes = need100Done30.estimatedMinutesNeeded;
    const todaysSlice = summarizeGoalsNeedToday(input({
      needs: [need100Done30],
    })).entries[0].minutes;
    expect(todaysSlice).toBeLessThan(weeklyRemainingMinutes);
    expect(todaysSlice).toBe(10);
    expect(weeklyRemainingMinutes).toBe(35);
  });

  it('zero consistency cadence → today\'s slice collapses to all remaining work (no NaN)', () => {
    // No consistency goal active. potential_sessions_left floors at
    // 1 (calendar caps it too), so attempts_today = attempts_remaining
    // = 70 and today's slice equals weekly remaining.
    const out = summarizeGoalsNeedToday(input({
      needs: [need({
        moduleId: 'harmonic-fluency',
        targetAttemptsThisWeek: 100,
        completedAttemptsThisWeek: 30,
        remainingAttempts: 70,
        estimatedMinutesNeeded: 35,
      })],
      consistencyTargetDays: 0,
      calendarDaysRemainingInWeek: 7,
    }));
    expect(entry('harmonic-fluency')(out).minutes).toBe(35);
    expect(entry('harmonic-fluency')(out).attemptsToday).toBe(70);
  });

  it('last day of week — calendar cap forces all remaining work into today', () => {
    // 1 calendar day left. potential_sessions_left = 1, so today's
    // slice swallows the whole remaining target. The design-doc
    // calendar-cap branch.
    const out = summarizeGoalsNeedToday(input({
      needs: [need({
        moduleId: 'harmonic-fluency',
        targetAttemptsThisWeek: 100,
        completedAttemptsThisWeek: 20,
        remainingAttempts: 80,
        estimatedMinutesNeeded: 40,
      })],
      calendarDaysRemainingInWeek: 1,
    }));
    expect(entry('harmonic-fluency')(out).attemptsToday).toBe(80);
    expect(entry('harmonic-fluency')(out).minutes).toBe(40);
  });
});

// =====================================================================
// summarizeGoalsNeedToday — per-module rendering (Step 7 contract)
// =====================================================================

describe('summarizeGoalsNeedToday — per-module rendering', () => {
  it('carries pace through unchanged for the pace pill', () => {
    const cases: WeeklyPace[] = ['ahead', 'on-pace', 'behind'];
    for (const pace of cases) {
      const out = summarizeGoalsNeedToday(input({
        needs: [need({ moduleId: 'ear-training', pace })],
      }));
      expect(entry('ear-training')(out).pace).toBe(pace);
    }
  });

  it('derives perAttemptSeconds from the keystone\'s estimatedMinutesNeeded ÷ remainingAttempts', () => {
    // 70 remaining × 30 s = 35 min — recover 30 s/attempt cleanly.
    const out = summarizeGoalsNeedToday(input({
      needs: [need({
        moduleId: 'harmonic-fluency',
        remainingAttempts: 70,
        estimatedMinutesNeeded: 35,
      })],
    }));
    expect(entry('harmonic-fluency')(out).perAttemptSeconds).toBe(30);
  });

  it('flags over-practice when remainingAttempts is 0 — minutes 0, attemptsToday 0, isTargetMet true', () => {
    const out = summarizeGoalsNeedToday(input({
      needs: [need({
        moduleId: 'harmonic-fluency',
        completedAttemptsThisWeek: 120,
        remainingAttempts: 0,
        estimatedMinutesNeeded: 0,
        pace: 'ahead',
      })],
    }));
    const e = entry('harmonic-fluency')(out);
    expect(e.isTargetMet).toBe(true);
    expect(e.minutes).toBe(0);
    expect(e.attemptsToday).toBe(0);
    expect(e.perAttemptSeconds).toBe(0);
    expect(e.pace).toBe('ahead'); // keystone pace preserved
  });

  it('total minutes sums today\'s-slice entries; over-practice rows contribute 0', () => {
    // HF: 100/30, 5-day, 4 calendar → 10 min today
    // ET: 50/10, 5-day, 4 calendar →
    //   remaining=40, daily=10, frac=1, sessions=min(max(5-1,1),4)=4,
    //   attempts_today=ceil(40/4)=10, time=10×30=300s=5 min.
    // S&P over-practice → 0 min.
    const out = summarizeGoalsNeedToday(input({
      needs: [
        need({
          moduleId: 'harmonic-fluency',
          targetAttemptsThisWeek: 100,
          completedAttemptsThisWeek: 30,
          remainingAttempts: 70,
          estimatedMinutesNeeded: 35,
        }),
        need({
          moduleId: 'ear-training',
          targetAttemptsThisWeek: 50,
          completedAttemptsThisWeek: 10,
          remainingAttempts: 40,
          estimatedMinutesNeeded: 20,
        }),
        need({
          moduleId: 'shapes-and-patterns',
          remainingAttempts: 0,
          estimatedMinutesNeeded: 0,
          pace: 'ahead',
        }),
      ],
    }));
    expect(entry('harmonic-fluency')(out).minutes).toBe(10);
    expect(entry('ear-training')(out).minutes).toBe(5);
    expect(entry('shapes-and-patterns')(out).minutes).toBe(0);
    expect(out.totalMinutes).toBe(15);
  });

  it('preserves input order in the entries array (keystone decides ordering)', () => {
    const out = summarizeGoalsNeedToday(input({
      needs: [
        need({ moduleId: 'production', estimatedMinutesNeeded: 10 }),
        need({ moduleId: 'harmonic-fluency', estimatedMinutesNeeded: 5 }),
      ],
    }));
    expect(out.entries.map(e => e.moduleId)).toEqual([
      'production', 'harmonic-fluency',
    ]);
  });

  it('empty needs → empty entries, total 0 (screen falls back to questionnaire)', () => {
    const out = summarizeGoalsNeedToday(input({ needs: [] }));
    expect(out.entries).toEqual([]);
    expect(out.totalMinutes).toBe(0);
  });
});

// =====================================================================
// summarizeGoalsNeedToday — Practice Consistency nudge
// =====================================================================

describe('summarizeGoalsNeedToday — Practice Consistency nudge', () => {
  it('shows the nudge when the user has not practiced today', () => {
    const out = summarizeGoalsNeedToday(input({
      needs: [need({ moduleId: 'harmonic-fluency' })],
      practicedToday: false,
    }));
    expect(out.showConsistencyNudge).toBe(true);
  });

  it('hides the nudge when a practice session exists today', () => {
    const out = summarizeGoalsNeedToday(input({
      needs: [need({ moduleId: 'harmonic-fluency' })],
      practicedToday: true,
    }));
    expect(out.showConsistencyNudge).toBe(false);
  });

  it('nudge state is independent of whether entries exist', () => {
    expect(summarizeGoalsNeedToday(input({ needs: [], practicedToday: false })).showConsistencyNudge).toBe(true);
    expect(summarizeGoalsNeedToday(input({ needs: [], practicedToday: true })).showConsistencyNudge).toBe(false);
  });
});

// =====================================================================
// startOfLocalDay
// =====================================================================

describe('startOfLocalDay', () => {
  it('returns the start of the local calendar day for a given timestamp', () => {
    const noon = new Date(2026, 4, 14, 13, 27, 41, 123).getTime(); // May 14 13:27:41.123
    const startOfDay = startOfLocalDay(noon);
    const d = new Date(startOfDay);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
    expect(d.getSeconds()).toBe(0);
    expect(d.getMilliseconds()).toBe(0);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(4);
    expect(d.getDate()).toBe(14);
  });
});

// =====================================================================
// loadGoalsNeedToday — integration (Dexie-backed)
// =====================================================================

function mkGoal(partial: Partial<Goal>): Goal {
  const now = Date.now();
  return {
    id: `g-${Math.random().toString(36).slice(2, 8)}`,
    scope: 'weekly',
    status: 'active',
    startDate: now - 6 * 24 * 60 * 60 * 1000,
    targetDate: now + 24 * 60 * 60 * 1000,
    targetMetric: null,
    targetValue: 0,
    targetUnit: 'attempts',
    relatedModules: [],
    isUmbrella: false,
    createdAt: now,
    updatedAt: now,
    ...partial,
  } as Goal;
}

function mkPracticeSession(startedAt: number): PracticeSession {
  return {
    id: `ps-${Math.random().toString(36).slice(2, 8)}`,
    startedAt,
    sessionRole: 'main',
    dayProfileUsed: null,
  } as unknown as PracticeSession;
}

describe('loadGoalsNeedToday — integration', () => {
  beforeEach(async () => {
    await db.goals.clear();
    await db.attempts.clear();
    await db.practiceSessions.clear();
  });

  it('threads "practiced today?" through from db.practiceSessions', async () => {
    const now = Date.now();
    const out = await loadGoalsNeedToday(now);
    expect(out.entries).toEqual([]);
    expect(out.showConsistencyNudge).toBe(true);

    await db.practiceSessions.add(mkPracticeSession(now - 1000));
    const out2 = await loadGoalsNeedToday(now);
    expect(out2.showConsistencyNudge).toBe(false);
  });

  it('yesterday\'s practice session does NOT count as practiced today', async () => {
    const now = Date.now();
    const yesterdayNoon = startOfLocalDay(now) - 12 * 60 * 60 * 1000;
    await db.practiceSessions.add(mkPracticeSession(yesterdayNoon));
    const out = await loadGoalsNeedToday(now);
    expect(out.showConsistencyNudge).toBe(true);
  });

  it('threads the global practice-consistency goal\'s targetValue into the today\'s-slice formula', async () => {
    // Pick a Sunday so calendarDaysRemainingInWeek is deterministic
    // (= 7). HF target 100, completed 30, consistency 5, calendar 7:
    //   daily=20, frac=1.5, sessions=min(max(5-1.5,1), 7)=3.5,
    //   attempts_today=ceil(70/3.5)=20, time=20×30=600s=10 min.
    const sunday = new Date(2026, 0, 4, 9, 0, 0).getTime(); // Jan 4 2026 = Sunday
    await db.goals.add(mkGoal({
      relatedModules: ['harmonic-fluency'],
      targetValue: 100,
      startDate: sunday - 1000,
      targetDate: sunday + 7 * 24 * 60 * 60 * 1000,
    }));
    await db.goals.add(mkGoal({
      scope: 'monthly',
      targetMetric: 'practice_days_per_cadence',
      targetUnit: null,
      targetValue: 5,
      relatedModules: ['practice-consistency'],
      startDate: sunday - 1000,
      targetDate: sunday + 30 * 24 * 60 * 60 * 1000,
    }));
    // Seed 30 HF attempts within the current week so the keystone's
    // remainingAttempts lands at 70.
    for (let i = 0; i < 30; i++) {
      await db.attempts.add({
        moduleId: 'harmonic-fluency',
        itemId: `seed-${i}`,
        correct: true,
        timestamp: sunday + i,
      });
    }

    const out = await loadGoalsNeedToday(sunday);
    expect(out.entries).toHaveLength(1);
    expect(out.entries[0].moduleId).toBe('harmonic-fluency');
    expect(out.entries[0].attemptsToday).toBe(20);
    expect(out.entries[0].minutes).toBe(10);
  });

  it('without a consistency goal, today\'s slice falls back to all remaining work', async () => {
    // Same setup as above MINUS the consistency goal. With
    // consistencyTargetDays = 0, daily_target collapses to 0,
    // fractional_days = 0, potential_sessions_left = max(0,1) = 1
    // (capped by calendar) → today's slice = all remaining.
    const sunday = new Date(2026, 0, 4, 9, 0, 0).getTime();
    await db.goals.add(mkGoal({
      relatedModules: ['harmonic-fluency'],
      targetValue: 100,
      startDate: sunday - 1000,
      targetDate: sunday + 7 * 24 * 60 * 60 * 1000,
    }));
    const out = await loadGoalsNeedToday(sunday);
    expect(out.entries[0].attemptsToday).toBe(100);
    expect(out.entries[0].minutes).toBe(50); // 100 × 30 s
  });
});
