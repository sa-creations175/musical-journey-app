/**
 * Phase 3 Step 1d — Hard pause prompt modal.
 *
 * Fires after 15+ minutes of continuous pause (DRIFT_HARD_PAUSE_MS).
 * Two actions: Resume (clears the pause) or End session (finalizes).
 *
 * Schedules a single setTimeout against state.pausedAt + threshold,
 * so the modal opens on time even when no other render is firing
 * (the 1Hz tick in useSessionTimes is gated on status === 'running').
 *
 * Dismissable via × / Escape / backdrop. If the user dismisses, we
 * suppress the prompt for the current pause segment — re-arms when
 * the user pauses again.
 */
import { useEffect, useState } from 'react';
import Modal from '../../components/Modal';
import { useSessionTimer } from './SessionTimerContext';
import { DRIFT_HARD_PAUSE_MS, shouldShowHardPrompt } from './drift';

export function HardPausePromptModal() {
  const { state, resumeSession, endSession } = useSessionTimer();
  const [open, setOpen] = useState(false);
  const [dismissedForPauseAt, setDismissedForPauseAt] = useState<number | null>(null);

  // Reset dismissal flag whenever a new pause segment starts.
  useEffect(() => {
    setDismissedForPauseAt(null);
    setOpen(false);
  }, [state.pausedAt, state.status]);

  // Schedule the modal to open at the threshold-crossing moment.
  // Cleanup runs on unmount and on any dependency change, so a
  // resume / end / next-pause cleanly cancels the pending fire.
  useEffect(() => {
    if (state.status !== 'paused' || state.pausedAt === null) return;
    if (dismissedForPauseAt === state.pausedAt) return;

    const fireAt = state.pausedAt + DRIFT_HARD_PAUSE_MS;
    const delay = Math.max(0, fireAt - Date.now());

    if (delay === 0 && shouldShowHardPrompt(state, Date.now())) {
      setOpen(true);
      return;
    }

    const t = window.setTimeout(() => setOpen(true), delay);
    return () => window.clearTimeout(t);
  }, [state, dismissedForPauseAt]);

  const handleClose = () => {
    setOpen(false);
    setDismissedForPauseAt(state.pausedAt);
  };

  const handleResume = () => {
    setOpen(false);
    resumeSession();
  };

  const handleEnd = () => {
    setOpen(false);
    endSession();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Still practicing?"
      description="Your session has been paused for 15 minutes."
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={handleEnd}
            className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm"
          >
            end session
          </button>
          <button
            onClick={handleResume}
            data-autofocus
            className="px-4 py-1.5 rounded-md bg-fluent text-white text-sm font-medium hover:opacity-90"
          >
            resume
          </button>
        </div>
      }
    >
      <p className="text-sm text-neutral-600 dark:text-neutral-300">
        We paused tracking when you stepped away. Pick up where you left off, or
        wrap the session here — sessions that sit idle don't count toward your
        practice history.
      </p>
    </Modal>
  );
}
