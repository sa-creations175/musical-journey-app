// @vitest-environment jsdom
/**
 * Phase 2 substep 1h tests. Two layers:
 *
 *   1. Pure derivation helpers — no Dexie, exhaustive coverage of
 *      threshold/window edges per module.
 *   2. End-to-end `backfillSpacingStateIfNeeded` integration — seeds
 *      the source tables (attempts, drillSessions,
 *      songPracticeLog, productionLessons), runs the backfill,
 *      asserts the right spacingState rows landed.
 */
import 'fake-indexeddb/auto';
import backfillSource from '../spacingStateBackfill.ts?raw';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  PREF_SPACING_STATE_BACKFILL_V1,
  backfillSpacingStateIfNeeded,
  deriveDeclarativeStage,
  deriveRatingStage,
} from '../spacingStateBackfill';
import { getSpacingState, recordEngagement } from '../spacingState';
import { getPref, setPref } from '../userPrefs';
import { db, newAttemptId, type AttemptRecord } from '../db';
import type { Feel } from '../fluencyScale';

// Attempts carry client-minted ids since v33/v34 (see db.ts), so the
// store no longer generates one. Seed rows here go through the same
// stamping the production write path does.
const withAttemptId = (r: AttemptRecord): AttemptRecord => ({ id: newAttemptId(), ...r });
const addAttemptRow = (r: AttemptRecord) => db.attempts.add(withAttemptId(r));
const addAttemptRows = (rows: AttemptRecord[]) => db.attempts.bulkAdd(rows.map(withAttemptId));


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

/**
 * `deriveFlashcardStage` USED TO BE TESTED HERE, and it is gone.
 *
 * It derived harmonic fluency's starting stage from the SM-2 row's
 * LIFETIME counters, which was the only rule in this file that had no
 * window — a card missed on each of its last five reps still read
 * `acquired` on the strength of forty right answers two years back.
 * Harmonic fluency goes through `deriveDeclarativeStage` now, with the
 * same trailing-ten window as the other four declarative modules, so
 * the cases above cover it too.
 *
 * The one behaviour worth pinning separately is that HF is dispatched
 * at all — a module silently missing from the backfill loop shows up
 * as day-one coverage of zero and nothing else.
 */
describe('harmonic fluency joins the declarative modules', () => {
  it('is backfilled from attempts, with no branch of its own', () => {
    expect(backfillSource).toContain(
      "backfillDeclarativeFromAttempts('harmonic-fluency'",
    );
    // The retired branch, pinned as an absence — including in prose,
    // which is why the comment above the removal names the SM-2 table
    // in words rather than by identifier. Reading it here is what this
    // commit removed, and it must not come back when the table itself
    // is dropped.
    expect(backfillSource).not.toContain('db.flashcardStates');
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
    await addAttemptRow({
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
    await addAttemptRows([
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
    await addAttemptRows([
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
    await addAttemptRows(writes);
    await backfillSpacingStateIfNeeded();
    const row = await getSpacingState('maj7', 'chord-recognition');
    expect(row!.acquisitionStage).toBe('acquired');
    expect(row!.performanceHistory).toEqual([]); // empty per Option A
  });

  it('scales-modes: tab1 and tab2 are independent rows', async () => {
    await addAttemptRows([
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
  it('derives from attempts, on the same trailing window as the rest', async () => {
    const t = 1_000;
    await addAttemptRows([
      // 5 for 5 → acquired.
      ...Array.from({ length: 5 }, (_, i) => ({
        moduleId: 'harmonic-fluency', itemId: 'sdm-1', correct: true, timestamp: t + i,
      })),
      // 1 of 3 → under the min gate, and under the threshold anyway.
      { moduleId: 'harmonic-fluency', itemId: 'nn-1', correct: true,  timestamp: t },
      { moduleId: 'harmonic-fluency', itemId: 'nn-1', correct: false, timestamp: t + 1 },
      { moduleId: 'harmonic-fluency', itemId: 'nn-1', correct: false, timestamp: t + 2 },
    ]);
    await backfillSpacingStateIfNeeded();
    const sdm = await getSpacingState('sdm-1', 'harmonic-fluency');
    const nn  = await getSpacingState('nn-1',  'harmonic-fluency');
    const dq  = await getSpacingState('dq-1',  'harmonic-fluency');
    expect(sdm!.acquisitionStage).toBe('acquired');
    expect(nn!.acquisitionStage).toBe('acquiring');
    expect(dq).toBeUndefined();  // never answered → no row
  });

  it('FORGETS: a long-ago run of right answers no longer carries a card', async () => {
    // THE CASE THE OLD RULE GOT WRONG, and the reason for the change.
    // Twenty correct, then five wrong. Lifetime accuracy is 20/25 =
    // 80%, which cleared the old gate exactly. The trailing ten is
    // 5 of 10, which does not.
    const t = 1_000;
    await addAttemptRows([
      ...Array.from({ length: 20 }, (_, i) => ({
        moduleId: 'harmonic-fluency', itemId: 'ks-9', correct: true, timestamp: t + i,
      })),
      ...Array.from({ length: 5 }, (_, i) => ({
        moduleId: 'harmonic-fluency', itemId: 'ks-9', correct: false, timestamp: t + 100 + i,
      })),
    ]);
    await backfillSpacingStateIfNeeded();
    const row = await getSpacingState('ks-9', 'harmonic-fluency');
    expect(row!.acquisitionStage).toBe('acquiring');
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
      { hand: 'both', style: 'solid', id: 'd1', drillTypeId: 't1', skillId: 's1', durationSeconds: 60, feelRating: 3, timestamp: now + 1 },
      { hand: 'both', style: 'solid', id: 'd2', drillTypeId: 't2', skillId: 's2', durationSeconds: 60, feelRating: 3, timestamp: now + 2 },
      { hand: 'both', style: 'solid', id: 'd3', drillTypeId: 't3', skillId: 's3', durationSeconds: 60, feelRating: 3, timestamp: now + 3 },
      { hand: 'both', style: 'solid', id: 'd4', drillTypeId: 't4', skillId: 's4', durationSeconds: 60, feelRating: 4, timestamp: now + 4 },
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
      { hand: 'both', style: 'solid', id: 'd1', drillTypeId: 't1', skillId: 's1', durationSeconds: 60, feelRating: 3, timestamp: now + 1 },
      { hand: 'both', style: 'solid', id: 'd2', drillTypeId: 't1', skillId: 's1', durationSeconds: 60, feelRating: 4, timestamp: now + 2 },
      { hand: 'both', style: 'solid', id: 'd3', drillTypeId: 't1', skillId: 's1', durationSeconds: 60, feelRating: 3, timestamp: now + 3 },
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
      // Legacy 'breakthrough'. The fifth step no longer exists on the
      // scale, but rows written under it do — the backfill must still
      // read them as flying, so the cast is the point of this case.
      { id: 'l3', songId: 'song-A', timestamp: 3, durationMin: 10, sectionIds: [], keys: [], feelRating: 5 as unknown as Feel },
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
  // The backfill and the live write path (setLessonRating) must map a
  // rating to the SAME stage — they share STAGE_FOR_RATING precisely
  // so they cannot drift. The coverage line is the assertion that
  // matters: 50 ("deep dive") must stay below acquired, 75 ("tried
  // it") must reach it.
  it('mirrors the five-step rating; 0 → no row, coverage starts at 75', async () => {
    const now = 1000;
    await db.productionLessons.bulkAdd([
      { id: 'wf-01', pathId: 'workflow', order: 1, rating: 0,   revisitCount: 0, lastOpenedAt: null, createdAt: now, updatedAt: now },
      { id: 'wf-02', pathId: 'workflow', order: 2, rating: 25,  revisitCount: 1, lastOpenedAt: now,  createdAt: now, updatedAt: now },
      { id: 'wf-03', pathId: 'workflow', order: 3, rating: 50,  revisitCount: 2, lastOpenedAt: now,  createdAt: now, updatedAt: now },
      { id: 'wf-04', pathId: 'workflow', order: 4, rating: 75,  revisitCount: 3, lastOpenedAt: now,  createdAt: now, updatedAt: now },
      { id: 'wf-05', pathId: 'workflow', order: 5, rating: 100, revisitCount: 5, lastOpenedAt: now,  createdAt: now, updatedAt: now },
    ]);
    await backfillSpacingStateIfNeeded();
    expect(await getSpacingState('wf-01', 'production')).toBeUndefined();
    expect((await getSpacingState('wf-02', 'production'))!.acquisitionStage).toBe('acquiring');
    expect((await getSpacingState('wf-03', 'production'))!.acquisitionStage).toBe('acquiring');
    expect((await getSpacingState('wf-04', 'production'))!.acquisitionStage).toBe('acquired');
    expect((await getSpacingState('wf-05', 'production'))!.acquisitionStage).toBe('mastered');
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
    await addAttemptRows([
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
    await addAttemptRow({
      moduleId: 'intervals', itemId: 'M3', direction: 'asc',
      correct: true, timestamp: now,
    });
    await addAttemptRow({
      moduleId: 'chord-recognition', itemId: 'maj7',
      correct: true, timestamp: now,
    });
    await db.productionLessons.add({
      id: 'wf-01', pathId: 'workflow', order: 1, rating: 75, revisitCount: 1, lastOpenedAt: now,
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
