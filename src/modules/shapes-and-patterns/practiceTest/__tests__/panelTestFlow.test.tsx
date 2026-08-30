// @vitest-environment jsdom
/**
 * The test flow, on the panel that every surface uses.
 *
 * =====================================================================
 * THERE WAS NO COVERAGE OF THIS AT ALL, WHICH IS WHY THE CHANGE THAT
 * REPLACED IT BROKE NOTHING.
 *
 * The old flow — collect three drills, then press Save The Test — had
 * no panel-level test. So swapping it for rate-as-you-go passed the
 * whole suite on the first run, which is not reassurance, it is the
 * absence of a question being asked.
 *
 * The things worth asserting are the ones that used to be different:
 * a run is WRITTEN when it finishes rather than at a Save, the failures
 * are written too, and the third clean one ends the test with no button
 * pressed.
 * =====================================================================
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import PracticeTestPanel from '../PracticeTestPanel';
import type { DrillRecord, DrillSurface } from '../surfaces';

vi.mock('../../../../lib/userPrefs', () => ({
  getPref: async (_k: string, d: unknown) => d,
  setPref: async () => {},
}));

const written: DrillRecord[] = [];
const passes = vi.fn(async () => {});

/** A surface with nothing to set up, so the flow is session → run →
 *  rate without a setup screen in the way. */
function surface(over: Partial<DrillSurface> = {}): DrillSurface {
  return {
    id: 'song', cellLabel: 'Verse 1', skillLabel: '',
    countsUp: true, readSessionElapsedMs: null, readSessionId: null,
    sessionMetronome: false, scopeOptions: null, openedOnScopeId: null,
    openItem: null, wrapSections: null, wrapAsksActivities: false,
    writeSessionLog: async () => {}, hasStyle: false,
    rateLabel: 'BPM', targetRate: 0,
    rateOptions: [{ per: 1, label: 'At The Written Tempo' }],
    rateFrom: (bpm: number) => bpm,
    write: async (r: DrillRecord) => { written.push(r); },
    writeSessionRating: async () => {},
    recordTestPass: passes,
    describeTestPass: (band, lowestFeel) => ({
      kind: 'cell', cellLabel: 'Cmaj7 · Root position · Left hand', band, lowestFeel,
    }),
    passKeyName: null,
    renderBadgePreview: null,
    readVerdict: async () => ({ kind: 'band', band: 'fluent' } as const),
    ...over,
  } as DrillSurface;
}

function render(s: DrillSurface = surface()) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => { root.render(<PracticeTestPanel surface={s} onClose={() => {}} />); });
  const labels = () => [...document.body.querySelectorAll('button')]
    .map(b => (b.textContent ?? '').replace(/\s+/g, ' ').trim());
  const press = async (label: string) => {
    const b = [...document.body.querySelectorAll('button')]
      .find(x => (x.textContent ?? '').replace(/\s+/g, ' ').trim() === label);
    if (!b) throw new Error(`no button "${label}" — have ${labels().join(' | ')}`);
    await act(async () => { b.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  };
  const pressStartingWith = async (prefix: string) => {
    const b = [...document.body.querySelectorAll('button')]
      .find(x => (x.textContent ?? '').replace(/\s+/g, ' ').trim().startsWith(prefix));
    if (!b) throw new Error(`no button starting "${prefix}" — have ${labels().join(' | ')}`);
    await act(async () => { b.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  };
  /**
   * One run, played long enough to be real, then rated.
   *
   * The 31 seconds are not decoration: a run under `MIN_REP_SECONDS`
   * is marked too short and writes nothing, so a test that skipped the
   * clock would assert against an empty log and pass for the wrong
   * reason.
   */
  const run = async (feel: string) => {
    await pressStartingWith('Start Test Run');
    await act(async () => { vi.advanceTimersByTime(31_000); });
    await pressStartingWith('Done');
    // The feel chips carry their hint in the same button, so this
    // matches the leading word rather than the whole label.
    await pressStartingWith(feel);
  };
  return {
    labels, press, pressStartingWith, run,
    text: () => (document.body.textContent ?? '').replace(/\s+/g, ' ').trim(),
    unmount: () => { act(() => { root.unmount(); }); host.remove(); },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  written.length = 0;
  passes.mockClear();
  document.body.innerHTML = '';
});

afterEach(() => { vi.useRealTimers(); });

describe('entering a test', () => {
  it('still asks what you are about to do', async () => {
    // The mode chooser stays. Tapping a cell does not assume.
    const r = render();
    const l = r.labels();
    expect(l.some(x => x.startsWith('Practice'))).toBe(true);
    expect(l.some(x => x.startsWith('Test'))).toBe(true);
    r.unmount();
  });

  it('goes straight to the session, with no setup screen', async () => {
    // This surface has nothing to set — no style, no target length,
    // one rate option — so the step does not render.
    const r = render();
    await r.pressStartingWith('Test');
    expect(r.labels().some(l => l.startsWith('Start Test Run'))).toBe(true);
    r.unmount();
  });

  it('shows the circles from the start, at 0 of 3', async () => {
    // Drawn always during a test, not once a run is banked.
    const r = render();
    await r.pressStartingWith('Test');
    expect(r.text()).toContain('0 of 3');
    r.unmount();
  });
});

describe('each run is written when it finishes', () => {
  it('the first run is stored before a second is started', async () => {
    // It used to collect three and write them at Save. Nothing reached
    // the database until the button was pressed, so abandoning a test
    // halfway through lost the runs that had happened.
    const r = render();
    await r.pressStartingWith('Test');
    await r.run('Clean');
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({ fromTest: true, feel: 3 });
    r.unmount();
  });

  it('THE FAILURES ARE WRITTEN TOO', async () => {
    // Required, not incidental: banding reconstructs the streak from
    // the stored reps, so a reset it cannot see is a reset that did
    // not happen.
    const r = render();
    await r.pressStartingWith('Test');
    await r.run('Struggled');
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({ fromTest: true, feel: 1 });
    r.unmount();
  });
});

describe('the third clean run ends the test', () => {
  it('passes with no button pressed', async () => {
    const r = render();
    await r.pressStartingWith('Test');
    await r.run('Clean');
    await r.run('Clean');
    expect(passes).not.toHaveBeenCalled();
    await r.run('Clean');
    expect(passes).toHaveBeenCalledTimes(1);
    r.unmount();
  });

  it('there is no Save step to press', async () => {
    // "Save The Test" asked the user to confirm something already
    // done, and was ignorable — three clean runs with it unpressed was
    // a passed test the app did not record.
    const r = render();
    await r.pressStartingWith('Test');
    await r.run('Clean');
    await r.run('Clean');
    expect(r.labels()).not.toContain('Save The Test');
    r.unmount();
  });
});

describe('a bad run resets the streak, visibly', () => {
  it('DOES NOT PASS on three clean runs with a fumble between them', async () => {
    // The exact case the old rule got wrong: three at-target rated
    // drills, one Struggled, and the panel called the test complete.
    const r = render();
    await r.pressStartingWith('Test');
    await r.run('Clean');
    await r.run('Struggled');
    await r.run('Clean');
    await r.run('Clean');
    expect(passes).not.toHaveBeenCalled();
    r.unmount();
  });

  it('says the streak started over, and keeps the count on screen', async () => {
    const r = render();
    await r.pressStartingWith('Test');
    await r.run('Clean');
    await r.run('Clean');
    expect(r.text()).toContain('2 of 3');
    await r.run('Struggled');
    expect(r.text()).toContain(
      'That run was below Clean, so the streak starts over — back to 0 of 3. '
      + 'The runs before it are still logged.',
    );
    expect(r.text()).toContain('0 of 3');
    r.unmount();
  });

  it('and the run number keeps climbing while the streak does not', async () => {
    // The reading the message exists to reconcile: run four, streak
    // zero. Without the sentence those look like a contradiction.
    const r = render();
    await r.pressStartingWith('Test');
    await r.run('Clean');
    await r.run('Clean');
    await r.run('Struggled');
    expect(r.labels().some(l => l === 'Start Test Run 4')).toBe(true);
    r.unmount();
  });

  it('a recovery after the reset passes', async () => {
    const r = render();
    await r.pressStartingWith('Test');
    await r.run('Struggled');
    await r.run('Clean');
    await r.run('Clean');
    await r.run('Clean');
    expect(passes).toHaveBeenCalledTimes(1);
    r.unmount();
  });
});

describe('a pass reports through the one result screen', () => {
  it('says the test is passed, and names the item without a key', () => {
    // Every surface runs the same test now, so every surface says so
    // the same way. A chord shape is not played in a key, so the
    // sentence ends where the fact does.
    return (async () => {
      const r = render();
      await r.pressStartingWith('Test');
      await r.run('Clean');
      await r.run('Clean');
      await r.run('Clean');
      expect(r.text()).toContain('That’s the test passed.');
      expect(r.text()).toContain(
        'Cmaj7 · Root position · Left hand is now at Fluent status.',
      );
      expect(r.text()).not.toContain('in the key of');
      r.unmount();
    })();
  });

  it('names what set it — the lowest of the three WINNERS', async () => {
    // Not the lowest of the whole session. The Struggled run already
    // cost the streak once; charging it again would cap the session
    // for one mistake.
    const r = render();
    await r.pressStartingWith('Test');
    await r.run('Struggled');
    await r.run('Clean');
    await r.run('Clean');
    await r.run('Clean');
    expect(r.text()).toContain('Your lowest was Clean');
    r.unmount();
  });

  it('offers exactly one exit', async () => {
    const r = render();
    await r.pressStartingWith('Test');
    await r.run('Clean');
    await r.run('Clean');
    await r.run('Clean');
    expect(r.labels().filter(l => l !== '×')).toEqual(['Close And See It']);
    r.unmount();
  });

  it('OMITS THE BADGE BLOCK where there is no row to draw yet', async () => {
    // Shapes and patterns has no matrix row of its own; it is adopting
    // the song repertoire's face as separate work. Absent rather than
    // approximated — a stand-in would be a third row to reconcile when
    // that lands.
    const r = render();
    await r.pressStartingWith('Test');
    await r.run('Clean');
    await r.run('Clean');
    await r.run('Clean');
    expect(r.text()).not.toContain('What the matrix says now');
    r.unmount();
  });

  it('a session that ends WITHOUT a pass does not use it', async () => {
    // A test walked away from is an ordinary ending, not a failure to
    // report. It still goes to the done step.
    const r = render();
    await r.pressStartingWith('Test');
    await r.run('Clean');
    await r.press('End Session');
    expect(r.text()).not.toContain('That’s the test passed.');
    r.unmount();
  });
});
