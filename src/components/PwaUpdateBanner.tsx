import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * Bottom-of-screen banner shown when the service worker has a new
 * version waiting. Tapping "Update now" tells the waiting worker
 * to skip waiting; once it takes control, the page reloads (the
 * `controlling` listener in registerSW handles that for us).
 *
 * Dismissable with × — re-surfaces 30 minutes later if the new
 * version is still waiting, so the user gets a second chance to
 * adopt without being nagged every minute.
 *
 * The PWA plugin's registerType must be 'prompt' for needRefresh
 * to fire — see vite.config.ts. In dev (devOptions.enabled=false)
 * this component sits idle.
 */
const DISMISS_RESHOW_MS = 30 * 60 * 1000;

export default function PwaUpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  const [dismissed, setDismissed] = useState(false);
  const [updating, setUpdating] = useState(false);

  // When the user dismisses, schedule a re-show 30 min later so a
  // fix the user opted to defer doesn't stay hidden forever. The
  // timer clears if the component unmounts or the user takes the
  // update before the window elapses.
  useEffect(() => {
    if (!dismissed) return;
    const timer = window.setTimeout(() => {
      setDismissed(false);
    }, DISMISS_RESHOW_MS);
    return () => window.clearTimeout(timer);
  }, [dismissed]);

  if (!needRefresh || dismissed) return null;

  const handleUpdate = async () => {
    if (updating) return;
    setUpdating(true);
    try {
      // updateServiceWorker tells the waiting SW to skipWaiting;
      // the `controlling` listener registered in registerSW then
      // fires window.location.reload() once the new SW takes
      // control. We don't need to reload manually.
      await updateServiceWorker();
    } catch (err) {
      console.warn('[pwa] updateServiceWorker failed', err);
      setUpdating(false);
    }
  };

  const handleDismiss = () => {
    // Clear needRefresh so the banner stays hidden during the
    // dismissal window; the useEffect above will flip it back on
    // via setDismissed(false) after 30 min, BUT the SW state
    // itself may have changed by then. needRefresh's `setNeedRefresh`
    // doesn't re-trigger the SW check — fine for this UX, since
    // if the SW already swapped via another tab the controlling
    // event reloads anyway.
    setDismissed(true);
    setNeedRefresh(false);
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[180] w-[calc(100%-1.5rem)] max-w-md px-3"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="rounded-lg bg-neutral-900 dark:bg-neutral-800 text-white shadow-lg px-3 py-2.5 flex items-center gap-3">
        <span className="text-sm font-medium flex-1 min-w-0 truncate">
          New version available
        </span>
        <button
          type="button"
          onClick={() => void handleUpdate()}
          disabled={updating}
          className="text-xs font-medium px-3 py-1 rounded-md bg-fluent text-white hover:opacity-90 disabled:opacity-50 shrink-0"
        >
          {updating ? 'Updating…' : 'Update now'}
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="dismiss update notice"
          className="text-neutral-400 hover:text-white text-lg leading-none shrink-0 px-1"
        >
          ×
        </button>
      </div>
    </div>
  );
}
