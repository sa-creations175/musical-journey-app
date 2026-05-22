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

  it('threads isWarmup + isKeyboardRequired from input blocks onto SessionBlock', () => {
    // ActiveSessionScreen reads currentBlock.isWarmup to suppress
    // the per-block skip affordance. Pin that the reducer doesn't
    // drop the flag when constructing SessionBlock — both flags
    // were dropped by an earlier version of startSession.
    const s = sessionTimerReducer(INITIAL_SESSION_STATE, {
      type: 'start',
      input: {
        origin: 'practice-sessions',
        activeModuleRef: 'practice-sessions',
        blocks: [
          {
            moduleRef: 'repertoire',
            plannedSeconds: 90,
            label: 'Chord quiz',
            isWarmup: true,
            isKeyboardRequired: true,
          },
          {
            moduleRef: 'ear-training',
            plannedSeconds: 600,
            label: 'ET',
            isWarmup: false,
            isKeyboardRequired: false,
          },
        ],
        sessionId: 'sess-warmup',
        now: T0,
      },
      blockIds: ['b1', 'b2'],
    });
    expect(s.blocks.map(b => b.isWarmup)).toEqual([true, false]);
    expect(s.blocks.map(b => b.isKeyboardRequired)).toEqual([true, false]);
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
      blockPhase: null,
      drillElapsedMs: 0,
      drillRemainingMs: 0,
      blockPhaseActiveMs: 0,
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

describe('sessionTimerReducer — block phases + drill timer', () => {
  it('starts the first block in the drill phase (legacy no-prep flow)', () => {
    const s = startState({ plannedSeconds: 600 });
    expect(s.blocks[0].phase).toBe('drill');
    expect(s.blocks[0].phaseStartedAt).toBe(T0);
    expect(s.blocks[0].adjustedDrillSeconds).toBe(600);
    expect(s.blocks[0].prepMs).toBe(0);
    expect(s.blocks[0].drillMs).toBe(0);
    expect(s.blocks[0].ratingMs).toBe(0);
  });

  it('legacy drill phase: timer counts down from planned, elapsed counts up', () => {
    const s = startState({ plannedSeconds: 120 });
    const t = getTimes(s, T0 + 30 * SECOND);
    expect(t.blockPhase).toBe('drill');
    expect(t.drillElapsedMs).toBe(30 * SECOND);
    expect(t.drillRemainingMs).toBe(90 * SECOND);
    expect(t.blockPhaseActiveMs).toBe(30 * SECOND);
  });

  it('drill timer clamps to 0 once over the planned duration', () => {
    const s = startState({ plannedSeconds: 60 });
    const t = getTimes(s, T0 + 90 * SECOND);
    expect(t.drillRemainingMs).toBe(0);
    expect(t.drillElapsedMs).toBe(90 * SECOND);
  });

  it('walks prep → drill → rating, accruing per-phase active time', () => {
    let s = startState({ plannedSeconds: 300 });
    s = sessionTimerReducer(s, { type: 'begin-prep', now: T0 });
    expect(s.blocks[0].phase).toBe('prep');

    // 20s of prep.
    s = sessionTimerReducer(s, { type: 'start-drill', now: T0 + 20 * SECOND });
    expect(s.blocks[0].phase).toBe('drill');
    expect(s.blocks[0].prepMs).toBe(20 * SECOND);
    expect(s.blocks[0].phaseStartedAt).toBe(T0 + 20 * SECOND);

    // 5 min of drill.
    s = sessionTimerReducer(s, {
      type: 'complete-drill',
      now: T0 + 20 * SECOND + 5 * MINUTE,
    });
    expect(s.blocks[0].phase).toBe('rating');
    expect(s.blocks[0].drillMs).toBe(5 * MINUTE);

    // 10s of rating, then end.
    const ended = sessionTimerReducer(s, {
      type: 'end-session',
      now: T0 + 30 * SECOND + 5 * MINUTE,
    });
    expect(ended.blocks[0].prepMs).toBe(20 * SECOND);
    expect(ended.blocks[0].drillMs).toBe(5 * MINUTE);
    expect(ended.blocks[0].ratingMs).toBe(10 * SECOND);
    expect(ended.blocks[0].phaseStartedAt).toBeNull();
  });

  it('in prep, drillRemaining previews the full duration and elapsed is 0', () => {
    let s = startState({ plannedSeconds: 120 });
    s = sessionTimerReducer(s, { type: 'begin-prep', now: T0 });
    const t = getTimes(s, T0 + 15 * SECOND);
    expect(t.blockPhase).toBe('prep');
    expect(t.drillElapsedMs).toBe(0);
    expect(t.drillRemainingMs).toBe(120 * SECOND);
    expect(t.blockPhaseActiveMs).toBe(15 * SECOND);
  });

  it('adjust-drill-time changes the drill timer duration', () => {
    let s = startState({ plannedSeconds: 120 });
    s = sessionTimerReducer(s, { type: 'begin-prep', now: T0 });
    s = sessionTimerReducer(s, { type: 'adjust-drill-time', deltaSeconds: 60 });
    expect(s.blocks[0].adjustedDrillSeconds).toBe(180);
    s = sessionTimerReducer(s, { type: 'start-drill', now: T0 + 10 * SECOND });
    const t = getTimes(s, T0 + 10 * SECOND + 30 * SECOND);
    expect(t.drillRemainingMs).toBe(150 * SECOND);
  });

  it('adjust-drill-time clamps to [30s, planned * 2]', () => {
    let s = startState({ plannedSeconds: 120 });
    s = sessionTimerReducer(s, { type: 'adjust-drill-time', deltaSeconds: -1000 });
    expect(s.blocks[0].adjustedDrillSeconds).toBe(30);
    s = sessionTimerReducer(s, { type: 'adjust-drill-time', deltaSeconds: 1000 });
    expect(s.blocks[0].adjustedDrillSeconds).toBe(240);
  });

  it('excludes paused time from the current phase accrual', () => {
    let s = startState({ plannedSeconds: 300 });
    s = sessionTimerReducer(s, { type: 'begin-prep', now: T0 });
    // prep 0–10s, pause 10–40s, resume, then leave prep at 50s.
    s = sessionTimerReducer(s, { type: 'pause', now: T0 + 10 * SECOND, reason: 'manual' });
    s = sessionTimerReducer(s, { type: 'resume', now: T0 + 40 * SECOND });
    s = sessionTimerReducer(s, { type: 'start-drill', now: T0 + 50 * SECOND });
    // Wall in prep 50s, paused 30s → 20s active prep.
    expect(s.blocks[0].prepMs).toBe(20 * SECOND);
  });

  it('accumulates a second drill segment (rating-screen extend path)', () => {
    let s = startState({ plannedSeconds: 300 });
    // First drill T0 .. +2m.
    s = sessionTimerReducer(s, { type: 'complete-drill', now: T0 + 2 * MINUTE });
    expect(s.blocks[0].drillMs).toBe(2 * MINUTE);
    // Rating 30s, then re-enter drill (extend).
    s = sessionTimerReducer(s, {
      type: 'start-drill',
      now: T0 + 2 * MINUTE + 30 * SECOND,
    });
    expect(s.blocks[0].ratingMs).toBe(30 * SECOND);
    // Second drill 1m.
    s = sessionTimerReducer(s, {
      type: 'complete-drill',
      now: T0 + 3 * MINUTE + 30 * SECOND,
    });
    expect(s.blocks[0].drillMs).toBe(3 * MINUTE);
  });

  it('freezes the drill timer while the session is paused', () => {
    const s = startState({ plannedSeconds: 600 });
    const paused = sessionTimerReducer(s, {
      type: 'pause',
      now: T0 + 30 * SECOND,
      reason: 'manual',
    });
    // 60s of wall pass while paused; drill should hold at 30s elapsed.
    const t = getTimes(paused, T0 + 90 * SECOND);
    expect(t.drillElapsedMs).toBe(30 * SECOND);
    expect(t.drillRemainingMs).toBe(600 * SECOND - 30 * SECOND);
  });

  it('phase transitions are no-ops when the session is not running', () => {
    const s = startState();
    const paused = sessionTimerReducer(s, { type: 'pause', now: T0 + SECOND, reason: 'manual' });
    const same = sessionTimerReducer(paused, { type: 'start-drill', now: T0 + 2 * SECOND });
    expect(same).toBe(paused);
  });
});

describe('sessionTimerReducer — startInPrep + extend-drill', () => {
  function startInPrep({ blockCount = 1, plannedSeconds = 120 } = {}): SessionState {
    const blocks = Array.from({ length: blockCount }, (_, i) => ({
      moduleRef: 'shapes-and-patterns',
      plannedSeconds,
      label: `Block ${i + 1}`,
    }));
    return sessionTimerReducer(INITIAL_SESSION_STATE, {
      type: 'start',
      input: {
        origin: 'practice-sessions',
        activeModuleRef: 'practice-sessions',
        startInPrep: true,
        blocks,
        sessionId: 'sess-p',
        now: T0,
      },
      blockIds: blocks.map((_, i) => `b${i + 1}`),
    });
  }

  it('opens the first block in prep when startInPrep is set', () => {
    const s = startInPrep({ plannedSeconds: 120 });
    expect(s.startInPrep).toBe(true);
    expect(s.blocks[0].phase).toBe('prep');
    expect(s.blocks[0].drillSegmentSeconds).toBe(120);
    // In prep the drill timer previews the full duration, frozen.
    const t = getTimes(s, T0 + 20 * SECOND);
    expect(t.blockPhase).toBe('prep');
    expect(t.drillRemainingMs).toBe(120 * SECOND);
    expect(t.drillElapsedMs).toBe(0);
  });

  it('opens each advanced-into block in prep too', () => {
    let s = startInPrep({ blockCount: 2 });
    s = sessionTimerReducer(s, { type: 'start-drill', now: T0 });
    s = sessionTimerReducer(s, { type: 'advance-block', now: T0 + 1 * MINUTE });
    expect(s.currentBlockIndex).toBe(1);
    expect(s.blocks[1].phase).toBe('prep');
  });

  it('legacy origins still start blocks in drill (startInPrep defaults false)', () => {
    const s = startState(); // no startInPrep
    expect(s.startInPrep).toBe(false);
    expect(s.blocks[0].phase).toBe('drill');
  });

  it('extend-drill re-enters drill with a fresh segment target', () => {
    let s = startInPrep({ plannedSeconds: 120 });
    s = sessionTimerReducer(s, { type: 'start-drill', now: T0 });
    s = sessionTimerReducer(s, { type: 'complete-drill', now: T0 + 2 * MINUTE });
    expect(s.blocks[0].phase).toBe('rating');

    // Extend by 1 min → fresh 60s drill segment.
    s = sessionTimerReducer(s, {
      type: 'extend-drill',
      seconds: 60,
      now: T0 + 2 * MINUTE,
    });
    expect(s.blocks[0].phase).toBe('drill');
    expect(s.blocks[0].drillSegmentSeconds).toBe(60);
    const t = getTimes(s, T0 + 2 * MINUTE + 20 * SECOND);
    expect(t.drillRemainingMs).toBe(40 * SECOND);
  });

  it('extend-drill gives a fresh segment even after an overtime drill', () => {
    let s = startInPrep({ plannedSeconds: 60 });
    s = sessionTimerReducer(s, { type: 'start-drill', now: T0 });
    // Drill runs 90s — 30s past the 60s target — then ends.
    s = sessionTimerReducer(s, { type: 'complete-drill', now: T0 + 90 * SECOND });
    expect(s.blocks[0].drillMs).toBe(90 * SECOND);
    // Extend +2 min → a clean 120s, unaffected by the prior overtime.
    s = sessionTimerReducer(s, {
      type: 'extend-drill',
      seconds: 120,
      now: T0 + 90 * SECOND,
    });
    const t = getTimes(s, T0 + 90 * SECOND + 30 * SECOND);
    expect(t.drillRemainingMs).toBe(90 * SECOND);
  });

  it('extend-drill clamps to the drill floor', () => {
    let s = startInPrep();
    s = sessionTimerReducer(s, { type: 'start-drill', now: T0 });
    s = sessionTimerReducer(s, { type: 'complete-drill', now: T0 + 1 * MINUTE });
    s = sessionTimerReducer(s, { type: 'extend-drill', seconds: 5, now: T0 + 1 * MINUTE });
    expect(s.blocks[0].drillSegmentSeconds).toBe(30);
  });

  it('set-in-session-drill-active toggles the runner flag (starts false)', () => {
    let s = startInPrep();
    expect(s.inSessionDrillActive).toBe(false);
    s = sessionTimerReducer(s, { type: 'set-in-session-drill-active', active: true });
    expect(s.inSessionDrillActive).toBe(true);
    s = sessionTimerReducer(s, { type: 'set-in-session-drill-active', active: false });
    expect(s.inSessionDrillActive).toBe(false);
  });
});

describe('sessionTimerReducer — defer a block', () => {
  function startPrep(blockCount = 3): SessionState {
    const blocks = Array.from({ length: blockCount }, (_, i) => ({
      moduleRef: i === 0 ? 'production' : 'ear-training',
      plannedSeconds: 600,
      label: `Block ${i + 1}`,
    }));
    return sessionTimerReducer(INITIAL_SESSION_STATE, {
      type: 'start',
      input: {
        origin: 'practice-sessions',
        activeModuleRef: 'practice-sessions',
        startInPrep: true,
        blocks,
        sessionId: 'sess-d',
        now: T0,
      },
      blockIds: blocks.map((_, i) => `b${i + 1}`),
    });
  }

  it('initial state seeds an empty deferredBlocks list', () => {
    expect(INITIAL_SESSION_STATE.deferredBlocks).toEqual([]);
    expect(startPrep().deferredBlocks).toEqual([]);
  });

  it('moves the current block to deferredBlocks and advances to the next', () => {
    let s = startPrep(3);
    const deferredLabel = s.blocks[0].label;
    s = sessionTimerReducer(s, { type: 'defer-block', now: T0 + 5 * SECOND, nextBlockId: 'next' });
    // Removed from the active queue, held aside (reset to pending).
    expect(s.blocks).toHaveLength(2);
    expect(s.deferredBlocks).toHaveLength(1);
    expect(s.deferredBlocks[0].label).toBe(deferredLabel);
    expect(s.deferredBlocks[0].status).toBe('pending');
    expect(s.deferredBlocks[0].startedAt).toBeNull();
    // Advanced to the next active block, opened in prep + running.
    expect(s.currentBlockIndex).toBe(0);
    expect(s.status).toBe('running');
    expect(s.blocks[0].status).toBe('running');
    expect(s.blocks[0].phase).toBe('prep');
    expect(s.blocks[0].id).toBe('next');
  });

  it('deferring the last active block exhausts the queue → deferred review', () => {
    let s = startPrep(1);
    s = sessionTimerReducer(s, { type: 'defer-block', now: T0 + 5 * SECOND });
    // currentBlockIndex null + deferredBlocks non-empty + still running
    // is the derived "deferred review" phase. Session has NOT ended.
    expect(s.currentBlockIndex).toBeNull();
    expect(s.status).toBe('running');
    expect(s.deferredBlocks).toHaveLength(1);
    expect(s.blocks).toHaveLength(0);
  });

  it('advancing past the last active block enters review (not ended) when blocks are deferred', () => {
    // Defer block 1, then complete blocks 2 + 3 → review with block 1.
    let s = startPrep(3);
    s = sessionTimerReducer(s, { type: 'defer-block', now: T0 });
    // Now 2 active blocks remain. Complete both.
    s = sessionTimerReducer(s, { type: 'advance-block', now: T0 + 1 * MINUTE, markStatus: 'completed' });
    expect(s.currentBlockIndex).toBe(1);
    s = sessionTimerReducer(s, { type: 'advance-block', now: T0 + 2 * MINUTE, markStatus: 'completed' });
    // Last active block done, one deferred → review, not ended.
    expect(s.status).toBe('running');
    expect(s.currentBlockIndex).toBeNull();
    expect(s.deferredBlocks).toHaveLength(1);
  });

  it('"do it now" re-appends a deferred block as the running current block', () => {
    let s = startPrep(1);
    s = sessionTimerReducer(s, { type: 'defer-block', now: T0 });
    const id = s.deferredBlocks[0].id;
    s = sessionTimerReducer(s, {
      type: 'resume-deferred-block',
      id,
      now: T0 + 30 * SECOND,
      blockId: 'resumed',
    });
    expect(s.deferredBlocks).toHaveLength(0);
    expect(s.blocks).toHaveLength(1);
    expect(s.currentBlockIndex).toBe(0);
    expect(s.blocks[0].id).toBe('resumed');
    expect(s.blocks[0].status).toBe('running');
    expect(s.blocks[0].phase).toBe('prep');
    expect(s.status).toBe('running');
  });

  it('completing a resumed deferred block ends the session when none remain', () => {
    let s = startPrep(1);
    s = sessionTimerReducer(s, { type: 'defer-block', now: T0 });
    const id = s.deferredBlocks[0].id;
    s = sessionTimerReducer(s, { type: 'resume-deferred-block', id, now: T0 + 1 * MINUTE });
    s = sessionTimerReducer(s, { type: 'advance-block', now: T0 + 2 * MINUTE, markStatus: 'completed' });
    expect(s.status).toBe('ended');
    expect(s.deferredBlocks).toHaveLength(0);
    expect(s.blocks.some(b => b.status === 'completed')).toBe(true);
  });

  it('"skip" on a deferred block records it skipped and ends when it was the last', () => {
    let s = startPrep(1);
    s = sessionTimerReducer(s, { type: 'defer-block', now: T0 });
    const id = s.deferredBlocks[0].id;
    s = sessionTimerReducer(s, { type: 'skip-deferred-block', id, now: T0 + 30 * SECOND });
    expect(s.status).toBe('ended');
    expect(s.deferredBlocks).toHaveLength(0);
    // Recorded as a skipped block (same as handleSkipBlock).
    expect(s.blocks.filter(b => b.status === 'skipped')).toHaveLength(1);
  });

  it('"skip" on one of several deferred blocks stays in review', () => {
    let s = startPrep(2);
    s = sessionTimerReducer(s, { type: 'defer-block', now: T0 }); // defer block 1
    s = sessionTimerReducer(s, { type: 'defer-block', now: T0 + 1 }); // defer block 2 → review
    expect(s.deferredBlocks).toHaveLength(2);
    const firstId = s.deferredBlocks[0].id;
    s = sessionTimerReducer(s, { type: 'skip-deferred-block', id: firstId, now: T0 + 2 });
    expect(s.status).toBe('running'); // one still pending → still in review
    expect(s.deferredBlocks).toHaveLength(1);
  });

  it('"end session" from review records all remaining deferred as skipped and ends', () => {
    let s = startPrep(2);
    s = sessionTimerReducer(s, { type: 'defer-block', now: T0 });
    s = sessionTimerReducer(s, { type: 'defer-block', now: T0 + 1 });
    s = sessionTimerReducer(s, { type: 'end-deferred-review', now: T0 + 2 });
    expect(s.status).toBe('ended');
    expect(s.deferredBlocks).toHaveLength(0);
    expect(s.blocks.filter(b => b.status === 'skipped')).toHaveLength(2);
  });

  it('defer is a no-op when there is no current block', () => {
    let s = startPrep(1);
    s = sessionTimerReducer(s, { type: 'defer-block', now: T0 }); // → review, index null
    const before = s;
    s = sessionTimerReducer(s, { type: 'defer-block', now: T0 + 1 });
    expect(s).toBe(before);
  });

  it('resume/skip with an unknown id is a no-op', () => {
    let s = startPrep(1);
    s = sessionTimerReducer(s, { type: 'defer-block', now: T0 });
    const before = s;
    expect(sessionTimerReducer(s, { type: 'resume-deferred-block', id: 'nope', now: T0 })).toBe(before);
    expect(sessionTimerReducer(s, { type: 'skip-deferred-block', id: 'nope', now: T0 })).toBe(before);
  });
});
