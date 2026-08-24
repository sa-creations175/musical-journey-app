/**
 * Rolling per-key due dates up to one song.
 *
 * The two exclusions carry the whole rule, and both are easy to
 * "simplify" away by someone who reads this as a min/max over states:
 * a key that never held anything has nothing to re-prove, and an
 * OVERDUE key belongs to the demotion notice rather than to this list.
 */
import { describe, expect, it } from 'vitest';
import type { SongKey, SongKeyState } from '../../../lib/db';
import { countSongsDue, songDueReading } from '../songDueState';
import { DUE_SOON_DEFAULT_DAYS, GRACE_DEFAULT_DAYS } from '../matrix/keySpacing';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_760_000_000_000;
const WINDOWS = { dueSoonDays: DUE_SOON_DEFAULT_DAYS, graceDays: GRACE_DEFAULT_DAYS };

const key = (id: string, keyState: SongKeyState = 'comfortable'): SongKey => ({
  id, songId: 's1', keyName: id, isOriginalKey: false,
  keyState, solidAt: null, solidDecayState: null,
  lastDecayCheckAt: null, livedWithSessionCount: 0,
  livedWithFirstSessionAt: null, livedWithWindowStartAt: null,
  livedWithSessionsInWindow: 0, wholeSongTestPassedAt: null,
  isRetestRecommended: false, lastEngagedAt: NOW, createdAt: 0, updatedAt: 0,
});

const read = (keys: SongKey[], due: Record<string, number | null>) =>
  songDueReading(keys, new Map(Object.entries(due)), NOW, WINDOWS);

describe('a key with work available', () => {
  it('reports due when one is past its date', () => {
    const r = read([key('A')], { A: NOW - DAY });
    expect(r?.state).toBe('due');
    expect(r?.dueKeys.map(d => d.key.id)).toEqual(['A']);
  });

  it('reports due-soon inside the warning window', () => {
    const r = read([key('A')], { A: NOW + 3 * DAY });
    expect(r?.state).toBe('due-soon');
    expect(r?.soonKeys.map(d => d.key.id)).toEqual(['A']);
  });

  it('lets due outrank soon when a song has both', () => {
    // A single row can carry one statement, and the more urgent of two
    // true ones is the one worth carrying.
    const r = read([key('A'), key('D')], { A: NOW - DAY, D: NOW + 3 * DAY });
    expect(r?.state).toBe('due');
    expect(r?.dueKeys.map(d => d.key.id)).toEqual(['A']);
    expect(r?.soonKeys.map(d => d.key.id)).toEqual(['D']);
  });
});

describe('nothing to say', () => {
  it('returns null when every key is comfortably inside its interval', () => {
    expect(read([key('A')], { A: NOW + 40 * DAY })).toBeNull();
  });

  it('returns null for a key that has never been proven', () => {
    // A null due date is not "due now" — the key has not earned a date
    // and cannot be late for it.
    expect(read([key('A')], { A: null })).toBeNull();
  });

  it('returns null rather than a state that renders nothing', () => {
    // Every caller draws nothing here. A `'held'` member would be a
    // branch waiting to be rendered by mistake.
    expect(read([], {})).toBeNull();
  });
});

describe('the two exclusions', () => {
  it('ignores a key that never held part of a rung', () => {
    // `learning` has no claim to re-prove and nothing to lose.
    expect(read([key('A', 'learning')], { A: NOW - 90 * DAY })).toBeNull();
  });

  it('EXCLUDES an overdue key — that is the demotion notice, not this', () => {
    // Past due AND past grace: the rung has already dropped, and the
    // song page says so persistently with the date and the criterion.
    // Listing it as "due" would put a song that has lost something in
    // the same row as one that still has time to keep it.
    const overdue = NOW - (GRACE_DEFAULT_DAYS + 5) * DAY;
    expect(read([key('A')], { A: overdue })).toBeNull();
  });

  it('still reports a due key on a song that ALSO has an overdue one', () => {
    // The exclusion is per key, not per song. One rung gone does not
    // silence the work still available on another key.
    const overdue = NOW - (GRACE_DEFAULT_DAYS + 5) * DAY;
    const r = read([key('A'), key('D')], { A: overdue, D: NOW - DAY });
    expect(r?.state).toBe('due');
    expect(r?.dueKeys.map(d => d.key.id)).toEqual(['D']);
  });

  it('keeps a key inside grace, which still holds its rung', () => {
    // Due-but-not-yet-overdue is the state the whole warning exists
    // for: past the date, still counting, still recoverable.
    const inGrace = NOW - (GRACE_DEFAULT_DAYS - 2) * DAY;
    expect(read([key('A')], { A: inGrace })?.state).toBe('due');
  });
});

describe('countSongsDue', () => {
  it('counts songs with something to re-prove, not keys', () => {
    const withWork = read([key('A'), key('D')], { A: NOW - DAY, D: NOW - DAY });
    expect(countSongsDue([withWork, null, withWork])).toBe(2);
  });

  it('is zero when nothing is due', () => {
    expect(countSongsDue([null, null])).toBe(0);
  });
});
