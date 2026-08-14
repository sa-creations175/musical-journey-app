/**
 * The two cross-tab database states that need the user to see them,
 * plus the registration of the idle probe that decides whether they
 * ever do.
 *
 * Mounted inside BrowserRouter and SessionTimerProvider because the
 * probe needs both the current route and session state — see
 * dbLifecycle.ts for why "idle" is a narrow whitelist rather than a
 * general check, and why an unregistered probe counts as busy.
 *
 * Both states mean the local database is unusable: closed-for-upgrade
 * has already closed the connection, and blocked never opened one. So
 * this is a hard blocking overlay, not a banner — anything rendered
 * behind it is showing stale data at best.
 */
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  setIdleProbe,
  shouldAutoReload,
  useDbLifecycle,
} from '../lib/dbLifecycle';
import { useSessionTimer } from '../lib/sessionTimer/SessionTimerContext';

export default function DbUpgradeOverlay() {
  const lifecycle = useDbLifecycle();
  const location = useLocation();
  const { state: sessionState } = useSessionTimer();

  // A paused session still counts as active — the user is inside it,
  // they just stepped away.
  const sessionActive =
    sessionState.status === 'running' || sessionState.status === 'paused';
  const inSessionDrillActive = sessionState.inSessionDrillActive;
  const pathname = location.pathname;

  useEffect(() => {
    // Re-registered whenever the inputs change so the probe always
    // closes over current values — versionchange can fire at any
    // moment and reads it synchronously.
    setIdleProbe(() =>
      shouldAutoReload({ pathname, sessionActive, inSessionDrillActive }),
    );
    return () => setIdleProbe(null);
  }, [pathname, sessionActive, inSessionDrillActive]);

  if (lifecycle === 'ok') return null;

  const blocked = lifecycle === 'blocked';

  return (
    <div
      // Above every modal (z-50) — nothing behind this can function.
      className="fixed inset-0 z-[100] flex items-center justify-center bg-neutral-950/90 backdrop-blur-sm p-6"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="db-upgrade-title"
    >
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-neutral-900 p-6 space-y-4 text-center">
        <h2 id="db-upgrade-title" className="text-base font-medium text-neutral-100">
          {blocked ? 'Another tab is holding the old version' : 'Updated in another tab'}
        </h2>
        <p className="text-sm text-neutral-400">
          {blocked
            ? 'This tab is trying to upgrade its local database, but another tab still has the previous version open. Close the other tab, then reload here.'
            : 'Another tab upgraded the local database, so this tab closed its connection. Reload to pick up the new version.'}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="w-full px-3 py-2.5 rounded-md bg-fluent text-white text-sm font-medium hover:opacity-90"
        >
          Reload
        </button>
        <p className="text-[11px] text-neutral-500">
          Nothing has been lost — this tab stopped writing the moment the
          upgrade started.
        </p>
      </div>
    </div>
  );
}
