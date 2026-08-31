// @vitest-environment jsdom
/**
 * The strip, against the addendum.
 *
 * =====================================================================
 * THE NAMING RULE IS THE MOST TESTABLE THING IN THE COPY, AND THE
 * EASIEST TO LOSE.
 *
 * "Session" and "Run" are the obvious labels for a bar like this, they
 * fit better in the space, and the surrounding context always seems to
 * make the kind clear. It does not: the two modes sit one tap apart and
 * write different records, and a bar reading "Session 04:12" is the
 * same bar in both. So the bare words are asserted absent, not just the
 * correct ones asserted present.
 *
 * The FINISH RUN split is pinned from both sides. Its absence on a test
 * is the resolution of a contradiction between two documents — a test
 * run ends by rating it, because rating is what a test is made of — and
 * absence is exactly the kind of thing a later change restores while
 * being helpful.
 * =====================================================================
 */
import { describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import SessionStrip, { type SessionKind } from '../SessionStrip';

vi.mock('../../../../lib/userPrefs', () => ({
  getPref: async (_k: string, d: unknown) => d,
  setPref: async () => {},
}));

function render(over: Partial<React.ComponentProps<typeof SessionStrip>> = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const props: React.ComponentProps<typeof SessionStrip> = {
    kind: 'testing' as SessionKind,
    metronomeOn: false,
    blockReason: null,
    awaitingVerdict: false,
    onDiscardRun: () => {},
    onMetronomeStopped: () => {},
    discardedMessage: '',
    runLive: false,
    onEndRun: () => {},
    sessionSeconds: 1361,       // 22:41
    runSeconds: null,
    nextRunNumber: 1,
    paused: false,
    onPauseToggle: () => {},
    streak: 0,
    streakBroken: false,
    onRate: () => {},
    onStartRun: () => {},
    onFinishRun: null,
    onSave: () => {},
    onBack: () => {},
    ...over,
  };
  act(() => { root.render(<SessionStrip {...props} />); });
  return {
    host,
    text: () => (host.textContent ?? '').replace(/\s+/g, ' ').trim(),
    labels: () => [...host.querySelectorAll('button')]
      .map(b => (b.textContent ?? '').replace(/\s+/g, ' ').trim()),
    click: (label: string) => {
      const b = [...host.querySelectorAll('button')]
        .find(x => (x.textContent ?? '').replace(/\s+/g, ' ').trim() === label);
      if (!b) throw new Error(`no button "${label}"`);
      act(() => { b.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    },
    aria: () => [...host.querySelectorAll('[aria-label]')]
      .map(e => e.getAttribute('aria-label') ?? ''),
    unmount: () => { act(() => { root.unmount(); }); host.remove(); },
  };
}

describe('the app never says Session or Run on its own', () => {
  it('a testing session names both its clocks', () => {
    const r = render({ runSeconds: 90 });
    expect(r.text()).toContain('Testing Session');
    expect(r.text()).toContain('Test Run');
    r.unmount();
  });

  it('a practice session names both its clocks', () => {
    const r = render({ kind: 'practice', runSeconds: 90, streak: null });
    expect(r.text()).toContain('Practice Session');
    expect(r.text()).toContain('Practice Run');
    r.unmount();
  });

  it('NEITHER MODE SHOWS A BARE "Session" OR "Run" LABEL', () => {
    // The reversal: the labels are the obvious shorthand and fit
    // better. Every occurrence must be preceded by which kind.
    for (const kind of ['testing', 'practice'] as const) {
      const r = render({ kind, runSeconds: 90, streak: kind === 'testing' ? 1 : null });
      const t = r.text();
      for (const word of ['Session', 'Run']) {
        for (const m of t.matchAll(new RegExp(word, 'g'))) {
          const before = t.slice(0, m.index).trimEnd();
          expect(
            /(Testing|Practice|Test|Start A Practice|Finish|Save|Back To The)$/.test(before),
            `bare "${word}" in ${kind}: …${t.slice(Math.max(0, m.index - 30), m.index + 10)}…`,
          ).toBe(true);
        }
      }
      r.unmount();
    }
  });

  it('says "Testing", not "Test", for the session', () => {
    // It matches the rule sentence the rest of the app states.
    const r = render();
    expect(r.text()).not.toContain('Test Session');
    r.unmount();
  });

  it('the streak\'s aria text names run-throughs, not bare runs', () => {
    const r = render({ streak: 2 });
    expect(r.aria()).toContain('2 of 3 clean run-throughs in a row');
    r.unmount();
  });
});

describe('how a run ends differs by mode', () => {
  it('A TEST RUN HAS NO Finish Run — the chips are the finish', () => {
    // Rating is required on a test, so a Finish Run button would be a
    // way to end a test run without the rating the test is made of.
    const r = render({ runSeconds: 90, onFinishRun: null });
    expect(r.labels()).not.toContain('Finish Run');
    expect(r.labels()).toEqual(expect.arrayContaining(
      ['Struggled', 'Working on it', 'Clean', 'In flow'],
    ));
    r.unmount();
  });

  it('a practice run has Finish Run AND the chips', () => {
    // Rating is optional in practice, so there has to be a way to stop
    // a run without one — and still a way to rate it.
    const finish = vi.fn();
    const r = render({
      kind: 'practice', streak: null, runSeconds: 90, onFinishRun: finish,
    });
    expect(r.labels()).toContain('Finish Run');
    r.click('Finish Run');
    expect(finish).toHaveBeenCalledTimes(1);
    r.unmount();
  });

  it('rating a run reports the feel', () => {
    const onRate = vi.fn();
    const r = render({ runSeconds: 90, onRate });
    r.click('Clean');
    expect(onRate).toHaveBeenCalledWith(3);
    r.unmount();
  });

  it('the chips are absent when no run is in progress', () => {
    const r = render({ runSeconds: null });
    expect(r.labels()).not.toContain('Clean');
    r.unmount();
  });
});

describe('starting a run', () => {
  it('a test names which run is next', () => {
    expect(render({ nextRunNumber: 2 }).labels()).toContain('Start Test Run 2');
  });

  it('practice does not number them', () => {
    expect(render({ kind: 'practice', streak: null }).labels())
      .toContain('Start A Practice Run');
  });
});

describe('the two saves are different acts with different names', () => {
  it('a testing session saves runs', () => {
    expect(render().labels()).toContain('Save Runs');
  });

  it('a practice session logs a practice session', () => {
    expect(render({ kind: 'practice', streak: null }).labels())
      .toContain('Log Practice Session');
  });
});

describe('the streak', () => {
  it('is drawn for a test', () => {
    expect(render({ streak: 1 }).aria()).toContain('1 of 3 clean run-throughs in a row');
  });

  it('IS ABSENT ON PRACTICE — three empty slots would promise one', () => {
    const r = render({ kind: 'practice', streak: null });
    expect(r.aria().some(a => a.includes('of 3'))).toBe(false);
    r.unmount();
  });
});

describe('Pause', () => {
  it('offers Pause when running and Resume when paused', () => {
    expect(render({ paused: false }).labels()).toContain('Pause');
    expect(render({ paused: true }).labels()).toContain('Resume');
  });

  it('says the clock has stopped, in words', () => {
    // The tinted bar alone is a colour someone can miss.
    expect(render({ paused: true }).text())
      .toContain('Paused — the clock is stopped.');
  });

  it('a paused session cannot start a run', () => {
    // Scoped to this render's own host: other tests in this file leave
    // strips mounted, and a document-wide query would find one of
    // theirs and pass on a button that was never paused.
    const r = render({ paused: true });
    const btn = [...r.host.querySelectorAll('button')]
      .find(b => (b.textContent ?? '').startsWith('Start Test Run'));
    expect(btn).toBeDefined();
    expect(btn?.hasAttribute('disabled')).toBe(true);
    r.unmount();
  });

  it('DOES NOT offer the three reopening choices', () => {
    // Resume / bank the time / discard belong to the Pause build and
    // two of the three are unwritten. Pinned so this component cannot
    // grow a guess at them.
    const t = render({ paused: true }).text();
    expect(t).not.toMatch(/discard/i);
    expect(t).not.toMatch(/bank/i);
  });
});

describe('the way back', () => {
  it('is named, and it is the only one', () => {
    const back = vi.fn();
    const r = render({ onBack: back });
    r.click('Back To The Session');
    expect(back).toHaveBeenCalledTimes(1);
    r.unmount();
  });
});

describe('the metronome names its own state', () => {
  it('says Active when it is sounding', () => {
    // The word travels with the state: in the strip there is no
    // heading above the metronome, so a lit dot would be a colour with
    // no noun attached.
    expect(render({ metronomeOn: true }).text()).toContain('Metronome Active');
  });

  it('says Silent when it is not', () => {
    expect(render({ metronomeOn: false }).text()).toContain('Metronome Silent');
  });
});

describe('why a test run cannot start', () => {
  it('is said ABOVE the button, not hidden on it', () => {
    // A disabled control with its reason behind a hover is a dead end
    // on a touch screen, and this is the one place someone is stuck.
    const r = render({ blockReason: 'Start the metronome to begin a test run.' });
    expect(r.text()).toContain('Start the metronome to begin a test run.');
    r.unmount();
  });

  it('disables the button while it stands', () => {
    const r = render({ blockReason: 'Start the metronome to begin a test run.' });
    const btn = [...r.host.querySelectorAll('button')]
      .find(b => (b.textContent ?? '').startsWith('Start Test Run'));
    expect(btn?.hasAttribute('disabled')).toBe(true);
    r.unmount();
  });

  it('goes away once a run is under way', () => {
    // It is a reason a run cannot START. Leaving it on screen during
    // the run it permitted would contradict the run.
    const r = render({ blockReason: 'Start the metronome to begin a test run.', runSeconds: 30 });
    expect(r.text()).not.toContain('Start the metronome to begin');
    r.unmount();
  });
});

describe('the metronome stopping mid-run asks rather than discarding', () => {
  it('asks whether the run was finished, in full', () => {
    // Only the player knows whether he had already got to the end, and
    // the rating system already takes his word for Clean versus
    // Struggled. This is the same order of trust.
    expect(render({ awaitingVerdict: true }).text()).toContain(
      'Did you finish that run? The metronome stopped, so the run stopped '
      + 'with it. Rate it if you got to the end. If you did not, discarding '
      + 'it costs you the run — your streak is untouched.',
    );
  });

  it('offers the discard, and it reports', () => {
    const discard = vi.fn();
    const r = render({ awaitingVerdict: true, onDiscardRun: discard });
    r.click('I didn’t finish it — discard this run');
    expect(discard).toHaveBeenCalledTimes(1);
    r.unmount();
  });

  it('THE RATING CHIPS ARE STILL THERE — they are the other answer', () => {
    // "Rate it if you got to the end." A prompt offering only the
    // discard would make the question rhetorical.
    const r = render({ awaitingVerdict: true, runSeconds: 30 });
    expect(r.labels()).toEqual(expect.arrayContaining(['Clean', 'In flow']));
    r.unmount();
  });
});

describe('what was discarded is named', () => {
  it('says the RUN, never the session', () => {
    // The session was paused, not discarded — its minutes are kept.
    const msg = 'Test Run 2 was discarded. Start it again when you’re back.';
    const r = render({ discardedMessage: msg });
    expect(r.text()).toContain(msg);
    r.unmount();
  });

  it('is not shown while the question is still open', () => {
    // Two messages about the same run, one saying it is gone and one
    // asking what to do with it.
    const r = render({ discardedMessage: 'Test Run 2 was discarded.', awaitingVerdict: true });
    expect(r.text()).not.toContain('was discarded');
    r.unmount();
  });
});

describe('the streak reset is visible', () => {
  it('says why the count went back, and that nothing was lost', () => {
    // The run number keeps climbing while the streak returns to zero.
    // Without the sentence the two readings look like a contradiction.
    expect(render({ streakBroken: true, streak: 0 }).text()).toContain(
      'That run was below Clean, so the streak starts over — back to 0 of 3. '
      + 'The runs before it are still logged.',
    );
  });

  it('THE CIRCLES ARE DRAWN ANYWAY, with the count beside them', () => {
    // They are drawn always during a test, never only once a run is
    // banked. Circles that vanish on a reset take the count away at
    // exactly the moment it matters most.
    const r = render({ streak: 0, streakBroken: true });
    expect(r.aria()).toContain('0 of 3 clean run-throughs in a row');
    expect(r.text()).toContain('0 of 3');
    r.unmount();
  });

  it('and at zero before any run, too', () => {
    const r = render({ streak: 0, streakBroken: false });
    expect(r.text()).toContain('0 of 3');
    r.unmount();
  });
});
