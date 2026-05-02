/**
 * Phase 3 Step 1a — Pure reducer + computed-times helper.
 *
 * No React, no Date.now() at the top level — every transition takes
 * `now` as input so tests can drive the clock deterministically.
 * Provider (SessionTimerContext.tsx) is the only place that calls
 * Date.now() and crypto.randomUUID().
 */

import type {
  PerformanceRating,
  SessionBlock,
  SessionState,
  SessionTimerAction,
  SessionTimes,
  StartSessionInput,
} from './types';

export const INITIAL_SESSION_STATE: SessionState = {
  status: 'idle',
  sessionId: null,
  origin: null,
  pendingStart: null,
  activeModuleRef: null,
  startedAt: null,
  endedAt: null,
  pausedAt: null,
  pauseReason: null,
  hardBlock: false,
  blockEndRequested: false,
  blocks: [],
  currentBlockIndex: null,
};

export function sessionTimerReducer(
  state: SessionState,
  action: SessionTimerAction,
): SessionState {
  switch (action.type) {
    case 'arm':
      // Refuse to arm on top of a live session — caller must reset
      // first. Replacing pendingStart while idle is fine; the
      // most-recent arm wins.
      if (state.status !== 'idle' && state.status !== 'ended') return state;
      return { ...state, pendingStart: action.config };

    case 'clear-pending':
      return { ...state, pendingStart: null };

    case 'start':
      return startSession(state, action.input, action.blockIds);

    case 'pause':
      if (state.status !== 'running') return state;
      return {
        ...state,
        status: 'paused',
        pausedAt: action.now,
        pauseReason: action.reason,
      };

    case 'resume': {
      if (state.status !== 'paused' || state.pausedAt === null) return state;
      const pauseDuration = Math.max(0, action.now - state.pausedAt);
      const blocks = bumpCurrentBlockPause(state, pauseDuration);
      return {
        ...state,
        status: 'running',
        pausedAt: null,
        pauseReason: null,
        blocks,
      };
    }

    case 'advance-block':
      return advanceBlock(state, action);

    case 'end-session':
      return endSession(state, action);

    case 'reset':
      return INITIAL_SESSION_STATE;

    case 'set-active-module-ref':
      return { ...state, activeModuleRef: action.moduleRef };

    case 'extend-block': {
      if (state.currentBlockIndex === null) return state;
      if (state.status !== 'running' && state.status !== 'paused') return state;
      const idx = state.currentBlockIndex;
      const cur = state.blocks[idx];
      const bumped = Math.max(0, cur.extensionSeconds + action.mins * 60);
      return {
        ...state,
        // Tapping an extend pill is an explicit "keep going" — clear
        // any pending block-end handoff so we don't bounce into the
        // rating phase right after dismissing the modal.
        blockEndRequested: false,
        blocks: replaceAt(state.blocks, idx, {
          ...cur,
          extensionSeconds: bumped,
        }),
      };
    }

    case 'request-block-end':
      if (state.status !== 'running' && state.status !== 'paused') return state;
      return { ...state, blockEndRequested: true };

    case 'consume-block-end':
      if (!state.blockEndRequested) return state;
      return { ...state, blockEndRequested: false };

    default: {
      const _exhaustive: never = action;
      void _exhaustive;
      return state;
    }
  }
}

function startSession(
  state: SessionState,
  input: StartSessionInput,
  blockIds: string[],
): SessionState {
  if (state.status !== 'idle' && state.status !== 'ended') {
    // Refuse to clobber an active session — caller must reset() first.
    return state;
  }
  if (input.blocks.length === 0) return state;
  if (blockIds.length !== input.blocks.length) {
    throw new Error(
      'sessionTimerReducer: blockIds length must match input.blocks length',
    );
  }

  const now = input.now ?? 0;
  const sessionId = input.sessionId ?? '';

  const blocks: SessionBlock[] = input.blocks.map((b, i) => ({
    id: blockIds[i],
    moduleRef: b.moduleRef,
    itemRefs: b.itemRefs,
    label: b.label,
    plannedSeconds: b.plannedSeconds,
    extensionSeconds: 0,
    status: i === 0 ? 'running' : 'pending',
    startedAt: i === 0 ? now : null,
    endedAt: null,
    activeMs: 0,
    pausedMs: 0,
  }));

  return {
    status: 'running',
    sessionId,
    origin: input.origin,
    // start consumes pendingStart — whether or not this start was
    // routed through arm(), we don't want a stale pending config
    // hanging around once a real session is running.
    pendingStart: null,
    activeModuleRef: input.activeModuleRef,
    startedAt: now,
    endedAt: null,
    pausedAt: null,
    pauseReason: null,
    hardBlock: input.hardBlock ?? false,
    blockEndRequested: false,
    blocks,
    currentBlockIndex: 0,
  };
}

function advanceBlock(
  state: SessionState,
  action: Extract<SessionTimerAction, { type: 'advance-block' }>,
): SessionState {
  if (state.currentBlockIndex === null) return state;
  if (state.status === 'ended') return state;

  // If currently paused, finalize the in-progress pause segment first
  // so the current block carries the right pausedMs.
  let workingState = state;
  if (state.status === 'paused' && state.pausedAt !== null) {
    const pauseDuration = Math.max(0, action.now - state.pausedAt);
    workingState = {
      ...state,
      status: 'running',
      pausedAt: null,
      pauseReason: null,
      blocks: bumpCurrentBlockPause(state, pauseDuration),
    };
  }

  const idx = workingState.currentBlockIndex!;
  const finalized = finalizeBlock(
    workingState.blocks[idx],
    action.now,
    action.markStatus ?? 'completed',
    action.rating,
  );

  const isLast = idx === workingState.blocks.length - 1;
  if (isLast) {
    // No more blocks to advance into — auto-end.
    return {
      ...workingState,
      status: 'ended',
      endedAt: action.now,
      blockEndRequested: false,
      blocks: replaceAt(workingState.blocks, idx, finalized),
      currentBlockIndex: idx,
    };
  }

  const nextIdx = idx + 1;
  const nextBlock: SessionBlock = {
    ...workingState.blocks[nextIdx],
    id: action.nextBlockId ?? workingState.blocks[nextIdx].id,
    status: 'running',
    startedAt: action.now,
  };

  const blocks = workingState.blocks.map((b, i) => {
    if (i === idx) return finalized;
    if (i === nextIdx) return nextBlock;
    return b;
  });

  return {
    ...workingState,
    status: 'running',
    blockEndRequested: false,
    blocks,
    currentBlockIndex: nextIdx,
  };
}

function endSession(
  state: SessionState,
  action: Extract<SessionTimerAction, { type: 'end-session' }>,
): SessionState {
  if (state.status === 'idle' || state.status === 'ended') return state;

  let workingState = state;
  if (state.status === 'paused' && state.pausedAt !== null) {
    const pauseDuration = Math.max(0, action.now - state.pausedAt);
    workingState = {
      ...state,
      status: 'running',
      pausedAt: null,
      pauseReason: null,
      blocks: bumpCurrentBlockPause(state, pauseDuration),
    };
  }

  let blocks = workingState.blocks;
  if (workingState.currentBlockIndex !== null) {
    const idx = workingState.currentBlockIndex;
    const cur = blocks[idx];
    if (cur.status === 'running') {
      const finalized = finalizeBlock(
        cur,
        action.now,
        action.markStatus ?? 'completed',
        action.rating,
      );
      blocks = replaceAt(blocks, idx, finalized);
    }
  }

  return {
    ...workingState,
    status: 'ended',
    endedAt: action.now,
    blocks,
  };
}

function finalizeBlock(
  block: SessionBlock,
  now: number,
  markStatus: 'completed' | 'skipped',
  rating?: PerformanceRating,
): SessionBlock {
  const startedAt = block.startedAt ?? now;
  const wallMs = Math.max(0, now - startedAt);
  const activeMs = Math.max(0, wallMs - block.pausedMs);
  return {
    ...block,
    status: markStatus,
    endedAt: now,
    activeMs,
    rating: rating ?? block.rating,
  };
}

function bumpCurrentBlockPause(
  state: SessionState,
  pauseDurationMs: number,
): SessionBlock[] {
  if (state.currentBlockIndex === null || pauseDurationMs <= 0) {
    return state.blocks;
  }
  const idx = state.currentBlockIndex;
  return replaceAt(state.blocks, idx, {
    ...state.blocks[idx],
    pausedMs: state.blocks[idx].pausedMs + pauseDurationMs,
  });
}

function replaceAt<T>(arr: T[], index: number, value: T): T[] {
  const copy = arr.slice();
  copy[index] = value;
  return copy;
}

/**
 * Compute live wall-clock + active times for the session and the
 * current block at instant `now`. Pure function — call from a render
 * driven by useTimerTick to get a smooth elapsed-time display.
 */
export function getTimes(state: SessionState, now: number): SessionTimes {
  if (state.status === 'idle' || state.startedAt === null) {
    return { wallMs: 0, activeMs: 0, blockWallMs: 0, blockActiveMs: 0 };
  }

  const sessionEnd = state.endedAt ?? now;
  const wallMs = Math.max(0, sessionEnd - state.startedAt);

  const finalizedPausedMs = state.blocks.reduce(
    (sum, b) => sum + b.pausedMs,
    0,
  );
  const inProgressPausedMs =
    state.pausedAt !== null ? Math.max(0, sessionEnd - state.pausedAt) : 0;
  const activeMs = Math.max(
    0,
    wallMs - finalizedPausedMs - inProgressPausedMs,
  );

  let blockWallMs = 0;
  let blockActiveMs = 0;
  if (state.currentBlockIndex !== null) {
    const cur = state.blocks[state.currentBlockIndex];
    if (cur.startedAt !== null) {
      const blockEnd = cur.endedAt ?? sessionEnd;
      blockWallMs = Math.max(0, blockEnd - cur.startedAt);
      blockActiveMs =
        cur.status === 'running'
          ? Math.max(0, blockWallMs - cur.pausedMs - inProgressPausedMs)
          : cur.activeMs;
    }
  }

  return { wallMs, activeMs, blockWallMs, blockActiveMs };
}
