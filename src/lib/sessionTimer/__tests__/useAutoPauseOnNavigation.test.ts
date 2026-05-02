/**
 * Phase 3 Step 1b — Auto-pause-on-navigation decision-logic tests.
 *
 * The hook itself is a thin wrapper around `decideAutoPauseAction`
 * + dispatching pauseSession / resumeSession. The pure decision
 * function is tested here exhaustively. Wiring is verified by
 * exercising the app.
 */
import { describe, it, expect } from 'vitest';
import {
  decideAutoPauseAction,
  isOnActiveModule,
  pathnameToModuleRef,
} from '../useAutoPauseOnNavigation';
import { INITIAL_SESSION_STATE, sessionTimerReducer } from '../reducer';
import type { SessionState } from '../types';

const T0 = 1_700_000_000_000;

function runningSession(activeModuleRef = 'shapes-and-patterns'): SessionState {
  return sessionTimerReducer(INITIAL_SESSION_STATE, {
    type: 'start',
    input: {
      origin: 'shapes-drill',
      activeModuleRef,
      blocks: [
        { moduleRef: activeModuleRef, plannedSeconds: 600, label: 'Drill' },
      ],
      sessionId: 'sess-1',
      now: T0,
    },
    blockIds: ['b1'],
  });
}

describe('pathnameToModuleRef', () => {
  it('returns null for the root and empty paths', () => {
    expect(pathnameToModuleRef('/')).toBeNull();
    expect(pathnameToModuleRef('')).toBeNull();
  });

  it('returns the first non-empty segment', () => {
    expect(pathnameToModuleRef('/shapes-and-patterns')).toBe('shapes-and-patterns');
    expect(pathnameToModuleRef('/shapes-and-patterns/calendar')).toBe('shapes-and-patterns');
    expect(pathnameToModuleRef('/ear-training/intervals/calendar')).toBe('ear-training');
  });

  it('handles a leading slash absent', () => {
    expect(pathnameToModuleRef('shapes-and-patterns')).toBe('shapes-and-patterns');
  });
});

describe('isOnActiveModule', () => {
  it('matches first segment exactly', () => {
    expect(isOnActiveModule('/shapes-and-patterns', 'shapes-and-patterns')).toBe(true);
    expect(isOnActiveModule('/shapes-and-patterns/calendar', 'shapes-and-patterns')).toBe(true);
  });

  it('rejects different first segments', () => {
    expect(isOnActiveModule('/goals', 'shapes-and-patterns')).toBe(false);
    expect(isOnActiveModule('/ear-training/intervals', 'shapes-and-patterns')).toBe(false);
  });

  it('does not partial-match across segments', () => {
    // Hypothetical defensive case — first-segment must equal exactly.
    expect(isOnActiveModule('/shapes', 'shapes-and-patterns')).toBe(false);
  });

  it('matches a sub-module ref against its full nested route', () => {
    // 'intervals' is registered with route '/ear-training/intervals'.
    // Naive first-segment comparison would yield 'ear-training' !==
    // 'intervals' and falsely report off-module — so the auto-pause
    // hook would re-pause every time the user lands on the sub-module.
    expect(isOnActiveModule('/ear-training/intervals', 'intervals')).toBe(true);
    expect(isOnActiveModule('/ear-training/intervals/anything', 'intervals')).toBe(true);
  });

  it('rejects sibling sub-module routes', () => {
    expect(isOnActiveModule('/ear-training/chord-recognition', 'intervals')).toBe(false);
    expect(isOnActiveModule('/ear-training', 'intervals')).toBe(false);
  });

  it('still treats a top-level module sub-route as on-module', () => {
    expect(isOnActiveModule('/ear-training/intervals', 'ear-training')).toBe(true);
    expect(isOnActiveModule('/ear-training', 'ear-training')).toBe(true);
  });

  it('falls back to first-segment match for refs not in the module registry', () => {
    expect(isOnActiveModule('/unregistered-module', 'unregistered-module')).toBe(true);
    expect(isOnActiveModule('/elsewhere', 'unregistered-module')).toBe(false);
  });
});

describe('decideAutoPauseAction', () => {
  it('returns noop while idle', () => {
    expect(decideAutoPauseAction(INITIAL_SESSION_STATE, '/anywhere')).toBe('noop');
  });

  it('returns noop after end', () => {
    const ended = sessionTimerReducer(runningSession(), {
      type: 'end-session',
      now: T0 + 1000,
    });
    expect(decideAutoPauseAction(ended, '/goals')).toBe('noop');
  });

  it('returns noop when activeModuleRef is null even if status is running', () => {
    const detached: SessionState = { ...runningSession(), activeModuleRef: null };
    expect(decideAutoPauseAction(detached, '/goals')).toBe('noop');
  });

  it('returns pause when running and pathname is off-module', () => {
    expect(decideAutoPauseAction(runningSession(), '/goals')).toBe('pause');
  });

  it('returns noop when running and pathname matches active module', () => {
    expect(decideAutoPauseAction(runningSession(), '/shapes-and-patterns')).toBe('noop');
  });

  it('returns noop on a child route under the active module', () => {
    expect(
      decideAutoPauseAction(runningSession(), '/shapes-and-patterns/calendar'),
    ).toBe('noop');
  });

  it('returns resume when paused via auto-navigation and back on active module', () => {
    let s = runningSession();
    s = sessionTimerReducer(s, {
      type: 'pause',
      now: T0 + 5_000,
      reason: 'auto-navigation',
    });
    expect(decideAutoPauseAction(s, '/shapes-and-patterns')).toBe('resume');
  });

  it('returns noop when paused via auto-navigation but still off-module', () => {
    let s = runningSession();
    s = sessionTimerReducer(s, {
      type: 'pause',
      now: T0 + 5_000,
      reason: 'auto-navigation',
    });
    expect(decideAutoPauseAction(s, '/goals')).toBe('noop');
  });

  it('returns noop when paused manually even if back on active module', () => {
    let s = runningSession();
    s = sessionTimerReducer(s, {
      type: 'pause',
      now: T0 + 5_000,
      reason: 'manual',
    });
    expect(decideAutoPauseAction(s, '/shapes-and-patterns')).toBe('noop');
  });

  it('does not flip to pause again while already paused, even off-module', () => {
    let s = runningSession();
    s = sessionTimerReducer(s, {
      type: 'pause',
      now: T0 + 5_000,
      reason: 'auto-navigation',
    });
    expect(decideAutoPauseAction(s, '/goals')).toBe('noop');
  });
});
