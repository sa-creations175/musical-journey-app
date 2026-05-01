/**
 * Phase 3 Step 1c — Global session banner.
 *
 * Always-visible thin strip at the top of the app while a session is
 * running or paused. Hidden in idle / ended.
 *
 * Layout:
 *   [accent dot] [block label · live elapsed]                     [End]
 *
 * Tapping the body returns the user to the active module's route.
 * The "End" button is its own click target — tapping End calls
 * endSession() and stops the propagation so it doesn't also navigate.
 *
 * Drift detection text (Step 1d) will overlay on this same surface;
 * for now the banner just shows the running active time.
 */
import { useNavigate } from 'react-router-dom';
import { useSessionTimer, useSessionTimes } from './SessionTimerContext';
import { formatActiveTime } from './formatActiveTime';
import { moduleMetaById } from '../moduleMeta';
import { formatDriftText, shouldShowDrift } from './drift';

export function GlobalSessionBanner() {
  const { state, endSession } = useSessionTimer();
  const times = useSessionTimes();
  const navigate = useNavigate();

  if (state.status !== 'running' && state.status !== 'paused') return null;

  const activeBlock =
    state.currentBlockIndex !== null ? state.blocks[state.currentBlockIndex] : null;
  const blockLabel = activeBlock?.label ?? activeBlock?.moduleRef ?? 'Session';

  const moduleMeta = state.activeModuleRef
    ? moduleMetaById(state.activeModuleRef)
    : undefined;
  const accent = moduleMeta?.accentHex ?? '#4a9088'; // Practice Sessions teal default
  const route = moduleMeta?.route ?? null;

  const isPaused = state.status === 'paused';
  const driftActive = shouldShowDrift(times);

  const handleBannerClick = () => {
    if (route) navigate(route);
  };

  const handleEndClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    endSession();
  };

  return (
    <div
      role="region"
      aria-label="active practice session"
      className="sticky top-0 z-50 w-full border-b border-neutral-200 dark:border-neutral-800 bg-white/95 dark:bg-neutral-900/95 backdrop-blur"
      style={{ borderTopColor: accent, borderTopWidth: 2, borderTopStyle: 'solid' }}
    >
      <div className="flex items-center gap-3 px-4 py-2">
        <button
          type="button"
          onClick={handleBannerClick}
          disabled={!route}
          className="flex-1 flex items-center gap-3 text-left disabled:cursor-default"
          aria-label={`return to ${blockLabel}`}
        >
          <span
            aria-hidden
            className={`inline-block w-2 h-2 rounded-full ${isPaused ? '' : 'animate-pulse'}`}
            style={{ backgroundColor: isPaused ? '#a3a3a3' : accent }}
          />
          <span className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-medium text-neutral-800 dark:text-neutral-100 truncate">
              {blockLabel}
            </span>
            {isPaused && (
              <span
                className="text-[10px] uppercase tracking-wider text-neutral-500"
                aria-label="session paused"
              >
                paused
              </span>
            )}
          </span>
          <span className="ml-auto font-mono tabular-nums text-sm text-neutral-700 dark:text-neutral-200">
            {formatActiveTime(times.activeMs)}
          </span>
        </button>
        <button
          type="button"
          onClick={handleEndClick}
          className="text-xs px-2.5 py-1 rounded-md border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-fluent hover:text-fluent"
        >
          end session
        </button>
      </div>
      {driftActive && (
        <div
          className="px-4 pb-1.5 text-[11px] italic text-neutral-500 dark:text-neutral-400"
          aria-label="session drift"
        >
          {formatDriftText(times)}
        </div>
      )}
    </div>
  );
}
