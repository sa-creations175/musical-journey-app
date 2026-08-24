// @vitest-environment jsdom
/**
 * The song timer hook's write path.
 *
 * The property worth the most here is ATTRIBUTION: a swap logs the
 * minutes against the song being LEFT, not the song being opened.
 * Getting that backwards would silently move practice between songs
 * and would look correct on screen — a toast naming a song and a
 * number, both plausible.
 *
 * Rendered rather than tested as pure functions because the ordering
 * (log, THEN start) is the part that can break. Uses createRoot + act
 * directly, matching TreeRow.test.tsx; the repo has no
 * @testing-library dependency and this is not worth adding one for.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { db } from '../../../lib/db';
import { useSongTimer, type SongTimerApi } from '../useSongTimer';
import { readSongTimer, startedRecord, writeSongTimer } from '../songTimer';

const MIN = 60_000;

beforeEach(async () => {
  localStorage.clear();
  await db.songPracticeLog.clear();
  vi.restoreAllMocks();
});

/** Mount the hook and expose its API. */
function mount(songId: string) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const box: { api: SongTimerApi | null } = { api: null };
  function Probe() {
    box.api = useSongTimer(songId);
    return null;
  }
  const root = createRoot(container);
  act(() => { root.render(<Probe />); });
  return {
    get api() { return box.api!; },
    unmount() { act(() => { root.unmount(); }); container.remove(); },
  };
}

/**
 * Put a running timer on `songId` that will log exactly `minutes`.
 *
 * Backdated five seconds SHORT of the full span, because
 * `elapsedMinutes` rounds up: an exactly-N-minute fixture plus the
 * milliseconds the test itself takes lands on N+1. That rounding is
 * correct — a 40-second pass must not record as zero — so the fixture
 * accommodates it rather than the rule bending for the fixture.
 */
function runningFor(songId: string, minutes: number) {
  writeSongTimer(startedRecord(songId, Date.now() - (minutes * MIN - 5_000)));
}

describe('start and stop', () => {
  it('writes NOTHING while running', async () => {
    const h = mount('song-A');
    act(() => { h.api.start(); });

    expect(readSongTimer()?.songId).toBe('song-A');
    // The whole point: the only persisted state is the localStorage
    // record. No row, no spacing signal, nothing to undo.
    expect(await db.songPracticeLog.count()).toBe(0);
    h.unmount();
  });

  it('logs one row against its own song on stop, and clears', async () => {
    runningFor('song-A', 12);
    const h = mount('song-A');

    let written = { minutes: 0, practiceLogId: null as string | null };
    await act(async () => { written = await h.api.stopAndLog(); });

    expect(written.minutes).toBe(12);
    const rows = await db.songPracticeLog.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].songId).toBe('song-A');
    // The id comes back so a run-through logged inside this sitting
    // can point at it. Test mode is what needs it; a null there would
    // say "logged on its own", which is false.
    expect(written.practiceLogId).toBe(rows[0].id);
    expect(rows[0].durationMin).toBe(12);
    expect(readSongTimer()).toBeNull();
    h.unmount();
  });

  it('logs no sections, no keys and no rating', async () => {
    // A timer knows how long you worked and nothing else. Inventing a
    // section here would be the app deciding on your behalf.
    runningFor('song-A', 5);
    const h = mount('song-A');
    await act(async () => { await h.api.stopAndLog(); });

    const row = (await db.songPracticeLog.toArray())[0];
    expect(row.sectionIds).toEqual([]);
    expect(row.keys).toEqual([]);
    expect(row.feelRating).toBeUndefined();
    h.unmount();
  });

  it('stopping with no timer writes nothing and does not throw', async () => {
    const h = mount('song-A');
    let written = { minutes: -1, practiceLogId: 'x' as string | null };
    await act(async () => { written = await h.api.stopAndLog(); });
    expect(written).toEqual({ minutes: 0, practiceLogId: null });
    expect(await db.songPracticeLog.count()).toBe(0);
    h.unmount();
  });
});

describe('the swap attributes minutes to the song being LEFT', () => {
  it('logs song A, then starts song B from zero', async () => {
    // THE LOAD-BEARING ONE. The hook is mounted on B — the song being
    // opened — and the minutes belong to A.
    runningFor('song-A', 20);
    const h = mount('song-B');

    // Guard the guard: the timer really is on the other song before
    // the swap, so this cannot pass by starting from nothing.
    expect(h.api.record?.songId).toBe('song-A');
    expect(h.api.isThisSong).toBe(false);

    let written = { minutes: 0, practiceLogId: null as string | null };
    await act(async () => { written = await h.api.swapToThisSong(); });

    expect(written.minutes).toBe(20);
    const rows = await db.songPracticeLog.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].songId).toBe('song-A');

    const after = readSongTimer();
    expect(after?.songId).toBe('song-B');
    expect(after?.accumulatedMs).toBe(0);
    h.unmount();
  });

  it('never discards the time it was holding', async () => {
    runningFor('song-A', 33);
    const h = mount('song-B');
    await act(async () => { await h.api.swapToThisSong(); });
    expect((await db.songPracticeLog.toArray())[0].durationMin).toBe(33);
    h.unmount();
  });
});

describe('one timer, whatever song you are looking at', () => {
  it('reports another song’s timer rather than pretending none runs', async () => {
    // sessionTimer.startSession returns state unchanged when one is
    // live — a silent no-op. This reports the record and flags that
    // it is not this song, so the surface can say so.
    runningFor('song-A', 3);
    const h = mount('song-B');
    expect(h.api.record?.songId).toBe('song-A');
    expect(h.api.isThisSong).toBe(false);
    // Just under three minutes — runningFor backdates five seconds
    // short so the round-up lands on a whole number. What matters is
    // that the elapsed belongs to A's timer and is live, not the
    // exact millisecond.
    expect(h.api.elapsedMs).toBeGreaterThan(2 * MIN);
    h.unmount();
  });

  it('discard throws the timer away without logging', async () => {
    runningFor('song-gone', 15);
    const h = mount('song-B');
    act(() => { h.api.discard(); });

    expect(readSongTimer()).toBeNull();
    expect(await db.songPracticeLog.count()).toBe(0);
    h.unmount();
  });
});

describe('a run records section × key', () => {
  it('writes the sections and the key it was given', async () => {
    // THE THING PRACTICE WORK HAS NEVER HAD. Before this a practice
    // row could only say "40 minutes on this song"; there was nowhere
    // for the work to land except a total.
    runningFor('song-A', 15);
    const h = mount('song-A');
    await act(async () => {
      await h.api.stopAndLog({ sectionIds: ['sec-1', 'sec-2'], keys: ['Eb'] });
    });

    const row = (await db.songPracticeLog.toArray())[0];
    expect(row.sectionIds).toEqual(['sec-1', 'sec-2']);
    expect(row.keys).toEqual(['Eb']);
    h.unmount();
  });

  it('still records an untagged run as a complete one', async () => {
    // "40 minutes, couldn't tell you which sections" stays a real
    // record. Guard the guard: the tagged case above proves the fields
    // are reachable, so empty here is a choice and not a broken path.
    runningFor('song-A', 15);
    const h = mount('song-A');
    await act(async () => { await h.api.stopAndLog(); });

    const row = (await db.songPracticeLog.toArray())[0];
    expect(row.durationMin).toBe(15);
    expect(row.sectionIds).toEqual([]);
    expect(row.keys).toEqual([]);
    h.unmount();
  });

  it('never invents a rating, tagged or not', async () => {
    // Practice is not graded. The panel's rating step asks how it
    // went; a timer stopped without one records the time honestly
    // rather than a middling score nobody gave.
    runningFor('song-A', 15);
    const h = mount('song-A');
    await act(async () => {
      await h.api.stopAndLog({ sectionIds: ['sec-1'], keys: ['C'] });
    });
    expect((await db.songPracticeLog.toArray())[0].feelRating).toBeUndefined();
    h.unmount();
  });
});

describe('Done pauses, Save writes', () => {
  /**
   * The shape the rating step needs. Neither obvious alternative
   * survives: leaving the clock running inflates the minutes by
   * however long you spend answering, and writing on Done then
   * updating the row means two writes for one sitting and a row that
   * briefly exists in a state nothing intended.
   */
  it('writes nothing when the clock is paused', async () => {
    runningFor('song-A', 15);
    const h = mount('song-A');
    act(() => { h.api.pause(); });
    expect(await db.songPracticeLog.count()).toBe(0);
    h.unmount();
  });

  it('keeps the banked minutes in storage, so a reload loses the answers and not the time', async () => {
    runningFor('song-A', 15);
    const h = mount('song-A');
    act(() => { h.api.pause(); });
    const stored = readSongTimer();
    expect(stored?.running).toBe(false);
    expect(stored?.accumulatedMs).toBeGreaterThan(14 * MIN);
    h.unmount();
  });

  it('logs the paused minutes, not zero, when Save comes', async () => {
    runningFor('song-A', 15);
    const h = mount('song-A');
    act(() => { h.api.pause(); });
    await act(async () => {
      await h.api.stopAndLog({
        sectionIds: ['sec-1'], keys: ['C'],
        activities: ['lead-sheet', 'in-time'], feelRating: 3,
      });
    });
    const [row] = await db.songPracticeLog.toArray();
    expect(row.durationMin).toBe(15);
    expect(row.activities).toEqual(['lead-sheet', 'in-time']);
    expect(row.feelRating).toBe(3);
    h.unmount();
  });

  it('does not keep counting while paused', async () => {
    // The whole reason Done pauses rather than leaving it running:
    // the time spent choosing must not land on the record.
    runningFor('song-A', 15);
    const h = mount('song-A');
    act(() => { h.api.pause(); });
    const atPause = readSongTimer()!.accumulatedMs;
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 10 * MIN);
    await act(async () => { await h.api.stopAndLog({ keys: ['C'] }); });
    const [row] = await db.songPracticeLog.toArray();
    expect(row.durationMin).toBe(Math.ceil(atPause / MIN));
    h.unmount();
  });

  it('resumes without losing what was banked', async () => {
    // Backing out of the rating step. The minutes already counted are
    // still counted; the clock simply runs again. Asserted by LOGGING
    // after the resume rather than by reading `accumulatedMs` back —
    // a resume that silently restarted from zero would leave the
    // field looking plausible and cost the user the sitting.
    runningFor('song-A', 15);
    const h = mount('song-A');
    act(() => { h.api.pause(); });
    act(() => { h.api.resume(); });
    expect(readSongTimer()!.running).toBe(true);
    await act(async () => { await h.api.stopAndLog({ keys: ['C'] }); });
    expect((await db.songPracticeLog.toArray())[0].durationMin).toBe(15);
    h.unmount();
  });

  it('does not bank the rating step as silence on resume', async () => {
    // Time spent answering questions is not time away from the
    // keyboard — the user was in the app. Without moving
    // `lastActivityAt`, going back to playing would immediately bank
    // the whole rating step as an un-attributed gap and ask about it.
    runningFor('song-A', 15);
    const h = mount('song-A');
    act(() => { h.api.pause(); });
    const later = Date.now() + 10 * MIN;
    vi.spyOn(Date, 'now').mockReturnValue(later);
    act(() => { h.api.resume(); });
    expect(readSongTimer()!.lastActivityAt).toBe(later);
    h.unmount();
  });

  it('reports isPaused only for a stopped timer on THIS song', async () => {
    // A timer paused mid-rating on song A must not make song B's page
    // think it has a sitting waiting to be saved. Same failure the
    // hook's header names for `isThisSong`, one state along.
    runningFor('song-A', 15);
    const a = mount('song-A');
    expect(a.api.isPaused).toBe(false);
    act(() => { a.api.pause(); });
    expect(a.api.isPaused).toBe(true);
    a.unmount();

    const b = mount('song-B');
    expect(readSongTimer()!.running).toBe(false);   // still paused, on A
    expect(b.api.isPaused).toBe(false);
    b.unmount();
  });
});
