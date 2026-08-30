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
import { metronome } from '../../../../lib/metronome';
import type { DrillRecord, DrillSurface } from '../surfaces';

vi.mock('../../../../lib/userPrefs', () => ({
  getPref: async (_k: string, d: unknown) => d,
  setPref: async () => {},
}));

/**
 * The metronome, reported as sounding.
 *
 * A test run cannot start with nothing sounding — that is the gate, and
 * it has its own test below. Everything else in this file is about what
 * happens AFTER a run starts, so the metronome is mocked as running
 * rather than each test being about switching it on. Starting the real
 * one needs an AudioContext jsdom does not have.
 */
let metronomePlaying = true;
vi.mock('../../../../lib/useMetronome', () => ({
  useMetronomeState: () => ({
    playing: metronomePlaying, bpm: 90, timeSig: '4/4', groove: 'straight', volume: 0.5,
  }),
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
    // "Done — Rate It" on a count-up surface, "Finish Now" on a
    // count-down one. Both end the run; the label follows the clock.
    const finish = [...document.body.querySelectorAll('button')]
      .map(b => (b.textContent ?? '').trim())
      .find(l => l.startsWith('Done') || l.startsWith('Finish'));
    if (!finish) throw new Error(`no finish button — have ${labels().join(' | ')}`);
    await pressStartingWith(finish);
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
  metronomePlaying = true;
  vi.useFakeTimers();
  written.length = 0;
  passes.mockClear();
  document.body.innerHTML = '';
});

afterEach(() => { vi.useRealTimers(); });

describe('the metronome gates a test run — on every surface', () => {
  it('refuses to start one with nothing sounding, and says why', async () => {
    // The rule stopped being song-only when the test model became
    // shared. A test that requires the metronome running cannot
    // require it on one surface and not the others.
    metronomePlaying = false;
    const r = render();
    await r.pressStartingWith('Test');
    expect(r.text()).toContain('Start the metronome to begin a test run.');
    const btn = [...document.body.querySelectorAll('button')]
      .find(b => (b.textContent ?? '').startsWith('Start Test Run'));
    expect(btn?.hasAttribute('disabled')).toBe(true);
    r.unmount();
  });

  it('lets one start once it is', async () => {
    const r = render();
    await r.pressStartingWith('Test');
    expect(r.text()).not.toContain('Start the metronome to begin');
    r.unmount();
  });

  it('DOES NOT GATE PRACTICE — the metronome is optional there', async () => {
    metronomePlaying = false;
    const r = render();
    await r.pressStartingWith('Practice');
    expect(r.text()).not.toContain('Start the metronome to begin');
    r.unmount();
  });
});

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

describe('a test asks its settings once, not before every run', () => {
  /** A surface with something to set, so the form exists at all. */
  const withSetup = () => surface({
    hasStyle: true,
    countsUp: false,
    rateOptions: [{ per: 1, label: 'One Shape Per Beat' }, { per: 2, label: 'One Shape Every 2 Beats' }],
    targetRate: 0,
  });

  it('shows the form on the session screen, beside the circles', async () => {
    const r = render(withSetup());
    await r.pressStartingWith('Test');
    expect(r.text()).toContain('How Long');
    expect(r.text()).toContain('0 of 3');
    r.unmount();
  });

  it('START MEANS START — it does not open a form', async () => {
    // Pressing a button that says Start and getting a form you have to
    // scroll past is the thing this removes.
    const r = render(withSetup());
    await r.pressStartingWith('Test');
    await r.pressStartingWith('Start Test Run');
    expect(r.labels().some(l => l === 'Start Drill')).toBe(false);
    expect(r.labels().some(l => l.startsWith('Finish'))).toBe(true);
    r.unmount();
  });

  it('THE THREE RUNS SHARE ONE SETTING, which is what makes them three of one', async () => {
    // Thirty seconds then ninety at two rates are two drills, and
    // "three in a row" says nothing about two drills.
    const r = render(withSetup());
    await r.pressStartingWith('Test');
    await r.run('Clean');
    await r.run('Clean');
    expect(written).toHaveLength(2);
    expect(written[0].targetSeconds).toBe(written[1].targetSeconds);
    expect(written[0].style).toBe(written[1].style);
    r.unmount();
  });

  it('PRACTICE KEEPS THE PER-DRILL FORM — varying it is the point there', async () => {
    const r = render(withSetup());
    await r.pressStartingWith('Practice');
    await r.pressStartingWith('Start A Practice Drill');
    expect(r.labels().some(l => l === 'Start Drill')).toBe(true);
    r.unmount();
  });
});

describe('closing asks when there is time to lose', () => {
  it('DOES NOT ask before a mode is picked', async () => {
    // Nothing recorded and nothing running: closing is as if the panel
    // never opened, so a prompt would be asking about nothing.
    const r = render();
    await r.press('Close');
    expect(r.text()).not.toContain('Are you sure you want to cancel this session?');
    r.unmount();
  });

  it('asks once a session has started', async () => {
    const r = render();
    await r.pressStartingWith('Test');
    await r.press('Close');
    expect(r.text()).toContain('Are you sure you want to cancel this session?');
    r.unmount();
  });

  it('asks in practice too — the condition is the clock, not the mode', async () => {
    const r = render();
    await r.pressStartingWith('Practice');
    await r.press('Close');
    expect(r.text()).toContain('Are you sure you want to cancel this session?');
    r.unmount();
  });

  it('Continue Session puts you back with the session intact', async () => {
    const r = render();
    await r.pressStartingWith('Test');
    await r.run('Clean');
    await r.press('Close');
    await r.press('Continue Session');
    expect(r.text()).not.toContain('Are you sure');
    expect(r.text()).toContain('1 of 3');
    r.unmount();
  });

  it('OFFERS NOTHING ELSE WHILE IT ASKS', async () => {
    // The confirmation replaces the body rather than sitting over it,
    // and the footer's Close goes with it: a question you can read the
    // session through invites answering it by looking away.
    const r = render();
    await r.pressStartingWith('Test');
    await r.press('Close');
    expect(r.labels().filter(l => l !== '×'))
      .toEqual(['Cancel The Session', 'Continue Session']);
    r.unmount();
  });

  it('does NOT include the unapproved middle line', async () => {
    const r = render();
    await r.pressStartingWith('Test');
    await r.press('Close');
    expect(r.text()).not.toContain("won't be recorded");
    r.unmount();
  });

  it('does not ask on the result screen — the session is already written', async () => {
    const r = render();
    await r.pressStartingWith('Test');
    await r.run('Clean');
    await r.run('Clean');
    await r.run('Clean');
    await r.press('Close And See It');
    expect(r.text()).not.toContain('Are you sure');
    r.unmount();
  });
});

describe('Pause — the third exit', () => {
  it('exists at all', async () => {
    // Done ends a session, Cancel throws it away, and walking away
    // from the piano is neither. It had nowhere to go.
    const r = render();
    await r.pressStartingWith('Test');
    expect(r.labels()).toContain('Pause');
    r.unmount();
  });

  it('says the clock is stopped, and what happened to the metronome', async () => {
    // A stopped clock is something a reader can miss. And a returning
    // player would otherwise find Start disabled and have to work out
    // why.
    const r = render();
    await r.pressStartingWith('Test');
    await r.press('Pause');
    expect(r.text()).toContain(
      'Paused — the clock is stopped. Metronome pauses with the session. '
      + 'Resumes upon return.',
    );
    r.unmount();
  });

  it('A PAUSED SESSION CANNOT START A RUN OR BE ENDED', async () => {
    // Both would be acting on a session that is not running. Ending
    // one is what Resume-then-Done is for.
    const r = render();
    await r.pressStartingWith('Test');
    await r.press('Pause');
    const start = [...document.body.querySelectorAll('button')]
      .find(b => (b.textContent ?? '').startsWith('Start Test Run'));
    const end = [...document.body.querySelectorAll('button')]
      .find(b => (b.textContent ?? '').trim() === 'End Session');
    expect(start?.hasAttribute('disabled')).toBe(true);
    expect(end?.hasAttribute('disabled')).toBe(true);
    r.unmount();
  });

  it('Resume puts it back', async () => {
    const r = render();
    await r.pressStartingWith('Test');
    await r.press('Pause');
    expect(r.labels()).toContain('Resume');
    await r.press('Resume');
    expect(r.labels()).toContain('Pause');
    expect(r.text()).not.toContain('Paused — the clock is stopped.');
    r.unmount();
  });

  it('cancelling a paused session still asks — the minutes are real', async () => {
    // The condition is that the clock HAS run, not that it is running
    // at this instant. A paused session has banked time to lose.
    const r = render();
    await r.pressStartingWith('Test');
    await r.press('Pause');
    await r.press('Close');
    expect(r.text()).toContain('Are you sure you want to cancel this session?');
    r.unmount();
  });

  it('DOES NOT show the reopening prompt while you are still here', async () => {
    // Resume / Log It And Close / Discard It are what a session asks
    // when you COME BACK to it. Offering them beside a live Pause
    // button would be two ways to end one session.
    const r = render();
    await r.pressStartingWith('Test');
    await r.press('Pause');
    expect(r.text()).not.toContain('Log It And Close');
    expect(r.text()).not.toContain('Discard It');
    r.unmount();
  });
});

describe('leaving the panel leaves silence', () => {
  it('stops a metronome the panel caused', async () => {
    // `stop('drill')` cannot pop a `'user'` driver, so a click started
    // inside the panel used to keep running after it closed. Harmless
    // while nothing made you start one — the test gate now requires
    // it, so it would happen on every single test.
    metronome.state = { ...metronome.state, playing: false };
    const r = render();
    metronome.state = { ...metronome.state, playing: true };
    const stop = vi.spyOn(metronome, 'stop');
    await r.press('Close');
    expect(stop).toHaveBeenCalledWith('user');
    stop.mockRestore();
    r.unmount();
  });

  it('LEAVES ONE THAT WAS ALREADY GOING', async () => {
    // A click started in the header before this panel opened belongs
    // to whatever was going on then. Closing a panel is not a reason
    // to end it, which is why this is not a `forceStop`.
    metronome.state = { ...metronome.state, playing: true };
    const r = render();
    const stop = vi.spyOn(metronome, 'stop');
    await r.press('Close');
    expect(stop).not.toHaveBeenCalledWith('user');
    stop.mockRestore();
    r.unmount();
    metronome.state = { ...metronome.state, playing: false };
  });
});
