// @vitest-environment jsdom
/**
 * Coming back to a paused session.
 *
 * =====================================================================
 * THE TWO-HOUR RULE CHANGES THE SHAPE, AND THAT IS THE POINT.
 *
 * Resuming after two hours starts a new sitting BY DEFINITION. So a
 * Resume button past the window would not resume anything — it would
 * start something new wearing the word "resume". Greying it out would
 * be the same lie with the volume turned down.
 *
 * So the option is ABSENT past two hours, and these pin its absence as
 * hard as its presence: a later tidy-up that "restores the missing
 * button" would be reintroducing the untruth.
 * =====================================================================
 */
import { describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import PausedSessionPrompt, {
  RESUME_WINDOW_MS,
  type PausedSession,
} from '../PausedSessionPrompt';

const NOW = 1_700_000_000_000;

function render(session: Partial<PausedSession>, age: number, handlers = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const props = {
    session: {
      kind: 'practice' as const, pausedAt: NOW - age, seconds: 760,
      ...session,
    },
    now: NOW,
    onResume: () => {}, onLogAndClose: () => {}, onDiscard: () => {},
    ...handlers,
  };
  act(() => { root.render(<PausedSessionPrompt {...props} />); });
  return {
    text: () => (host.textContent ?? '').replace(/\s+/g, ' ').trim(),
    labels: () => [...host.querySelectorAll('button')]
      .map(b => (b.textContent ?? '').replace(/\s+/g, ' ').trim()),
    click: (label: string) => {
      const b = [...host.querySelectorAll('button')]
        .find(x => (x.textContent ?? '').replace(/\s+/g, ' ').trim() === label);
      if (!b) throw new Error(`no button "${label}"`);
      act(() => { b.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    },
    unmount: () => { act(() => { root.unmount(); }); host.remove(); },
  };
}

const MINUTES = 60_000;

describe('paused inside the window', () => {
  it('says how long ago, and what is on the clock', () => {
    const r = render({}, 40 * MINUTES);
    expect(r.text()).toContain('You paused this practice session 40 minutes ago.');
    expect(r.text()).toContain('12:40 on the clock.');
    r.unmount();
  });

  it('offers all three', () => {
    expect(render({}, 40 * MINUTES).labels()).toEqual([
      'Resume This Practice Session', 'Log It And Close', 'Discard It',
    ]);
  });

  it('names which kind of session — a test is not a practice', () => {
    const r = render({ kind: 'testing' }, 40 * MINUTES);
    expect(r.text()).toContain('You paused this testing session');
    expect(r.labels()).toContain('Resume This Testing Session');
    r.unmount();
  });

  it('each button reports', () => {
    const onResume = vi.fn();
    const onLogAndClose = vi.fn();
    const onDiscard = vi.fn();
    const r = render({}, 40 * MINUTES, { onResume, onLogAndClose, onDiscard });
    r.click('Resume This Practice Session');
    r.click('Log It And Close');
    r.click('Discard It');
    expect(onResume).toHaveBeenCalledTimes(1);
    expect(onLogAndClose).toHaveBeenCalledTimes(1);
    expect(onDiscard).toHaveBeenCalledTimes(1);
    r.unmount();
  });

  it('reads in hours once it has been a while', () => {
    expect(render({}, 90 * MINUTES).text()).toContain('1 hour ago');
  });
});

describe('paused past the window', () => {
  it('DROPS RESUME ENTIRELY — it does not grey it', () => {
    const l = render({}, RESUME_WINDOW_MS + MINUTES).labels();
    expect(l).toEqual(['Log It And Close', 'Discard It']);
    expect(l.some(x => x.startsWith('Resume'))).toBe(false);
  });

  it('says why, where the option would have been', () => {
    // An absent button with no explanation reads as a missing feature
    // rather than a rule.
    expect(render({}, RESUME_WINDOW_MS + MINUTES).text()).toContain(
      'Too long ago to pick up — anything from here starts a new session. '
      + 'The minutes are still yours.',
    );
  });

  it('names the day rather than a duration', () => {
    const r = render({}, RESUME_WINDOW_MS + MINUTES);
    expect(r.text()).toMatch(/You paused this practice session on \w+day\./);
    // Not "ago" in general — "Too long ago to pick up" uses the word.
    // The HEADLINE must not carry a duration.
    expect(r.text()).not.toMatch(/session \d+ (minute|hour)s? ago/);
    r.unmount();
  });

  it('the minutes are still shown — they were earned', () => {
    expect(render({}, RESUME_WINDOW_MS + MINUTES).text()).toContain('12:40 on the clock.');
  });

  it('the boundary is two hours, and it is exclusive', () => {
    // A session paused at exactly two hours is past the window: the
    // rule is "within two hours", not "up to and including".
    expect(render({}, RESUME_WINDOW_MS - 1).labels().some(l => l.startsWith('Resume'))).toBe(true);
    expect(render({}, RESUME_WINDOW_MS).labels().some(l => l.startsWith('Resume'))).toBe(false);
  });
});

describe('what it never offers', () => {
  it('has no "Log It And Start A New Session"', () => {
    // Ruled out: logging and then starting one is two taps already
    // available, and a button that is two other buttons is a way for
    // them to disagree.
    for (const age of [40 * MINUTES, RESUME_WINDOW_MS + MINUTES]) {
      expect(render({}, age).text()).not.toContain('Start A New Session');
    }
  });

  it('closes nothing by itself — every path is a button', () => {
    // Nothing about a paused session resolves quietly. The minutes are
    // real and were earned.
    expect(render({}, 40 * MINUTES).labels().length).toBeGreaterThan(0);
  });
});
