/**
 * Phase 3 Step 1b — Auto-pause / auto-resume keyed to module navigation.
 *
 * Compares the user's current route against the session's
 * activeModuleRef. When the user leaves the active module, the timer
 * auto-pauses with reason 'auto-navigation'. When they return, the
 * timer auto-resumes — but only if the most recent pause WAS the
 * auto-navigation one. A manual pause survives navigation: returning
 * to the active module does not undo it.
 *
 * Module-ref derivation is a literal first-segment match. The Phase 1
 * route table mounts every module at a top-level slug
 * (`/shapes-and-patterns`, `/ear-training/...`, etc.), so the first
 * non-empty segment is the canonical module ref. Sub-routes
 * (`/shapes-and-patterns/calendar`) keep the same first segment and
 * count as "still in module" — the user hasn't left.
 *
 * The decision logic lives in `decideAutoPauseAction` (pure, tested
 * in isolation) so this module's wiring stays trivial.
 */
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useSessionTimer } from './SessionTimerContext';
import type { SessionState } from './types';

export function useAutoPauseOnNavigation(): void {
  const location = useLocation();
  const { state, pauseSession, resumeSession } = useSessionTimer();

  useEffect(() => {
    const decision = decideAutoPauseAction(state, location.pathname);
    if (decision === 'pause') {
      pauseSession({ reason: 'auto-navigation' });
    } else if (decision === 'resume') {
      resumeSession();
    }
  }, [
    location.pathname,
    state,
    pauseSession,
    resumeSession,
  ]);
}

export type AutoPauseDecision = 'pause' | 'resume' | 'noop';

/**
 * Pure decision function. Given the session state and the current
 * URL pathname, returns whether the navigation hook should pause,
 * resume, or do nothing. Exported for unit testing.
 *
 *   - idle / ended → noop
 *   - activeModuleRef unset → noop (consumer hasn't anchored yet)
 *   - running + off-module → pause
 *   - paused + auto-navigation reason + on-module → resume
 *   - paused + manual reason → noop (manual pause is sticky)
 *   - everything else → noop
 */
export function decideAutoPauseAction(
  state: SessionState,
  pathname: string,
): AutoPauseDecision {
  if (state.status === 'idle' || state.status === 'ended') return 'noop';
  if (state.activeModuleRef === null) return 'noop';

  const onActive = isOnActiveModule(pathname, state.activeModuleRef);

  if (state.status === 'running' && !onActive) return 'pause';
  if (
    state.status === 'paused' &&
    state.pauseReason === 'auto-navigation' &&
    onActive
  ) {
    return 'resume';
  }
  return 'noop';
}

/**
 * First non-empty segment of the pathname. `'/'` yields null,
 * `/shapes-and-patterns/calendar` yields `'shapes-and-patterns'`.
 * Exported for unit testing.
 */
export function pathnameToModuleRef(pathname: string): string | null {
  for (const seg of pathname.split('/')) {
    if (seg.length > 0) return seg;
  }
  return null;
}

export function isOnActiveModule(
  pathname: string,
  activeModuleRef: string,
): boolean {
  return pathnameToModuleRef(pathname) === activeModuleRef;
}
