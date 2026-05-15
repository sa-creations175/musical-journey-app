// @vitest-environment jsdom
/**
 * Phase B Step 3 Part B — Production lesson rating.
 *
 * recordLessonRating writes the rated ProductionLessonSession row —
 * the row Phase B counts as a Production attempt. These tests pin:
 *   1. the row shape — rating + startedAt + timestamp (lessonEndedAt)
 *      + computed durationSeconds;
 *   2. durationSeconds is the honest end−start difference, floored at
 *      0 against clock skew;
 *   3. the passive open event (recordLessonOpen) writes NO rating —
 *      so leaving a lesson without going through the rating flow
 *      leaves only unrated open rows, never a partial rated record.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../../lib/db';
import { recordLessonOpen, recordLessonRating } from '../data';

beforeEach(async () => {
  await db.productionLessonSessions.clear();
  await db.productionLessons.clear();
  await db.spacingState.clear();
});

describe('recordLessonRating', () => {
  it('writes a rated session row with start/end timestamps + duration', async () => {
    const before = Date.now();
    const startedAt = before - 8 * 60 * 1000; // entered the lesson 8 min ago
    const session = await recordLessonRating('wf-01', 'cruising', startedAt);
    const after = Date.now();

    const rows = await db.productionLessonSessions.toArray();
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row).toEqual(session);
    expect(row.id.startsWith('pls-')).toBe(true);
    expect(row.lessonId).toBe('wf-01');
    expect(row.rating).toBe('cruising');
    expect(row.startedAt).toBe(startedAt);
    expect(row.openedDeepDive).toBe(false);
    // timestamp doubles as lessonEndedAt.
    expect(row.timestamp).toBeGreaterThanOrEqual(before);
    expect(row.timestamp).toBeLessThanOrEqual(after);
    // durationSeconds is computed from end − start.
    expect(row.durationSeconds).toBe(Math.round((row.timestamp - startedAt) / 1000));
    expect(row.durationSeconds).toBeGreaterThanOrEqual(8 * 60);
  });

  it('floors durationSeconds at 0 when startedAt is in the future (clock skew)', async () => {
    const session = await recordLessonRating('wf-01', 'flying', Date.now() + 60_000);
    expect(session.durationSeconds).toBe(0);
  });

  it('records each rating submission as its own row', async () => {
    await recordLessonRating('wf-01', 'crawling', Date.now() - 1_000);
    await recordLessonRating('wf-01', 'flying', Date.now() - 1_000);
    const rows = await db.productionLessonSessions.toArray();
    expect(rows).toHaveLength(2);
    expect(rows.map(r => r.rating).sort()).toEqual(['crawling', 'flying']);
  });
});

describe('recordLessonOpen — passive open events carry no rating', () => {
  it('writes a session row with no rating, startedAt, or duration', async () => {
    await recordLessonOpen('wf-01', false);
    const rows = await db.productionLessonSessions.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].rating).toBeUndefined();
    expect(rows[0].startedAt).toBeUndefined();
    expect(rows[0].durationSeconds).toBeUndefined();
  });

  it('a lesson opened (incl. deep dive) but never rated leaves zero rated rows', async () => {
    await recordLessonOpen('wf-01', false);
    await recordLessonOpen('wf-01', true); // deep dive opened
    const rated = await db.productionLessonSessions
      .filter(s => s.rating !== undefined)
      .toArray();
    expect(rated).toHaveLength(0);
  });
});
