/**
 * Phase 3 Step 1a — React Provider + hooks for the global session timer.
 *
 * One provider per app. Owns the reducer state, sources `now` from
 * Date.now() at action time, and exposes:
 *   - useSessionTimer()  → state + actions
 *   - useSessionTimes()  → live computed wall/active times, ticks every second
 *
 * Auto-pause (Step 1b), banner UI (Step 1c), and drift detection
 * (Step 1d) all live in sibling files and consume this provider.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  INITIAL_SESSION_STATE,
  getTimes,
  sessionTimerReducer,
} from './reducer';
import {
  clearActiveSessionDraft,
  writeActiveSessionDraft,
} from './activeSessionDraft';
import type {
  PauseReason,
  PendingStartConfig,
  PerformanceRating,
  SessionState,
  SessionTimes,
  StartSessionInput,
} from './types';

interface AdvanceBlockOptions {
  rating?: PerformanceRating;
  markStatus?: 'completed' | 'skipped';
}

interface EndSessionOptions {
  rating?: PerformanceRating;
  markStatus?: 'completed' | 'skipped';
}

export interface SessionTimerContextValue {
  state: SessionState;
  /**
   * Arm a session for delayed start. The proposal-acceptance flow
   * stores the planned blocks here and routes the user to the first
   * block's module; the actual `start` action fires the moment they
   * arrive there (via useStartArmedSessionOnArrival in Layout).
   * Keeps session-time honest — questionnaire-fill +
   * proposal-browse time doesn't count toward practice time.
   */
  armSession: (config: PendingStartConfig) => void;
  /** Clear an armed session without starting. */
  clearPendingSession: () => void;
  startSession: (input: Omit<StartSessionInput, 'sessionId' | 'now'>) => void;
  /**
   * Pause the timer. Defaults to 'manual' reason; pass
   * 'auto-navigation' from the route-watching hook (Step 1b) so a
   * manual pause isn't undone when the user happens back on the
   * active module.
   */
  pauseSession: (opts?: { reason?: PauseReason }) => void;
  resumeSession: () => void;
  advanceBlock: (opts?: AdvanceBlockOptions) => void;
  endSession: (opts?: EndSessionOptions) => void;
  /** Returns to idle. Called from end-of-session "Done" (Step 6k). */
  reset: () => void;
  /**
   * Restore a session from a persisted draft (refresh/crash recovery).
   * The caller passes an already-rebased SessionState (see
   * activeSessionDraft.draftToSessionState); the reducer adopts it.
   */
  restoreSession: (next: SessionState) => void;
  setActiveModuleRef: (moduleRef: string | null) => void;
  /**
   * Bump the current block's extensionSeconds by `mins` minutes.
   * No-op if there's no current block. Soft-block extend pills in the
   * global block-expiry modal call this.
   */
  extendCurrentBlock: (mins: number) => void;
  /**
   * Signal cross-screen "Next block" handoff. The block-expiry modal
   * sets this; the active session screen reactively transitions to
   * its rating phase and clears via consumeBlockEndRequest.
   */
  requestBlockEnd: () => void;
  consumeBlockEndRequest: () => void;
  // --- Prep-flow redesign: block phase transitions -------------
  /** Enter the current block's prep phase (prep screen arrival). */
  beginPrep: () => void;
  /** prep → drill (countdown "GO"); starts the drill timer. */
  startDrill: () => void;
  /** drill → rating (drill timer hit 0 or user moved on). */
  completeDrill: () => void;
  /** Adjust the current block's drill duration by `deltaSeconds`
   *  (prep-screen +/-). Clamped to [30s, planned * 2]. */
  adjustDrillTime: (deltaSeconds: number) => void;
}

// eslint-disable-next-line react-refresh/only-export-components
const SessionTimerContext = createContext<SessionTimerContextValue | null>(null);

export function SessionTimerProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(sessionTimerReducer, INITIAL_SESSION_STATE);

  const armSession = useCallback((config: PendingStartConfig) => {
    dispatch({ type: 'arm', config });
  }, []);

  const clearPendingSession = useCallback(() => {
    dispatch({ type: 'clear-pending' });
  }, []);

  const startSession = useCallback(
    (input: Omit<StartSessionInput, 'sessionId' | 'now'>) => {
      const blockIds = input.blocks.map(() => makeId());
      dispatch({
        type: 'start',
        input: {
          ...input,
          sessionId: makeId(),
          now: Date.now(),
        },
        blockIds,
      });
    },
    [],
  );

  const pauseSession = useCallback((opts?: { reason?: PauseReason }) => {
    dispatch({
      type: 'pause',
      now: Date.now(),
      reason: opts?.reason ?? 'manual',
    });
  }, []);

  const resumeSession = useCallback(() => {
    dispatch({ type: 'resume', now: Date.now() });
  }, []);

  const advanceBlock = useCallback((opts?: AdvanceBlockOptions) => {
    dispatch({
      type: 'advance-block',
      now: Date.now(),
      rating: opts?.rating,
      markStatus: opts?.markStatus,
      nextBlockId: makeId(),
    });
  }, []);

  const endSession = useCallback((opts?: EndSessionOptions) => {
    dispatch({
      type: 'end-session',
      now: Date.now(),
      rating: opts?.rating,
      markStatus: opts?.markStatus,
    });
  }, []);

  const reset = useCallback(() => dispatch({ type: 'reset' }), []);

  const restoreSession = useCallback((next: SessionState) => {
    dispatch({ type: 'restore', state: next });
  }, []);

  // --- Persistence (refresh / crash recovery) --------------------
  // Mirror the live session into Dexie so a reload can offer to resume.
  // Write on every meaningful state change while running/paused; clear
  // on a normal end. Intentionally NOT cleared on 'idle' — the initial
  // idle (and reset-after-end) must not wipe a resumable draft before
  // ResumeSessionGate reads it (a real end already cleared it).
  useEffect(() => {
    if (state.status === 'running' || state.status === 'paused') {
      void writeActiveSessionDraft(state);
    } else if (state.status === 'ended') {
      void clearActiveSessionDraft();
    }
  }, [state]);

  // Heartbeat: refresh the draft's time snapshot every 5s while running
  // so a crash loses at most ~5s of elapsed time. The timestamps in
  // `state` don't change between ticks, but writeActiveSessionDraft
  // recomputes the active-ms snapshot against the current clock.
  useEffect(() => {
    if (state.status !== 'running') return;
    const id = window.setInterval(() => {
      void writeActiveSessionDraft(state);
    }, 5000);
    return () => window.clearInterval(id);
  }, [state]);

  const setActiveModuleRef = useCallback((moduleRef: string | null) => {
    dispatch({ type: 'set-active-module-ref', moduleRef });
  }, []);

  const extendCurrentBlock = useCallback((mins: number) => {
    dispatch({ type: 'extend-block', mins });
  }, []);

  const requestBlockEnd = useCallback(() => {
    dispatch({ type: 'request-block-end', now: Date.now() });
  }, []);

  const consumeBlockEndRequest = useCallback(() => {
    dispatch({ type: 'consume-block-end' });
  }, []);

  const beginPrep = useCallback(() => {
    dispatch({ type: 'begin-prep', now: Date.now() });
  }, []);

  const startDrill = useCallback(() => {
    dispatch({ type: 'start-drill', now: Date.now() });
  }, []);

  const completeDrill = useCallback(() => {
    dispatch({ type: 'complete-drill', now: Date.now() });
  }, []);

  const adjustDrillTime = useCallback((deltaSeconds: number) => {
    dispatch({ type: 'adjust-drill-time', deltaSeconds });
  }, []);

  const value = useMemo<SessionTimerContextValue>(
    () => ({
      state,
      armSession,
      clearPendingSession,
      startSession,
      pauseSession,
      resumeSession,
      advanceBlock,
      endSession,
      reset,
      restoreSession,
      setActiveModuleRef,
      extendCurrentBlock,
      requestBlockEnd,
      consumeBlockEndRequest,
      beginPrep,
      startDrill,
      completeDrill,
      adjustDrillTime,
    }),
    [
      state,
      armSession,
      clearPendingSession,
      startSession,
      pauseSession,
      resumeSession,
      advanceBlock,
      endSession,
      reset,
      restoreSession,
      setActiveModuleRef,
      extendCurrentBlock,
      requestBlockEnd,
      consumeBlockEndRequest,
      beginPrep,
      startDrill,
      completeDrill,
      adjustDrillTime,
    ],
  );

  return (
    <SessionTimerContext.Provider value={value}>
      {children}
    </SessionTimerContext.Provider>
  );
}

export function useSessionTimer(): SessionTimerContextValue {
  const ctx = useContext(SessionTimerContext);
  if (!ctx) {
    throw new Error('useSessionTimer must be used within SessionTimerProvider');
  }
  return ctx;
}

/**
 * Live elapsed-time read. Re-renders the consumer once per second
 * while a session is running, so banner / block timer / drift checks
 * stay current. Goes idle (no ticking) when the session is paused or
 * idle/ended — paused time is still computed correctly on next read
 * because the reducer captures pausedAt.
 */
export function useSessionTimes(intervalMs = 1000): SessionTimes {
  const { state } = useSessionTimer();
  const [, setTick] = useState(0);
  const timesRef = useRef<SessionTimes>({
    wallMs: 0,
    activeMs: 0,
    blockWallMs: 0,
    blockActiveMs: 0,
    blockPhase: null,
    drillElapsedMs: 0,
    drillRemainingMs: 0,
    blockPhaseActiveMs: 0,
  });

  useEffect(() => {
    if (state.status !== 'running') return;
    const id = window.setInterval(() => {
      setTick(t => (t + 1) & 0x7fffffff);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [state.status, intervalMs]);

  timesRef.current = getTimes(state, Date.now());
  return timesRef.current;
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}
