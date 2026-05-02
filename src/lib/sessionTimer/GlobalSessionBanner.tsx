/**
 * Phase 3 Step 1c — Global session banner.
 *
 * Always-visible thin strip at the top of the app while a session is
 * running or paused. Hidden in idle / ended.
 *
 * Layout (left → right):
 *   [accent dot] [block label] [paused?]
 *   ··· Session 6:32 · [Module] 2:14 [⏸] [end session]
 *
 * The session timer counts up (active practice time), the block
 * timer counts down from the current block's plannedSeconds. The
 * "[Module]" prefix on the block timer wears the block's accent
 * color so the user sees at a glance which block they're on. Both
 * timers freeze while paused.
 *
 * Tapping the body returns the user to the active module's route.
 * Pause / End buttons stop propagation so taps on them don't also
 * navigate.
 */
import { useNavigate } from 'react-router-dom';
import { useSessionTimer, useSessionTimes } from './SessionTimerContext';
import { formatActiveTime } from './formatActiveTime';
import { moduleMetaById } from '../moduleMeta';
import { formatDriftText, shouldShowDrift } from './drift';

export function GlobalSessionBanner() {
  const { state, pauseSession, resumeSession, endSession } = useSessionTimer();
  const times = useSessionTimes();
  const navigate = useNavigate();

  if (state.status !== 'running' && state.status !== 'paused') return null;

  const activeBlock =
    state.currentBlockIndex !== null ? state.blocks[state.currentBlockIndex] : null;
  const blockLabel = activeBlock?.label ?? activeBlock?.moduleRef ?? 'Session';

  // Border-top + dot accent follows the user's location (active
  // module ref) so the banner reads as "the timer is here with
  // you."
  const activeModuleMeta = state.activeModuleRef
    ? moduleMetaById(state.activeModuleRef)
    : undefined;
  const accent = activeModuleMeta?.accentHex ?? '#4a9088';
  const route = activeModuleMeta?.route ?? null;

  // Block timer accent follows the BLOCK's module — independent of
  // navigation. The module name in the block-timer chip wears this
  // color so "what I'm doing right now" stays visually anchored to
  // its own module even when the user steps onto another surface.
  const blockMeta = activeBlock ? moduleMetaById(activeBlock.moduleRef) : undefined;
  const blockAccent = blockMeta?.accentHex ?? accent;
  const blockModuleLabel = blockMeta?.label ?? activeBlock?.moduleRef ?? '';

  // Block countdown — clamps to 0 when the user runs over the
  // planned duration. Soft-block extend pills + hard-block grace
  // are surfaced on the active session screen, not here.
  const blockRemainingMs = activeBlock
    ? Math.max(0, activeBlock.plannedSeconds * 1000 - times.blockActiveMs)
    : 0;

  const isPaused = state.status === 'paused';
  const driftActive = shouldShowDrift(times);

  const handleBannerClick = () => {
    if (route) navigate(route);
  };

  const handleEndClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    endSession();
  };

  const handlePauseResumeClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (state.status === 'running') {
      pauseSession({ reason: 'manual' });
    } else if (state.status === 'paused') {
      resumeSession();
    }
  };

  // Banner z-index sits above Modal's z-[100] so the active session
  // surface remains visible even while a module modal (drill, etc.)
  // is open. Toaster (z-[200]) still wins.
  return (
    <div
      role="region"
      aria-label="active practice session"
      className="sticky top-0 z-[150] w-full border-b border-neutral-200 dark:border-neutral-800 bg-white/95 dark:bg-neutral-900/95 backdrop-blur"
      style={{ borderTopColor: accent, borderTopWidth: 2, borderTopStyle: 'solid' }}
    >
      <div className="flex items-center gap-3 px-4 py-2">
        <button
          type="button"
          onClick={handleBannerClick}
          disabled={!route}
          className="flex-1 flex items-center gap-3 text-left disabled:cursor-default min-w-0"
          aria-label={`return to ${blockLabel}`}
        >
          <span
            aria-hidden
            className={`inline-block w-2 h-2 rounded-full shrink-0 ${isPaused ? '' : 'animate-pulse'}`}
            style={{ backgroundColor: isPaused ? '#a3a3a3' : accent }}
          />
          <span className="flex items-center gap-2 min-w-0 flex-1">
            <span className="text-sm font-medium text-neutral-800 dark:text-neutral-100 truncate">
              {blockLabel}
            </span>
            {isPaused && (
              <span
                className="text-[10px] uppercase tracking-wider text-neutral-500 shrink-0"
                aria-label="session paused"
              >
                paused
              </span>
            )}
          </span>
          <span
            className="ml-auto flex items-center gap-3 shrink-0"
            aria-label="session times"
          >
            <span className="font-mono tabular-nums text-sm text-neutral-700 dark:text-neutral-200">
              <span className="text-[10px] uppercase tracking-wider text-neutral-500 mr-1">
                Session
              </span>
              {formatActiveTime(times.activeMs)}
            </span>
            {activeBlock && (
              <span className="font-mono tabular-nums text-sm text-neutral-700 dark:text-neutral-200">
                <span
                  className="text-[10px] uppercase tracking-wider mr-1"
                  style={{ color: blockAccent }}
                >
                  {blockModuleLabel}
                </span>
                {formatActiveTime(blockRemainingMs)}
              </span>
            )}
          </span>
        </button>
        <button
          type="button"
          onClick={handlePauseResumeClick}
          aria-label={isPaused ? 'resume session' : 'pause session'}
          title={isPaused ? 'resume' : 'pause'}
          className="text-sm leading-none w-7 h-7 inline-flex items-center justify-center rounded-md border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-fluent hover:text-fluent"
        >
          {isPaused ? '▶' : '⏸'}
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
