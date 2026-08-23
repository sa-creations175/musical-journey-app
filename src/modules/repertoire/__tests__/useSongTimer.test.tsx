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

    let minutes = 0;
    await act(async () => { minutes = await h.api.stopAndLog(); });

    expect(minutes).toBe(12);
    const rows = await db.songPracticeLog.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].songId).toBe('song-A');
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
    let minutes = -1;
    await act(async () => { minutes = await h.api.stopAndLog(); });
    expect(minutes).toBe(0);
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

    let minutes = 0;
    await act(async () => { minutes = await h.api.swapToThisSong(); });

    expect(minutes).toBe(20);
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
