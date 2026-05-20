// @vitest-environment jsdom
/**
 * Session-draft persistence (prep-flow redesign, Part 1).
 *
 * Pure logic only — buildDraft / draftToSessionState / reducer restore.
 * The Dexie read/write/clear wrappers are thin and excluded here.
 * (jsdom + fake-indexeddb only because the module imports `db`, whose
 * dev-only window helper + Dexie construction need a DOM/IndexedDB.)
 *
 * The core property: a draft snapshots active-ms at save time, and
 * restore REBASES timestamps to the resume instant so offline time is
 * never counted as practice.
 */
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { INITIAL_SESSION_STATE, getTimes, sessionTimerReducer } from '../reducer';
import type { SessionState } from '../types';
import { buildDraft, draftToSessionState } from '../activeSessionDraft';

const T0 = 1_700_000_000_000;
const SECOND = 1000;
const MINUTE = 60 * SECOND;

function startState(blockCount = 2): SessionState {
  const blocks = Array.from({ length: blockCount }, (_, i) => ({
    moduleRef: i === 0 ? 'shapes-and-patterns' : 'ear-training',
    plannedSeconds: 600,
    label: `Block ${i + 1}`,
  }));
  return sessionTimerReducer(INITIAL_SESSION_STATE, {
    type: 'start',
    input: {
      origin: 'practice-sessions',
      activeModuleRef: 'practice-sessions',
      blocks,
      sessionId: 'sess-1',
      now: T0,
    },
    blockIds: blocks.map((_, i) => `b${i + 1}`),
  });
}

describe('buildDraft', () => {
  it('returns null for idle and ended sessions', () => {
    expect(buildDraft(INITIAL_SESSION_STATE, T0)).toBeNull();
    const ended = sessionTimerReducer(startState(), {
      type: 'end-session',
      now: T0 + MINUTE,
    });
    expect(buildDraft(ended, T0 + MINUTE)).toBeNull();
  });

  it('snapshots active-ms for a running session', () => {
    const draft = buildDraft(startState(), T0 + 5 * MINUTE);
    expect(draft).not.toBeNull();
    expect(draft!.status).toBe('running');
    expect(draft!.sessionId).toBe('sess-1');
    expect(draft!.savedSessionActiveMs).toBe(5 * MINUTE);
    expect(draft!.savedBlockActiveMs).toBe(5 * MINUTE);
  });
});

describe('draftToSessionState — rebasing', () => {
  it('excludes offline time: active continues from the saved value', () => {
    const draft = buildDraft(startState(), T0 + 5 * MINUTE)!;
    // Reload 100 minutes later (tab was closed).
    const reloadNow = T0 + 105 * MINUTE;
    const restored = draftToSessionState(draft, reloadNow);
    expect(restored.status).toBe('running');
    // The 100-minute gap is discarded — still 5 min in.
    expect(getTimes(restored, reloadNow).activeMs).toBe(5 * MINUTE);
    // …and it keeps counting from there.
    expect(getTimes(restored, reloadNow + MINUTE).activeMs).toBe(6 * MINUTE);
  });

  it('preserves completed blocks and rebases the current block', () => {
    const started = startState(2);
    const advanced = sessionTimerReducer(started, {
      type: 'advance-block',
      now: T0 + 5 * MINUTE,
      rating: 'flying',
      nextBlockId: 'b2b',
    });
    const draft = buildDraft(advanced, T0 + 8 * MINUTE)!;
    expect(draft.savedSessionActiveMs).toBe(8 * MINUTE);
    expect(draft.savedBlockActiveMs).toBe(3 * MINUTE);

    const reloadNow = T0 + 500 * MINUTE;
    const restored = draftToSessionState(draft, reloadNow);
    expect(restored.currentBlockIndex).toBe(1);
    // Completed block 0 keeps its finalized active time + rating.
    expect(restored.blocks[0].status).toBe('completed');
    expect(restored.blocks[0].activeMs).toBe(5 * MINUTE);
    expect(restored.blocks[0].rating).toBe('flying');
    // Block 1 is running again, rebased.
    expect(restored.blocks[1].status).toBe('running');
    const t = getTimes(restored, reloadNow);
    expect(t.activeMs).toBe(8 * MINUTE);
    expect(t.blockActiveMs).toBe(3 * MINUTE);
  });

  it('drops a pause: paused session restores as running with the saved active time', () => {
    const started = startState();
    const paused = sessionTimerReducer(started, {
      type: 'pause',
      now: T0 + 4 * MINUTE,
      reason: 'manual',
    });
    // Saved 6 min after start while paused → active frozen at 4 min.
    const draft = buildDraft(paused, T0 + 6 * MINUTE)!;
    expect(draft.status).toBe('paused');
    expect(draft.savedSessionActiveMs).toBe(4 * MINUTE);

    const reloadNow = T0 + 50 * MINUTE;
    const restored = draftToSessionState(draft, reloadNow);
    expect(restored.status).toBe('running');
    expect(restored.pausedAt).toBeNull();
    expect(getTimes(restored, reloadNow).activeMs).toBe(4 * MINUTE);
  });
});

describe('sessionTimerReducer — restore', () => {
  it('adopts the provided state wholesale', () => {
    const target = startState();
    const out = sessionTimerReducer(INITIAL_SESSION_STATE, {
      type: 'restore',
      state: target,
    });
    expect(out).toBe(target);
  });
});
