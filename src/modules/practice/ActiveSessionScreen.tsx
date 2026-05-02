/**
 * Phase 3 Step 5a — Active session execution screen.
 *
 * One block at a time, full-screen focus. Reads from the global
 * timer; doesn't start sessions itself (proposal acceptance does
 * that, supplying the block list). Subsequent substeps add:
 *
 *   5b — soft-block extend buttons + hard-block auto-advance
 *   5c — Flying / Cruising / Crawling rating at block end
 *   5d — between-blocks "Ready for next?" screen
 *
 * activeModuleRef wiring (per the 1b design call, model b):
 *
 *   - While on this screen, activeModuleRef = 'practice-sessions'
 *     so the auto-pause hook keeps the timer running.
 *   - On quick-launch tap, set activeModuleRef = block.moduleRef
 *     before navigating, so the timer stays running once the user
 *     lands in the module.
 *   - On return to this screen, the on-mount effect resets
 *     activeModuleRef = 'practice-sessions'.
 *
 * No-session redirect: when status flips to 'idle' (no session, or
 * post-reset() after end-of-session), we route back to the Practice
 * Sessions home so the user doesn't sit on a dead screen. 'ended'
 * keeps them here so Step 6 (end-of-session summary) can take over.
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { moduleMetaById } from '../../lib/moduleMeta';
import {
  useSessionTimer,
  useSessionTimes,
} from '../../lib/sessionTimer/SessionTimerContext';
import { formatActiveTime } from '../../lib/sessionTimer/formatActiveTime';

const PRACTICE_SESSIONS_REF = 'practice-sessions';
const PRACTICE_SESSIONS_HOME_ROUTE = '/practice-sessions';

export default function ActiveSessionScreen() {
  const navigate = useNavigate();
  const { state, setActiveModuleRef, advanceBlock } = useSessionTimer();
  const times = useSessionTimes();

  // Model (b) — while this screen is mounted, activeModuleRef
  // mirrors the practice-sessions module so auto-pause-on-navigation
  // doesn't fire on /practice-sessions/active.
  useEffect(() => {
    if (state.status === 'idle' || state.status === 'ended') return;
    if (state.activeModuleRef !== PRACTICE_SESSIONS_REF) {
      setActiveModuleRef(PRACTICE_SESSIONS_REF);
    }
  }, [state.status, state.activeModuleRef, setActiveModuleRef]);

  // Bounce off the screen when there's no session — sits at idle on
  // initial load, or after the user resets via the end-of-session
  // summary's Done button (Step 6k).
  useEffect(() => {
    if (state.status === 'idle') {
      navigate(PRACTICE_SESSIONS_HOME_ROUTE, { replace: true });
    }
  }, [state.status, navigate]);

  if (state.status === 'idle') return null;

  const currentBlock =
    state.currentBlockIndex !== null
      ? state.blocks[state.currentBlockIndex]
      : null;
  if (!currentBlock) return null;

  const moduleMeta = moduleMetaById(currentBlock.moduleRef);
  const moduleLabel = moduleMeta?.label ?? currentBlock.moduleRef;
  const accent = moduleMeta?.accentHex ?? '#4a9088';
  const route = moduleMeta?.route ?? null;

  const elapsedSec = Math.floor(times.blockActiveMs / 1000);
  const remainingSec = Math.max(0, currentBlock.plannedSeconds - elapsedSec);
  const isEnded = state.status === 'ended';

  const handleQuickLaunch = () => {
    if (!route) return;
    // Set activeRef BEFORE navigating so the auto-pause hook sees a
    // matching ref on the destination route.
    setActiveModuleRef(currentBlock.moduleRef);
    navigate(route);
  };

  // 5c will replace this with a rating prompt before advancing;
  // 5a's "End this activity" goes straight to advanceBlock.
  const handleEndActivity = () => {
    advanceBlock({ markStatus: 'completed' });
  };

  // Step 6 will own the end-of-session summary surface; for now
  // status === 'ended' shows a quiet placeholder so the user knows
  // the session has wrapped.
  if (isEnded) {
    return (
      <div className="max-w-xl mx-auto px-4 py-10 text-center space-y-3">
        <h2 className="text-lg font-medium">Session complete</h2>
        <p className="text-sm text-neutral-500">
          End-of-session summary lands in a later release. For now,
          tap below to return to Practice Sessions.
        </p>
        <button
          type="button"
          onClick={() => navigate(PRACTICE_SESSIONS_HOME_ROUTE)}
          className="px-4 py-2 rounded-md bg-fluent text-white text-sm font-medium hover:opacity-90"
        >
          done
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-6 space-y-4">
      <div className="text-center text-[11px] uppercase tracking-wider text-neutral-500">
        Block {(state.currentBlockIndex ?? 0) + 1} of {state.blocks.length}
      </div>

      <section
        className="rounded-lg border p-5 sm:p-6 space-y-5"
        style={{
          backgroundColor: `${accent}14`,
          borderColor: accent,
          borderLeftWidth: 3,
        }}
      >
        <header className="space-y-1">
          <div
            className="text-[11px] uppercase tracking-wider font-medium"
            style={{ color: accent }}
          >
            {moduleLabel}
          </div>
          <h2 className="text-lg font-medium text-neutral-800 dark:text-neutral-100">
            {currentBlock.label ?? currentBlock.moduleRef}
          </h2>
        </header>

        <div className="text-center py-3">
          <div className="font-mono tabular-nums text-6xl text-neutral-800 dark:text-neutral-100">
            {formatActiveTime(remainingSec * 1000)}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-neutral-500 mt-1">
            remaining
          </div>
        </div>

        {route && (
          <button
            type="button"
            onClick={handleQuickLaunch}
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border text-sm font-medium hover:opacity-90"
            style={{ color: accent, borderColor: accent }}
          >
            <span aria-hidden>↗</span>
            <span>open {moduleLabel}</span>
          </button>
        )}
      </section>

      <button
        type="button"
        onClick={handleEndActivity}
        className="w-full px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm font-medium hover:border-fluent hover:text-fluent"
      >
        end this activity
      </button>
    </div>
  );
}
