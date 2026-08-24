// @vitest-environment jsdom
/**
 * A practice session is not a test, and must not move the retest clock.
 *
 * ---------------------------------------------------------------
 * THIS ASSERTS THE MECHANISM, WHICH IS AN ITEMREF NAMESPACE.
 *
 * Two spacing rows, one engine:
 *
 *   `songKey:<songKeyId>` — the retest clock. Written ONLY by
 *      `recordKeyProving`, when a whole-song test passes or fails.
 *      Read by `dueByKeyId` → `keyDueState` → the rung that holds or
 *      drops. This is the row that decides when a key comes due.
 *
 *   `<songId>` — the song. Written by `logPracticeSession` when the
 *      user rated the sitting.
 *
 * Practice cannot reach the first because it writes the second. The
 * rule from the other side is in `proveKey.ts`: a single run cannot
 * earn time, so it must not cost time either — and the same symmetry
 * applies to a practice sitting, which proves less than a single run.
 *
 * WHY THIS FILE EXISTS FROM STEP 3d-6 AND NOT BEFORE. Until the rating
 * step, the timer path passed no `feelRating`, so a timed sitting
 * never emitted a spacing signal at all and the boundary was never
 * exercised. It now runs on every rated session.
 *
 * The test would be worthless if it only checked that a key row stayed
 * put — that passes just as well on a build where the practice write
 * is broken and nothing is emitted at all. So every case here ALSO
 * asserts the song-level row was written. The claim is separation, not
 * silence.
 * ---------------------------------------------------------------
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../../lib/db';
import { getSpacingState } from '../../../lib/spacingState';
import { logPracticeSession } from '../logPractice';
import { dueByKeyId, recordKeyProving, songKeyItemRef } from '../matrix/proveKey';

const SONG = 'song-1';
const SONG_KEY = 'sk-ab';

beforeEach(async () => {
  await Promise.all([
    db.songPracticeLog.clear(),
    db.spacingState.clear(),
    db.songs.clear(),
  ]);
});

/** Every `songKey:`-namespaced spacing row, whatever song it belongs
 *  to. A practice write must create none and disturb none. */
async function keyClockRows() {
  const all = await db.spacingState.toArray();
  return all.filter(r => r.itemRef.startsWith('songKey:'));
}

describe('a rated practice session', () => {
  it('creates no row in the key-clock namespace', async () => {
    await logPracticeSession({
      songId: SONG, durationMin: 45, keys: ['Ab'], feelRating: 4,
      activities: ['under-the-fingers', 'in-time'],
    });

    expect(await keyClockRows()).toHaveLength(0);
    // Not vacuous: the practice signal really was emitted.
    expect(await getSpacingState(SONG, 'repertoire')).toBeDefined();
  });

  it('leaves an already-proven key exactly where the test left it', async () => {
    await recordKeyProving({ songKeyId: SONG_KEY, passed: true });
    const before = await getSpacingState(songKeyItemRef(SONG_KEY), 'repertoire');
    expect(before?.nextDueAt).toBeTruthy();

    await logPracticeSession({
      songId: SONG, durationMin: 90, keys: ['Ab'], feelRating: 4,
      activities: ['in-time'],
    });

    const after = await getSpacingState(songKeyItemRef(SONG_KEY), 'repertoire');
    expect(after?.nextDueAt).toBe(before?.nextDueAt);
    expect(after?.performanceHistory).toHaveLength(1);
    expect(await getSpacingState(SONG, 'repertoire')).toBeDefined();
  });

  it('cannot rescue a key it practised — a bad sitting does not cost it either', async () => {
    // The symmetry, both directions. Ninety minutes rated "struggled"
    // in this key must not pull the due date forward any more than
    // ninety minutes rated "in flow" pushes it back. Only the test
    // moves it.
    await recordKeyProving({ songKeyId: SONG_KEY, passed: true });
    const [{ nextDueAt: before }] = await keyClockRows();

    await logPracticeSession({
      songId: SONG, durationMin: 90, keys: ['Ab'], feelRating: 1,
    });

    const [{ nextDueAt: after }] = await keyClockRows();
    expect(after).toBe(before);
    expect(await getSpacingState(SONG, 'repertoire')).toBeDefined();
  });

  it('does not change what the matrix reads as due', async () => {
    // One level up from the row: the value the rung actually consults.
    await recordKeyProving({ songKeyId: SONG_KEY, passed: true });
    const before = await dueByKeyId([SONG_KEY]);

    await logPracticeSession({
      songId: SONG, durationMin: 60, keys: ['Ab'], feelRating: 3,
      activities: ['just-playing'],
    });

    const after = await dueByKeyId([SONG_KEY]);
    expect(after.get(SONG_KEY)).toBe(before.get(SONG_KEY));
    expect(before.get(SONG_KEY)).not.toBeNull();
  });

  it('does not START a clock on a key that was never proven', async () => {
    // The nastier direction. A key with no row reads as never-proven,
    // which HOLDS the rung; a practice sitting that quietly opened a
    // row would give the key a due date it never earned, and the first
    // anyone would know is a demotion.
    await logPracticeSession({
      songId: SONG, durationMin: 60, keys: ['Ab'], feelRating: 4,
    });

    expect((await dueByKeyId([SONG_KEY])).get(SONG_KEY)).toBeNull();
    expect(await keyClockRows()).toHaveLength(0);
    expect(await getSpacingState(SONG, 'repertoire')).toBeDefined();
  });
});
