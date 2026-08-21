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
  bankOpenGap,
  inactivityMs,
  resolvedGap,
  withActivity,
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
      lastActivityAt: T0,
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

describe('inactivity and gap resolution', () => {
  it('measures how long the app has seen nothing', () => {
    const r = startedRecord('song-1', T0);
    expect(inactivityMs(r, T0 + 8 * MIN)).toBe(8 * MIN);
  });

  it('activity resets the inactivity clock without touching elapsed', () => {
    // Guard the guard: elapsed really is running, so a helper that
    // reset the wrong field would show up here.
    const r = withActivity(startedRecord('song-1', T0), T0 + 6 * MIN, null);
    expect(inactivityMs(r, T0 + 6 * MIN)).toBe(0);
    expect(elapsedMs(r, T0 + 6 * MIN)).toBe(6 * MIN);
  });

  it('never moves the activity clock backwards', () => {
    const r = withActivity(startedRecord('song-1', T0 + 5 * MIN), T0, null);
    expect(r.lastActivityAt).toBe(T0 + 5 * MIN);
  });

  it('"I was locked in" keeps the whole gap', () => {
    const r = startedRecord('song-1', T0);
    const settled = resolvedGap(r, T0 + 40 * MIN, 1);
    expect(elapsedMs(settled, T0 + 40 * MIN)).toBe(40 * MIN);
  });

  it('"I was gone" removes the gap and keeps everything before it', () => {
    // Ten minutes of tracked work, then a thirty-minute gap. Only the
    // gap goes.
    let r = startedRecord('song-1', T0);
    r = withActivity(r, T0 + 10 * MIN, null);
    const settled = resolvedGap(r, T0 + 40 * MIN, 0);
    expect(elapsedMs(settled, T0 + 40 * MIN)).toBe(10 * MIN);
  });

  it('the coarse buckets keep their fraction of the gap', () => {
    let r = startedRecord('song-1', T0);
    r = withActivity(r, T0 + 10 * MIN, null);
    const at = T0 + 50 * MIN;                       // a 40-minute gap
    for (const [fraction, expected] of [[0.75, 40], [0.5, 30], [0.25, 20]] as const) {
      expect(elapsedMs(resolvedGap(r, at, fraction), at)).toBe(expected * MIN);
    }
  });

  it('restarts the gap, so settling twice cannot discount twice', () => {
    let r = startedRecord('song-1', T0);
    r = withActivity(r, T0 + 10 * MIN, null);
    const at = T0 + 40 * MIN;
    const once = resolvedGap(r, at, 0);
    const twice = resolvedGap(once, at, 0);
    expect(elapsedMs(twice, at)).toBe(elapsedMs(once, at));
  });

  it('a well-formed record can only ever be discounted to exactly zero', () => {
    // The gap is bounded by the elapsed on any record built by these
    // helpers, so discarding all of it lands on 0 and never below.
    // Stated as the invariant rather than as a clamp test — the clamp
    // is not what produces this, and a test claiming otherwise would
    // pass with the clamp removed. Verified: it does.
    const r = startedRecord('song-1', T0);
    expect(elapsedMs(resolvedGap(r, T0 + 5 * MIN, 0), T0 + 5 * MIN)).toBe(0);
  });

  it('CLAMPS a corrupt record whose activity predates its start', () => {
    // ---------------------------------------------------------------
    // THERE ARE TWO CLAMPS AND THIS TESTS THE FIRST ONE.
    //
    // `resolvedGap` clamps the banked total at zero. `elapsedMs` ALSO
    // clamps `accumulatedMs` at zero when it reads it. So a test that
    // asserts through `elapsedMs` sees the second clamp absorb the
    // negative and passes whether or not the first exists — which is
    // exactly what happened: two drafts of this test stayed green with
    // resolvedGap's clamp removed, and only asserting on the stored
    // field caught it.
    //
    // Assert on `resolvedGap(...).accumulatedMs`. Never on the elapsed
    // derived from it.
    //
    // The reachable path is the only one: nothing in this module
    // produces lastActivityAt < startedAt, but the record crosses a
    // process boundary and can be hand-edited. Without the clamp the
    // stored total goes negative and rounds to a negative duration
    // logged against a real song.
    // ---------------------------------------------------------------
    const corrupt: SongTimerRecord = {
      songId: 'song-1', startedAt: T0, accumulatedMs: 0, running: true,
      lastActivityAt: T0 - 30 * MIN,
    };
    // Guard the guard: the gap really does exceed the elapsed here.
    expect(inactivityMs(corrupt, T0 + MIN)).toBeGreaterThan(elapsedMs(corrupt, T0 + MIN));
    // ASSERTED ON THE FIELD, not through elapsedMs — which clamps
    // accumulatedMs itself, so reading the result that way passes
    // whether or not resolvedGap clamps. Verified by reversal: the
    // elapsedMs version stayed green with the clamp removed.
    expect(resolvedGap(corrupt, T0 + MIN, 0).accumulatedMs).toBe(0);
  });

  it('normalises a record written before lastActivityAt existed', () => {
    // Rejecting it would mean an upgrade silently ate a running
    // timer over a field the user never knew about.
    localStorage.setItem('mja.songTimer.v1', JSON.stringify({
      songId: 'song-1', startedAt: T0, accumulatedMs: 0, running: true,
    }));
    expect(readSongTimer()?.lastActivityAt).toBe(T0);
  });
});

describe('an unwitnessed stretch is banked, never dropped', () => {
  const THRESH = 5 * MIN;

  it('banks the gap when activity resumes after a long silence', () => {
    // WITHOUT THIS the first tap on returning moves lastActivityAt to
    // now and the stretch vanishes into the total as focused
    // practice — the one outcome the whole mechanism exists to
    // prevent.
    const r = withActivity(startedRecord('song-1', T0), T0 + 40 * MIN, THRESH);
    expect(r.pendingGapMs).toBe(40 * MIN);
  });

  it('does not bank a silence under the threshold', () => {
    const r = withActivity(startedRecord('song-1', T0), T0 + 2 * MIN, THRESH);
    expect(r.pendingGapMs ?? 0).toBe(0);
  });

  it('banks nothing at all when the mechanism is switched off', () => {
    const r = withActivity(startedRecord('song-1', T0), T0 + 90 * MIN, null);
    expect(r.pendingGapMs ?? 0).toBe(0);
  });

  it('ACCUMULATES across gaps rather than replacing', () => {
    // Two silences before anyone answers is two stretches of unknown
    // time. Keeping only the later would quietly forgive the earlier.
    let r = startedRecord('song-1', T0);
    r = withActivity(r, T0 + 30 * MIN, THRESH);
    r = withActivity(r, T0 + 80 * MIN, THRESH);
    expect(r.pendingGapMs).toBe(80 * MIN);
  });

  it('answering a banked stretch discounts it and clears the pending flag', () => {
    let r = startedRecord('song-1', T0);
    r = withActivity(r, T0 + 40 * MIN, THRESH);
    // Guard the guard: forty of the forty-one minutes are unattributed.
    expect(r.pendingGapMs).toBe(40 * MIN);
    const at = T0 + 41 * MIN;
    const settled = resolvedGap(r, at, 0, r.pendingGapMs);
    expect(elapsedMs(settled, at)).toBe(1 * MIN);
    expect(settled.pendingGapMs).toBe(0);
  });

  it('bankOpenGap catches a silence that is still open at stop', () => {
    // Nothing has resumed, so withActivity never ran. Stopping without
    // this would log the silence as focused practice — the same
    // failure one step later.
    const r = bankOpenGap(startedRecord('song-1', T0), T0 + 50 * MIN, THRESH);
    expect(r.pendingGapMs).toBe(50 * MIN);
  });

  it('bankOpenGap leaves a short silence alone', () => {
    const r = bankOpenGap(startedRecord('song-1', T0), T0 + 3 * MIN, THRESH);
    expect(r.pendingGapMs ?? 0).toBe(0);
  });
});
