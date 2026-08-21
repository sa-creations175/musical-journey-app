// @vitest-environment jsdom
/**
 * The song timer's storage and time arithmetic.
 *
 * The property that matters is that elapsed time is DERIVED from
 * stored timestamps rather than accumulated by ticking — that is what
 * makes a reload recover exactly, with no recovery logic. So the
 * central test simulates a reload by throwing the in-memory record
 * away and reading it back, and the reversal for it replaces the
 * derivation with a ticking counter.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearSongTimer,
  elapsedMinutes,
  elapsedMs,
  pausedRecord,
  readSongTimer,
  resumedRecord,
  startedRecord,
  writeSongTimer,
  type SongTimerRecord,
} from '../songTimer';

const T0 = 1_760_000_000_000;
const MIN = 60_000;

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('elapsed derives from timestamps', () => {
  it('counts the running segment against the clock', () => {
    const r = startedRecord('song-1', T0);
    expect(elapsedMs(r, T0)).toBe(0);
    expect(elapsedMs(r, T0 + 5 * MIN)).toBe(5 * MIN);
  });

  it('SURVIVES A RELOAD EXACTLY — the record is the only state', () => {
    // Start, persist, throw the in-memory value away, read it back
    // twelve minutes later. Nothing ticked in between; the number
    // comes entirely from startedAt and the clock.
    writeSongTimer(startedRecord('song-1', T0));
    const afterReload = readSongTimer();
    expect(afterReload).not.toBeNull();
    expect(elapsedMs(afterReload!, T0 + 12 * MIN)).toBe(12 * MIN);
  });

  it('ignores the clock entirely while paused', () => {
    const paused = pausedRecord(startedRecord('song-1', T0), T0 + 3 * MIN);
    expect(elapsedMs(paused, T0 + 3 * MIN)).toBe(3 * MIN);
    // Hours later, still three minutes.
    expect(elapsedMs(paused, T0 + 300 * MIN)).toBe(3 * MIN);
  });

  it('does not go backwards when the clock does', () => {
    // NTP correction or a manual clock change. Guard: the segment
    // really is negative, so a rule that just added it would return
    // less than the banked time.
    const r: SongTimerRecord = {
      songId: 'song-1', startedAt: T0, accumulatedMs: 4 * MIN, running: true,
    };
    expect(T0 - MIN - r.startedAt).toBeLessThan(0);
    expect(elapsedMs(r, T0 - MIN)).toBe(4 * MIN);
  });
});

describe('pause and resume bank time rather than losing it', () => {
  it('keeps the first segment across a pause and a resume', () => {
    let r = startedRecord('song-1', T0);
    r = pausedRecord(r, T0 + 4 * MIN);
    r = resumedRecord(r, T0 + 60 * MIN);          // away for an hour
    expect(elapsedMs(r, T0 + 63 * MIN)).toBe(7 * MIN); // 4 banked + 3 live
  });

  it('pausing twice does not double-count the segment', () => {
    // Guard the guard: the first pause really did bank four minutes,
    // so a non-idempotent second pause would show eight.
    const once = pausedRecord(startedRecord('song-1', T0), T0 + 4 * MIN);
    expect(once.accumulatedMs).toBe(4 * MIN);
    const twice = pausedRecord(once, T0 + 8 * MIN);
    expect(twice.accumulatedMs).toBe(4 * MIN);
  });

  it('resuming a running record does not restart its segment', () => {
    const r = startedRecord('song-1', T0);
    const again = resumedRecord(r, T0 + 5 * MIN);
    expect(elapsedMs(again, T0 + 5 * MIN)).toBe(5 * MIN);
  });
});

describe('minutes to log', () => {
  it('rounds up, so a short pass is not dropped', () => {
    const r = startedRecord('song-1', T0);
    expect(elapsedMinutes(r, T0 + 40_000)).toBe(1);
    expect(elapsedMinutes(r, T0 + 61_000)).toBe(2);
  });

  it('is zero only for a zero-length record', () => {
    expect(elapsedMinutes(startedRecord('song-1', T0), T0)).toBe(0);
  });
});

describe('storage', () => {
  it('round-trips a record', () => {
    const r = startedRecord('song-1', T0);
    writeSongTimer(r);
    expect(readSongTimer()).toEqual(r);
  });

  it('holds ONE timer — writing a second replaces the first', () => {
    writeSongTimer(startedRecord('song-A', T0));
    writeSongTimer(startedRecord('song-B', T0 + MIN));
    expect(readSongTimer()?.songId).toBe('song-B');
  });

  it('clears', () => {
    writeSongTimer(startedRecord('song-1', T0));
    clearSongTimer();
    expect(readSongTimer()).toBeNull();
  });

  it('rejects a malformed record rather than trusting it', () => {
    // This data crosses a process boundary — written by a possibly
    // older build, and editable by hand. A record waved through would
    // produce NaN elapsed and log a nonsense duration against a real
    // song.
    const bad = [
      '{"songId":"s","startedAt":"nope","accumulatedMs":0,"running":true}',
      '{"songId":"","startedAt":1,"accumulatedMs":0,"running":true}',
      '{"songId":"s","startedAt":1,"accumulatedMs":0}',
      '{"startedAt":1,"accumulatedMs":0,"running":true}',
      'not json at all',
      'null',
    ];
    for (const raw of bad) {
      localStorage.setItem('mja.songTimer.v1', raw);
      expect(readSongTimer()).toBeNull();
    }
  });

  it('degrades to no-timer when localStorage throws', () => {
    // Safari private mode, or a full quota. A practice timer is not
    // worth taking the screen down for.
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(readSongTimer()).toBeNull();
  });

  it('a failed write does not throw at the caller', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => writeSongTimer(startedRecord('song-1', T0))).not.toThrow();
  });
});
