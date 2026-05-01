/**
 * Phase 3 Step 1d — Drift detection helpers.
 */
import { describe, it, expect } from 'vitest';
import {
  DRIFT_HARD_PAUSE_MS,
  DRIFT_MIN_WALL_MS,
  DRIFT_SOFT_RATIO,
  formatDriftText,
  shouldShowDrift,
  shouldShowHardPrompt,
} from '../drift';
import { INITIAL_SESSION_STATE, sessionTimerReducer } from '../reducer';
import type { SessionState, SessionTimes } from '../types';

const T0 = 1_700_000_000_000;

function times(active: number, wall: number): SessionTimes {
  return { activeMs: active, wallMs: wall, blockActiveMs: active, blockWallMs: wall };
}

describe('shouldShowDrift', () => {
  it('returns false below the minimum wall-time floor', () => {
    expect(shouldShowDrift(times(0, DRIFT_MIN_WALL_MS - 1))).toBe(false);
  });

  it('returns false when active/wall ratio is at or above the soft threshold', () => {
    // Exactly 60% past the floor — at the threshold is not yet drift.
    const wall = DRIFT_MIN_WALL_MS + 60_000;
    expect(shouldShowDrift(times(wall * DRIFT_SOFT_RATIO, wall))).toBe(false);
    // Just above 60%.
    expect(shouldShowDrift(times(wall * 0.7, wall))).toBe(false);
  });

  it('returns true when ratio drops below the soft threshold', () => {
    // 50% active vs 100% wall, well past the floor.
    const wall = DRIFT_MIN_WALL_MS + 60_000;
    const active = wall * 0.5;
    expect(shouldShowDrift(times(active, wall))).toBe(true);
  });

  it('returns false on a zero-wall edge case', () => {
    expect(shouldShowDrift(times(0, 0))).toBe(false);
  });

  it('threshold constant is the documented 0.6', () => {
    expect(DRIFT_SOFT_RATIO).toBe(0.6);
  });
});

describe('formatDriftText', () => {
  it('renders rounded-down minute counts', () => {
    expect(formatDriftText(times(12 * 60_000 + 45_000, 28 * 60_000 + 5_000))).toBe(
      '12 min active of 28 min elapsed',
    );
  });

  it('handles 0 active gracefully', () => {
    expect(formatDriftText(times(0, 5 * 60_000))).toBe('0 min active of 5 min elapsed');
  });
});

describe('shouldShowHardPrompt', () => {
  function pausedAt(now: number, pausedAtMs: number): SessionState {
    const started = sessionTimerReducer(INITIAL_SESSION_STATE, {
      type: 'start',
      input: {
        origin: 'shapes-drill',
        activeModuleRef: 'shapes-and-patterns',
        blocks: [{ moduleRef: 'shapes-and-patterns', plannedSeconds: 600 }],
        sessionId: 'sess-1',
        now,
      },
      blockIds: ['b1'],
    });
    return sessionTimerReducer(started, {
      type: 'pause',
      now: pausedAtMs,
      reason: 'manual',
    });
  }

  it('returns false when not paused', () => {
    const running = sessionTimerReducer(INITIAL_SESSION_STATE, {
      type: 'start',
      input: {
        origin: 'shapes-drill',
        activeModuleRef: 'shapes-and-patterns',
        blocks: [{ moduleRef: 'shapes-and-patterns', plannedSeconds: 600 }],
        sessionId: 'sess-1',
        now: T0,
      },
      blockIds: ['b1'],
    });
    expect(shouldShowHardPrompt(running, T0 + DRIFT_HARD_PAUSE_MS)).toBe(false);
  });

  it('returns false before the threshold', () => {
    const s = pausedAt(T0, T0 + 1_000);
    expect(shouldShowHardPrompt(s, T0 + DRIFT_HARD_PAUSE_MS)).toBe(false);
  });

  it('returns true when continuous pause meets the threshold', () => {
    const s = pausedAt(T0, T0 + 1_000);
    expect(shouldShowHardPrompt(s, T0 + 1_000 + DRIFT_HARD_PAUSE_MS)).toBe(true);
  });

  it('returns true past the threshold', () => {
    const s = pausedAt(T0, T0 + 1_000);
    expect(shouldShowHardPrompt(s, T0 + 1_000 + DRIFT_HARD_PAUSE_MS + 60_000)).toBe(true);
  });

  it('threshold constant is the documented 15 minutes', () => {
    expect(DRIFT_HARD_PAUSE_MS).toBe(15 * 60 * 1000);
  });
});
