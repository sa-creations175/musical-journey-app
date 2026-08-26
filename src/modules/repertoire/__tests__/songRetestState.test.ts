/**
 * What the stage badge adds, and what it refuses to add.
 *
 * The rule worth pinning hardest is the one about LEARNING: nothing has
 * been proven there, so nothing can have decayed, and a badge asking
 * for a retest of something that was never a test is the defect this
 * function exists to prevent.
 */
import { describe, expect, it } from 'vitest';
import type { RepertoireStage, SongKey } from '../../../lib/db';
import { GRACE_DEFAULT_DAYS, DUE_SOON_DEFAULT_DAYS } from '../matrix/keySpacing';
import { retestSuffix, songRetestState } from '../songRetestState';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 7, 25, 12);
const WINDOWS = { dueSoonDays: DUE_SOON_DEFAULT_DAYS, graceDays: GRACE_DEFAULT_DAYS };

const key = (id: string, keyState: SongKey['keyState'] = 'comfortable'): SongKey =>
  ({ id, songId: 'song-1', keyName: 'Bb', keyState } as SongKey);

const read = (
  stage: RepertoireStage,
  keys: SongKey[],
  due: Array<[string, number | null]>,
) => songRetestState(stage, keys, new Map(due), NOW, WINDOWS);

describe('a rung that still stands', () => {
  it('says nothing while every key is inside its interval', () => {
    expect(read('comfortable', [key('k1')], [['k1', NOW + 30 * DAY]])).toBeNull();
  });

  it('says nothing for a key approaching its date', () => {
    // DUE-SOON IS NOT DUE. The matrix shows `soon` on the row you would
    // act on; a badge saying "due" a week early would make the word
    // mean two things.
    expect(read('comfortable', [key('k1')], [['k1', NOW + 2 * DAY]])).toBeNull();
  });

  it('says nothing for a song with no keys at all', () => {
    expect(read('comfortable', [], [])).toBeNull();
  });
});

describe('due', () => {
  it('appears the day the date arrives', () => {
    expect(read('comfortable', [key('k1')], [['k1', NOW]])).toEqual({ state: 'due' });
  });

  it('holds through grace rather than tipping straight to overdue', () => {
    const insideGrace = NOW - (GRACE_DEFAULT_DAYS - 1) * DAY;
    expect(read('comfortable', [key('k1')], [['k1', insideGrace]]))
      .toEqual({ state: 'due' });
  });
});

describe('overdue', () => {
  it('counts the days past the end of grace, not past the due date', () => {
    // Nine days past grace, which is nine days later than the naive
    // reading — an assertion on the due date alone would pass on a
    // function that forgot grace entirely.
    const due = NOW - (GRACE_DEFAULT_DAYS + 9) * DAY;
    expect(read('comfortable', [key('k1')], [['k1', due]]))
      .toEqual({ state: 'overdue', days: 9 });
  });

  it('outranks due when a song has both', () => {
    // Different in kind: one is "do this and keep it", the other is
    // "this is already gone". A badge has room for the more serious.
    const overdue = NOW - (GRACE_DEFAULT_DAYS + 3) * DAY;
    expect(read('comfortable', [key('k1'), key('k2')], [['k1', NOW], ['k2', overdue]]))
      .toEqual({ state: 'overdue', days: 3 });
  });

  it('reports the WORST key, not the first', () => {
    const mild = NOW - (GRACE_DEFAULT_DAYS + 2) * DAY;
    const bad = NOW - (GRACE_DEFAULT_DAYS + 40) * DAY;
    expect(read('comfortable', [key('k1'), key('k2')], [['k1', mild], ['k2', bad]]))
      .toEqual({ state: 'overdue', days: 40 });
  });
});

describe('what cannot decay', () => {
  it('never shows a state at learning, whatever the keys say', () => {
    // THE RULE. Even with a key long past grace — which can happen,
    // since a song can fall back to `learning` while still carrying the
    // key that once counted.
    const due = NOW - (GRACE_DEFAULT_DAYS + 20) * DAY;
    expect(read('learning', [key('k1')], [['k1', due]])).toBeNull();
    expect(read('learning', [key('k1')], [['k1', NOW]])).toBeNull();
  });

  it('ignores a key that never counted toward a rung', () => {
    // `learning` keyState has no claim to re-prove.
    expect(read('comfortable', [key('k1', 'learning')], [['k1', NOW - 100 * DAY]]))
      .toBeNull();
  });

  it('ignores a key that has never been proven', () => {
    // No due date is not "due now" — it is a key that has not started.
    expect(read('comfortable', [key('k1')], [['k1', null]])).toBeNull();
    expect(read('comfortable', [key('k1')], [])).toBeNull();
  });

  it('does show a state at every rung above learning', () => {
    for (const stage of ['comfortable', 'cross-key', 'internalized'] as RepertoireStage[]) {
      expect(read(stage, [key('k1')], [['k1', NOW]]), stage).toEqual({ state: 'due' });
    }
  });
});

describe('what the badge appends', () => {
  it('adds nothing when there is nothing to add', () => {
    expect(retestSuffix(null)).toBeNull();
  });

  it('names the two states the way the badge shows them', () => {
    expect(retestSuffix({ state: 'due' })).toBe('due');
    expect(retestSuffix({ state: 'overdue', days: 9 })).toBe('overdue 9d');
  });
});
