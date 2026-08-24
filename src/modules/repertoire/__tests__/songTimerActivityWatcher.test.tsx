// @vitest-environment jsdom
/**
 * The activity watcher, and what it does BEFORE it knows the rule.
 *
 * ---------------------------------------------------------------
 * TWO DEFECTS, ONE LOAD.
 *
 * `getAmberMinutes()` was called without a catch, in a component
 * mounted at the app level for the whole session — so a Dexie failure
 * became an unhandled rejection with nothing to attribute it to. It
 * showed up as two of them during a full test run.
 *
 * The worse one is silent. `thresholdMs` starts null, and null MEANS
 * "never bank" — the user's own setting — so an unloaded threshold and
 * a deliberate "never" were the same value. A ping arriving during the
 * load took the `!banks` branch: `lastActivityAt` moved to now and the
 * gap it was measuring vanished into the total as focused practice.
 *
 * Reload the page mid-practice after a break and the first tap can
 * easily beat a Dexie read. That is a whole break, erased, with
 * nothing on screen to show for it.
 * ---------------------------------------------------------------
 *
 * Asserted on the STORED RECORD, never on the render — the component
 * returns null and has nothing to look at. What it does is write.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { db } from '../../../lib/db';
import { readSongTimer, startedRecord, writeSongTimer } from '../songTimer';
import { setAmberMinutes } from '../songTimerPrefs';
import SongTimerActivityWatcher from '../SongTimerActivityWatcher';

const MIN = 60_000;

/** A timer running for `minutes`, with `silentFor` minutes unseen. */
function timerWithGap(minutes: number, silentFor: number) {
  writeSongTimer({
    ...startedRecord('s1', Date.now() - minutes * MIN),
    lastActivityAt: Date.now() - silentFor * MIN,
  });
}

function mount() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter>
        <SongTimerActivityWatcher />
      </MemoryRouter>,
    );
  });
  return {
    /** Let the threshold read resolve. */
    settle: async () => { await act(async () => {}); },
    tap: () => act(() => {
      window.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    }),
    unmount() { act(() => { root.unmount(); }); container.remove(); },
  };
}

beforeEach(async () => {
  localStorage.clear();
  await db.userPrefs.clear();
  vi.restoreAllMocks();
});

describe('a tap arriving before the threshold has loaded', () => {
  it('does not erase the gap it was measuring', async () => {
    // THE DEFECT. Without the guard, this tap moves lastActivityAt to
    // now and the 38 minutes are counted as focused practice — no
    // amber, no question, nothing to notice.
    await setAmberMinutes(5);
    timerWithGap(40, 38);
    const before = readSongTimer()!.lastActivityAt;

    const h = mount();
    h.tap();                       // deliberately BEFORE settle()

    expect(readSongTimer()!.lastActivityAt).toBe(before);
    expect(readSongTimer()!.pendingGapMs ?? 0).toBe(0);
    h.unmount();
  });

  it('banks that same gap on the first tap once the rule is known', async () => {
    // The other half: going quiet during the load costs nothing,
    // because the gap is still open and the next ping measures it.
    await setAmberMinutes(5);
    timerWithGap(40, 38);

    const h = mount();
    h.tap();
    await h.settle();
    h.tap();

    expect(readSongTimer()!.pendingGapMs).toBeGreaterThan(37 * MIN);
    h.unmount();
  });

  it('banks nothing once the rule turns out to be "never"', async () => {
    // And the reason guessing the DEFAULT during the load would have
    // been wrong too: this user would have had a question to dismiss
    // that they had already switched off.
    await setAmberMinutes(null);
    timerWithGap(40, 38);

    const h = mount();
    h.tap();
    await h.settle();
    h.tap();

    expect(readSongTimer()!.pendingGapMs ?? 0).toBe(0);
    h.unmount();
  });
});

describe('once loaded, it marks activity as it always did', () => {
  it('moves lastActivityAt on a tap inside the threshold', async () => {
    await setAmberMinutes(5);
    timerWithGap(10, 1);           // one minute of silence, under five
    const before = readSongTimer()!.lastActivityAt;

    const h = mount();
    await h.settle();
    h.tap();

    expect(readSongTimer()!.lastActivityAt).toBeGreaterThan(before);
    expect(readSongTimer()!.pendingGapMs ?? 0).toBe(0);
    h.unmount();
  });

  it('leaves a paused timer alone', async () => {
    // A paused clock has no gap to measure — the rating step is what
    // it is waiting on.
    await setAmberMinutes(5);
    timerWithGap(40, 38);
    writeSongTimer({ ...readSongTimer()!, running: false });
    const before = readSongTimer()!.lastActivityAt;

    const h = mount();
    await h.settle();
    h.tap();

    expect(readSongTimer()!.lastActivityAt).toBe(before);
    h.unmount();
  });
});

describe('a failed threshold read', () => {
  it('does not reject, and leaves the watcher quiet rather than guessing', async () => {
    // An uncaught read here is an unhandled rejection at the app
    // level, mounted for the whole session, with nothing to attribute
    // it to. Two of these showed up in a full run.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(db.userPrefs, 'get').mockRejectedValue(new Error('db closed'));
    await setAmberMinutes(5);
    timerWithGap(40, 38);
    const before = readSongTimer()!.lastActivityAt;

    const h = mount();
    await h.settle();
    h.tap();

    expect(warn).toHaveBeenCalled();
    expect(readSongTimer()!.lastActivityAt).toBe(before);
    h.unmount();
  });
});
