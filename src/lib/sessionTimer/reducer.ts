/**
 * Phase 3 Step 1a — Pure reducer + computed-times helper.
 *
 * No React, no Date.now() at the top level — every transition takes
 * `now` as input so tests can drive the clock deterministically.
 * Provider (SessionTimerContext.tsx) is the only place that calls
 * Date.now() and crypto.randomUUID().
 */

import type {
  BlockPhase,
  PerformanceRating,
  SessionBlock,
  SessionState,
  SessionTimerAction,
  SessionTimes,
  StartSessionInput,
} from './types';

/** Drill-timer adjustment floor (seconds). Mirrors the design's Time
 *  Adjustment UX: a drill can't be shortened below 30s. */
const MIN_DRILL_SECONDS = 30;

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
  context: 'keys',
  startInPrep: false,
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

    case 'restore':
      // Replace state wholesale with a (rebased) snapshot recovered
      // from the persisted draft. The caller (persistence layer) has
      // already anchored timestamps to `now`, so the reducer just
      // adopts it.
      return action.state;

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

    case 'request-block-end': {
      // Atomic with pause: anchors the rating-phase entry as a manual
      // pause so the auto-pause hook (Layout) can't race us into an
      // auto-navigation reason that would later auto-resume mid-
      // rating. Three branches:
      //
      //   - running: pause now with reason 'manual', set the flag.
      //   - paused with auto-navigation: convert reason to 'manual'
      //     so the hook stops trying to auto-resume.
      //   - paused with manual / no pauseReason: just set the flag.
      //
      // Any other status (idle/ended) is a no-op.
      if (state.status === 'running') {
        return {
          ...state,
          status: 'paused',
          pausedAt: action.now,
          pauseReason: 'manual',
          blockEndRequested: true,
        };
      }
      if (state.status === 'paused') {
        if (state.pauseReason === 'auto-navigation') {
          return { ...state, pauseReason: 'manual', blockEndRequested: true };
        }
        return { ...state, blockEndRequested: true };
      }
      return state;
    }

    case 'consume-block-end':
      if (!state.blockEndRequested) return state;
      return { ...state, blockEndRequested: false };

    case 'begin-prep':
      return transitionPhase(state, 'prep', action.now);

    case 'start-drill': {
      // Enter drill with the current adjusted duration as the segment.
      if (state.currentBlockIndex === null || state.status !== 'running') {
        return state;
      }
      const cur = state.blocks[state.currentBlockIndex];
      return enterDrill(state, action.now, cur.adjustedDrillSeconds);
    }

    case 'complete-drill':
      return transitionPhase(state, 'rating', action.now);

    case 'extend-drill':
      // Re-enter drill with a fresh segment of `seconds` (rating-screen
      // extend). Clamp to the drill floor.
      return enterDrill(
        state,
        action.now,
        Math.max(MIN_DRILL_SECONDS, action.seconds),
      );

    case 'adjust-drill-time': {
      if (state.currentBlockIndex === null) return state;
      if (state.status !== 'running' && state.status !== 'paused') return state;
      const idx = state.currentBlockIndex;
      const cur = state.blocks[idx];
      // Clamp to [30s, planned * 2] per the design's Time Adjustment UX.
      const ceil = Math.max(MIN_DRILL_SECONDS, cur.plannedSeconds * 2);
      const next = clamp(
        cur.adjustedDrillSeconds + action.deltaSeconds,
        MIN_DRILL_SECONDS,
        ceil,
      );
      if (next === cur.adjustedDrillSeconds) return state;
      return {
        ...state,
        blocks: replaceAt(state.blocks, idx, {
          ...cur,
          adjustedDrillSeconds: next,
        }),
      };
    }

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
  const startInPrep = input.startInPrep ?? false;
  // Prep-flow sessions open each block in `prep` (drill timer idle
  // until Ready); other origins start straight in `drill` so their
  // whole-block time logs as drill, unchanged.
  const initialPhase = startInPrep ? 'prep' : 'drill';

  const blocks: SessionBlock[] = input.blocks.map((b, i) => ({
    id: blockIds[i],
    moduleRef: b.moduleRef,
    itemRefs: b.itemRefs,
    label: b.label,
    quickLaunchRoute: b.quickLaunchRoute,
    plannedSeconds: b.plannedSeconds,
    isKeyboardRequired: b.isKeyboardRequired,
    isWarmup: b.isWarmup,
    extensionSeconds: 0,
    status: i === 0 ? 'running' : 'pending',
    startedAt: i === 0 ? now : null,
    endedAt: null,
    activeMs: 0,
    pausedMs: 0,
    // The first block's phase clock starts with the block; pending
    // blocks start their phase clock when they become current
    // (advance-block).
    phase: initialPhase,
    phaseStartedAt: i === 0 ? now : null,
    prepMs: 0,
    drillMs: 0,
    ratingMs: 0,
    phasePausedMs: 0,
    adjustedDrillSeconds: b.plannedSeconds,
    drillSegmentSeconds: b.plannedSeconds,
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
    context: input.context ?? 'keys',
    startInPrep,
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
  const nextBlockBase = workingState.blocks[nextIdx];
  const nextBlock: SessionBlock = {
    ...nextBlockBase,
    id: action.nextBlockId ?? nextBlockBase.id,
    status: 'running',
    startedAt: action.now,
    // Open the next block in prep (prep-flow) or drill (legacy), and
    // (re)anchor its drill segment to its adjusted duration.
    phase: workingState.startInPrep ? 'prep' : 'drill',
    phaseStartedAt: action.now,
    phasePausedMs: 0,
    drillSegmentSeconds: nextBlockBase.adjustedDrillSeconds,
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
  // Fold the in-progress phase segment into its accumulator first so
  // the persisted prep/drill/rating breakdown is complete. (For the
  // legacy no-prep flow this lands the whole block in drillMs.)
  const accrued = accrueCurrentPhase(block, now);
  const startedAt = accrued.startedAt ?? now;
  const wallMs = Math.max(0, now - startedAt);
  const activeMs = Math.max(0, wallMs - accrued.pausedMs);
  return {
    ...accrued,
    status: markStatus,
    endedAt: now,
    activeMs,
    // No longer accruing — null the phase anchor.
    phaseStartedAt: null,
    rating: rating ?? accrued.rating,
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
  const cur = state.blocks[idx];
  return replaceAt(state.blocks, idx, {
    ...cur,
    // Whole-block + current-phase pause both grow by the segment so
    // per-phase active time excludes the pause too.
    pausedMs: cur.pausedMs + pauseDurationMs,
    phasePausedMs: cur.phasePausedMs + pauseDurationMs,
  });
}

/**
 * Fold the current phase segment's active time into its accumulator
 * and reset the segment (phasePausedMs → 0). Does NOT change `phase`
 * or set a new `phaseStartedAt` — the caller decides what comes next
 * (a new phase via transitionPhase, or null on finalize).
 *
 * Expects to run while NOT mid-pause: advance/end/transition all
 * unwind any in-progress pause into phasePausedMs first.
 */
function accrueCurrentPhase(block: SessionBlock, now: number): SessionBlock {
  if (block.phaseStartedAt === null) return block;
  const segWall = Math.max(0, now - block.phaseStartedAt);
  const segActive = Math.max(0, segWall - block.phasePausedMs);
  const next: SessionBlock = { ...block, phasePausedMs: 0 };
  if (block.phase === 'prep') next.prepMs = block.prepMs + segActive;
  else if (block.phase === 'drill') next.drillMs = block.drillMs + segActive;
  else next.ratingMs = block.ratingMs + segActive;
  return next;
}

/**
 * Move the current block into `nextPhase`: unwind any in-progress
 * pause, fold the leaving segment into its accumulator, then anchor
 * the new phase at `now`. No-op unless there's a current block and
 * the session is running.
 */
function transitionPhase(
  state: SessionState,
  nextPhase: BlockPhase,
  now: number,
): SessionState {
  if (state.currentBlockIndex === null) return state;
  if (state.status !== 'running') return state;
  const idx = state.currentBlockIndex;
  const accrued = accrueCurrentPhase(state.blocks[idx], now);
  return {
    ...state,
    blocks: replaceAt(state.blocks, idx, {
      ...accrued,
      phase: nextPhase,
      phaseStartedAt: now,
    }),
  };
}

/**
 * Enter the drill phase with `segmentSeconds` as the current segment's
 * countdown target. Used by start-drill (target = adjusted duration)
 * and extend-drill (target = the chosen extension). Folds the leaving
 * phase's time into its accumulator first. No-op unless there's a
 * current block and the session is running.
 */
function enterDrill(
  state: SessionState,
  now: number,
  segmentSeconds: number,
): SessionState {
  if (state.currentBlockIndex === null) return state;
  if (state.status !== 'running') return state;
  const idx = state.currentBlockIndex;
  const accrued = accrueCurrentPhase(state.blocks[idx], now);
  return {
    ...state,
    blocks: replaceAt(state.blocks, idx, {
      ...accrued,
      phase: 'drill',
      phaseStartedAt: now,
      drillSegmentSeconds: segmentSeconds,
    }),
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
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
    return {
      wallMs: 0,
      activeMs: 0,
      blockWallMs: 0,
      blockActiveMs: 0,
      blockPhase: null,
      drillElapsedMs: 0,
      drillRemainingMs: 0,
      blockPhaseActiveMs: 0,
    };
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
  let blockPhase: BlockPhase | null = null;
  let drillElapsedMs = 0;
  let drillRemainingMs = 0;
  let blockPhaseActiveMs = 0;
  if (state.currentBlockIndex !== null) {
    const cur = state.blocks[state.currentBlockIndex];
    blockPhase = cur.phase;
    if (cur.startedAt !== null) {
      const blockEnd = cur.endedAt ?? sessionEnd;
      blockWallMs = Math.max(0, blockEnd - cur.startedAt);
      blockActiveMs =
        cur.status === 'running'
          ? Math.max(0, blockWallMs - cur.pausedMs - inProgressPausedMs)
          : cur.activeMs;
    }

    // Live active time in the current phase segment (running only).
    const accruing = cur.status === 'running' && cur.phaseStartedAt !== null;
    const phaseSegActive = accruing
      ? Math.max(
          0,
          Math.max(0, sessionEnd - cur.phaseStartedAt!) -
            cur.phasePausedMs -
            inProgressPausedMs,
        )
      : 0;
    blockPhaseActiveMs = phaseSegActive;

    // Cumulative drill time (count-up): finalized segments + the live
    // one when we're in drill.
    const liveDrill =
      cur.status === 'running' && cur.phase === 'drill' ? phaseSegActive : 0;
    drillElapsedMs = cur.drillMs + liveDrill;

    // Count-down drill timer for the CURRENT segment, against that
    // segment's own target (drillSegmentSeconds) — so a rating-screen
    // extend gets a fresh N-minute countdown regardless of how long
    // the prior segment ran.
    if (cur.status === 'running' && cur.phase === 'drill') {
      drillRemainingMs = Math.max(
        0,
        cur.drillSegmentSeconds * 1000 - phaseSegActive,
      );
    } else if (cur.status === 'running' && cur.phase === 'prep') {
      // Drill hasn't started — preview the adjusted duration.
      drillRemainingMs = cur.adjustedDrillSeconds * 1000;
    } else {
      drillRemainingMs = 0;
    }
  }

  return {
    wallMs,
    activeMs,
    blockWallMs,
    blockActiveMs,
    blockPhase,
    drillElapsedMs,
    drillRemainingMs,
    blockPhaseActiveMs,
  };
}
