/**
 * Prep-flow redesign — start an armed session the moment the user
 * arrives at the active-session screen (the prep screen for block 1).
 *
 * The proposal-acceptance flow calls armSession({...}) and navigates
 * to /practice-sessions/active. This hook (mounted in Layout alongside
 * useAutoPauseOnNavigation) watches pathname + pendingStart and fires
 * startSession exactly once: when the user lands on the active-session
 * route. The session is anchored to 'practice-sessions' so auto-pause
 * doesn't fire while they configure the prep screen.
 *
 * Result: session-time starts at prep (block timer begins there, per
 * the design) — the questionnaire-fill + proposal-browse window still
 * doesn't count.
 *
 * Idempotency: the reducer's `start` action clears pendingStart, so
 * a subsequent route change doesn't re-trigger.
 */
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useSessionTimer } from './SessionTimerContext';

const ACTIVE_SESSION_ROUTE = '/practice-sessions/active';
const ACTIVE_MODULE_REF = 'practice-sessions';

export function useStartArmedSessionOnArrival(): void {
  const location = useLocation();
  const { state, startSession } = useSessionTimer();

  useEffect(() => {
    if (!state.pendingStart) return;
    if (state.status !== 'idle' && state.status !== 'ended') return;
    if (state.pendingStart.blocks.length === 0) return;

    if (location.pathname !== ACTIVE_SESSION_ROUTE) return;

    startSession({
      origin: state.pendingStart.origin,
      activeModuleRef: ACTIVE_MODULE_REF,
      hardBlock: state.pendingStart.hardBlock,
      context: state.pendingStart.context,
      blocks: state.pendingStart.blocks.map(b => ({
        moduleRef: b.moduleRef,
        itemRefs: b.itemRefs,
        label: b.label,
        plannedSeconds: b.plannedSeconds,
        quickLaunchRoute: b.quickLaunchRoute,
        isKeyboardRequired: b.isKeyboardRequired,
        isWarmup: b.isWarmup,
      })),
    });
  }, [location.pathname, state.pendingStart, state.status, startSession]);
}
