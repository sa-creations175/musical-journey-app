/**
 * Phase 3 — Global block expiry modal.
 *
 * Mounts in Layout. Pops up on top of whatever route the user is on
 * the moment the current block's countdown crosses 0. Replaces the
 * inline soft-block extend pills + hard-block grace banner that used
 * to live only on the active session screen.
 *
 * Why global:
 *   The proposal-acceptance flow auto-navigates the user into the
 *   block's module (e.g. /harmonic-fluency). The active session
 *   screen isn't mounted there, so its inline expiry UI never fires.
 *
 * Soft-block (default):
 *   Modal stays open until the user extends or taps "Next block".
 *   Extending bumps the current block's extensionSeconds (reducer
 *   state) and dismisses the modal — banner countdown picks up the
 *   new total immediately.
 *
 * Hard-block:
 *   Same UI, plus a 5-second grace clock. If the user doesn't
 *   interact, advanceBlock fires automatically. Tapping any extend
 *   pill cancels the grace; tapping Next bypasses the grace
 *   immediately.
 *
 * "Next block" handoff:
 *   The active session screen owns the rating phase. The modal
 *   dispatches request-block-end (reducer flag) and navigates to
 *   /practice-sessions/active; the active session screen reactively
 *   picks up the flag, transitions to its rating phase, and clears
 *   the flag via consumeBlockEndRequest.
 *
 *   For the last block, the modal doesn't need a hand-off: tapping
 *   "Finish session" just dispatches advanceBlock, which auto-ends
 *   the session.
 *
 * Z-index: z-[160] sits above the global banner (z-[150]) and the
 * shared Modal (z-[100]) so module-level modals don't visually mask
 * the expiry prompt. Toaster (z-[200]) still wins.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { moduleMetaById } from '../moduleMeta';
import { useSessionTimer, useSessionTimes } from './SessionTimerContext';

const PRACTICE_SESSIONS_ACTIVE_ROUTE = '/practice-sessions/active';
const HARD_BLOCK_GRACE_MS = 5000;
const EXTEND_OPTIONS_MIN: ReadonlyArray<number> = [1, 2, 5, 10];

export function BlockExpiryModal() {
  const navigate = useNavigate();
  const {
    state,
    extendCurrentBlock,
    advanceBlock,
    requestBlockEnd,
    completeDrill,
  } = useSessionTimer();
  const times = useSessionTimes();

  const currentBlock =
    state.currentBlockIndex !== null ? state.blocks[state.currentBlockIndex] : null;

  // Prep-flow: the DRILL timer is the countdown — not whole-block
  // active time. Prep/rating time never trips this, and a slow prep
  // can't fire the modal mid-setup.
  const drillTotalMs = currentBlock
    ? (currentBlock.adjustedDrillSeconds + currentBlock.extensionSeconds) * 1000
    : 0;
  const isOvertime =
    !!currentBlock &&
    times.blockPhase === 'drill' &&
    drillTotalMs > 0 &&
    times.drillRemainingMs <= 0;

  // Open exactly when a running session's drill timer has crossed 0.
  // Paused sessions don't fire — the user hit pause for a reason and
  // we shouldn't ambush them with a modal.
  const open = !!currentBlock && state.status === 'running' && isOvertime;

  // -----------------------------------------------------------------
  // Hard-block grace. Anchored to a per-open epoch so re-firing on a
  // fresh expiry (after extending and crossing 0 again) works.
  // -----------------------------------------------------------------
  const [graceStart, setGraceStart] = useState<number | null>(null);

  useEffect(() => {
    if (!open) {
      setGraceStart(null);
      return;
    }
    if (!state.hardBlock) return;
    setGraceStart(prev => prev ?? Date.now());
  }, [open, state.hardBlock]);

  const [graceTick, setGraceTick] = useState(0);
  useEffect(() => {
    if (graceStart === null) return;
    const id = window.setInterval(
      () => setGraceTick(t => (t + 1) & 0x7fffffff),
      250,
    );
    return () => window.clearInterval(id);
  }, [graceStart]);

  const graceRemainingSec = useMemo(() => {
    if (graceStart === null) return null;
    const elapsed = Date.now() - graceStart;
    return Math.max(0, Math.ceil((HARD_BLOCK_GRACE_MS - elapsed) / 1000));
  }, [graceStart, graceTick]);

  // Auto-advance once the grace window elapses. Guard with a ref so
  // the timer fires once even if React re-renders mid-grace.
  const advancedRef = useRef(false);
  useEffect(() => {
    if (!open) {
      advancedRef.current = false;
      return;
    }
    if (graceStart === null) return;
    const elapsed = Date.now() - graceStart;
    const remaining = HARD_BLOCK_GRACE_MS - elapsed;
    if (remaining <= 0) {
      if (!advancedRef.current) {
        advancedRef.current = true;
        handleAdvance();
      }
      return;
    }
    const id = window.setTimeout(() => {
      if (!advancedRef.current) {
        advancedRef.current = true;
        handleAdvance();
      }
    }, remaining);
    return () => window.clearTimeout(id);
    // handleAdvance intentionally not in deps — its identity changes
    // every render and we only want to schedule the auto-advance once
    // per grace window.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graceStart, open]);

  // -----------------------------------------------------------------
  // Lock background scroll while the modal is up. Don't block Escape
  // / backdrop click — the user must explicitly choose extend or next.
  // -----------------------------------------------------------------
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !currentBlock) return null;

  const meta = moduleMetaById(currentBlock.moduleRef);
  const moduleLabel = meta?.label ?? currentBlock.moduleRef;
  const accent = meta?.accentHex ?? '#4a9088';

  const isLastBlock =
    state.currentBlockIndex !== null &&
    state.currentBlockIndex >= state.blocks.length - 1;

  function handleExtend(mins: number) {
    extendCurrentBlock(mins);
    setGraceStart(null);
    advancedRef.current = false;
  }

  function handleAdvance() {
    advancedRef.current = true;
    if (isLastBlock) {
      // No hand-off — last block auto-ends the session in advanceBlock,
      // whose finalize folds the (over)drill time into drillMs.
      advanceBlock({ markStatus: 'completed' });
      return;
    }
    // Finalize the drill into the rating phase before the hand-off so
    // drillMs captures the actual (possibly overtime) drill, matching
    // the manual "end this activity" path. complete-drill runs while
    // still running; request-block-end then pauses + flags the
    // rating hand-off for the active-session screen.
    completeDrill();
    requestBlockEnd();
    navigate(PRACTICE_SESSIONS_ACTIVE_ROUTE);
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[160] flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="block time's up"
    >
      <div
        className="bg-white dark:bg-neutral-900 rounded-card border shadow-xl w-full max-w-md flex flex-col overflow-hidden"
        style={{ borderColor: accent, borderLeftWidth: 3 }}
      >
        <header className="px-5 py-4 border-b border-neutral-200 dark:border-neutral-800">
          <div
            className="text-[11px] uppercase tracking-wider font-medium mb-1"
            style={{ color: accent }}
          >
            {moduleLabel}
          </div>
          <h3 className="text-lg font-medium text-neutral-800 dark:text-neutral-100">
            Block time’s up
          </h3>
        </header>

        <div className="px-5 py-4 space-y-4">
          <p className="text-sm text-neutral-700 dark:text-neutral-200">
            <span className="font-medium">{moduleLabel}</span> block is
            complete. Extend or move on?
          </p>

          <div className="flex items-center gap-2">
            {EXTEND_OPTIONS_MIN.map(m => (
              <button
                key={m}
                type="button"
                onClick={() => handleExtend(m)}
                className="flex-1 px-3 py-2 rounded-md border text-sm font-medium hover:opacity-90"
                style={{ color: accent, borderColor: accent }}
              >
                +{m} min
              </button>
            ))}
          </div>

          {state.hardBlock && graceRemainingSec !== null && (
            <p
              className="text-center text-[11px] italic text-neutral-500"
              aria-live="polite"
            >
              auto-advancing in {graceRemainingSec}s · tap an extend pill
              or "{isLastBlock ? 'finish session' : 'next block'}" to
              skip the wait
            </p>
          )}
        </div>

        <footer className="px-5 py-3 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-end">
          <button
            type="button"
            onClick={handleAdvance}
            data-autofocus
            className="px-4 py-2 rounded-md bg-fluent text-white text-sm font-medium hover:opacity-90"
          >
            {isLastBlock ? 'finish session' : 'next block'}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
