// @vitest-environment jsdom
/**
 * Test mode in the panel — the CELL test.
 *
 * ---------------------------------------------------------------
 * THE GRAIN IS THE CLAIM, AND IT IS WHAT THESE GUARD.
 *
 * Three clean runs at tempo make one section comfortable in one key.
 * The two claims about the whole song in a key — "Test song", which
 * makes the key solid and is the only thing that moves the retest
 * clock, and "run at tempo", which is breadth evidence for
 * Internalized — live on `KeyRow` and must stay unreachable from a
 * cell. Offering them here would put whole-song runs in the
 * per-section table, where nothing downstream could tell them apart
 * again.
 *
 * So the assertions are on WHICH TABLES MOVE, not on what renders.
 * ---------------------------------------------------------------
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import {
  db, type Song, type SongCell, type SongKey, type SongMatrixSection,
} from '../../../../lib/db';
import { readSongTimer, startedRecord, writeSongTimer } from '../../songTimer';
import { getSpacingState } from '../../../../lib/spacingState';
import { songKeyItemRef } from '../proveKey';
import CellPanel from '../CellPanel';

const NOW = 1_760_000_000_000;
const MIN = 60_000;

const song = (tempo: number | null = 100) => ({
  id: 's1', title: 'Superstar', addedDate: 0, updatedAt: 0,
  ...(tempo === null ? {} : { tempo }),
}) as Song;

const songKey = (): SongKey => ({
  id: 'sk-C', songId: 's1', keyName: 'C', isOriginalKey: true,
  keyState: 'learning', solidAt: null, solidDecayState: null,
  lastDecayCheckAt: null, livedWithSessionCount: 0,
  livedWithFirstSessionAt: null, livedWithWindowStartAt: null,
  livedWithSessionsInWindow: 0, wholeSongTestPassedAt: null,
  isRetestRecommended: false, lastEngagedAt: NOW, createdAt: 0, updatedAt: 0,
});

const section = (): SongMatrixSection => ({
  id: 'sec-1', songId: 's1', name: 'Chorus', displayOrder: 0,
  isArchived: false, splitFromSectionId: null, createdAt: 0, updatedAt: 0,
});

const cell = (over: Partial<SongCell> = {}): SongCell => ({
  id: 'cell-1', songId: 's1', songKeyId: 'sk-C', sectionId: 'sec-1',
  cellState: 'learning', comfortableAt: null, consecutiveCleanCount: 0,
  lastRunAt: null, lastRunWasClean: null, notes: null,
  lastEngagedAt: null, createdAt: 0, updatedAt: 0,
  ...over,
});

function mount(opts: { minutes?: number; cell?: SongCell; tempo?: number | null } = {}) {
  const { minutes = 20, tempo = 100 } = opts;
  const theCell = opts.cell ?? cell();
  // Written before the render: `useSongTimer` reads storage once in a
  // lazy initializer, so a timer written after mount is invisible and
  // entering test mode would silently start a fresh, zero-length one.
  // `minutes: 0` leaves storage empty, so entering test mode STARTS
  // the clock rather than adopting one. Cancel treats the two
  // differently and both need covering.
  if (minutes > 0) {
    writeSongTimer({
      ...startedRecord('s1', Date.now() - (minutes * MIN - 5_000)),
      lastActivityAt: Date.now(),
    });
  }
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <CellPanel
        song={song(tempo)} cell={theCell} siblingCells={[theCell]}
        songKey={songKey()} section={section()} sections={[section()]}
        spelling="flat" layout="full"
        onLayoutChange={() => {}}
        onClose={() => {}}
        onFinished={() => {}}
      />,
    );
  });
  const button = (label: string) => {
    const btn = [...container.querySelectorAll('button')]
      .find(b => (b.textContent ?? '').trim().startsWith(label));
    if (!btn) throw new Error(`no button starting "${label}"`);
    return btn;
  };
  const click = (label: string) => act(() => {
    button(label).dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  const clickAsync = async (label: string) => {
    await act(async () => {
      button(label).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  };
  const setBpm = (value: string) => {
    const input = container.querySelector<HTMLInputElement>('input[aria-label="Tempo in bpm"]')!;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value',
      )!.set!;
      setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  /** Straight into test mode. */
  const toTest = () => click('Test');
  /** Log `n` clean runs at the current tempo. */
  const runsClean = (n: number) => { for (let i = 0; i < n; i += 1) click('clean'); };
  return {
    click, clickAsync, button, setBpm, toTest, runsClean,
    find: (label: string) => [...container.querySelectorAll('button')]
      .find(b => (b.textContent ?? '').trim().startsWith(label)),
    text: () => container.textContent ?? '',
    unmount() { act(() => { root.unmount(); }); container.remove(); },
  };
}

beforeEach(async () => {
  localStorage.clear();
  await Promise.all([
    db.songPracticeLog.clear(), db.songCells.clear(), db.songKeys.clear(),
    db.songCellRunThroughs.clear(), db.songKeyRunThroughs.clear(),
    db.spacingState.clear(), db.userPrefs.clear(),
  ]);
});

describe('the runs land at the cell grain', () => {
  it('writes cell run-throughs and touches no key-level table', async () => {
    // THE LOAD-BEARING NEGATIVE. songKeyRunThroughs is what "Test
    // song" and "run at tempo" write, at the key grain, and a cell
    // must never reach it.
    const h = mount();
    h.toTest();
    h.runsClean(2);
    await h.clickAsync('Save runs');

    expect(await db.songCellRunThroughs.count()).toBe(2);
    expect(await db.songKeyRunThroughs.count()).toBe(0);
    h.unmount();
  });

  it('cannot move the retest clock', async () => {
    // Only the whole-song test does, via recordKeyProving, and it is
    // not reachable from here. Asserted on the itemRef namespace, the
    // same way the practice boundary is.
    const h = mount();
    h.toTest();
    h.runsClean(3);
    await h.clickAsync('Mark comfortable');

    expect(await getSpacingState(songKeyItemRef('sk-C'), 'repertoire')).toBeUndefined();
    // Not vacuous: the save really did happen.
    expect(await db.songCellRunThroughs.count()).toBe(3);
    h.unmount();
  });

  it('offers no whole-song action from a cell', () => {
    const h = mount();
    h.toTest();
    expect(h.find('Test song')).toBeUndefined();
    expect(h.find('run at tempo')).toBeUndefined();
    h.unmount();
  });
});

describe('three clean runs in a row', () => {
  it('does not offer Mark comfortable before the third', () => {
    const h = mount();
    h.toTest();
    h.runsClean(2);
    expect(h.button('Mark comfortable').hasAttribute('disabled')).toBe(true);
    h.unmount();
  });

  it('offers it on the third, and it makes the cell comfortable', async () => {
    const h = mount();
    h.toTest();
    h.runsClean(3);
    expect(h.button('Mark comfortable').hasAttribute('disabled')).toBe(false);
    await h.clickAsync('Mark comfortable');

    const stored = await db.songCells.get('cell-1');
    expect(stored?.cellState).toBe('comfortable');
    h.unmount();
  });

  it('a run that was not clean resets the count', () => {
    const h = mount();
    h.toTest();
    h.runsClean(2);
    h.click('not clean');
    expect(h.text()).toContain('0 of 3 clean runs in a row');
    expect(h.button('Mark comfortable').hasAttribute('disabled')).toBe(true);
    h.unmount();
  });

  it('carries the streak the cell already holds', () => {
    // Unlike the whole-song test, which restarts at 0/3 on every open
    // because it has to be assembled in one sitting. A cell is
    // ordinary work and accumulates.
    const h = mount({ cell: cell({ consecutiveCleanCount: 2 }) });
    h.toTest();
    expect(h.text()).toContain('2 of 3 clean runs in a row');
    h.runsClean(1);
    expect(h.button('Mark comfortable').hasAttribute('disabled')).toBe(false);
    h.unmount();
  });
});

describe('the tempo floor', () => {
  it('logs a slow run without advancing the count', async () => {
    // A warm-up pass is a different activity, not a failed test — so
    // it neither advances the streak nor resets it, and it is still
    // recorded honestly.
    const h = mount();
    h.toTest();
    h.setBpm('60');           // floor is 90 for a 100bpm song
    h.runsClean(3);
    expect(h.text()).toContain('0 of 3 clean runs in a row');

    await h.clickAsync('Save runs');
    expect(await db.songCellRunThroughs.count()).toBe(3);
    expect((await db.songCells.get('cell-1'))?.cellState).toBe('learning');
    h.unmount();
  });

  it('does not reset a streak either', () => {
    const h = mount({ cell: cell({ consecutiveCleanCount: 2 }) });
    h.toTest();
    h.setBpm('60');
    h.runsClean(1);
    expect(h.text()).toContain('2 of 3 clean runs in a row');
    h.unmount();
  });

  it('counts every run when the song has no performance tempo', () => {
    // The gate switches itself off rather than blocking a user who
    // has not set one.
    const h = mount({ tempo: null });
    h.toTest();
    h.runsClean(3);
    expect(h.button('Mark comfortable').hasAttribute('disabled')).toBe(false);
    h.unmount();
  });
});

describe('a test is timed, and not rated', () => {
  it('logs the minutes as practice', async () => {
    const h = mount({ minutes: 20 });
    h.toTest();
    h.runsClean(1);
    await h.clickAsync('Save runs');

    const rows = await db.songPracticeLog.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].durationMin).toBe(20);
    expect(rows[0].sectionIds).toEqual(['sec-1']);
    expect(rows[0].keys).toEqual(['C']);
    h.unmount();
  });

  it('never opens the rating step', async () => {
    // "What kind of work was it" has one answer when the answer is a
    // test, and the attempts already say how it went.
    const h = mount();
    h.toTest();
    h.runsClean(1);
    expect(h.text()).not.toContain('What kind of work was it?');
    await h.clickAsync('Save runs');

    const row = (await db.songPracticeLog.toArray())[0];
    expect(Object.hasOwn(row, 'activities')).toBe(false);
    expect(Object.hasOwn(row, 'feelRating')).toBe(false);
    h.unmount();
  });

  it('links the runs to the sitting they happened inside', async () => {
    // A null practiceLogId means "logged on their own", which would
    // be false for every attempt made during a timed test.
    const h = mount();
    h.toTest();
    h.runsClean(1);
    await h.clickAsync('Save runs');

    const logId = (await db.songPracticeLog.toArray())[0].id;
    const runs = await db.songCellRunThroughs.toArray();
    expect(runs[0].practiceLogId).toBe(logId);
    h.unmount();
  });

  it('emits no spacing signal, because it carries no rating', async () => {
    const h = mount();
    h.toTest();
    h.runsClean(1);
    await h.clickAsync('Save runs');
    expect(await getSpacingState('s1', 'repertoire')).toBeUndefined();
    h.unmount();
  });
});

describe('Cancel', () => {
  it('writes nothing at all, three clean runs or not', async () => {
    // The runs live in component state until Save. Cancelling out of
    // a test that would have passed leaves no trace anywhere — no
    // run-throughs, no practice row, no cell.
    const h = mount();
    h.toTest();
    h.runsClean(3);
    h.click('Cancel');

    expect(await db.songCellRunThroughs.count()).toBe(0);
    expect(await db.songPracticeLog.count()).toBe(0);
    expect(await db.songCells.count()).toBe(0);
    h.unmount();
  });

  it('discards a clock this panel started', async () => {
    const h = mount({ minutes: 0 });
    h.toTest();
    expect(readSongTimer()?.songId).toBe('s1');   // entering test started it

    h.click('Cancel');
    expect(readSongTimer()).toBeNull();
    h.unmount();
  });

  it('leaves a clock it merely ADOPTED running', async () => {
    // Same rule practice mode follows. Cancelling out of a panel is
    // not a reason to throw away time the user started elsewhere —
    // and a test entered mid-practice is exactly that case.
    const h = mount({ minutes: 20 });
    h.toTest();
    h.click('Cancel');

    expect(readSongTimer()?.songId).toBe('s1');
    expect(await db.songPracticeLog.count()).toBe(0);
    h.unmount();
  });
});
