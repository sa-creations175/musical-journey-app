// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  getWeeklyAttempts,
  getWeeklyTimeEstimate,
  PRODUCTION_TIME_RANGE_MINUTES,
  TIME_PER_ATTEMPT_MINUTES,
} from '../weeklyAttempts';
import {
  db,
  type AttemptRecord,
  type DrillSession,
  type PracticeSession,
  type SongCellRunThrough,
  type SpacingState,
} from '../db';

// Sunday May 11, 2025 00:00 local-ish — picked an arbitrary epoch so
// the math is transparent. Week ends at + 7 days.
const WEEK_START = 1_700_000_000_000;
const WEEK_END = WEEK_START + 7 * 24 * 60 * 60 * 1000;
const BEFORE = WEEK_START - 60_000;            // 1 minute before week
const AFTER = WEEK_END + 60_000;               // 1 minute after week
const MID_WEEK = WEEK_START + 3 * 24 * 60 * 60 * 1000;

describe('getWeeklyTimeEstimate — point estimates', () => {
  it('HF: 20 sec per attempt → minutes scale', () => {
    expect(getWeeklyTimeEstimate('harmonic-fluency', 0)).toEqual({ kind: 'point', minutes: 0 });
    expect(getWeeklyTimeEstimate('harmonic-fluency', 3)).toEqual({
      kind: 'point',
      minutes: 3 * (20 / 60),
    });
    expect(getWeeklyTimeEstimate('harmonic-fluency', 60)).toEqual({
      kind: 'point',
      minutes: 60 * (20 / 60),
    }); // 20 minutes for 60 cards
  });

  it('ET: 20 sec per attempt — same as HF', () => {
    expect(getWeeklyTimeEstimate('ear-training', 90)).toEqual({
      kind: 'point',
      minutes: 90 * (20 / 60),
    });
  });

  it('Shapes: 5 minutes per rep', () => {
    expect(getWeeklyTimeEstimate('shapes-and-patterns', 6)).toEqual({
      kind: 'point',
      minutes: 30,
    });
  });

  it('Repertoire: 17.5 minutes per cell session', () => {
    expect(getWeeklyTimeEstimate('repertoire', 4)).toEqual({
      kind: 'point',
      minutes: 70,
    });
  });

  it('Practice Consistency: 45 minutes per session', () => {
    expect(getWeeklyTimeEstimate('practice-consistency', 5)).toEqual({
      kind: 'point',
      minutes: 225,
    });
  });
});

describe('getWeeklyTimeEstimate — Production range', () => {
  it('Production: 30–90 min per lesson scales to a range', () => {
    expect(getWeeklyTimeEstimate('production', 0)).toEqual({
      kind: 'range',
      minMinutes: 0,
      maxMinutes: 0,
    });
    expect(getWeeklyTimeEstimate('production', 2)).toEqual({
      kind: 'range',
      minMinutes: 60,
      maxMinutes: 180,
    });
    expect(getWeeklyTimeEstimate('production', 4)).toEqual({
      kind: 'range',
      minMinutes: 4 * PRODUCTION_TIME_RANGE_MINUTES.minPerLesson,
      maxMinutes: 4 * PRODUCTION_TIME_RANGE_MINUTES.maxPerLesson,
    });
  });
});

describe('TIME_PER_ATTEMPT_MINUTES — sanity on the per-module constants', () => {
  it('HF and ET share the 20-second-per-attempt rate', () => {
    expect(TIME_PER_ATTEMPT_MINUTES['harmonic-fluency']).toBe(TIME_PER_ATTEMPT_MINUTES['ear-training']);
  });

  it('all non-production modules carry a positive constant', () => {
    for (const moduleId of [
      'harmonic-fluency',
      'ear-training',
      'shapes-and-patterns',
      'repertoire',
      'practice-consistency',
    ] as const) {
      expect(TIME_PER_ATTEMPT_MINUTES[moduleId]).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------
// getWeeklyAttempts — Dexie-backed, per-module dispatch
// ---------------------------------------------------------------------

describe('getWeeklyAttempts — HF', () => {
  beforeEach(async () => {
    await db.attempts.clear();
  });

  it('counts only harmonic-fluency attempts within the week', async () => {
    const attempts: Array<Omit<AttemptRecord, 'id'>> = [
      { moduleId: 'harmonic-fluency', itemId: 'maj', correct: true,  timestamp: MID_WEEK },
      { moduleId: 'harmonic-fluency', itemId: 'min', correct: false, timestamp: WEEK_START + 1 },
      { moduleId: 'harmonic-fluency', itemId: 'maj', correct: true,  timestamp: BEFORE },   // before window
      { moduleId: 'harmonic-fluency', itemId: 'maj', correct: true,  timestamp: AFTER },    // after window
      { moduleId: 'intervals',        itemId: 'M3',  correct: true,  timestamp: MID_WEEK }, // wrong module
    ];
    for (const a of attempts) await db.attempts.add(a);

    expect(await getWeeklyAttempts('harmonic-fluency', WEEK_START, WEEK_END)).toBe(2);
  });

  it('treats weekStart and weekEnd as inclusive boundaries', async () => {
    await db.attempts.add({
      moduleId: 'harmonic-fluency', itemId: 'maj', correct: true,
      timestamp: WEEK_START,
    });
    await db.attempts.add({
      moduleId: 'harmonic-fluency', itemId: 'maj', correct: true,
      timestamp: WEEK_END,
    });
    expect(await getWeeklyAttempts('harmonic-fluency', WEEK_START, WEEK_END)).toBe(2);
  });
});

describe('getWeeklyAttempts — ET', () => {
  beforeEach(async () => {
    await db.attempts.clear();
  });

  it('aggregates across all four ET sub-module ids', async () => {
    const attempts: Array<Omit<AttemptRecord, 'id'>> = [
      { moduleId: 'intervals',          itemId: 'M3', correct: true, timestamp: MID_WEEK },
      { moduleId: 'chord-recognition',  itemId: 'maj', correct: true, timestamp: MID_WEEK },
      { moduleId: 'chord-progressions', itemId: 'I-V', correct: true, timestamp: MID_WEEK },
      { moduleId: 'scales-modes',       itemId: 'dorian', correct: true, timestamp: MID_WEEK },
      { moduleId: 'harmonic-fluency',   itemId: 'maj', correct: true, timestamp: MID_WEEK }, // not ET
    ];
    for (const a of attempts) await db.attempts.add(a);
    expect(await getWeeklyAttempts('ear-training', WEEK_START, WEEK_END)).toBe(4);
  });
});

describe('getWeeklyAttempts — Shapes', () => {
  beforeEach(async () => {
    await db.drillSessions.clear();
  });

  it('counts drillSessions within the window', async () => {
    const rows: DrillSession[] = [
      { id: 's1', drillTypeId: 'dt1', skillId: 'sk1', durationSeconds: 60, feelRating: 3, timestamp: WEEK_START },
      { id: 's2', drillTypeId: 'dt1', skillId: 'sk1', durationSeconds: 60, feelRating: 3, timestamp: MID_WEEK },
      { id: 's3', drillTypeId: 'dt1', skillId: 'sk1', durationSeconds: 60, feelRating: 3, timestamp: WEEK_END },
      { id: 's4', drillTypeId: 'dt1', skillId: 'sk1', durationSeconds: 60, feelRating: 3, timestamp: BEFORE },
      { id: 's5', drillTypeId: 'dt1', skillId: 'sk1', durationSeconds: 60, feelRating: 3, timestamp: AFTER },
    ];
    await db.drillSessions.bulkAdd(rows);
    expect(await getWeeklyAttempts('shapes-and-patterns', WEEK_START, WEEK_END)).toBe(3);
  });
});

describe('getWeeklyAttempts — Repertoire', () => {
  beforeEach(async () => {
    await db.songCellRunThroughs.clear();
  });

  it('counts songCellRunThroughs within the window', async () => {
    const rows: SongCellRunThrough[] = [
      { id: 'r1', cellId: 'c1', songId: 'song-a', sectionId: 'sec-a', songKeyId: 'key-c', wasClean: true,  tempoBpm: 80, notes: null, createdAt: MID_WEEK },
      { id: 'r2', cellId: 'c1', songId: 'song-a', sectionId: 'sec-a', songKeyId: 'key-c', wasClean: false, tempoBpm: 80, notes: null, createdAt: MID_WEEK + 1 },
      { id: 'r3', cellId: 'c2', songId: 'song-b', sectionId: 'sec-b', songKeyId: 'key-d', wasClean: true,  tempoBpm: 80, notes: null, createdAt: BEFORE },
    ];
    await db.songCellRunThroughs.bulkAdd(rows);
    expect(await getWeeklyAttempts('repertoire', WEEK_START, WEEK_END)).toBe(2);
  });
});

describe('getWeeklyAttempts — Production', () => {
  beforeEach(async () => {
    await db.spacingState.clear();
  });

  function spacing(partial: Partial<SpacingState> & { performanceHistory: SpacingState['performanceHistory'] }): SpacingState {
    return {
      id: `row-${Math.random().toString(36).slice(2, 8)}`,
      itemRef: 'lesson-x',
      moduleRef: 'production',
      memoryType: 'integration',
      acquisitionStage: 'acquiring',
      currentIntervalDays: 0,
      lastEngagedAt: null,
      nextDueAt: null,
      ...partial,
    };
  }

  it('counts performanceHistory entries within the window on production rows', async () => {
    await db.spacingState.add(
      spacing({
        id: 'row-1',
        moduleRef: 'production',
        performanceHistory: [
          { t: BEFORE,    kind: 'rating', rating: 'cruising' }, // before
          { t: WEEK_START, kind: 'rating', rating: 'flying' },  // boundary
          { t: MID_WEEK,  kind: 'rating', rating: 'crawling' }, // in
          { t: AFTER,     kind: 'rating', rating: 'cruising' }, // after
        ],
      }),
    );
    expect(await getWeeklyAttempts('production', WEEK_START, WEEK_END)).toBe(2);
  });

  it('skips recency entries (passive surfacing, not state changes)', async () => {
    await db.spacingState.add(
      spacing({
        id: 'row-1',
        moduleRef: 'production',
        performanceHistory: [
          { t: MID_WEEK, kind: 'rating', rating: 'cruising' },
          { t: MID_WEEK + 1, kind: 'recency' },                  // skipped
          { t: MID_WEEK + 2, kind: 'rating', rating: 'flying' },
        ],
      }),
    );
    expect(await getWeeklyAttempts('production', WEEK_START, WEEK_END)).toBe(2);
  });

  it('ignores rows from other modules', async () => {
    await db.spacingState.bulkAdd([
      spacing({
        id: 'row-prod', moduleRef: 'production',
        performanceHistory: [{ t: MID_WEEK, kind: 'rating', rating: 'flying' }],
      }),
      spacing({
        id: 'row-hf', moduleRef: 'harmonic-fluency',
        performanceHistory: [{ t: MID_WEEK, kind: 'attempt', correct: true }],
      }),
    ]);
    expect(await getWeeklyAttempts('production', WEEK_START, WEEK_END)).toBe(1);
  });

  it('aggregates across multiple production rows', async () => {
    await db.spacingState.bulkAdd([
      spacing({
        id: 'row-1', moduleRef: 'production',
        performanceHistory: [
          { t: MID_WEEK, kind: 'rating', rating: 'flying' },
          { t: MID_WEEK + 1, kind: 'rating', rating: 'cruising' },
        ],
      }),
      spacing({
        id: 'row-2', moduleRef: 'production',
        performanceHistory: [
          { t: MID_WEEK + 2, kind: 'rating', rating: 'flying' },
        ],
      }),
    ]);
    expect(await getWeeklyAttempts('production', WEEK_START, WEEK_END)).toBe(3);
  });
});

describe('getWeeklyAttempts — Practice Consistency', () => {
  beforeEach(async () => {
    await db.practiceSessions.clear();
  });

  function session(partial: Partial<PracticeSession> & { id: string; startedAt: number }): PracticeSession {
    return {
      endedAt: null,
      plannedDurationMin: 30,
      actualDurationMin: null,
      context: 'mixed',
      timeOfDay: 'morning',
      sessionRole: 'only',
      sessionIntent: null,
      hardBlocks: false,
      energyFocus: null,
      energyMotivation: null,
      energyInspiration: null,
      dayProfileUsed: null,
      reasoningSnapshot: null,
      notes: null,
      lastEngagedAt: null,
      ...partial,
    } as PracticeSession;
  }

  it('counts practice sessions started within the window, regardless of module', async () => {
    await db.practiceSessions.bulkAdd([
      session({ id: 'p1', startedAt: WEEK_START }),
      session({ id: 'p2', startedAt: MID_WEEK }),
      session({ id: 'p3', startedAt: WEEK_END }),
      session({ id: 'p4', startedAt: BEFORE }),
      session({ id: 'p5', startedAt: AFTER }),
    ]);
    expect(await getWeeklyAttempts('practice-consistency', WEEK_START, WEEK_END)).toBe(3);
  });
});
