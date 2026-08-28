// @vitest-environment jsdom
/**
 * The duplicate-row bug, both halves.
 *
 * A read-then-write is two awaits, and StrictMode double-invokes an
 * effect in dev. Both copies saw no row and both inserted, because
 * `[moduleRef+itemRef+hand]` is a plain index and the primary key was
 * random. So: the write path must survive CONCURRENCY, not just
 * repetition, and the cleanup must survive being run twice.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, type SpacingState } from '../../db';
import { getSpacingState, recordEngagementOccurred, spacingRowId } from '../../spacingState';
import { getPref } from '../../userPrefs';
import {
  PREF_SPACING_DUPES_REMOVED,
  duplicatesToRemove,
  pickSurvivor,
  removeDuplicateSpacingRows,
} from '../dedupeSpacingRows';

const row = (over: Partial<SpacingState>): SpacingState => ({
  id: 'r1',
  itemRef: 'songCell:c1',
  moduleRef: 'repertoire',
  hand: 'both',
  memoryType: 'integration',
  acquisitionStage: 'acquiring',
  currentIntervalDays: 0,
  lastEngagedAt: 1,
  nextDueAt: null,
  performanceHistory: [],
  ...over,
} as SpacingState);

beforeEach(async () => {
  await Promise.all([db.spacingState.clear(), db.userPrefs.clear()]);
});

describe('the write path survives concurrency', () => {
  it('two concurrent calls produce ONE row', async () => {
    // The actual failure: both reach the existence check before either
    // reaches the insert.
    await Promise.all([
      recordEngagementOccurred({ itemRef: 'songCell:c1', moduleRef: 'repertoire' }),
      recordEngagementOccurred({ itemRef: 'songCell:c1', moduleRef: 'repertoire' }),
    ]);
    expect(await db.spacingState.count()).toBe(1);
  });

  it('eight concurrent calls still produce one row', async () => {
    await Promise.all(Array.from({ length: 8 }, () =>
      recordEngagementOccurred({ itemRef: 'songCell:c1', moduleRef: 'repertoire' })));
    expect(await db.spacingState.count()).toBe(1);
  });

  it('every racing caller gets the same row back', async () => {
    const [a, b] = await Promise.all([
      recordEngagementOccurred({ itemRef: 'songCell:c1', moduleRef: 'repertoire' }),
      recordEngagementOccurred({ itemRef: 'songCell:c1', moduleRef: 'repertoire' }),
    ]);
    // The loser must not get a phantom row that was never stored.
    expect(a.id).toBe(b.id);
    const stored = await getSpacingState('songCell:c1', 'repertoire', 'both');
    expect(stored?.id).toBe(a.id);
  });

  it('keys the row on the identity the app already uses', async () => {
    const r = await recordEngagementOccurred({ itemRef: 'songCell:c1', moduleRef: 'repertoire' });
    expect(r.id).toBe(spacingRowId('repertoire', 'songCell:c1', 'both'));
  });

  it('different items still get their own rows', async () => {
    await Promise.all([
      recordEngagementOccurred({ itemRef: 'songCell:c1', moduleRef: 'repertoire' }),
      recordEngagementOccurred({ itemRef: 'songCell:c2', moduleRef: 'repertoire' }),
    ]);
    expect(await db.spacingState.count()).toBe(2);
  });

  it('different hands are different items', async () => {
    await Promise.all([
      recordEngagementOccurred({ itemRef: 'x', moduleRef: 'shapes-and-patterns', hand: 'left' }),
      recordEngagementOccurred({ itemRef: 'x', moduleRef: 'shapes-and-patterns', hand: 'right' }),
    ]);
    expect(await db.spacingState.count()).toBe(2);
  });

  it('still short-circuits on an existing row from an earlier call', async () => {
    const first = await recordEngagementOccurred({ itemRef: 'songCell:c1', moduleRef: 'repertoire' });
    const second = await recordEngagementOccurred({ itemRef: 'songCell:c1', moduleRef: 'repertoire' });
    expect(second.id).toBe(first.id);
    expect(second.lastEngagedAt).toBe(first.lastEngagedAt);
    expect(await db.spacingState.count()).toBe(1);
  });
});

describe('picking the survivor', () => {
  it('keeps the row carrying the most history', () => {
    const thin = row({ id: 'a', performanceHistory: [] });
    const fat = row({ id: 'z', performanceHistory: [{ t: 1, kind: 'recency' }] });
    // 'a' sorts first, so this proves history beats the id tiebreak.
    expect(pickSurvivor([thin, fat]).id).toBe('z');
  });

  it('breaks ties on the id, not on argument order', () => {
    const a = row({ id: 'aaa' });
    const b = row({ id: 'bbb' });
    expect(pickSurvivor([b, a]).id).toBe('aaa');
    expect(pickSurvivor([a, b]).id).toBe('aaa');
  });
});

describe('choosing what to remove', () => {
  it('leaves a table with no duplicates completely alone', () => {
    const r = duplicatesToRemove([
      row({ id: 'a', itemRef: 'songCell:c1' }),
      row({ id: 'b', itemRef: 'songCell:c2' }),
    ]);
    expect(r.doomed).toEqual([]);
    expect(r.itemsAffected).toBe(0);
    expect(r.itemsTotal).toBe(2);
  });

  it('removes all but one of each duplicate set', () => {
    const r = duplicatesToRemove([
      row({ id: 'a', itemRef: 'songCell:c1' }),
      row({ id: 'b', itemRef: 'songCell:c1' }),
      row({ id: 'c', itemRef: 'songCell:c1' }),
      row({ id: 'd', itemRef: 'songCell:c2' }),
    ]);
    expect(r.doomed.map(x => x.id).sort()).toEqual(['b', 'c']);
    expect(r.itemsAffected).toBe(1);
  });

  it('does not treat two hands of one itemRef as duplicates', () => {
    const r = duplicatesToRemove([
      row({ id: 'a', hand: 'left' }),
      row({ id: 'b', hand: 'right' }),
    ]);
    expect(r.doomed).toEqual([]);
  });

  it('does not treat one itemRef under two modules as duplicates', () => {
    const r = duplicatesToRemove([
      row({ id: 'a', moduleRef: 'repertoire' }),
      row({ id: 'b', moduleRef: 'shapes-and-patterns' }),
    ]);
    expect(r.doomed).toEqual([]);
  });
});

describe('the pass itself', () => {
  it('reduces the real shape — every item written exactly twice', async () => {
    for (let i = 1; i <= 8; i++) {
      await db.spacingState.bulkAdd([
        row({ id: `x${i}`, itemRef: `songCell:c${i}` }),
        row({ id: `y${i}`, itemRef: `songCell:c${i}` }),
      ]);
    }
    expect(await db.spacingState.count()).toBe(16);
    const r = await removeDuplicateSpacingRows();
    expect(r).toEqual({ skipped: false, removed: 8, itemsAffected: 8, itemsTotal: 8 });
    expect(await db.spacingState.count()).toBe(8);
    expect(await getPref(PREF_SPACING_DUPES_REMOVED, false)).toBe(true);
  });

  it('skips on a second run', async () => {
    await db.spacingState.bulkAdd([row({ id: 'a' }), row({ id: 'b' })]);
    await removeDuplicateSpacingRows();
    const again = await removeDuplicateSpacingRows();
    expect(again.skipped).toBe(true);
    expect(await db.spacingState.count()).toBe(1);
  });

  it('is harmless with the pref cleared — deletes are idempotent', async () => {
    await db.spacingState.bulkAdd([row({ id: 'a' }), row({ id: 'b' })]);
    await removeDuplicateSpacingRows();
    await db.userPrefs.clear();
    const again = await removeDuplicateSpacingRows();
    expect(again.skipped).toBe(false);
    expect(again.removed).toBe(0);
    expect(await db.spacingState.count()).toBe(1);
  });

  it('survives being run concurrently with itself', async () => {
    // The failure mode that created the duplicates, applied to the
    // cleanup. Deleting a gone id is a no-op, so both runs converge.
    await db.spacingState.bulkAdd([row({ id: 'a' }), row({ id: 'b' })]);
    await Promise.all([removeDuplicateSpacingRows(), removeDuplicateSpacingRows()]);
    expect(await db.spacingState.count()).toBe(1);
  });

  it('never removes the row with more evidence', async () => {
    await db.spacingState.bulkAdd([
      row({ id: 'a', performanceHistory: [] }),
      row({ id: 'b', performanceHistory: [{ t: 1, kind: 'recency' }] }),
    ]);
    await removeDuplicateSpacingRows();
    const left = await db.spacingState.toArray();
    expect(left).toHaveLength(1);
    expect(left[0].id).toBe('b');
  });
});
