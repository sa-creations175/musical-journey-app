// @vitest-environment jsdom
/**
 * Phase 2 substep 1h tests. Two layers:
 *
 *   1. Pure derivation helpers — no Dexie, exhaustive coverage of
 *      threshold/window edges per module.
 *   2. End-to-end `backfillSpacingStateIfNeeded` integration — seeds
 *      the source tables (attempts, flashcardStates, drillSessions,
 *      songPracticeLog, productionLessons), runs the backfill,
 *      asserts the right spacingState rows landed.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  PREF_SPACING_STATE_BACKFILL_V1,
  backfillSpacingStateIfNeeded,
  deriveDeclarativeStage,
  deriveFlashcardStage,
  deriveRatingStage,
} from '../spacingStateBackfill';
import { getSpacingState, recordEngagement } from '../spacingState';
import { getPref, setPref } from '../userPrefs';
import { db } from '../db';

beforeEach(async () => {
  await Promise.all([
    db.spacingState.clear(),
    db.attempts.clear(),
    db.flashcardStates.clear(),
    db.drillSessions.clear(),
    db.drillSkills.clear(),
    db.songPracticeLog.clear(),
    db.productionLessons.clear(),
    db.userPrefs.clear(),
  ]);
});

// -------------------------------------------------------------------
// Pure derivation helpers
// -------------------------------------------------------------------

describe('deriveDeclarativeStage', () => {
  function attempts(corrects: boolean[]): Array<{ correct: boolean; ts: number }> {
    return corrects.map((correct, i) => ({ correct, ts: 1000 + i }));
  }

  it('returns null for empty history', () => {
    expect(deriveDeclarativeStage([])).toBeNull();
  });

  it('returns acquiring for a single attempt', () => {
    expect(deriveDeclarativeStage(attempts([true]))).toBe('acquiring');
  });

  it('stays acquiring below the min-attempts gate (4 attempts at 100%)', () => {
    expect(deriveDeclarativeStage(attempts([true, true, true, true]))).toBe('acquiring');
  });

  it('promotes at the boundary (5 attempts, 4/5 = 80%)', () => {
    expect(deriveDeclarativeStage(attempts([true, true, true, true, false]))).toBe('acquired');
  });

  it('stays acquiring at 5 attempts with 60% correct', () => {
    expect(deriveDeclarativeStage(attempts([true, true, true, false, false]))).toBe('acquiring');
  });

  it('only the last 10 attempts count (3 wrongs at the front, then 10 correct)', () => {
    expect(deriveDeclarativeStage(attempts([
      false, false, false,
      true, true, true, true, true, true, true, true, true, true,
    ]))).toBe('acquired');
  });

  it('handles unsorted timestamps by sorting first', () => {
    // Three correct attempts logged in reverse-chronological order
    // followed by two more correct in correct order. After sorting
    // ascending, the trailing 5 should be evaluated.
    const out = deriveDeclarativeStage([
      { correct: false, ts: 1 },
      { correct: false, ts: 2 },
      { correct: true,  ts: 3 },
      { correct: true,  ts: 4 },
      { correct: true,  ts: 5 },
      { correct: true,  ts: 6 },
      { correct: true,  ts: 7 },
    ]);
    // last 10 = all 7. correct count = 5. 5/7 ≈ 0.71 < 0.8 → acquiring
    expect(out).toBe('acquiring');
  });
});

describe('deriveFlashcardStage', () => {
  it('returns null when totalAttempts is 0', () => {
    expect(deriveFlashcardStage(0, 0)).toBeNull();
  });

  it('returns acquiring below the min gate', () => {
    expect(deriveFlashcardStage(4, 4)).toBe('acquiring');
  });

  it('returns acquired at the boundary (5 attempts, 4 correct = 80%)', () => {
    expect(deriveFlashcardStage(5, 4)).toBe('acquired');
  });

  it('returns acquiring when threshold is missed', () => {
    expect(deriveFlashcardStage(10, 7)).toBe('acquiring');
  });

  it('returns acquiring even at 100% if below min attempts', () => {
    expect(deriveFlashcardStage(2, 2)).toBe('acquiring');
  });
});

describe('deriveRatingStage', () => {
  function ratings(rs: Array<'flying' | 'cruising' | 'crawling'>): {
    rs: Array<'flying' | 'cruising' | 'crawling'>;
    ts: number[];
  } {
    return { rs, ts: rs.map((_, i) => 1000 + i) };
  }

  it('returns null for empty history', () => {
    expect(deriveRatingStage([], [])).toBeNull();
  });

  it('returns acquiring with a single rating', () => {
    const { rs, ts } = ratings(['flying']);
    expect(deriveRatingStage(rs, ts)).toBe('acquiring');
  });

  it('returns acquiring with 2 cruising (below min gate)', () => {
    const { rs, ts } = ratings(['cruising', 'cruising']);
    expect(deriveRatingStage(rs, ts)).toBe('acquiring');
  });

  it('promotes when last 3 are all cruising', () => {
    const { rs, ts } = ratings(['cruising', 'cruising', 'cruising']);
    expect(deriveRatingStage(rs, ts)).toBe('acquired');
  });

  it('stays acquiring with a recent crawling in the last 3', () => {
    const { rs, ts } = ratings(['cruising', 'crawling', 'cruising']);
    expect(deriveRatingStage(rs, ts)).toBe('acquiring');
  });

  it('only the last 3 matter — early crawlings are forgiven', () => {
    const { rs, ts } = ratings([
      'crawling', 'crawling', 'crawling',
      'cruising', 'cruising', 'cruising',
    ]);
    expect(deriveRatingStage(rs, ts)).toBe('acquired');
  });

  it('handles unsorted timestamps by sorting first', () => {
    expect(deriveRatingStage(
      ['crawling', 'cruising', 'cruising', 'cruising'],
      [10, 1, 2, 3], // crawling has highest ts → it's actually the most recent
    )).toBe('acquiring');
  });
});

// -------------------------------------------------------------------
// End-to-end backfill integration
// -------------------------------------------------------------------

describe('backfillSpacingStateIfNeeded — gating', () => {
  it('runs once and sets the pref', async () => {
    const counts = await backfillSpacingStateIfNeeded();
    expect(counts.created).toBe(0); // no source data
    const pref = await getPref<number>(PREF_SPACING_STATE_BACKFILL_V1, 0);
    expect(pref).toBeGreaterThan(0);
  });

  it('short-circuits on second call (pref already set)', async () => {
    await setPref(PREF_SPACING_STATE_BACKFILL_V1, 12345);
    // Seed source data that WOULD produce rows if backfill ran.
    await db.attempts.add({
      moduleId: 'intervals', itemId: 'M3', direction: 'asc',
      correct: true, timestamp: 1000,
    });
    const counts = await backfillSpacingStateIfNeeded();
    expect(counts.created).toBe(0);
    expect(counts.modules).toEqual({});
    const all = await db.spacingState.toArray();
    expect(all).toHaveLength(0);
    // pref unchanged (still 12345, not bumped to Date.now())
    expect(await getPref<number>(PREF_SPACING_STATE_BACKFILL_V1, 0)).toBe(12345);
  });
});

describe('backfillSpacingStateIfNeeded — declarative modules', () => {
  it('intervals: encodes direction in itemRef', async () => {
    await db.attempts.bulkAdd([
      { moduleId: 'intervals', itemId: 'M3', direction: 'asc',  correct: true,  timestamp: 1 },
      { moduleId: 'intervals', itemId: 'M3', direction: 'desc', correct: true,  timestamp: 2 },
      { moduleId: 'intervals', itemId: 'M3', direction: 'asc',  correct: false, timestamp: 3 },
    ]);
    await backfillSpacingStateIfNeeded();
    const asc = await getSpacingState('M3:asc', 'intervals');
    const desc = await getSpacingState('M3:desc', 'intervals');
    expect(asc).toBeDefined();
    expect(desc).toBeDefined();
    expect(asc!.acquisitionStage).toBe('acquiring');  // 2 attempts, below min 5
    expect(desc!.acquisitionStage).toBe('acquiring'); // 1 attempt
  });

  it('chord-progressions: skips sub-skill itemIds', async () => {
    await db.attempts.bulkAdd([
      { moduleId: 'chord-progressions', itemId: '1-4-5',           correct: true, timestamp: 1 },
      { moduleId: 'chord-progressions', itemId: '1-4-5-pattern',   correct: true, timestamp: 2 },
      { moduleId: 'chord-progressions', itemId: '1-4-5-inversion', correct: true, timestamp: 3 },
      { moduleId: 'chord-progressions', itemId: 'key-detection:C', correct: true, timestamp: 4 },
      { moduleId: 'chord-progressions', itemId: 'motion:I-IV',     correct: true, timestamp: 5 },
      { moduleId: 'chord-progressions', itemId: 'motion-mode:full', correct: true, timestamp: 6 },
      { moduleId: 'chord-progressions', itemId: 'motion-first:x',  correct: true, timestamp: 7 },
    ]);
    await backfillSpacingStateIfNeeded();
    const rows = await db.spacingState.where('moduleRef').equals('chord-progressions').toArray();
    expect(rows.map(r => r.itemRef)).toEqual(['1-4-5']);
  });

  it('promotes to acquired when threshold met', async () => {
    const writes = Array.from({ length: 5 }, (_, i) => ({
      moduleId: 'chord-recognition', itemId: 'maj7',
      correct: true, timestamp: 1000 + i,
    }));
    await db.attempts.bulkAdd(writes);
    await backfillSpacingStateIfNeeded();
    const row = await getSpacingState('maj7', 'chord-recognition');
    expect(row!.acquisitionStage).toBe('acquired');
    expect(row!.performanceHistory).toEqual([]); // empty per Option A
  });

  it('scales-modes: tab1 and tab2 are independent rows', async () => {
    await db.attempts.bulkAdd([
      { moduleId: 'scales-modes', itemId: 'dorian-tab1', correct: true, timestamp: 1 },
      { moduleId: 'scales-modes', itemId: 'dorian-tab2', correct: true, timestamp: 2 },
    ]);
    await backfillSpacingStateIfNeeded();
    const tab1 = await getSpacingState('dorian-tab1', 'scales-modes');
    const tab2 = await getSpacingState('dorian-tab2', 'scales-modes');
    expect(tab1).toBeDefined();
    expect(tab2).toBeDefined();
    expect(tab1!.id).not.toBe(tab2!.id);
  });
});

describe('backfillSpacingStateIfNeeded — Harmonic Fluency', () => {
  it('uses flashcardStates aggregate counters', async () => {
    await db.flashcardStates.bulkAdd([
      { cardId: 'sdm-1', easeFactor: 2.5, interval: 1, nextReviewDate: 0, lastReviewed: 0,
        consecutiveCorrect: 5, totalAttempts: 5, totalCorrect: 5 },
      { cardId: 'nn-1', easeFactor: 2.5, interval: 1, nextReviewDate: 0, lastReviewed: 0,
        consecutiveCorrect: 0, totalAttempts: 3, totalCorrect: 1 },
      { cardId: 'dq-1', easeFactor: 2.5, interval: 1, nextReviewDate: 0, lastReviewed: 0,
        consecutiveCorrect: 0, totalAttempts: 0, totalCorrect: 0 },
    ]);
    await backfillSpacingStateIfNeeded();
    const sdm = await getSpacingState('sdm-1', 'harmonic-fluency');
    const nn  = await getSpacingState('nn-1',  'harmonic-fluency');
    const dq  = await getSpacingState('dq-1',  'harmonic-fluency');
    expect(sdm!.acquisitionStage).toBe('acquired');
    expect(nn!.acquisitionStage).toBe('acquiring');
    expect(dq).toBeUndefined();  // 0 attempts → no row
  });
});

describe('backfillSpacingStateIfNeeded — Shapes & Patterns', () => {
  it('builds itemRef from skill descriptor; excludes mental-viz', async () => {
    const now = 1000;
    await db.drillSkills.bulkAdd([
      { id: 's1', kind: 'chord-shape',   keyName: 'C',  quality: 'maj7',     label: '', createdAt: now },
      { id: 's2', kind: 'scale',         keyName: 'C',  scale:   'major',    label: '', createdAt: now },
      { id: 's3', kind: 'voice-leading', keyName: 'C',  patternId: 'aba-251', label: '', createdAt: now },
      { id: 's4', kind: 'mental-viz',    variant: 'shape-viz',                label: '', createdAt: now },
    ]);
    await db.drillSessions.bulkAdd([
      { id: 'd1', drillTypeId: 't1', skillId: 's1', durationSeconds: 60, feelRating: 3, timestamp: now + 1 },
      { id: 'd2', drillTypeId: 't2', skillId: 's2', durationSeconds: 60, feelRating: 3, timestamp: now + 2 },
      { id: 'd3', drillTypeId: 't3', skillId: 's3', durationSeconds: 60, feelRating: 3, timestamp: now + 3 },
      { id: 'd4', drillTypeId: 't4', skillId: 's4', durationSeconds: 60, feelRating: 4, timestamp: now + 4 },
    ]);
    await backfillSpacingStateIfNeeded();
    const cs = await getSpacingState('chord-shape:maj7:C', 'shapes-and-patterns');
    const sc = await getSpacingState('scale:major:C',      'shapes-and-patterns');
    const vl = await getSpacingState('vl:aba-251:C',       'shapes-and-patterns');
    expect(cs).toBeDefined();
    expect(sc).toBeDefined();
    expect(vl).toBeDefined();
    // mental-viz excluded entirely:
    const all = await db.spacingState.where('moduleRef').equals('shapes-and-patterns').toArray();
    expect(all).toHaveLength(3);
  });

  it('promotes when last 3 sessions all cruising or flying', async () => {
    const now = 1000;
    await db.drillSkills.add({
      id: 's1', kind: 'chord-shape', keyName: 'C', quality: 'maj7',
      label: '', createdAt: now,
    });
    await db.drillSessions.bulkAdd([
      { id: 'd1', drillTypeId: 't1', skillId: 's1', durationSeconds: 60, feelRating: 3, timestamp: now + 1 },
      { id: 'd2', drillTypeId: 't1', skillId: 's1', durationSeconds: 60, feelRating: 4, timestamp: now + 2 },
      { id: 'd3', drillTypeId: 't1', skillId: 's1', durationSeconds: 60, feelRating: 3, timestamp: now + 3 },
    ]);
    await backfillSpacingStateIfNeeded();
    const row = await getSpacingState('chord-shape:maj7:C', 'shapes-and-patterns');
    expect(row!.acquisitionStage).toBe('acquired');
  });
});

describe('backfillSpacingStateIfNeeded — Song Repertoire', () => {
  it('uses 5-point lenient mapping; one row per song', async () => {
    await db.songPracticeLog.bulkAdd([
      { id: 'l1', songId: 'song-A', timestamp: 1, durationMin: 10, sectionIds: [], keys: [], feelRating: 3 },
      { id: 'l2', songId: 'song-A', timestamp: 2, durationMin: 10, sectionIds: [], keys: [], feelRating: 4 },
      { id: 'l3', songId: 'song-A', timestamp: 3, durationMin: 10, sectionIds: [], keys: [], feelRating: 5 },
      { id: 'l4', songId: 'song-B', timestamp: 4, durationMin: 10, sectionIds: [], keys: [], feelRating: 1 },
    ]);
    await backfillSpacingStateIfNeeded();
    const a = await getSpacingState('song-A', 'repertoire');
    const b = await getSpacingState('song-B', 'repertoire');
    // last 3 of A = [cruising, cruising, flying] → acquired
    expect(a!.acquisitionStage).toBe('acquired');
    // B has 1 log at crawling → acquiring (≥1 attempt rule)
    expect(b!.acquisitionStage).toBe('acquiring');
  });
});

describe('backfillSpacingStateIfNeeded — Production', () => {
  it('mirrors mastery enum directly; not-started → no row', async () => {
    const now = 1000;
    await db.productionLessons.bulkAdd([
      { id: 'wf-01', pathId: 'workflow', order: 1, mastery: 'not-started', revisitCount: 0, completedAt: null, lastOpenedAt: null, createdAt: now, updatedAt: now },
      { id: 'wf-02', pathId: 'workflow', order: 2, mastery: 'in-progress', revisitCount: 1, completedAt: null, lastOpenedAt: now, createdAt: now, updatedAt: now },
      { id: 'wf-03', pathId: 'workflow', order: 3, mastery: 'completed',   revisitCount: 3, completedAt: now,  lastOpenedAt: now, createdAt: now, updatedAt: now },
      { id: 'wf-04', pathId: 'workflow', order: 4, mastery: 'mastered',    revisitCount: 5, completedAt: now,  lastOpenedAt: now, createdAt: now, updatedAt: now },
    ]);
    await backfillSpacingStateIfNeeded();
    const not = await getSpacingState('wf-01', 'production');
    const inp = await getSpacingState('wf-02', 'production');
    const com = await getSpacingState('wf-03', 'production');
    const mas = await getSpacingState('wf-04', 'production');
    expect(not).toBeUndefined();
    expect(inp!.acquisitionStage).toBe('acquiring');
    expect(com!.acquisitionStage).toBe('acquired');
    expect(mas!.acquisitionStage).toBe('mastered');
  });
});

describe('backfillSpacingStateIfNeeded — live wiring takes precedence', () => {
  it('does NOT overwrite a row that already exists', async () => {
    // Live wiring already created a row at 'acquired' for this item.
    await recordEngagement({
      itemRef: 'M3:asc',
      moduleRef: 'intervals',
      signal: { kind: 'attempt', correct: true },
    });
    const before = await getSpacingState('M3:asc', 'intervals');
    expect(before).toBeDefined();
    const liveId = before!.id;

    // Now seed historical attempts that would otherwise create a row.
    await db.attempts.bulkAdd([
      { moduleId: 'intervals', itemId: 'M3', direction: 'asc', correct: false, timestamp: 1 },
      { moduleId: 'intervals', itemId: 'M3', direction: 'asc', correct: false, timestamp: 2 },
    ]);
    await backfillSpacingStateIfNeeded();
    const after = await getSpacingState('M3:asc', 'intervals');
    expect(after!.id).toBe(liveId); // same row, untouched
    expect(after!.performanceHistory).toHaveLength(1); // live wiring's history preserved
  });
});

describe('backfillSpacingStateIfNeeded — counts', () => {
  it('returns honest per-module counts', async () => {
    const now = 1000;
    await db.attempts.add({
      moduleId: 'intervals', itemId: 'M3', direction: 'asc',
      correct: true, timestamp: now,
    });
    await db.attempts.add({
      moduleId: 'chord-recognition', itemId: 'maj7',
      correct: true, timestamp: now,
    });
    await db.productionLessons.add({
      id: 'wf-01', pathId: 'workflow', order: 1, mastery: 'completed',
      revisitCount: 1, completedAt: now, lastOpenedAt: now,
      createdAt: now, updatedAt: now,
    });
    const counts = await backfillSpacingStateIfNeeded();
    expect(counts.created).toBe(3);
    expect(counts.modules).toEqual({
      'intervals': 1,
      'chord-recognition': 1,
      'production': 1,
    });
  });
});
