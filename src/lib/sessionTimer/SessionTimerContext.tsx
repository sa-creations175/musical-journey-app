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
import type {
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
  startSession: (input: Omit<StartSessionInput, 'sessionId' | 'now'>) => void;
  pauseSession: () => void;
  resumeSession: () => void;
  advanceBlock: (opts?: AdvanceBlockOptions) => void;
  endSession: (opts?: EndSessionOptions) => void;
  /** Returns to idle. Called from end-of-session "Done" (Step 6k). */
  reset: () => void;
  setActiveModuleRef: (moduleRef: string | null) => void;
}

// eslint-disable-next-line react-refresh/only-export-components
const SessionTimerContext = createContext<SessionTimerContextValue | null>(null);

export function SessionTimerProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(sessionTimerReducer, INITIAL_SESSION_STATE);

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

  const pauseSession = useCallback(() => {
    dispatch({ type: 'pause', now: Date.now() });
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

  const setActiveModuleRef = useCallback((moduleRef: string | null) => {
    dispatch({ type: 'set-active-module-ref', moduleRef });
  }, []);

  const value = useMemo<SessionTimerContextValue>(
    () => ({
      state,
      startSession,
      pauseSession,
      resumeSession,
      advanceBlock,
      endSession,
      reset,
      setActiveModuleRef,
    }),
    [
      state,
      startSession,
      pauseSession,
      resumeSession,
      advanceBlock,
      endSession,
      reset,
      setActiveModuleRef,
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
