// @vitest-environment jsdom
/**
 * Phase B Step 7 — GoalsNeedTodayScreen data layer tests.
 *
 * Fixture-driven: the pure `summarizeGoalsNeedToday` is the heart of
 * the screen's view-model and tests run literal ModuleWeeklyNeed
 * fixtures through it. The async wrapper (`loadGoalsNeedToday`) gets
 * a focused integration test against a fake IndexedDB so we cover
 * the "practiced today?" path that the keystone alone can't tell us
 * about.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  loadGoalsNeedToday,
  startOfLocalDay,
  summarizeGoalsNeedToday,
  type GoalsNeedTodayEntry,
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
    ...partial,
  };
}

function entry(moduleId: GoalsNeedTodayEntry['moduleId']) {
  return (s: ReturnType<typeof summarizeGoalsNeedToday>) =>
    s.entries.find(e => e.moduleId === moduleId)!;
}

// =====================================================================
// summarizeGoalsNeedToday — per-module rendering
// =====================================================================

describe('summarizeGoalsNeedToday — per-module rendering', () => {
  it('maps estimatedMinutesNeeded (rounded) into the minutes field', () => {
    const out = summarizeGoalsNeedToday(
      [need({ moduleId: 'harmonic-fluency', estimatedMinutesNeeded: 35 })],
      false,
    );
    expect(entry('harmonic-fluency')(out).minutes).toBe(35);
  });

  it('carries pace through unchanged for the pace pill', () => {
    const cases: WeeklyPace[] = ['ahead', 'on-pace', 'behind'];
    for (const pace of cases) {
      const out = summarizeGoalsNeedToday(
        [need({ moduleId: 'ear-training', pace })],
        false,
      );
      expect(entry('ear-training')(out).pace).toBe(pace);
    }
  });

  it('derives perAttemptSeconds from estimatedMinutesNeeded ÷ remainingAttempts', () => {
    // 70 remaining × 30 s = 35 min — recover 30 s/attempt cleanly.
    const out = summarizeGoalsNeedToday(
      [need({
        moduleId: 'harmonic-fluency',
        remainingAttempts: 70,
        estimatedMinutesNeeded: 35,
      })],
      false,
    );
    expect(entry('harmonic-fluency')(out).perAttemptSeconds).toBe(30);
  });

  it('flags over-practice when remainingAttempts is 0 — minutes 0, isTargetMet true, pace preserved', () => {
    const out = summarizeGoalsNeedToday(
      [need({
        moduleId: 'harmonic-fluency',
        completedAttemptsThisWeek: 120,
        remainingAttempts: 0,
        estimatedMinutesNeeded: 0,
        pace: 'ahead',
      })],
      false,
    );
    const e = entry('harmonic-fluency')(out);
    expect(e.isTargetMet).toBe(true);
    expect(e.minutes).toBe(0);
    expect(e.perAttemptSeconds).toBe(0);
    expect(e.pace).toBe('ahead');
  });

  it('total minutes sums entries; over-practice rows contribute 0', () => {
    const out = summarizeGoalsNeedToday(
      [
        need({ moduleId: 'harmonic-fluency', estimatedMinutesNeeded: 35 }),
        need({ moduleId: 'ear-training',     estimatedMinutesNeeded: 20 }),
        need({
          moduleId: 'shapes-and-patterns',
          remainingAttempts: 0,
          estimatedMinutesNeeded: 0,
          pace: 'ahead',
        }),
      ],
      false,
    );
    expect(out.totalMinutes).toBe(55); // 35 + 20 + 0
  });

  it('preserves input order in the entries array (no MODULE_ORDER reshuffle — keystone decides ordering)', () => {
    const out = summarizeGoalsNeedToday(
      [
        need({ moduleId: 'production', estimatedMinutesNeeded: 10 }),
        need({ moduleId: 'harmonic-fluency', estimatedMinutesNeeded: 5 }),
      ],
      false,
    );
    expect(out.entries.map(e => e.moduleId)).toEqual([
      'production', 'harmonic-fluency',
    ]);
  });

  it('empty needs → empty entries, total 0 (screen falls back to questionnaire)', () => {
    const out = summarizeGoalsNeedToday([], false);
    expect(out.entries).toEqual([]);
    expect(out.totalMinutes).toBe(0);
  });
});

// =====================================================================
// summarizeGoalsNeedToday — Practice Consistency nudge
// =====================================================================

describe('summarizeGoalsNeedToday — Practice Consistency nudge', () => {
  it('shows the nudge when the user has not practiced today', () => {
    const out = summarizeGoalsNeedToday(
      [need({ moduleId: 'harmonic-fluency' })],
      false,
    );
    expect(out.showConsistencyNudge).toBe(true);
  });

  it('hides the nudge when a practice session exists today', () => {
    const out = summarizeGoalsNeedToday(
      [need({ moduleId: 'harmonic-fluency' })],
      true,
    );
    expect(out.showConsistencyNudge).toBe(false);
  });

  it('nudge state is independent of whether entries exist', () => {
    expect(summarizeGoalsNeedToday([], false).showConsistencyNudge).toBe(true);
    expect(summarizeGoalsNeedToday([], true).showConsistencyNudge).toBe(false);
  });
});

// =====================================================================
// startOfLocalDay
// =====================================================================

describe('startOfLocalDay', () => {
  it('returns the start of the local calendar day for a given timestamp', () => {
    // Pick a mid-day timestamp and verify zeroing of h/m/s/ms.
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
    // No goal — empty entries, but the nudge logic should still
    // fire correctly off the practice-session count.
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

  it('pulls keystone needs from active weekly goals + threads them into entries', async () => {
    const now = Date.now();
    await db.goals.add(mkGoal({
      relatedModules: ['harmonic-fluency'],
      targetValue: 100,
    }));
    // No attempts yet → completed 0, remaining 100 — but it's the
    // first day of the week here (a degenerate window for our fake;
    // pace will be on-pace).
    const out = await loadGoalsNeedToday(now);
    expect(out.entries).toHaveLength(1);
    expect(out.entries[0].moduleId).toBe('harmonic-fluency');
    expect(out.entries[0].remainingAttempts).toBe(100);
    // 100 × 30 s = 3000 s = 50 min.
    expect(out.entries[0].minutes).toBe(50);
  });
});
