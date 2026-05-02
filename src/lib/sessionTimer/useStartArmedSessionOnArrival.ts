/**
 * Phase 3 — Start an armed session the moment the user arrives at
 * the first block's module.
 *
 * The proposal-acceptance flow calls armSession({...}) and navigates
 * to the first block's module's route. This hook (mounted in Layout
 * alongside useAutoPauseOnNavigation) watches pathname + pendingStart
 * and fires startSession exactly once: when the first non-empty
 * pathname segment matches the first block's moduleRef.
 *
 * Result: session-time = actual practice time. The questionnaire-
 * fill + proposal-browse window doesn't count toward active time.
 *
 * Idempotency: the reducer's `start` action clears pendingStart, so
 * a subsequent route change doesn't re-trigger.
 */
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useSessionTimer } from './SessionTimerContext';
import { pathnameToModuleRef } from './useAutoPauseOnNavigation';

export function useStartArmedSessionOnArrival(): void {
  const location = useLocation();
  const { state, startSession } = useSessionTimer();

  useEffect(() => {
    if (!state.pendingStart) return;
    if (state.status !== 'idle' && state.status !== 'ended') return;
    const firstBlock = state.pendingStart.blocks[0];
    if (!firstBlock) return;

    const seg = pathnameToModuleRef(location.pathname);
    if (seg !== firstBlock.moduleRef) return;

    startSession({
      origin: state.pendingStart.origin,
      activeModuleRef: firstBlock.moduleRef,
      blocks: state.pendingStart.blocks.map(b => ({
        moduleRef: b.moduleRef,
        itemRefs: b.itemRefs,
        label: b.label,
        plannedSeconds: b.plannedSeconds,
      })),
    });
  }, [location.pathname, state.pendingStart, state.status, startSession]);
}
