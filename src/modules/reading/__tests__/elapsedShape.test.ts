// @vitest-environment jsdom
/**
 * The probe describes the corpus. It does not touch it.
 *
 * The rows it counts are contaminated — ReadingDrill sets `shownAt`
 * once per card and never invalidates it, so a card left open
 * overnight is stored as an answer that took hours. This asserts the
 * probe separates those from the real measurements and, more
 * importantly, that it leaves every row where it found it.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../../lib/db';
import { WALK_AWAY_CEILING_MS } from '../../../lib/attemptTiming';
import { readingElapsedShape } from '../elapsedShape';

const MODULE = 'reading';

beforeEach(async () => { await db.attempts.clear(); });

async function seed(elapsed: Array<number | undefined>) {
  await db.attempts.bulkAdd(elapsed.map((ms, i) => ({
    id: `att-shape-${i}`,
    moduleId: MODULE,
    itemId: `item-${i}`,
    correct: true,
    timestamp: 1_700_000_000_000 + i,
    ...(ms === undefined ? {} : { elapsedMs: ms }),
  })) as never);
}

describe('readingElapsedShape', () => {
  it('separates the contaminated rows from the real ones', async () => {
    await seed([800, 2_400, 9_000, 4 * 60 * 60 * 1000, 6 * 60 * 1000]);
    const shape = await readingElapsedShape();
    expect(shape.attempts).toBe(5);
    expect(shape.withElapsed).toBe(5);
    expect(shape.overCeiling).toBe(2);
    expect(shape.belowCeiling?.count).toBe(3);
    expect(shape.worstHours).toBe(4);
  });

  it('counts attempts that never recorded a time at all', async () => {
    await seed([1_000, undefined, undefined]);
    const shape = await readingElapsedShape();
    expect(shape.missingElapsed).toBe(2);
    expect(shape.withElapsed).toBe(1);
  });

  it('buckets below the ceiling without double-counting', async () => {
    await seed([500, 900, 1_500, 4_000, 45_000, WALK_AWAY_CEILING_MS + 1]);
    const shape = await readingElapsedShape();
    const total = shape.buckets.reduce((sum, b) => sum + b.count, 0);
    expect(total).toBe(shape.belowCeiling?.count);
    expect(shape.buckets.find(b => b.label === '<1s')?.count).toBe(2);
    expect(shape.buckets.find(b => b.label === '1–2s')?.count).toBe(1);
    expect(shape.buckets.find(b => b.label === '30s–1m')?.count).toBe(1);
  });

  it('reports nothing rather than dividing by zero on an empty corpus', async () => {
    const shape = await readingElapsedShape();
    expect(shape.attempts).toBe(0);
    expect(shape.belowCeiling).toBeNull();
    expect(shape.worstHours).toBeNull();
  });

  it('deletes nothing and changes nothing', async () => {
    // The whole point: the shape has to be visible before anyone
    // decides what to do about it, and a cleanup written before that
    // decision destroys the evidence for it.
    await seed([800, 4 * 60 * 60 * 1000]);
    const before = await db.attempts.toArray();
    await readingElapsedShape();
    const after = await db.attempts.toArray();
    expect(after).toEqual(before);
  });
});
