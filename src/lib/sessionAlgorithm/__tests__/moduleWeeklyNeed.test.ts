// @vitest-environment jsdom
/**
 * Phase B Step 5 — computeModuleWeeklyNeeds + classifyWeeklyPace
 * fixture tests.
 *
 * Pure / fixture-driven by design: every test calls the keystone with
 * literal numbers — no db, no clock — so behaviour is pinned by the
 * fixtures, not by ambient state. A small set of integration tests at
 * the bottom exercises the async wrapper's distinctive paths
 * (Production uses the rated-session count, ET threads the
 * sub-activity breakdown) against a fake IndexedDB.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  classifyWeeklyPace,
  computeModuleWeeklyNeeds,
  loadModuleWeeklyNeeds,
  PACE_TOLERANCE,
  type ModuleWeeklyNeedInput,
} from '../moduleWeeklyNeed';
import {
  PRODUCTION_TIME_RANGE_MINUTES,
  SHAPES_DEFAULT_TIME_PER_REP_MINUTES,
  TIME_PER_ATTEMPT_MINUTES,
  TIME_PER_ATTEMPT_SECONDS,
} from '../timePerAttempt';
import { db, type Goal, type ProductionLessonSession, type AttemptRecord } from '../../db';
import { startOfWeekLocal, endOfWeekLocal } from '../../../modules/goals/weeklyPlanData';

const DAY = 24 * 60 * 60 * 1000;
const WEEK_START = 1_700_000_000_000;
const WEEK_END = WEEK_START + 7 * DAY;

// Expected per-attempt seeds, in minutes, derived the same way the
// keystone does — so assertions are exact (no float fuzz) and the
// "right seed per module" check is self-documenting.
const MIN_PER_ATTEMPT = {
  'harmonic-fluency': TIME_PER_ATTEMPT_SECONDS['harmonic-fluency'] / 60,
  'ear-training':     TIME_PER_ATTEMPT_SECONDS['ear-training'] / 60,
  'shapes-and-patterns': SHAPES_DEFAULT_TIME_PER_REP_MINUTES,
  'repertoire':       TIME_PER_ATTEMPT_MINUTES['repertoire'],
  'production':
    (PRODUCTION_TIME_RANGE_MINUTES.minPerLesson
      + PRODUCTION_TIME_RANGE_MINUTES.maxPerLesson) / 2,
} as const;

// =====================================================================
// classifyWeeklyPace — pace boundary tests
// =====================================================================

describe('classifyWeeklyPace', () => {
  it('mid-week on-pace — actual ≈ expected', () => {
    // day index 3 → expected = 3/7. completed 30 / target 70 = 3/7.
    const pace = classifyWeeklyPace(
      WEEK_START, WEEK_END, WEEK_START + 3 * DAY, 70, 30,
    );
    expect(pace).toBe('on-pace');
  });

  it('mid-week ahead — actual well above expected + tolerance', () => {
    // day 3, expected 3/7 ≈ 0.4286, +tolerance ≈ 0.5786. actual = 0.6.
    const pace = classifyWeeklyPace(
      WEEK_START, WEEK_END, WEEK_START + 3 * DAY, 70, 42,
    );
    expect(pace).toBe('ahead');
  });

  it('mid-week behind — actual well below expected − tolerance', () => {
    // day 3, expected 0.4286, −tolerance ≈ 0.2786. actual = 15/70 = 0.2143.
    const pace = classifyWeeklyPace(
      WEEK_START, WEEK_END, WEEK_START + 3 * DAY, 70, 15,
    );
    expect(pace).toBe('behind');
  });

  it('+tolerance boundary on day 0 — exactly at boundary is on-pace, not ahead', () => {
    // day 0, expected 0. actual = 15/100 = 0.15 ≡ expected + tolerance.
    // ahead is strict `>`, so the boundary itself stays on-pace.
    expect(PACE_TOLERANCE).toBe(0.15);
    expect(classifyWeeklyPace(WEEK_START, WEEK_END, WEEK_START, 100, 15)).toBe('on-pace');
    expect(classifyWeeklyPace(WEEK_START, WEEK_END, WEEK_START, 100, 16)).toBe('ahead');
    expect(classifyWeeklyPace(WEEK_START, WEEK_END, WEEK_START, 100, 14)).toBe('on-pace');
  });

  it('−tolerance boundary region — just inside is on-pace, just outside is behind', () => {
    // day 6, expected 6/7 ≈ 0.857, −tolerance ≈ 0.707.
    // 50/70 ≈ 0.714 (just above floor) → on-pace.
    // 49/70 = 0.700 (just below floor)   → behind.
    expect(classifyWeeklyPace(WEEK_START, WEEK_END, WEEK_START + 6 * DAY, 70, 50)).toBe('on-pace');
    expect(classifyWeeklyPace(WEEK_START, WEEK_END, WEEK_START + 6 * DAY, 70, 49)).toBe('behind');
  });

  it('zero (or negative) target → on-pace — nothing to be behind on', () => {
    expect(classifyWeeklyPace(WEEK_START, WEEK_END, WEEK_START + 3 * DAY, 0, 0)).toBe('on-pace');
    expect(classifyWeeklyPace(WEEK_START, WEEK_END, WEEK_START + 3 * DAY, 0, 50)).toBe('on-pace');
    expect(classifyWeeklyPace(WEEK_START, WEEK_END, WEEK_START + 3 * DAY, -5, 0)).toBe('on-pace');
  });

  it('today clamps into [weekStart, weekEnd] — out-of-window does not skew the day index', () => {
    // Before the window → dayIndex floors at 0.
    expect(classifyWeeklyPace(WEEK_START, WEEK_END, WEEK_START - 5 * DAY, 100, 0)).toBe('on-pace');
    // After the window → dayIndex caps at 6 (treats the user as
    // "end of week"). 30/100 = 0.30, expected 6/7 − 0.15 ≈ 0.707 → behind.
    expect(classifyWeeklyPace(WEEK_START, WEEK_END, WEEK_END + 5 * DAY, 100, 30)).toBe('behind');
  });
});

// =====================================================================
// computeModuleWeeklyNeeds — per-module need
// =====================================================================

// Mid-week reference timestamp used for the per-module need tests —
// keeps pace classification consistent without it being the focus.
const TODAY = WEEK_START + 3 * DAY;

function need(input: ModuleWeeklyNeedInput) {
  return computeModuleWeeklyNeeds(WEEK_START, WEEK_END, TODAY, [input])[0];
}

describe('computeModuleWeeklyNeeds — per-module remaining + minutes', () => {
  it('harmonic-fluency uses TIME_PER_ATTEMPT_SECONDS (30 s)', () => {
    const out = need({
      moduleId: 'harmonic-fluency',
      targetAttemptsThisWeek: 100,
      completedAttemptsThisWeek: 30,
    });
    expect(out.moduleId).toBe('harmonic-fluency');
    expect(out.remainingAttempts).toBe(70);
    expect(out.estimatedMinutesNeeded).toBe(70 * MIN_PER_ATTEMPT['harmonic-fluency']);
    expect(out.estimatedMinutesNeeded).toBe(35); // sanity: 70 × 0.5
  });

  it('ear-training uses the ET per-attempt seed (30 s)', () => {
    const out = need({
      moduleId: 'ear-training',
      targetAttemptsThisWeek: 200,
      completedAttemptsThisWeek: 80,
    });
    expect(out.remainingAttempts).toBe(120);
    expect(out.estimatedMinutesNeeded).toBe(120 * MIN_PER_ATTEMPT['ear-training']);
    expect(out.estimatedMinutesNeeded).toBe(60);
  });

  it('shapes-and-patterns uses the catalog-weighted rep average', () => {
    const out = need({
      moduleId: 'shapes-and-patterns',
      targetAttemptsThisWeek: 50,
      completedAttemptsThisWeek: 20,
    });
    expect(out.remainingAttempts).toBe(30);
    expect(out.estimatedMinutesNeeded).toBe(30 * MIN_PER_ATTEMPT['shapes-and-patterns']);
  });

  it('repertoire uses the per-cell-session midpoint (17.5 min)', () => {
    const out = need({
      moduleId: 'repertoire',
      targetAttemptsThisWeek: 10,
      completedAttemptsThisWeek: 4,
    });
    expect(out.remainingAttempts).toBe(6);
    expect(out.estimatedMinutesNeeded).toBe(6 * MIN_PER_ATTEMPT['repertoire']);
    expect(out.estimatedMinutesNeeded).toBe(105);
  });

  it('production uses the lesson-range midpoint (60 min) — matches dailyGoalNeed.ts', () => {
    const out = need({
      moduleId: 'production',
      targetAttemptsThisWeek: 5,
      completedAttemptsThisWeek: 2,
    });
    expect(out.remainingAttempts).toBe(3);
    expect(out.estimatedMinutesNeeded).toBe(3 * MIN_PER_ATTEMPT['production']);
    expect(out.estimatedMinutesNeeded).toBe(180);
  });
});

// =====================================================================
// computeModuleWeeklyNeeds — ET sub-activity breakdown
// =====================================================================

describe('computeModuleWeeklyNeeds — ET sub-activity breakdown', () => {
  it('attaches intervals + chord-recognition sub-entries when the input has a breakdown', () => {
    const out = need({
      moduleId: 'ear-training',
      targetAttemptsThisWeek: 100,
      completedAttemptsThisWeek: 40,
      earTrainingBreakdown: { intervals: 24, chordRecognition: 12 },
    });
    expect(out.subActivities).toEqual([
      { subActivity: 'intervals',         completedAttemptsThisWeek: 24 },
      { subActivity: 'chord-recognition', completedAttemptsThisWeek: 12 },
    ]);
    // The module-level completed is still the full total — the
    // "other" ET sub-modules (chord-progressions, scales-modes) live
    // in the gap between sub-entries and the total.
    expect(out.completedAttemptsThisWeek).toBe(40);
    expect(
      out.subActivities!.reduce((s, sa) => s + sa.completedAttemptsThisWeek, 0),
    ).toBeLessThanOrEqual(out.completedAttemptsThisWeek);
  });

  it('non-ET modules never carry sub-entries — even if the field is somehow set', () => {
    const out = need({
      moduleId: 'harmonic-fluency',
      targetAttemptsThisWeek: 50,
      completedAttemptsThisWeek: 10,
      // Defensive: callers shouldn't pass this on non-ET, but the
      // pure function must not surface it as a sub-entry either.
      earTrainingBreakdown: { intervals: 1, chordRecognition: 2 },
    });
    expect(out.subActivities).toBeUndefined();
  });

  it('ET without breakdown — sub-entries are simply absent', () => {
    const out = need({
      moduleId: 'ear-training',
      targetAttemptsThisWeek: 50,
      completedAttemptsThisWeek: 10,
    });
    expect(out.subActivities).toBeUndefined();
  });
});

// =====================================================================
// computeModuleWeeklyNeeds — edge cases
// =====================================================================

describe('computeModuleWeeklyNeeds — edge cases', () => {
  it('zero target → remaining 0, minutes 0, pace on-pace', () => {
    const out = need({
      moduleId: 'harmonic-fluency',
      targetAttemptsThisWeek: 0,
      completedAttemptsThisWeek: 0,
    });
    expect(out.remainingAttempts).toBe(0);
    expect(out.estimatedMinutesNeeded).toBe(0);
    expect(out.pace).toBe('on-pace');
  });

  it('over-completed → remaining floored at 0 (not negative), minutes 0', () => {
    const out = need({
      moduleId: 'harmonic-fluency',
      targetAttemptsThisWeek: 100,
      completedAttemptsThisWeek: 130,
    });
    expect(out.remainingAttempts).toBe(0);
    expect(out.estimatedMinutesNeeded).toBe(0);
    // Completed > target naturally classifies as ahead.
    expect(out.pace).toBe('ahead');
  });

  it('exactly complete → remaining 0, minutes 0', () => {
    const out = need({
      moduleId: 'ear-training',
      targetAttemptsThisWeek: 200,
      completedAttemptsThisWeek: 200,
    });
    expect(out.remainingAttempts).toBe(0);
    expect(out.estimatedMinutesNeeded).toBe(0);
  });

  it('empty input → empty output (no modules with active weekly goals)', () => {
    expect(computeModuleWeeklyNeeds(WEEK_START, WEEK_END, TODAY, [])).toEqual([]);
  });

  it('preserves input order in the output array', () => {
    const out = computeModuleWeeklyNeeds(WEEK_START, WEEK_END, TODAY, [
      { moduleId: 'production',          targetAttemptsThisWeek: 5,   completedAttemptsThisWeek: 1 },
      { moduleId: 'harmonic-fluency',    targetAttemptsThisWeek: 100, completedAttemptsThisWeek: 30 },
      { moduleId: 'shapes-and-patterns', targetAttemptsThisWeek: 50,  completedAttemptsThisWeek: 10 },
    ]);
    expect(out.map(n => n.moduleId)).toEqual([
      'production', 'harmonic-fluency', 'shapes-and-patterns',
    ]);
  });
});

// =====================================================================
// loadModuleWeeklyNeeds — wrapper integration
// =====================================================================
//
// The wrapper is the thin Dexie pass-through above the pure keystone.
// Two focused integration tests pin the bits that AREN'T covered by
// the pure layer: (a) the wrapper picks the right modules from the
// active weekly goals, and (b) it counts Production from rated
// ProductionLessonSession rows, NOT the legacy spacingState walk.

function mkGoal(partial: Partial<Goal>): Goal {
  return {
    id: `g-${Math.random().toString(36).slice(2, 8)}`,
    scope: 'weekly',
    status: 'active',
    startDate: WEEK_START,
    targetDate: WEEK_END,
    targetMetric: null,
    targetValue: 0,
    targetUnit: 'attempts',
    relatedModules: [],
    isUmbrella: false,
    createdAt: WEEK_START,
    updatedAt: WEEK_START,
    ...partial,
  } as Goal;
}

async function clearAll() {
  await db.goals.clear();
  await db.attempts.clear();
  await db.drillSessions.clear();
  await db.songCellRunThroughs.clear();
  await db.productionLessonSessions.clear();
  await db.spacingState.clear();
  await db.practiceSessions.clear();
}

describe('loadModuleWeeklyNeeds — wrapper integration', () => {
  beforeEach(clearAll);

  it('threads ET completed counts + sub-activity breakdown through the pure layer', async () => {
    // ET weekly goal, anchored mid-week so today ∈ [start, target].
    const today = WEEK_START + 3 * DAY;
    const ws = startOfWeekLocal(today);
    const we = endOfWeekLocal(ws);
    await db.goals.add(mkGoal({
      relatedModules: ['ear-training'],
      targetValue: 100,
      startDate: ws,
      targetDate: we,
    }));
    const inWindow = ws + DAY;
    const et: Array<Omit<AttemptRecord, 'id'>> = [
      { moduleId: 'intervals',          itemId: 'M3',     correct: true, timestamp: inWindow },
      { moduleId: 'intervals',          itemId: 'P5',     correct: true, timestamp: inWindow },
      { moduleId: 'chord-recognition',  itemId: 'maj',    correct: true, timestamp: inWindow },
      { moduleId: 'chord-progressions', itemId: 'I-V',    correct: true, timestamp: inWindow },
    ];
    for (const a of et) await db.attempts.add(a);

    const result = await loadModuleWeeklyNeeds(today);
    const etNeed = result.find(n => n.moduleId === 'ear-training');
    expect(etNeed).toBeDefined();
    expect(etNeed!.targetAttemptsThisWeek).toBe(100);
    expect(etNeed!.completedAttemptsThisWeek).toBe(4); // all ET rows
    expect(etNeed!.remainingAttempts).toBe(96);
    expect(etNeed!.subActivities).toEqual([
      { subActivity: 'intervals',         completedAttemptsThisWeek: 2 },
      { subActivity: 'chord-recognition', completedAttemptsThisWeek: 1 },
    ]);
  });

  it('counts Production from rated lesson sessions, not the legacy spacingState walk', async () => {
    const today = WEEK_START + 3 * DAY;
    const ws = startOfWeekLocal(today);
    const we = endOfWeekLocal(ws);
    await db.goals.add(mkGoal({
      relatedModules: ['production'],
      targetValue: 5,
      startDate: ws,
      targetDate: we,
    }));
    // One rated lesson session inside the window — should count.
    const rated: ProductionLessonSession = {
      id: 'pls-rated',
      lessonId: 'wf-01',
      timestamp: ws + DAY,
      startedAt: ws + DAY - 600_000,
      durationSeconds: 600,
      openedDeepDive: false,
      rating: 'cruising',
    };
    // One unrated open event inside the window — should NOT count.
    const open: ProductionLessonSession = {
      id: 'pls-open',
      lessonId: 'wf-01',
      timestamp: ws + DAY,
      openedDeepDive: false,
    };
    await db.productionLessonSessions.bulkAdd([rated, open]);

    const result = await loadModuleWeeklyNeeds(today);
    const prod = result.find(n => n.moduleId === 'production');
    expect(prod).toBeDefined();
    expect(prod!.completedAttemptsThisWeek).toBe(1); // rated only
    expect(prod!.targetAttemptsThisWeek).toBe(5);
    expect(prod!.remainingAttempts).toBe(4);
  });

  it('returns [] when there are no active weekly coverage goals', async () => {
    const result = await loadModuleWeeklyNeeds(WEEK_START + 3 * DAY);
    expect(result).toEqual([]);
  });
});
