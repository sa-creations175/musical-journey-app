// @vitest-environment jsdom
/**
 * Cancel discards. Done finishes and says what it recorded.
 *
 * ---------------------------------------------------------------
 * BOTH OF THESE WERE FOUND BY USING THE PAGE, NOT BY A TEST.
 *
 * Cancel closed the panel and left the clock running — nothing on
 * screen said time was still being counted, and reopening practice
 * showed a total the user had never agreed to. Done wrote a row and
 * returned, with no confirmation and no close, so a working button was
 * indistinguishable from a broken one.
 *
 * Neither failure has a crash or a bad value to catch. They are both
 * "the thing you pressed did not do what its label says", which is
 * only visible if the test presses it.
 * ---------------------------------------------------------------
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { db, type Song, type SongKey, type SongMatrixSection } from '../../../../lib/db';
import { readSongTimer, startedRecord, writeSongTimer } from '../../songTimer';
import CellPanel from '../CellPanel';

const NOW = 1_760_000_000_000;
const MIN = 60_000;

const song = () => ({
  id: 's1', title: 'Superstar', addedDate: 0, updatedAt: 0, tempo: 100,
}) as Song;

const songKey = (): SongKey => ({
  id: 'sk-C', songId: 's1', keyName: 'C', isOriginalKey: true,
  keyState: 'comfortable', solidAt: null, solidDecayState: null,
  lastDecayCheckAt: null, livedWithSessionCount: 0,
  livedWithFirstSessionAt: null, livedWithWindowStartAt: null,
  livedWithSessionsInWindow: 0, wholeSongTestPassedAt: null,
  isRetestRecommended: false, lastEngagedAt: NOW, createdAt: 0, updatedAt: 0,
});

const section = (): SongMatrixSection => ({
  id: 'sec-1', songId: 's1', name: 'Chorus', displayOrder: 0,
  isArchived: false, splitFromSectionId: null, createdAt: 0, updatedAt: 0,
});

function mount() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const seen: Array<{ minutes: number; sections: number }> = [];
  let closed = 0;
  act(() => {
    root.render(
      <CellPanel
        song={song()} songKey={songKey()} section={section()}
        sections={[section()]} spelling="flat" layout="full"
        onLayoutChange={() => {}}
        onClose={() => { closed += 1; }}
        onFinished={(minutes, sections) => seen.push({ minutes, sections })}
      />,
    );
  });
  const click = (label: string) => {
    const btn = [...container.querySelectorAll('button')]
      .find(b => (b.textContent ?? '').trim().startsWith(label));
    if (!btn) throw new Error(`no button starting "${label}"`);
    act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  };
  const clickAsync = async (label: string) => {
    const btn = [...container.querySelectorAll('button')]
      .find(b => (b.textContent ?? '').trim().startsWith(label));
    if (!btn) throw new Error(`no button starting "${label}"`);
    await act(async () => {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  };
  return {
    click, clickAsync, seen,
    closedCount: () => closed,
    unmount() { act(() => { root.unmount(); }); container.remove(); },
  };
}

beforeEach(async () => {
  localStorage.clear();
  await db.songPracticeLog.clear();
});

describe('Cancel', () => {
  it('STOPS the timer it started, and records nothing', async () => {
    const h = mount();
    h.click('Practice');
    // Guard the guard: entering practice really did start a clock, so
    // a cancel that stopped nothing would have something to stop.
    expect(readSongTimer()?.songId).toBe('s1');

    h.click('Cancel');
    expect(readSongTimer()).toBeNull();
    expect(await db.songPracticeLog.count()).toBe(0);
    expect(h.closedCount()).toBe(1);
    h.unmount();
  });

  it('does NOT discard a timer that was already running when it opened', async () => {
    // Adopted, not begun. Cancelling out of a panel is not a reason to
    // throw away time the user started somewhere else.
    writeSongTimer(startedRecord('s1', Date.now() - 20 * MIN));
    const h = mount();
    h.click('Practice');
    h.click('Cancel');

    expect(readSongTimer()?.songId).toBe('s1');
    expect(await db.songPracticeLog.count()).toBe(0);
    h.unmount();
  });
});

describe('Done', () => {
  it('writes the run, reports it, and closes', async () => {
    // All three. A button that logs but neither reports nor closes is
    // indistinguishable from one that is broken.
    writeSongTimer(startedRecord('s1', Date.now() - (12 * MIN - 5_000)));
    const h = mount();
    h.click('Practice');
    await h.clickAsync('Done');

    const rows = await db.songPracticeLog.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].durationMin).toBe(12);
    expect(rows[0].sectionIds).toEqual(['sec-1']);
    expect(rows[0].keys).toEqual(['C']);

    expect(h.seen).toEqual([{ minutes: 12, sections: 1 }]);
    expect(h.closedCount()).toBe(1);
    expect(readSongTimer()).toBeNull();
    h.unmount();
  });
});
