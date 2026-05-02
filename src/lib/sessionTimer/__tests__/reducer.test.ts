/**
 * Phase 3 Step 1a — Reducer + getTimes contract tests.
 *
 * Pure logic; no Dexie, no React, deterministic clock via the `now`
 * field on actions and the `now` argument to getTimes.
 */
import { describe, it, expect } from 'vitest';
import {
  INITIAL_SESSION_STATE,
  getTimes,
  sessionTimerReducer,
} from '../reducer';
import type { SessionState, SessionTimerAction } from '../types';

const T0 = 1_700_000_000_000;
const SECOND = 1000;
const MINUTE = 60 * SECOND;

function startState({
  now = T0,
  blockCount = 2,
  plannedSeconds = 600,
}: { now?: number; blockCount?: number; plannedSeconds?: number } = {}): SessionState {
  const blocks = Array.from({ length: blockCount }, (_, i) => ({
    moduleRef: i === 0 ? 'shapes-and-patterns' : 'ear-training',
    plannedSeconds,
    label: `Block ${i + 1}`,
  }));
  const blockIds = blocks.map((_, i) => `b${i + 1}`);
  return sessionTimerReducer(INITIAL_SESSION_STATE, {
    type: 'start',
    input: {
      origin: 'practice-sessions',
      activeModuleRef: 'practice-sessions',
      blocks,
      sessionId: 'sess-1',
      now,
    },
    blockIds,
  });
}

describe('sessionTimerReducer — initial state', () => {
  it('starts idle with empty blocks', () => {
    expect(INITIAL_SESSION_STATE.status).toBe('idle');
    expect(INITIAL_SESSION_STATE.blocks).toEqual([]);
    expect(INITIAL_SESSION_STATE.currentBlockIndex).toBeNull();
  });
});

describe('sessionTimerReducer — start', () => {
  it('transitions idle → running with the first block running and the rest pending', () => {
    const s = startState({ blockCount: 3 });
    expect(s.status).toBe('running');
    expect(s.sessionId).toBe('sess-1');
    expect(s.startedAt).toBe(T0);
    expect(s.currentBlockIndex).toBe(0);
    expect(s.blocks.map(b => b.status)).toEqual(['running', 'pending', 'pending']);
    expect(s.blocks[0].startedAt).toBe(T0);
    expect(s.blocks[1].startedAt).toBeNull();
    expect(s.activeModuleRef).toBe('practice-sessions');
  });

  it('refuses to start when a session is already running', () => {
    const running = startState();
    const same = sessionTimerReducer(running, {
      type: 'start',
      input: {
        origin: 'shapes-drill',
        activeModuleRef: 'shapes-and-patterns',
        blocks: [{ moduleRef: 'shapes-and-patterns', plannedSeconds: 60 }],
        sessionId: 'sess-2',
        now: T0 + MINUTE,
      },
      blockIds: ['x'],
    });
    expect(same).toBe(running);
  });

  it('rejects empty block list', () => {
    const same = sessionTimerReducer(INITIAL_SESSION_STATE, {
      type: 'start',
      input: {
        origin: 'practice-sessions',
        activeModuleRef: 'practice-sessions',
        blocks: [],
        sessionId: 'sess-x',
        now: T0,
      },
      blockIds: [],
    });
    expect(same).toBe(INITIAL_SESSION_STATE);
  });
});

describe('sessionTimerReducer — pause / resume', () => {
  it('pause stores pausedAt + reason and flips to paused', () => {
    const s = startState();
    const paused = sessionTimerReducer(s, { type: 'pause', now: T0 + 30 * SECOND, reason: 'manual' });
    expect(paused.status).toBe('paused');
    expect(paused.pausedAt).toBe(T0 + 30 * SECOND);
    expect(paused.pauseReason).toBe('manual');
  });

  it('pause carries the auto-navigation reason through unchanged', () => {
    const s = startState();
    const paused = sessionTimerReducer(s, {
      type: 'pause',
      now: T0 + 5 * SECOND,
      reason: 'auto-navigation',
    });
    expect(paused.pauseReason).toBe('auto-navigation');
  });

  it('pause is a no-op while not running', () => {
    const s = startState();
    const paused1 = sessionTimerReducer(s, { type: 'pause', now: T0 + 5 * SECOND, reason: 'manual' });
    const paused2 = sessionTimerReducer(paused1, { type: 'pause', now: T0 + 10 * SECOND, reason: 'manual' });
    expect(paused2).toBe(paused1);
  });

  it('resume bumps current block pausedMs and clears pausedAt + pauseReason', () => {
    const s = startState();
    const paused = sessionTimerReducer(s, { type: 'pause', now: T0 + 10 * SECOND, reason: 'auto-navigation' });
    const resumed = sessionTimerReducer(paused, {
      type: 'resume',
      now: T0 + 25 * SECOND,
    });
    expect(resumed.status).toBe('running');
    expect(resumed.pausedAt).toBeNull();
    expect(resumed.pauseReason).toBeNull();
    expect(resumed.blocks[0].pausedMs).toBe(15 * SECOND);
  });

  it('resume is a no-op when not paused', () => {
    const s = startState();
    const same = sessionTimerReducer(s, { type: 'resume', now: T0 + SECOND });
    expect(same).toBe(s);
  });
});

describe('sessionTimerReducer — advance-block', () => {
  it('finalizes current block, starts next, transitions stay running', () => {
    const s = startState({ blockCount: 2 });
    const advanced = sessionTimerReducer(s, {
      type: 'advance-block',
      now: T0 + 5 * MINUTE,
      rating: 'cruising',
      nextBlockId: 'b2-new',
    });
    expect(advanced.status).toBe('running');
    expect(advanced.currentBlockIndex).toBe(1);
    expect(advanced.blocks[0].status).toBe('completed');
    expect(advanced.blocks[0].endedAt).toBe(T0 + 5 * MINUTE);
    expect(advanced.blocks[0].activeMs).toBe(5 * MINUTE);
    expect(advanced.blocks[0].rating).toBe('cruising');
    expect(advanced.blocks[1].status).toBe('running');
    expect(advanced.blocks[1].startedAt).toBe(T0 + 5 * MINUTE);
  });

  it('finalizes pause segment before finalizing current block', () => {
    const s = startState();
    // Pause at T0+1m, advance at T0+3m → pause segment of 2m carried into block 0 pausedMs.
    const paused = sessionTimerReducer(s, { type: 'pause', now: T0 + 1 * MINUTE, reason: 'manual' });
    const advanced = sessionTimerReducer(paused, {
      type: 'advance-block',
      now: T0 + 3 * MINUTE,
    });
    expect(advanced.blocks[0].pausedMs).toBe(2 * MINUTE);
    // Active = wall(3m) - paused(2m) = 1m
    expect(advanced.blocks[0].activeMs).toBe(1 * MINUTE);
    expect(advanced.status).toBe('running');
    expect(advanced.pausedAt).toBeNull();
  });

  it('auto-ends the session on advancing the last block', () => {
    const s = startState({ blockCount: 1 });
    const advanced = sessionTimerReducer(s, {
      type: 'advance-block',
      now: T0 + 10 * MINUTE,
    });
    expect(advanced.status).toBe('ended');
    expect(advanced.endedAt).toBe(T0 + 10 * MINUTE);
    expect(advanced.blocks[0].status).toBe('completed');
  });

  it('respects markStatus = skipped', () => {
    const s = startState({ blockCount: 2 });
    const advanced = sessionTimerReducer(s, {
      type: 'advance-block',
      now: T0 + 1 * MINUTE,
      markStatus: 'skipped',
    });
    expect(advanced.blocks[0].status).toBe('skipped');
  });
});

describe('sessionTimerReducer — end-session', () => {
  it('from running, finalizes current block and transitions to ended', () => {
    const s = startState({ blockCount: 2 });
    const ended = sessionTimerReducer(s, {
      type: 'end-session',
      now: T0 + 7 * MINUTE,
      rating: 'flying',
    });
    expect(ended.status).toBe('ended');
    expect(ended.endedAt).toBe(T0 + 7 * MINUTE);
    expect(ended.blocks[0].status).toBe('completed');
    expect(ended.blocks[0].rating).toBe('flying');
    expect(ended.blocks[0].activeMs).toBe(7 * MINUTE);
    // Block 1 untouched — still pending.
    expect(ended.blocks[1].status).toBe('pending');
  });

  it('from paused, finalizes the in-progress pause and then ends', () => {
    const s = startState();
    const paused = sessionTimerReducer(s, { type: 'pause', now: T0 + 2 * MINUTE, reason: 'manual' });
    const ended = sessionTimerReducer(paused, {
      type: 'end-session',
      now: T0 + 5 * MINUTE,
    });
    expect(ended.status).toBe('ended');
    expect(ended.blocks[0].pausedMs).toBe(3 * MINUTE);
    expect(ended.blocks[0].activeMs).toBe(2 * MINUTE);
  });

  it('is a no-op when idle or already ended', () => {
    const idle = INITIAL_SESSION_STATE;
    expect(
      sessionTimerReducer(idle, { type: 'end-session', now: T0 }),
    ).toBe(idle);

    const ended = sessionTimerReducer(startState(), {
      type: 'end-session',
      now: T0 + 1 * MINUTE,
    });
    expect(
      sessionTimerReducer(ended, { type: 'end-session', now: T0 + 2 * MINUTE }),
    ).toBe(ended);
  });
});

describe('sessionTimerReducer — arm / clear-pending', () => {
  const armConfig = {
    origin: 'practice-sessions' as const,
    blocks: [
      { moduleRef: 'shapes-and-patterns', plannedSeconds: 600, label: 'Block 1' },
    ],
  };

  it('arm sets pendingStart while idle', () => {
    const armed = sessionTimerReducer(INITIAL_SESSION_STATE, {
      type: 'arm',
      config: armConfig,
    });
    expect(armed.pendingStart).toEqual(armConfig);
    expect(armed.status).toBe('idle');
  });

  it('arm refuses to set pendingStart while a session is running', () => {
    const running = startState();
    const same = sessionTimerReducer(running, { type: 'arm', config: armConfig });
    expect(same).toBe(running);
  });

  it('clear-pending nulls pendingStart', () => {
    const armed = sessionTimerReducer(INITIAL_SESSION_STATE, {
      type: 'arm',
      config: armConfig,
    });
    const cleared = sessionTimerReducer(armed, { type: 'clear-pending' });
    expect(cleared.pendingStart).toBeNull();
  });

  it('start consumes pendingStart in a single action', () => {
    const armed = sessionTimerReducer(INITIAL_SESSION_STATE, {
      type: 'arm',
      config: armConfig,
    });
    const started = sessionTimerReducer(armed, {
      type: 'start',
      input: {
        origin: 'practice-sessions',
        activeModuleRef: 'shapes-and-patterns',
        blocks: armConfig.blocks,
        sessionId: 'sess-1',
        now: T0,
      },
      blockIds: ['b1'],
    });
    expect(started.status).toBe('running');
    expect(started.pendingStart).toBeNull();
  });
});

describe('sessionTimerReducer — request-block-end / consume-block-end', () => {
  it('request-block-end pauses a running session with reason "manual"', () => {
    const running = startState();
    const requested = sessionTimerReducer(running, {
      type: 'request-block-end',
      now: T0 + 30 * SECOND,
    });
    expect(requested.blockEndRequested).toBe(true);
    expect(requested.status).toBe('paused');
    expect(requested.pauseReason).toBe('manual');
    expect(requested.pausedAt).toBe(T0 + 30 * SECOND);
  });

  it('request-block-end converts an auto-navigation pause to manual', () => {
    const running = startState();
    const autoPaused = sessionTimerReducer(running, {
      type: 'pause',
      now: T0 + 30 * SECOND,
      reason: 'auto-navigation',
    });
    expect(autoPaused.pauseReason).toBe('auto-navigation');
    const requested = sessionTimerReducer(autoPaused, {
      type: 'request-block-end',
      now: T0 + 60 * SECOND,
    });
    expect(requested.blockEndRequested).toBe(true);
    expect(requested.status).toBe('paused');
    expect(requested.pauseReason).toBe('manual');
    expect(requested.pausedAt).toBe(T0 + 30 * SECOND);
  });

  it('request-block-end on a manual pause leaves the pause untouched', () => {
    const running = startState();
    const manualPaused = sessionTimerReducer(running, {
      type: 'pause',
      now: T0 + 30 * SECOND,
      reason: 'manual',
    });
    const requested = sessionTimerReducer(manualPaused, {
      type: 'request-block-end',
      now: T0 + 60 * SECOND,
    });
    expect(requested.blockEndRequested).toBe(true);
    expect(requested.pauseReason).toBe('manual');
    expect(requested.pausedAt).toBe(T0 + 30 * SECOND);
  });

  it('request-block-end is a no-op when idle', () => {
    const same = sessionTimerReducer(INITIAL_SESSION_STATE, {
      type: 'request-block-end',
      now: T0,
    });
    expect(same).toBe(INITIAL_SESSION_STATE);
  });

  it('consume-block-end clears the flag', () => {
    const running = startState();
    const requested = sessionTimerReducer(running, {
      type: 'request-block-end',
      now: T0 + 30 * SECOND,
    });
    const consumed = sessionTimerReducer(requested, { type: 'consume-block-end' });
    expect(consumed.blockEndRequested).toBe(false);
  });

  it('advance-block clears the flag and unwinds the manual pause', () => {
    const running = startState({ blockCount: 2 });
    const requested = sessionTimerReducer(running, {
      type: 'request-block-end',
      now: T0 + 30 * SECOND,
    });
    expect(requested.blockEndRequested).toBe(true);
    expect(requested.status).toBe('paused');
    // Mirror handleRatingNext: explicit resume, then advance.
    const resumed = sessionTimerReducer(requested, {
      type: 'resume',
      now: T0 + 60 * SECOND,
    });
    expect(resumed.status).toBe('running');
    expect(resumed.pausedAt).toBeNull();
    expect(resumed.pauseReason).toBeNull();
    const advanced = sessionTimerReducer(resumed, {
      type: 'advance-block',
      now: T0 + 60 * SECOND,
    });
    expect(advanced.status).toBe('running');
    expect(advanced.blockEndRequested).toBe(false);
    expect(advanced.currentBlockIndex).toBe(1);
  });
});

describe('sessionTimerReducer — reset / set-active-module-ref', () => {
  it('reset returns to INITIAL_SESSION_STATE', () => {
    const s = startState();
    const reset = sessionTimerReducer(s, { type: 'reset' });
    expect(reset).toEqual(INITIAL_SESSION_STATE);
  });

  it('set-active-module-ref updates moduleRef without changing status', () => {
    const s = startState();
    const updated = sessionTimerReducer(s, {
      type: 'set-active-module-ref',
      moduleRef: 'ear-training',
    });
    expect(updated.activeModuleRef).toBe('ear-training');
    expect(updated.status).toBe('running');
    expect(updated.blocks).toBe(s.blocks);
  });
});

describe('getTimes', () => {
  it('returns zeros for idle state', () => {
    const t = getTimes(INITIAL_SESSION_STATE, T0);
    expect(t).toEqual({
      wallMs: 0,
      activeMs: 0,
      blockWallMs: 0,
      blockActiveMs: 0,
    });
  });

  it('with no pauses, wall and active are equal and grow with now', () => {
    const s = startState();
    const t = getTimes(s, T0 + 90 * SECOND);
    expect(t.wallMs).toBe(90 * SECOND);
    expect(t.activeMs).toBe(90 * SECOND);
    expect(t.blockWallMs).toBe(90 * SECOND);
    expect(t.blockActiveMs).toBe(90 * SECOND);
  });

  it('while paused, activeMs freezes but wallMs keeps growing', () => {
    const s = startState();
    const paused = sessionTimerReducer(s, { type: 'pause', now: T0 + 30 * SECOND, reason: 'manual' });
    const t = getTimes(paused, T0 + 90 * SECOND);
    expect(t.wallMs).toBe(90 * SECOND);
    expect(t.activeMs).toBe(30 * SECOND);
    expect(t.blockActiveMs).toBe(30 * SECOND);
    expect(t.blockWallMs).toBe(90 * SECOND);
  });

  it('after finalized pause, activeMs subtracts the segment', () => {
    const s = startState();
    const paused = sessionTimerReducer(s, { type: 'pause', now: T0 + 30 * SECOND, reason: 'manual' });
    const resumed = sessionTimerReducer(paused, {
      type: 'resume',
      now: T0 + 60 * SECOND,
    });
    const t = getTimes(resumed, T0 + 120 * SECOND);
    expect(t.wallMs).toBe(120 * SECOND);
    expect(t.activeMs).toBe(90 * SECOND);
  });

  it('after end, uses endedAt as the ceiling', () => {
    const s = startState();
    const ended = sessionTimerReducer(s, {
      type: 'end-session',
      now: T0 + 5 * MINUTE,
    });
    const t = getTimes(ended, T0 + 10 * MINUTE);
    expect(t.wallMs).toBe(5 * MINUTE);
    expect(t.activeMs).toBe(5 * MINUTE);
  });

  it('block times scope to the current block, ignoring earlier finalized blocks', () => {
    const s = startState({ blockCount: 2 });
    const advanced = sessionTimerReducer(s, {
      type: 'advance-block',
      now: T0 + 4 * MINUTE,
    });
    const t = getTimes(advanced, T0 + 7 * MINUTE);
    expect(t.wallMs).toBe(7 * MINUTE);
    expect(t.activeMs).toBe(7 * MINUTE);
    expect(t.blockWallMs).toBe(3 * MINUTE);
    expect(t.blockActiveMs).toBe(3 * MINUTE);
  });

  it('survives a multi-segment pause sequence', () => {
    let state = startState();
    // Pause 0–10s, run 10–30s, pause 30–50s, run 50–90s.
    const actions: SessionTimerAction[] = [
      { type: 'pause', now: T0 + 0 * SECOND, reason: 'manual' },
      { type: 'resume', now: T0 + 10 * SECOND },
      { type: 'pause', now: T0 + 30 * SECOND, reason: 'manual' },
      { type: 'resume', now: T0 + 50 * SECOND },
    ];
    for (const a of actions) state = sessionTimerReducer(state, a);
    const t = getTimes(state, T0 + 90 * SECOND);
    // wall 90s, paused 10s + 20s = 30s, active 60s.
    expect(t.wallMs).toBe(90 * SECOND);
    expect(t.activeMs).toBe(60 * SECOND);
    expect(state.blocks[0].pausedMs).toBe(30 * SECOND);
  });
});
