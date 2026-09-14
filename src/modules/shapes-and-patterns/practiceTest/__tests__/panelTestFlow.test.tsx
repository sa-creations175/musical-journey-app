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
// THE PANEL READS THE GLOBAL INSTRUMENT, so a surface that shows it
// has to be mounted inside the provider the app mounts it inside.
import { InstrumentProvider } from '../../../../lib/instrumentContext';
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
    renderMetronome: null,
    onSessionPause: null,
    readVerdict: async () => ({ kind: 'band', band: 'fluent' } as const),
    ...over,
  } as DrillSurface;
}

function render(s: DrillSurface = surface()) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <InstrumentProvider>
        <PracticeTestPanel surface={s} onClose={() => {}} />
      </InstrumentProvider>,
    );
  });
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
  /**
   * One run: started, played, ENDED, then rated.
   *
   * Three presses, and the middle one is the point. Rating is not how a
   * run ends — one tap must not mean both "I finished" and "here is how
   * it went" — so the run is ended on purpose and rated afterwards.
   *
   * The 31 seconds are not decoration: a run under `MIN_REP_SECONDS`
   * writes nothing, so a test that skipped the clock would assert
   * against an empty log and pass for the wrong reason.
   */
  const run = async (feel: string) => {
    await pressStartingWith('Start A Test Drill');
    await act(async () => { vi.advanceTimersByTime(31_000); });
    await pressStartingWith('End Drill');
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
      .find(b => (b.textContent ?? '').startsWith('Start A Test Drill'));
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
    expect(r.labels().some(l => l.startsWith('Start A Test Drill'))).toBe(true);
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
    // The count in the pinned strip climbs with every run.
    expect(r.text()).toContain('3 drills in this session');
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
    await r.press('Log Session');
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
    await r.pressStartingWith('Start A Test Drill');
    expect(r.labels().some(l => l === 'Start Drill')).toBe(false);
    // In a run: the chips are on screen, because rating one is how a
    // run finishes now.
    expect(r.labels().some(l => l.startsWith('Clean'))).toBe(true);
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
    // The SETTINGS are shared — the style both runs were played in.
    // Their lengths are their own: a run records what it was played
    // for, and rating one early is allowed.
    expect(written[0].style).toBe(written[1].style);
    expect(written[0].style).toBe('blocked');
    r.unmount();
  });

  it('PRACTICE ASKS IT ON THE SAME SCREEN — and Start starts a run', async () => {
    // It used to open a screen of its own here, left by a second
    // button also called Start Drill, so a practice run cost two
    // presses of Start with the session hidden behind the form.
    const r = render(withSetup());
    await r.pressStartingWith('Practice');
    expect(r.text()).toContain('How Long');
    await r.press('Blocked');
    await r.pressStartingWith('Start A Practice Drill');
    expect(r.labels().some(l => l === 'Start Drill')).toBe(false);
    // Straight into a run: the chips are on screen and the run has a
    // way to end.
    expect(r.labels().some(l => l === 'End Drill')).toBe(true);
    r.unmount();
  });

  it('and can still be varied between practice runs', async () => {
    // Varying it between drills is the point of practising; the
    // controls are in front of you rather than behind a button.
    const r = render(withSetup());
    await r.pressStartingWith('Practice');
    await r.press('Blocked');
    await r.press('30s');
    await r.pressStartingWith('Start A Practice Drill');
    // A 30s drill ends itself at its target — no button to press.
    await act(async () => { vi.advanceTimersByTime(31_000); });
    await r.pressStartingWith('Clean');
    await r.press('Broken');
    await r.pressStartingWith('Start A Practice Drill');
    await act(async () => { vi.advanceTimersByTime(31_000); });
    await r.pressStartingWith('Clean');
    expect(written).toHaveLength(2);
    expect(written[0].style).toBe('blocked');
    expect(written[1].style).toBe('broken');
    r.unmount();
  });
});

describe('closing asks when there is time to lose', () => {
  it('DOES NOT ask before a mode is picked', async () => {
    // Nothing recorded and nothing running: closing is as if the panel
    // never opened, so a prompt would be asking about nothing.
    // Before a mode is picked the button really is just Close: nothing
    // has happened, so there is no session to cancel.
    const r = render();
    expect(r.labels()).toContain('Close');
    await r.press('Close');
    expect(r.text()).not.toContain('Are you sure you want to cancel this session?');
    r.unmount();
  });

  it('asks once a session has started', async () => {
    const r = render();
    await r.pressStartingWith('Test');
    await r.press('Cancel Session');
    expect(r.text()).toContain('Are you sure you want to cancel this session?');
    r.unmount();
  });

  it('asks in practice too — the condition is the clock, not the mode', async () => {
    const r = render();
    await r.pressStartingWith('Practice');
    await r.press('Cancel Session');
    expect(r.text()).toContain('Are you sure you want to cancel this session?');
    r.unmount();
  });

  it('Continue Session puts you back with the session intact', async () => {
    const r = render();
    await r.pressStartingWith('Test');
    await r.run('Clean');
    await r.press('Cancel Session');
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
    await r.press('Cancel Session');
    expect(r.labels().filter(l => l !== '×'))
      .toEqual(['Cancel The Session', 'Continue Session']);
    r.unmount();
  });

  it('does NOT include the unapproved middle line', async () => {
    const r = render();
    await r.pressStartingWith('Test');
    await r.press('Cancel Session');
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
    expect(r.labels()).toContain('Pause Session');
    r.unmount();
  });

  it('says the clock is stopped, and what happened to the metronome', async () => {
    // A stopped clock is something a reader can miss. And a returning
    // player would otherwise find Start disabled and have to work out
    // why.
    const r = render();
    await r.pressStartingWith('Test');
    await r.press('Pause Session');
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
    await r.press('Pause Session');
    const start = [...document.body.querySelectorAll('button')]
      .find(b => (b.textContent ?? '').startsWith('Start A Test Drill'));
    const end = [...document.body.querySelectorAll('button')]
      .find(b => (b.textContent ?? '').trim() === 'Log Session');
    expect(start?.hasAttribute('disabled')).toBe(true);
    expect(end?.hasAttribute('disabled')).toBe(true);
    r.unmount();
  });

  it('Resume puts it back', async () => {
    const r = render();
    await r.pressStartingWith('Test');
    await r.press('Pause Session');
    expect(r.labels()).toContain('Resume Session');
    await r.press('Resume Session');
    expect(r.labels()).toContain('Pause Session');
    expect(r.text()).not.toContain('Paused — the clock is stopped.');
    r.unmount();
  });

  it('cancelling a paused session still asks — the minutes are real', async () => {
    // The condition is that the clock HAS run, not that it is running
    // at this instant. A paused session has banked time to lose.
    const r = render();
    await r.pressStartingWith('Test');
    await r.press('Pause Session');
    await r.press('Cancel Session');
    expect(r.text()).toContain('Are you sure you want to cancel this session?');
    r.unmount();
  });

  it('DOES NOT show the reopening prompt while you are still here', async () => {
    // Resume / Log It And Close / Discard It are what a session asks
    // when you COME BACK to it. Offering them beside a live Pause
    // button would be two ways to end one session.
    const r = render();
    await r.pressStartingWith('Test');
    await r.press('Pause Session');
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

describe('the ladder band — where you are, and what it gets you', () => {
  it('shows the standing you walked in with, and the prize', async () => {
    // The circles alone say how far through you are; the rungs alone
    // say what a pass is worth. The question three runs in is "is this
    // worth finishing", and only both together answer it.
    const r = render();
    await r.pressStartingWith('Test');
    expect(r.text()).toContain('Fluent');
    r.unmount();
  });

  it('PROJECTS THE PRIZE FROM THE STREAK SO FAR', async () => {
    // Three In flow runs promise Mastered; three Cleans promise
    // Fluent. A band that always showed the ceiling would be offering
    // something not on the table.
    const r = render();
    await r.pressStartingWith('Test');
    await r.run('In flow');
    expect(r.text()).toContain('Mastered');
    r.unmount();
  });

  it('drops back with the streak when a run goes wrong', async () => {
    const r = render();
    await r.pressStartingWith('Test');
    await r.run('In flow');
    await r.run('Clean');
    // The lowest of the streak so far is Clean, so Fluent is what is
    // on offer — not the Mastered the first run alone suggested.
    expect(r.text()).toContain('Fluent');
    r.unmount();
  });

  it('is not drawn in practice — there is no rung to reach', async () => {
    const r = render();
    await r.pressStartingWith('Practice');
    expect(r.text()).not.toContain('0 of 3');
    r.unmount();
  });
});

describe('Open Lead Sheet reveals the chart without ending the session', () => {
  /** The song surface is the only one with an `openItem`, so it is the
   *  only one that can wear the sheet. */
  const withSheet = (onOpen = () => {}) => surface({
    openItem: onOpen,
    sessionMetronome: true,
    scopeOptions: [{ id: 's1', label: 'Verse 1' }],
    openedOnScopeId: 's1',
  });

  it('swaps the panel for the strip', async () => {
    const r = render(withSheet());
    await r.pressStartingWith('Test');
    await r.press('Open Lead Sheet');
    expect(r.labels()).toContain('Back To The Session');
    expect(r.labels()).not.toContain('Open Lead Sheet');
    r.unmount();
  });

  it('tells the host to reveal the item — it does not close', async () => {
    // `openItem` used to mean "leave". The host scrolls; the panel
    // stays mounted, which is the whole of the fix.
    const onOpen = vi.fn();
    const r = render(withSheet(onOpen));
    await r.pressStartingWith('Test');
    await r.press('Open Lead Sheet');
    expect(onOpen).toHaveBeenCalledTimes(1);
    r.unmount();
  });

  it('THE BANKED RUNS AND THE STREAK SURVIVE THE SWITCH, AND SURVIVE COMING BACK', async () => {
    // The bug: the panel could only ever be a dialog, so revealing the
    // page behind it meant unmounting — and the session state lives in
    // the panel, so two clean runs died to show a chart.
    const r = render(withSheet());
    await r.pressStartingWith('Test');
    await r.run('Clean');
    await r.run('Clean');
    expect(r.text()).toContain('2 of 3');

    await r.press('Open Lead Sheet');
    expect(r.text()).toContain('2 of 3');

    await r.press('Back To The Session');
    expect(r.text()).toContain('2 of 3');
    expect(r.labels()).toContain('Open Lead Sheet');
    r.unmount();
  });

  it('and a third clean run from the STRIP still passes the test', async () => {
    // Proof the session is one session: two runs rated in the panel,
    // the third in the strip, and the streak completes across both.
    const r = render(withSheet());
    await r.pressStartingWith('Test');
    await r.run('Clean');
    await r.run('Clean');
    await r.press('Open Lead Sheet');
    await r.pressStartingWith('Start Test Run');
    await act(async () => { vi.advanceTimersByTime(31_000); });
    await r.pressStartingWith('End Test Run');
    await r.pressStartingWith('Clean');
    expect(passes).toHaveBeenCalledTimes(1);
    r.unmount();
  });
});

describe('stopping the metronome ends the run and asks — in both views', () => {
  const withSheet = () => surface({
    openItem: () => {},
    sessionMetronome: true,
    scopeOptions: [{ id: 's1', label: 'Verse 1' }],
    openedOnScopeId: 's1',
  });

  /** Stop it the way a user does: from the control's own button. */
  const stopMetronome = async () => {
    metronomePlaying = false;
    const btn = [...document.body.querySelectorAll('button')]
      .find(b => b.getAttribute('aria-label') === 'stop metronome');
    if (!btn) throw new Error('no metronome stop button');
    await act(async () => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  };

  it('asks in the PANEL', async () => {
    const r = render(withSheet());
    await r.pressStartingWith('Test');
    await r.pressStartingWith('Start A Test Drill');
    await act(async () => { vi.advanceTimersByTime(31_000); });
    await stopMetronome();
    expect(r.text()).toContain(
      'Did you finish that run? The metronome stopped, so the run stopped '
      + 'with it. Rate it if you got to the end. If you did not, discarding '
      + 'it costs you the run — your streak is untouched.',
    );
    r.unmount();
  });

  it('asks in the STRIP', async () => {
    const r = render(withSheet());
    await r.pressStartingWith('Test');
    await r.press('Open Lead Sheet');
    await r.pressStartingWith('Start Test Run');
    await act(async () => { vi.advanceTimersByTime(31_000); });
    await stopMetronome();
    expect(r.text()).toContain('Did you finish that run?');
    r.unmount();
  });

  it('THE CHIPS ARE STILL THERE — they are the other answer', async () => {
    // "Rate it if you got to the end." A prompt offering only the
    // discard would make the question rhetorical.
    const r = render(withSheet());
    await r.pressStartingWith('Test');
    await r.pressStartingWith('Start A Test Drill');
    await act(async () => { vi.advanceTimersByTime(31_000); });
    await stopMetronome();
    expect(r.labels().some(l => l.startsWith('Clean'))).toBe(true);
    r.unmount();
  });

  it('DISCARDING COSTS THE RUN AND NOT THE STREAK', async () => {
    // A run you abandoned is not a run you failed. Failing is what the
    // chips are for, and Struggled already costs the streak.
    const r = render(withSheet());
    await r.pressStartingWith('Test');
    await r.run('Clean');
    await r.run('Clean');
    await r.pressStartingWith('Start A Test Drill');
    await act(async () => { vi.advanceTimersByTime(31_000); });
    await stopMetronome();
    written.length = 0;
    await r.pressStartingWith('I didn');
    expect(r.text()).toContain('2 of 3');
    expect(written).toHaveLength(0);
    expect(r.text()).toContain('was discarded');
    r.unmount();
  });

  it('rating it instead keeps the run', async () => {
    const r = render(withSheet());
    await r.pressStartingWith('Test');
    await r.pressStartingWith('Start A Test Drill');
    await act(async () => { vi.advanceTimersByTime(31_000); });
    await stopMetronome();
    await r.pressStartingWith('Clean');
    expect(written).toHaveLength(1);
    expect(r.text()).toContain('1 of 3');
    r.unmount();
  });

  it('DOES NOT ASK IN PRACTICE — the metronome is optional there', async () => {
    const r = render(withSheet());
    await r.pressStartingWith('Practice');
    await r.pressStartingWith('Start A Practice');
    await act(async () => { vi.advanceTimersByTime(31_000); });
    await stopMetronome();
    expect(r.text()).not.toContain('Did you finish that run?');
    r.unmount();
  });
});

describe('one rendering of the four ratings', () => {
  const withSheet = () => surface({
    openItem: () => {},
    sessionMetronome: true,
    scopeOptions: [{ id: 's1', label: 'Verse 1' }, { id: 's2', label: 'Chorus' }],
    openedOnScopeId: 's1',
  });

  it('rates in place, with the session still on screen', async () => {
    // It used to be a page of its own, so the clock, the streak and the
    // runs behind it all vanished at the moment you were asked about
    // them.
    const r = render(withSheet());
    await r.pressStartingWith('Test');
    await r.pressStartingWith('Start A Test Drill');
    await act(async () => { vi.advanceTimersByTime(31_000); });
    expect(r.text()).toContain('Rate That Run');
    expect(r.text()).toContain('0 of 3');
    r.unmount();
  });

  it('offers Start OR the rating, never both', async () => {
    const r = render(withSheet());
    await r.pressStartingWith('Test');
    await r.pressStartingWith('Start A Test Drill');
    await act(async () => { vi.advanceTimersByTime(31_000); });
    expect(r.labels().some(l => l.startsWith('Start A Test Drill'))).toBe(false);
    r.unmount();
  });

  it('the retired label is gone', async () => {
    const r = render(withSheet());
    await r.pressStartingWith('Test');
    await r.pressStartingWith('Start A Test Drill');
    await act(async () => { vi.advanceTimersByTime(31_000); });
    expect(r.text()).not.toContain('How Did That Go');
    r.unmount();
  });

  it('PANEL AND STRIP REACH THE SAME RESULT from the same four chips', async () => {
    // The point of the extraction: not that they look alike, but that
    // a run rated either side goes through one renderer and one
    // handler.
    const inPanel = render(withSheet());
    await inPanel.pressStartingWith('Test');
    await inPanel.run('Clean');
    const panelWrite = { ...written[0] };
    inPanel.unmount();

    written.length = 0;
    document.body.innerHTML = '';
    const inStrip = render(withSheet());
    await inStrip.pressStartingWith('Test');
    await inStrip.press('Open Lead Sheet');
    await inStrip.pressStartingWith('Start Test Run');
    await act(async () => { vi.advanceTimersByTime(31_000); });
    await inStrip.pressStartingWith('End Test Run');
    await inStrip.pressStartingWith('Clean');

    expect(written).toHaveLength(1);
    expect(written[0].feel).toBe(panelWrite.feel);
    expect(written[0].fromTest).toBe(panelWrite.fromTest);
    expect(written[0].scope).toBe(panelWrite.scope);
    inStrip.unmount();
  });

  it('the third clean run ends the test from the PANEL', async () => {
    const r = render(withSheet());
    await r.pressStartingWith('Test');
    await r.run('Clean');
    await r.run('Clean');
    await r.run('Clean');
    expect(passes).toHaveBeenCalledTimes(1);
    r.unmount();
  });

  it('and from the STRIP', async () => {
    const r = render(withSheet());
    await r.pressStartingWith('Test');
    await r.run('Clean');
    await r.run('Clean');
    await r.press('Open Lead Sheet');
    await r.pressStartingWith('Start Test Run');
    await act(async () => { vi.advanceTimersByTime(31_000); });
    await r.pressStartingWith('End Test Run');
    await r.pressStartingWith('Clean');
    expect(passes).toHaveBeenCalledTimes(1);
    r.unmount();
  });

  it('a shapes run still rates and records — no surface is gated out', async () => {
    // Chord shapes, scales and voice-leading got the chips too. Same
    // four ratings, same moment, same order — smaller.
    const shapes = surface({
      hasStyle: true, countsUp: false, scopeOptions: null,
      openItem: null, sessionMetronome: false,
      rateOptions: [{ per: 1, label: 'One Shape Per Beat' }],
    });
    const r = render(shapes);
    await r.pressStartingWith('Practice');
    // The style is picked on the session screen, and Start stays
    // disabled until it has been — the refusal moved with the
    // question rather than being dropped.
    await r.press('Blocked');
    await r.pressStartingWith('Start A Practice');
    // A count-DOWN drill finishes itself when the countdown fires, so
    // there is nothing to press: the rating box is already there.
    await act(async () => { vi.advanceTimersByTime(61_000); });
    expect(r.text()).toContain('Rate That Run');
    await r.pressStartingWith('Clean');
    expect(written).toHaveLength(1);
    expect(written[0].feel).toBe(3);
    r.unmount();
  });
});

describe('the scope picker is a practice control', () => {
  const withSections = () => surface({
    sessionMetronome: true,
    scopeOptions: [{ id: 's1', label: 'Verse 1' }, { id: 's2', label: 'Chorus' }],
    openedOnScopeId: 's1',
  });

  it('A PRACTICE RUN CAN WIDEN WHAT IT COUNTED FOR, after playing it', async () => {
    // Seeing afterwards that a run covered the chorus too is a real
    // thing to want, and this is how you say so.
    const r = render(withSections());
    await r.pressStartingWith('Practice');
    await r.pressStartingWith('Start A Practice');
    await act(async () => { vi.advanceTimersByTime(61_000); });
    await r.pressStartingWith('End Drill');
    expect(r.text()).toContain('What Was That Run');
    await r.press('Chorus');
    await r.pressStartingWith('Clean');
    expect(written[0].scope).toEqual(['s2']);
    r.unmount();
  });

  it('A TEST RUN HAS NO SCOPE CONTROL', async () => {
    // What a test counts for is fixed when the test is opened. `entry`
    // decides it and nothing after the run may widen it.
    const r = render(withSections());
    await r.pressStartingWith('Test');
    await r.pressStartingWith('Start A Test Drill');
    await act(async () => { vi.advanceTimersByTime(31_000); });
    expect(r.text()).toContain('Rate That Run');
    expect(r.text()).not.toContain('What Was That Run');
    r.unmount();
  });

  it('and records only what it was opened for', async () => {
    // Unchanged by this commit: the writer has always sent `scope:
    // null` on a test, so the control was visible and inert there.
    const r = render(withSections());
    await r.pressStartingWith('Test');
    await r.run('Clean');
    expect(written[0].scope).toBeNull();
    r.unmount();
  });
});

describe('playing a run does not take the screen', () => {
  const withEverything = () => surface({
    openItem: () => {},
    sessionMetronome: true,
    scopeOptions: [{ id: 's1', label: 'Verse 1' }, { id: 's2', label: 'Chorus' }],
    openedOnScopeId: 's1',
  });

  it('THE SESSION STAYS PUT WHILE A RUN IS PLAYED', async () => {
    // It used to be replaced by a stopwatch page: one big number, a
    // target readout and a button. The circles, the runs already
    // played and the metronome all vanished for the duration of the
    // thing they were there to measure.
    const r = render(withEverything());
    await r.pressStartingWith('Test');
    await r.run('Clean');
    await r.pressStartingWith('Start A Test Drill');
    await act(async () => { vi.advanceTimersByTime(31_000); });

    expect(r.text()).toContain('1 of 3');                    // the circles
    expect(r.text()).toContain('Runs In This Testing Session'); // the run list
    expect(r.text()).toContain('Rate That Run');             // the rating box
    // The metronome: this fixture uses the plain control, whose face
    // is its tempo rather than the word.
    expect(r.labels().some(l => l.endsWith('bpm'))).toBe(true);
    expect(r.labels()).toContain('Open Lead Sheet');
    r.unmount();
  });

  it('the run clock appears beside the session clock, named', async () => {
    const r = render(withEverything());
    await r.pressStartingWith('Test');
    expect(r.text()).toContain('Testing Session');
    expect(r.text()).not.toContain('Test Run ');
    await r.pressStartingWith('Start A Test Drill');
    await act(async () => { vi.advanceTimersByTime(31_000); });
    expect(r.text()).toContain('Testing Session');
    expect(r.text()).toContain('Test Run');
    r.unmount();
  });

  it('THE STOPWATCH PAGE IS GONE', async () => {
    // Its parts, one by one: the big unlabelled clock's caption, the
    // rate readout, and the button that finished a run.
    const r = render(withEverything());
    await r.pressStartingWith('Test');
    await r.pressStartingWith('Start A Test Drill');
    await act(async () => { vi.advanceTimersByTime(31_000); });
    expect(r.text()).not.toContain('AT TARGET');
    expect(r.text()).not.toContain('BELOW TARGET');
    expect(r.labels().some(l => l.startsWith('Done'))).toBe(false);
    expect(r.labels().some(l => l.startsWith('Finish Now'))).toBe(false);
    r.unmount();
  });

  it('rating a live run finishes it, and the clock goes', async () => {
    const r = render(withEverything());
    await r.pressStartingWith('Test');
    await r.pressStartingWith('Start A Test Drill');
    await act(async () => { vi.advanceTimersByTime(31_000); });
    await r.pressStartingWith('End Drill');
    await r.pressStartingWith('Clean');
    expect(written).toHaveLength(1);
    expect(r.text()).not.toContain('Rate That Run');
    expect(r.labels().some(l => l.startsWith('Start A Test Drill'))).toBe(true);
    r.unmount();
  });

  it('a count-down drill still stops at its target on its own', async () => {
    // No screen hosts the countdown any more, so the run has to end
    // itself. A drill with a target still gets one.
    const shapes = surface({
      hasStyle: true, countsUp: false, scopeOptions: null,
      openItem: null, sessionMetronome: false,
      rateOptions: [{ per: 1, label: 'One Shape Per Beat' }],
    });
    const r = render(shapes);
    await r.pressStartingWith('Practice');
    await r.press('Blocked');
    await r.pressStartingWith('Start A Practice');
    await act(async () => { vi.advanceTimersByTime(61_000); });
    expect(r.text()).toContain('Rate That Run');
    await r.pressStartingWith('Clean');
    expect(written[0].ranSeconds).toBe(60);
    r.unmount();
  });
});

describe('the ways out sit along the bottom', () => {
  it('the step trail is gone', async () => {
    // It read `Skill › Mode › Test Runs › Done` — a breadcrumb through
    // screens the panel no longer has.
    const r = render();
    await r.pressStartingWith('Test');
    expect(r.text()).not.toContain('Skill');
    expect(r.text()).not.toContain('Wrap Up');
    r.unmount();
  });

  it('Pause and End Session are reachable while a run is going', async () => {
    // They used to sit halfway up the session screen, so they scrolled
    // away exactly when a run was in progress.
    const r = render();
    await r.pressStartingWith('Test');
    await r.pressStartingWith('Start A Test Drill');
    await act(async () => { vi.advanceTimersByTime(31_000); });
    expect(r.labels()).toContain('Pause Session');
    expect(r.labels()).toContain('Log Session');
    r.unmount();
  });

  it('and are absent before a mode is picked', async () => {
    const r = render();
    expect(r.labels()).not.toContain('Pause Session');
    expect(r.labels()).not.toContain('Log Session');
    r.unmount();
  });
});

describe('a run ends explicitly, then is rated', () => {
  const withSheet = () => surface({
    openItem: () => {},
    sessionMetronome: true,
    scopeOptions: [{ id: 's1', label: 'Verse 1' }],
    openedOnScopeId: 's1',
  });

  /** Every chip on screen, and whether it can be pressed. */
  const chips = () => [...document.body.querySelectorAll('button')]
    .filter(b => ['Struggled', 'Working on it', 'Clean', 'In flow']
      .some(l => (b.textContent ?? '').trim().startsWith(l)));

  it('THE CHIPS CANNOT BE TAPPED WHILE THE RUN IS GOING', async () => {
    // One tap must not mean both "I finished" and "here is how it
    // went". The question is present because it is next — not because
    // it can be answered.
    const r = render(withSheet());
    await r.pressStartingWith('Test');
    await r.pressStartingWith('Start A Test Drill');
    await act(async () => { vi.advanceTimersByTime(31_000); });
    expect(chips()).toHaveLength(4);
    expect(chips().every(b => b.hasAttribute('disabled'))).toBe(true);
    expect(written).toHaveLength(0);
    r.unmount();
  });

  it('says "After the run" where "Required" goes', async () => {
    const r = render(withSheet());
    await r.pressStartingWith('Test');
    await r.pressStartingWith('Start A Test Drill');
    await act(async () => { vi.advanceTimersByTime(31_000); });
    expect(r.text()).toContain('Rate That Run');
    expect(r.text()).toContain('After the run');
    expect(r.text()).not.toContain('Required');
    r.unmount();
  });

  it('ending the run stops the clock and lights the chips', async () => {
    const r = render(withSheet());
    await r.pressStartingWith('Test');
    await r.pressStartingWith('Start A Test Drill');
    await act(async () => { vi.advanceTimersByTime(31_000); });
    await r.pressStartingWith('End Drill');

    expect(chips().every(b => !b.hasAttribute('disabled'))).toBe(true);
    expect(r.text()).toContain('Required');
    expect(r.text()).not.toContain('After the run');
    // The End button has done its job and goes.
    expect(r.labels().some(l => l.startsWith('End Drill'))).toBe(false);
    r.unmount();
  });

  it('THE CLOCK STOPS — the run keeps the length it had', async () => {
    const r = render(withSheet());
    await r.pressStartingWith('Test');
    await r.pressStartingWith('Start A Test Drill');
    await act(async () => { vi.advanceTimersByTime(31_000); });
    await r.pressStartingWith('End Drill');
    // Time passing after the run ended must not lengthen it.
    await act(async () => { vi.advanceTimersByTime(60_000); });
    await r.pressStartingWith('Clean');
    expect(written[0].ranSeconds).toBe(31);
    r.unmount();
  });

  it('practice ends with End Drill too, in the panel', async () => {
    const r = render(withSheet());
    await r.pressStartingWith('Practice');
    await r.pressStartingWith('Start A Practice');
    await act(async () => { vi.advanceTimersByTime(31_000); });
    expect(r.labels().some(l => l === 'End Drill')).toBe(true);
    expect(r.labels().some(l => l.startsWith('End Test Run'))).toBe(false);
    r.unmount();
  });

  it('a count-down drill ends ITSELF into the same state', async () => {
    // It does not skip the rating, and it does not need the button
    // pressed as well.
    const shapes = surface({
      hasStyle: true, countsUp: false, scopeOptions: null,
      openItem: null, sessionMetronome: false,
      rateOptions: [{ per: 1, label: 'One Shape Per Beat' }],
    });
    const r = render(shapes);
    await r.pressStartingWith('Practice');
    await r.press('Blocked');
    await r.pressStartingWith('Start A Practice');
    await act(async () => { vi.advanceTimersByTime(61_000); });

    expect(r.labels().some(l => l.startsWith('End Drill'))).toBe(false);
    expect(chips().every(b => !b.hasAttribute('disabled'))).toBe(true);
    expect(r.text()).not.toContain('After the run');
    await r.pressStartingWith('Clean');
    expect(written[0].ranSeconds).toBe(60);
    r.unmount();
  });

  it('THE STRIP BEHAVES THE SAME WAY', async () => {
    const r = render(withSheet());
    await r.pressStartingWith('Test');
    await r.press('Open Lead Sheet');
    await r.pressStartingWith('Start Test Run');
    await act(async () => { vi.advanceTimersByTime(31_000); });

    expect(chips()).toHaveLength(4);
    expect(chips().every(b => b.hasAttribute('disabled'))).toBe(true);
    await r.pressStartingWith('End Test Run');
    expect(chips().every(b => !b.hasAttribute('disabled'))).toBe(true);
    await r.pressStartingWith('Clean');
    expect(written).toHaveLength(1);
    expect(written[0].ranSeconds).toBe(31);
    r.unmount();
  });
});

describe('a testing session is logged, like a practice one', () => {
  const logged: unknown[] = [];
  const withLog = (kindProps = {}) => surface({
    sessionMetronome: true,
    openItem: () => {},
    scopeOptions: [{ id: 's1', label: 'Verse 1' }],
    openedOnScopeId: 's1',
    wrapSections: [{ id: 's1', label: 'Verse 1' }],
    // The activities question is a song's; the fixture asks it so the
    // wrap-up is recognisable in an assertion.
    wrapAsksActivities: true,
    writeSessionLog: async (entry: unknown) => { logged.push(entry); },
    ...kindProps,
  });

  beforeEach(() => { logged.length = 0; });

  it('ENDING A TEST REACHES THE WRAP-UP', async () => {
    // It used to ask whether you wanted to cancel, so a testing
    // session had two exits wearing three names and its minutes were
    // lost every time.
    const r = render(withLog());
    await r.pressStartingWith('Test');
    await r.run('Clean');
    await r.press('Log Session');
    expect(r.text()).toContain('What Did You Work On');
    expect(r.text()).not.toContain('Are you sure you want to cancel');
    r.unmount();
  });

  it('and logs the sitting, with its minutes', async () => {
    const r = render(withLog());
    await r.pressStartingWith('Test');
    await r.run('Clean');
    await act(async () => { vi.advanceTimersByTime(120_000); });
    await r.press('Log Session');
    await r.pressStartingWith('Log Session');
    expect(logged).toHaveLength(1);
    expect((logged[0] as { durationSeconds: number }).durationSeconds)
      .toBeGreaterThan(0);
    r.unmount();
  });

  it('PRACTICE LOGS THE SITTING TOO — nothing was writing it before', async () => {
    // The wrap-up has always asked what you worked on, which sections
    // you touched and for a note, and then handed all three to a
    // caller that dropped them along with the minutes.
    const r = render(withLog());
    await r.pressStartingWith('Practice');
    await r.press('Log Session');
    await r.pressStartingWith('Log Session');
    expect(logged).toHaveLength(1);
    r.unmount();
  });

  it('runs already rated survive being logged', async () => {
    const r = render(withLog());
    await r.pressStartingWith('Test');
    await r.run('Clean');
    await r.run('Clean');
    expect(written).toHaveLength(2);
    await r.press('Log Session');
    await r.pressStartingWith('Log Session');
    expect(written).toHaveLength(2);
    r.unmount();
  });

  it('and survive being cancelled', async () => {
    // Each was written the moment it was rated. Cancelling throws away
    // the sitting, not the runs.
    const r = render(withLog());
    await r.pressStartingWith('Test');
    await r.run('Clean');
    await r.press('Cancel Session');
    expect(r.text()).toContain('Are you sure you want to cancel this session?');
    await r.press('Cancel The Session');
    expect(written).toHaveLength(1);
    expect(logged).toHaveLength(0);
    r.unmount();
  });

  it('the practice-only ceiling notice is absent on a test', async () => {
    // "A test at target can" is not something to say to someone who
    // has just finished one.
    const r = render(withLog());
    await r.pressStartingWith('Test');
    await r.press('Log Session');
    expect(r.text()).not.toContain('Practice stops at Developing');
    r.unmount();
  });

  it('and present on practice', async () => {
    const r = render(withLog());
    await r.pressStartingWith('Practice');
    await r.press('Log Session');
    expect(r.text()).toContain('Practice stops at Developing');
    r.unmount();
  });
});

describe('the three session buttons say what they do', () => {
  it('read Cancel Session, Pause Session and Log Session', async () => {
    const r = render();
    await r.pressStartingWith('Test');
    const l = r.labels();
    expect(l).toContain('Cancel Session');
    expect(l).toContain('Pause Session');
    expect(l).toContain('Log Session');
    r.unmount();
  });

  it('the retired ones are gone', async () => {
    const r = render();
    await r.pressStartingWith('Test');
    const l = r.labels();
    expect(l).not.toContain('End Session');
    expect(l).not.toContain('Close');
    expect(l).not.toContain('Pause');
    r.unmount();
  });

  it('Pause Session reads Resume Session while paused', async () => {
    const r = render();
    await r.pressStartingWith('Test');
    await r.press('Pause Session');
    expect(r.labels()).toContain('Resume Session');
    expect(r.labels()).not.toContain('Pause Session');
    r.unmount();
  });

  it('and it is still just Close before a mode is picked', async () => {
    const r = render();
    const l = r.labels();
    expect(l).toContain('Close');
    expect(l).not.toContain('Cancel Session');
    expect(l).not.toContain('Log Session');
    r.unmount();
  });
});

describe('the session clock runs on a song', () => {
  /** A surface whose clock is a stored record, as a song's is. */
  const withStoredClock = () => {
    let startedAt: number | null = null;
    const s = surface({
      sessionMetronome: true,
      readSessionElapsedMs: () => (startedAt === null ? 0 : Date.now() - startedAt),
      onSessionStart: () => { if (startedAt === null) startedAt = Date.now(); },
    });
    return s;
  };

  it('ADVANCES ONCE A SESSION STARTS', async () => {
    // It sat at 00:00 for a whole sitting: the panel was faithfully
    // reporting a stored timer that nothing had ever started.
    const r = render(withStoredClock());
    await r.pressStartingWith('Practice');
    await act(async () => { vi.advanceTimersByTime(65_000); });
    expect(r.text()).toContain('01:05');
    r.unmount();
  });

  it('and keeps advancing across runs', async () => {
    // The run clock restarts every run; the session's must not.
    const r = render(withStoredClock());
    await r.pressStartingWith('Test');
    await r.run('Clean');
    await act(async () => { vi.advanceTimersByTime(60_000); });
    await r.run('Clean');
    await act(async () => { vi.advanceTimersByTime(60_000); });
    // Two runs of 31s plus two waits of 60s.
    expect(r.text()).toContain('03:02');
    r.unmount();
  });

  it('does not start a stored clock that is already going', async () => {
    // A timer already running belongs to whatever started it; the page
    // offers the swap. Starting one here would move minutes between
    // songs.
    let starts = 0;
    const s = surface({
      readSessionElapsedMs: () => 1000,
      onSessionStart: () => { starts += 1; },
    });
    const r = render(s);
    await r.pressStartingWith('Practice');
    expect(starts).toBe(1);
    r.unmount();
  });
});

describe('the run list does not grow without limit', () => {
  it('shows the last three, and offers the rest', async () => {
    // Three is the length of the streak, so what is on screen is
    // always the runs deciding the outcome — and a tenth run must not
    // push the End button off the bottom.
    const r = render(surface({ sessionMetronome: true }));
    await r.pressStartingWith('Test');
    // Struggled, not Clean: three clean in a row would pass the test
    // and take us to the result screen before there were four runs.
    for (let i = 0; i < 4; i += 1) await r.run('Struggled');
    expect(r.text()).toContain('Show all 4 run-throughs — 1 earlier');
    r.unmount();
  });

  it('and says so the other way round once open', async () => {
    const r = render(surface({ sessionMetronome: true }));
    await r.pressStartingWith('Test');
    for (let i = 0; i < 4; i += 1) await r.run('Struggled');
    await r.pressStartingWith('Show all');
    expect(r.text()).toContain('Show fewer');
    r.unmount();
  });

  it('offers nothing to expand while there are three or fewer', async () => {
    const r = render(surface({ sessionMetronome: true }));
    await r.pressStartingWith('Test');
    await r.run('Clean');
    expect(r.text()).not.toContain('Show all');
    r.unmount();
  });
});


describe('the drill button is pinned under the header', () => {
  it('sits beside the session clock, outside the scrolling body, and reads End Drill while a drill runs', async () => {
    // SILAS, 14 SEP 2026: Start A Practice Drill is never below the fold.
    const r = render(surface({
      hasStyle: true,
      countsUp: false,
      rateOptions: [{ per: 1, label: 'One Shape Per Beat' }],
      targetRate: 0,
    }));
    await r.pressStartingWith('Practice');
    await r.press('Blocked');
    const strip = () => document.body.querySelector('[data-testid="modal-pinned"]');
    expect(strip()).not.toBeNull();
    const inStrip = () => [...strip()!.querySelectorAll('button')].map(b => (b.textContent ?? '').trim());
    expect(inStrip()).toContain('Start A Practice Drill');
    expect(strip()!.textContent).toContain('Practice Session');
    expect(strip()!.textContent).toContain('No drills yet, the clock is still counting.');
    await r.pressStartingWith('Start A Practice Drill');
    expect(inStrip()).toContain('End Drill');
    expect(strip()!.textContent).toContain('Drill 1 running');
    r.unmount();
  });
});
