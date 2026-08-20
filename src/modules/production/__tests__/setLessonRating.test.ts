// @vitest-environment jsdom
/**
 * The single write path for the five-step Production lesson rating.
 *
 * setLessonRating has three consequences and they have to stay in
 * step: the cumulative lesson state, the rated session row the weekly
 * pace counts as an attempt, and the spacingState mirror Production
 * coverage goals read. These tests pin all three, plus the two rules
 * that keep the attempt count honest — one rated row per VISIT rather
 * than per tap, and no row at all for a no-op re-tap.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, type ProductionLesson } from '../../../lib/db';
import { recordLessonOpen, setLessonRating } from '../data';
import { getSpacingState } from '../../../lib/spacingState';

const LESSON_ID = 'wf-01';

function lessonRow(overrides: Partial<ProductionLesson> = {}): ProductionLesson {
  const now = 1000;
  return {
    id: LESSON_ID,
    pathId: 'workflow',
    order: 1,
    rating: 0,
    revisitCount: 0,
    lastOpenedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

beforeEach(async () => {
  await db.productionLessonSessions.clear();
  await db.productionLessons.clear();
  await db.spacingState.clear();
  await db.productionLessons.add(lessonRow());
});

describe('setLessonRating — the three writes', () => {
  it('updates the cumulative lesson rating', async () => {
    await setLessonRating(LESSON_ID, 75, Date.now() - 60_000);
    const row = await db.productionLessons.get(LESSON_ID);
    expect(row?.rating).toBe(75);
  });

  it('writes a rated session row with start/end timestamps + duration', async () => {
    const before = Date.now();
    const startedAt = before - 8 * 60 * 1000; // entered the lesson 8 min ago
    await setLessonRating(LESSON_ID, 50, startedAt);
    const after = Date.now();

    const rows = await db.productionLessonSessions.toArray();
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.id.startsWith('pls-')).toBe(true);
    expect(row.lessonId).toBe(LESSON_ID);
    expect(row.rating).toBe(50);
    expect(row.startedAt).toBe(startedAt);
    // timestamp doubles as lessonEndedAt.
    expect(row.timestamp).toBeGreaterThanOrEqual(before);
    expect(row.timestamp).toBeLessThanOrEqual(after);
    expect(row.durationSeconds).toBe(Math.round((row.timestamp - startedAt) / 1000));
    expect(row.durationSeconds).toBeGreaterThanOrEqual(8 * 60);
  });

  it('floors durationSeconds at 0 when startedAt is in the future (clock skew)', async () => {
    await setLessonRating(LESSON_ID, 25, Date.now() + 60_000);
    const rows = await db.productionLessonSessions.toArray();
    expect(rows[0].durationSeconds).toBe(0);
  });
});

describe('setLessonRating — the spacing mirror', () => {
  // The stage map is the coverage contract: COVERED_STAGES is
  // {acquired, consolidated, mastered}, so 'acquired' is the value
  // that makes a lesson count toward a Production coverage goal.
  // Asserting the stage (not a label) is what pins the coverage line
  // at "tried it".
  it.each([
    [25, 'acquiring'],
    [50, 'acquiring'],
    [75, 'acquired'],
    [100, 'mastered'],
  ] as const)('rating %i mirrors to stage %s', async (rating, stage) => {
    await setLessonRating(LESSON_ID, rating, Date.now() - 1_000);
    const row = await getSpacingState(LESSON_ID, 'production');
    expect(row?.acquisitionStage).toBe(stage);
  });

  it('coverage begins at "tried it", not at "deep dive"', async () => {
    await setLessonRating(LESSON_ID, 50, Date.now() - 2_000);
    const readOnly = await getSpacingState(LESSON_ID, 'production');
    expect(readOnly?.acquisitionStage).toBe('acquiring'); // NOT covered

    await setLessonRating(LESSON_ID, 75, Date.now() - 1_000);
    const tried = await getSpacingState(LESSON_ID, 'production');
    expect(tried?.acquisitionStage).toBe('acquired'); // covered
  });

  it('dropping back to 0 deletes the row — absence is the canonical "new"', async () => {
    await setLessonRating(LESSON_ID, 75, Date.now() - 2_000);
    expect(await getSpacingState(LESSON_ID, 'production')).toBeTruthy();

    await setLessonRating(LESSON_ID, 0, Date.now() - 1_000);
    expect(await getSpacingState(LESSON_ID, 'production')).toBeUndefined();
  });
});

describe('setLessonRating — one rated row per visit', () => {
  it('folds repeat ratings within one visit into a single row', async () => {
    const visit = Date.now() - 5 * 60 * 1000;
    await setLessonRating(LESSON_ID, 25, visit);
    await setLessonRating(LESSON_ID, 50, visit);
    await setLessonRating(LESSON_ID, 75, visit);

    const rows = await db.productionLessonSessions.toArray();
    expect(rows).toHaveLength(1);
    // The row carries where the visit ENDED, not where it began.
    expect(rows[0].rating).toBe(75);
    expect(rows[0].startedAt).toBe(visit);
  });

  it('a later visit writes its own row', async () => {
    const firstVisit = Date.now() - 10 * 60 * 1000;
    const secondVisit = Date.now() - 60 * 1000;
    await setLessonRating(LESSON_ID, 25, firstVisit);
    await setLessonRating(LESSON_ID, 75, secondVisit);

    const rows = await db.productionLessonSessions.toArray();
    expect(rows).toHaveLength(2);
    expect(rows.map(r => r.startedAt).sort()).toEqual([firstVisit, secondVisit]);
  });

  it('re-tapping the current rating writes nothing at all', async () => {
    const visit = Date.now() - 60_000;
    await setLessonRating(LESSON_ID, 75, visit);
    const afterFirst = await db.productionLessonSessions.toArray();

    await setLessonRating(LESSON_ID, 75, visit);
    const afterSecond = await db.productionLessonSessions.toArray();

    expect(afterSecond).toHaveLength(1);
    expect(afterSecond[0].timestamp).toBe(afterFirst[0].timestamp);
  });

  it('does nothing when the lesson row does not exist', async () => {
    await setLessonRating('no-such-lesson', 75, Date.now());
    const rows = await db.productionLessonSessions.toArray();
    expect(rows).toHaveLength(0);
  });
});

describe('recordLessonOpen — opening is not a claim', () => {
  it('writes a session row with no rating, startedAt, or duration', async () => {
    await recordLessonOpen(LESSON_ID);
    const rows = await db.productionLessonSessions.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].rating).toBeUndefined();
    expect(rows[0].startedAt).toBeUndefined();
    expect(rows[0].durationSeconds).toBeUndefined();
  });

  it('leaves the rating at 0 — opening a lesson promotes nothing', async () => {
    await recordLessonOpen(LESSON_ID);
    await recordLessonOpen(LESSON_ID);
    const row = await db.productionLessons.get(LESSON_ID);
    expect(row?.rating).toBe(0);
    // …and writes no spacing row, so an opened-but-unrated lesson
    // never counts toward coverage.
    expect(await getSpacingState(LESSON_ID, 'production')).toBeUndefined();
  });

  it('bumps revisitCount once per open', async () => {
    await recordLessonOpen(LESSON_ID);
    await recordLessonOpen(LESSON_ID);
    const row = await db.productionLessons.get(LESSON_ID);
    expect(row?.revisitCount).toBe(2);
  });

  it('a lesson opened but never rated leaves zero rated rows', async () => {
    await recordLessonOpen(LESSON_ID);
    await recordLessonOpen(LESSON_ID);
    const rated = await db.productionLessonSessions
      .filter(s => s.rating !== undefined)
      .toArray();
    expect(rated).toHaveLength(0);
  });
});
