// @vitest-environment jsdom
/**
 * The rating step — what Done opens.
 *
 * ---------------------------------------------------------------
 * THESE ASSERT WHAT IS WRITTEN, NOT WHAT IS DRAWN.
 *
 * A test that the six chips render would pass on a build that drops
 * every one of them on save, which is the failure this step exists to
 * fix one layer down: the timer looked usable and recorded duration
 * and nothing else. So each case presses the chips and then reads the
 * ROW.
 *
 * The exception is the metronome case, which has to assert a
 * NON-event: pressing nothing must leave "practising in time"
 * unticked. There the claim is about the button's state, because the
 * failure being guarded is a pre-tick that would then be written as
 * though the user had said it.
 * ---------------------------------------------------------------
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { db, type Song, type SongCell, type SongKey, type SongMatrixSection } from '../../../../lib/db';
import { readSongTimer, startedRecord, writeSongTimer } from '../../songTimer';
import CellPanel from '../CellPanel';
import { setAmberMinutes } from '../../songTimerPrefs';

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

const sections = (): SongMatrixSection[] => ([
  { id: 'sec-1', songId: 's1', name: 'Chorus', displayOrder: 0,
    isArchived: false, splitFromSectionId: null, createdAt: 0, updatedAt: 0 },
  { id: 'sec-2', songId: 's1', name: 'Verse', displayOrder: 1,
    isArchived: false, splitFromSectionId: null, createdAt: 0, updatedAt: 0 },
]);

/**
 * Mount with `minutes` already on the clock.
 *
 * The record is written BEFORE the render, deliberately. `useSongTimer`
 * reads storage once in a lazy initializer, so a timer written after
 * the mount is invisible to the panel — which then treats entering
 * practice as a fresh start and silently replaces the fixture with a
 * zero-length clock. Every duration assertion here would read 1.
 */
const cell = (): SongCell => ({
  id: 'cell-1', songId: 's1', songKeyId: 'sk-C', sectionId: 'sec-1',
  cellState: 'learning', comfortableAt: null, consecutiveCleanCount: 0,
  lastRunAt: null, lastRunWasClean: null, notes: null,
  lastEngagedAt: null, createdAt: 0, updatedAt: 0,
});

function mount(minutes = 0) {
  if (minutes > 0) {
    // Five seconds short of the span, because `elapsedMinutes` rounds
    // up: an exactly-N-minute fixture plus the test's own milliseconds
    // lands on N+1. The rounding is correct — a 40-second pass must not
    // record as zero — so the fixture accommodates it.
    // `lastActivityAt` is pulled to NOW rather than left where
    // `startedRecord` puts it, which is the start. A record backdated
    // thirty minutes with an untouched `lastActivityAt` is not "thirty
    // minutes of practice" to this mechanism — it is thirty minutes
    // the app saw nothing during, and it would raise the
    // un-attributed-time question in every test here. That behaviour
    // is correct and is what the threshold setting exists to tune; it
    // is simply not what these fixtures mean. The tests that DO mean
    // it write their own record.
    writeSongTimer({
      ...startedRecord('s1', Date.now() - (minutes * MIN - 5_000)),
      lastActivityAt: Date.now(),
    });
  }
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const all = sections();
  act(() => {
    root.render(
      <CellPanel
        song={song()} cell={cell()} siblingCells={[cell()]} songKey={songKey()} section={all[0]}
        sections={all} spelling="flat" layout="full"
        onLayoutChange={() => {}}
        onClose={() => {}}
        onFinished={() => {}}
      />,
    );
  });
  const find = (label: string) => [...container.querySelectorAll('button')]
    .find(b => (b.textContent ?? '').trim().startsWith(label));
  const button = (label: string) => {
    const btn = find(label);
    if (!btn) throw new Error(`no button starting "${label}"`);
    return btn;
  };
  const click = (label: string) => {
    act(() => {
      button(label).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  };
  const clickAsync = async (label: string) => {
    await act(async () => {
      button(label).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  };
  const queryInput = (ariaLabel: string) =>
    container.querySelector<HTMLInputElement>(`input[aria-label="${ariaLabel}"]`);
  const type = (ariaLabel: string, value: string) => {
    const input = queryInput(ariaLabel);
    if (!input) throw new Error(`no input labelled "${ariaLabel}"`);
    act(() => {
      // React tracks the DOM value to decide whether onChange fires;
      // setting `.value` directly is silently swallowed on a re-render.
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value',
      )!.set!;
      setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  /** Straight to the rating step, on the clock this was mounted with. */
  const toRatingStep = () => {
    click('Practice');
    click('Done');
  };
  /** Let the panel's preference read settle. The amber threshold is
   *  loaded in an effect, and a synchronous mount does not give the
   *  promise a turn. */
  const settle = async () => { await act(async () => {}); };
  return {
    click, clickAsync, type, find, button, queryInput, toRatingStep, settle,
    text: () => container.textContent ?? '',
    unmount() { act(() => { root.unmount(); }); container.remove(); },
  };
}

const onlyRow = async () => {
  const rows = await db.songPracticeLog.toArray();
  expect(rows).toHaveLength(1);
  return rows[0];
};

beforeEach(async () => {
  localStorage.clear();
  await Promise.all([db.songPracticeLog.clear(), db.userPrefs.clear()]);
});

describe('what kind of work it was', () => {
  it('writes several activities from one sitting', async () => {
    // A sitting is often lead sheet work AND getting it under the
    // fingers. Forcing one would make the user pick whichever felt
    // more like the "real" work.
    const h = mount(30);
    h.toRatingStep();
    h.click('building the lead sheet');
    h.click('getting it under the fingers');
    await h.clickAsync('Log it');

    expect((await onlyRow()).activities)
      .toEqual(['lead-sheet', 'under-the-fingers']);
    h.unmount();
  });

  it('logs a sitting with nothing ticked, and stores no activities', async () => {
    // Nothing here is required. `Log it` works untouched, and the
    // field is absent rather than empty.
    const h = mount(30);
    h.toRatingStep();
    await h.clickAsync('Log it');

    const row = await onlyRow();
    expect(row.durationMin).toBe(30);
    expect(Object.hasOwn(row, 'activities')).toBe(false);
    h.unmount();
  });

  it('carries the free text through with "something else"', async () => {
    const h = mount(30);
    h.toRatingStep();
    h.click('something else');
    h.type('What the other work was', 'transcribing the bass line');
    await h.clickAsync('Log it');

    const row = await onlyRow();
    expect(row.activities).toEqual(['other']);
    expect(row.activityOther).toBe('transcribing the bass line');
    h.unmount();
  });

  it('shows no free-text line until "something else" is ticked', async () => {
    const h = mount(30);
    h.toRatingStep();
    expect(h.queryInput('What the other work was')).toBeNull();
    h.click('something else');
    expect(h.queryInput('What the other work was')).not.toBeNull();
    h.unmount();
  });

  it('records "just playing" as an activity like any other', async () => {
    // A category, not a lesser grade of practice. Nothing downgrades a
    // sitting for carrying it, and it does not become a rating.
    const h = mount(45);
    h.toRatingStep();
    h.click('just playing');
    await h.clickAsync('Log it');

    const row = await onlyRow();
    expect(row.activities).toEqual(['just-playing']);
    expect(row.durationMin).toBe(45);
    expect(Object.hasOwn(row, 'feelRating')).toBe(false);
    h.unmount();
  });
});

describe('"practising in time" is never derived', () => {
  it('is unticked when the rating step opens, metronome or not', async () => {
    // THE RULE THIS FILE EXISTS FOR. The metronome is mounted in the
    // practice panel throughout, and its being available is not
    // evidence it was used. The number worth seeing is how often the
    // user deliberately played to a click; a derived value would count
    // how often a control was on screen.
    const h = mount(30);
    h.toRatingStep();
    expect(h.button('practising in time').getAttribute('aria-pressed')).toBe('false');
    h.unmount();
  });

  it('is written only when the user ticks it', async () => {
    const h = mount(30);
    h.toRatingStep();
    await h.clickAsync('Log it');
    expect(Object.hasOwn(await onlyRow(), 'activities')).toBe(false);
    h.unmount();

    await db.songPracticeLog.clear();
    localStorage.clear();

    const h2 = mount(30);
    h2.toRatingStep();
    h2.click('practising in time');
    await h2.clickAsync('Log it');
    expect((await onlyRow()).activities).toEqual(['in-time']);
    h2.unmount();
  });
});

describe('how it went', () => {
  it('stores the feel that was chosen', async () => {
    const h = mount(20);
    h.toRatingStep();
    h.click('in flow');
    await h.clickAsync('Log it');
    expect((await onlyRow()).feelRating).toBe(4);
    h.unmount();
  });

  it('invents none when the question is skipped', async () => {
    const h = mount(20);
    h.toRatingStep();
    await h.clickAsync('Log it');
    expect(Object.hasOwn(await onlyRow(), 'feelRating')).toBe(false);
    h.unmount();
  });
});

describe('the sections carry across from the timer', () => {
  it('keeps the tapped section ticked, and takes a second one added here', async () => {
    const h = mount(30);
    h.toRatingStep();
    h.click('Verse');
    await h.clickAsync('Log it');
    expect((await onlyRow()).sectionIds).toEqual(['sec-1', 'sec-2']);
    h.unmount();
  });
});

describe('Back to the timer', () => {
  it('puts the clock back on and writes nothing', async () => {
    const h = mount(30);
    h.toRatingStep();
    expect(readSongTimer()?.running).toBe(false);

    h.click('← Back to the timer');
    expect(readSongTimer()?.running).toBe(true);
    expect(await db.songPracticeLog.count()).toBe(0);
    h.unmount();
  });

  it('does not lose the minutes it was holding', async () => {
    const h = mount(30);
    h.toRatingStep();
    h.click('← Back to the timer');
    await h.clickAsync('Done');
    await h.clickAsync('Log it');
    expect((await onlyRow()).durationMin).toBe(30);
    h.unmount();
  });
});

describe('time the app could not see', () => {
  /**
   * ---------------------------------------------------------------
   * THE MECHANISM SHIPPED IN 3b-4 AND HAD NO SURFACE UNTIL NOW.
   *
   * `withActivity` banked long silences into `pendingGapMs` and
   * `resolvePendingGap` settled them, and nothing ever asked — so the
   * amber signal led nowhere and the banked minutes stayed unresolved.
   * The rating step is where it belongs: the one moment the user is
   * already answering for the sitting they just finished.
   *
   * The end-to-end claim is that Done BANKS an open silence before it
   * pauses. Without that, a stretch still open when the clock stops has
   * never been banked — no activity resumed to bank it — and would be
   * logged as focused practice, which is the same silent-counting
   * failure the banking was built to prevent, one step later.
   * ---------------------------------------------------------------
   */
  const amber = async (minutes: number | null) => {
    await setAmberMinutes(minutes);
  };

  it('asks nothing when the app watched the whole sitting', async () => {
    // A question that appeared every time would train the user to
    // dismiss it, which is worse than not asking at all.
    await amber(5);
    const h = mount(30);
    await h.settle();
    h.toRatingStep();
    expect(h.text()).not.toContain('App activity not detected');
    h.unmount();
  });

  it('asks about a silence that was still open when Done was pressed', async () => {
    await amber(5);
    // Forty minutes on the clock, the last thirty-eight of them unseen.
    writeSongTimer({
      songId: 's1',
      startedAt: Date.now() - (40 * MIN - 5_000),
      accumulatedMs: 0,
      running: true,
      lastActivityAt: Date.now() - 38 * MIN,
    });
    const h = mount();
    await h.settle();
    h.toRatingStep();

    expect(h.text()).toContain('App activity not detected for the last 38 minutes');
    expect(h.text()).toContain('Only you know');
    h.unmount();
  });

  it('keeps every minute when the answer is "I was locked in"', async () => {
    await amber(5);
    writeSongTimer({
      songId: 's1',
      startedAt: Date.now() - (40 * MIN - 5_000),
      accumulatedMs: 0,
      running: true,
      lastActivityAt: Date.now() - 38 * MIN,
    });
    const h = mount();
    await h.settle();
    h.toRatingStep();
    h.click('I was locked in');
    await h.clickAsync('Log it');

    expect((await onlyRow()).durationMin).toBe(40);
    h.unmount();
  });

  it('discards the unseen stretch when the answer is "I was gone"', async () => {
    // 40 minutes on the clock, 38 of them un-attributed and given
    // back. Two remain. This is the number the whole mechanism exists
    // to make possible — without the question it would have logged 40.
    await amber(5);
    writeSongTimer({
      songId: 's1',
      startedAt: Date.now() - (40 * MIN - 5_000),
      accumulatedMs: 0,
      running: true,
      lastActivityAt: Date.now() - 38 * MIN,
    });
    const h = mount();
    await h.settle();
    h.toRatingStep();
    h.click('I was gone');
    await h.clickAsync('Log it');

    expect((await onlyRow()).durationMin).toBe(2);
    h.unmount();
  });

  it('keeps a quarter of it when the answer is "barely any"', async () => {
    // Behind the disclosure, so this also proves the partial answers
    // are reachable rather than drawn and inert.
    await amber(5);
    writeSongTimer({
      songId: 's1',
      startedAt: Date.now() - (40 * MIN - 5_000),
      accumulatedMs: 0,
      running: true,
      lastActivityAt: Date.now() - 38 * MIN,
    });
    const h = mount();
    await h.settle();
    h.toRatingStep();
    h.click('I was here for some of it');
    h.click('barely any');
    await h.clickAsync('Log it');

    // 40 - 38 × 0.75 = 11.5, and elapsedMinutes rounds up.
    expect((await onlyRow()).durationMin).toBe(12);
    h.unmount();
  });

  it('asks nothing at all when the user has turned the threshold off', async () => {
    // "Never" is an offered answer, for someone who finds the
    // mechanism more trouble than the time it recovers.
    await amber(null);
    writeSongTimer({
      songId: 's1',
      startedAt: Date.now() - (40 * MIN - 5_000),
      accumulatedMs: 0,
      running: true,
      lastActivityAt: Date.now() - 38 * MIN,
    });
    const h = mount();
    await h.settle();
    h.toRatingStep();

    expect(h.text()).not.toContain('App activity not detected');
    await h.clickAsync('Log it');
    expect((await onlyRow()).durationMin).toBe(40);
    h.unmount();
  });
});
