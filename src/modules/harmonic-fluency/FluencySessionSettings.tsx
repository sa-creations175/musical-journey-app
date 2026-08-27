/**
 * The settings a drill runs under, plus the plain Start button beside
 * them — now in a modal.
 *
 * =====================================================================
 * THE SETTINGS DID NOT CHANGE. WHERE THEY LIVE DID.
 *
 * Every control, every string and every arrangement below is the one
 * that was here. What is gone is the full-width collapsed card they sat
 * in, halfway down the page, spending a band of vertical space on a
 * heading for something the reader opens rarely and closes at once.
 * It is reached from a text link in the streak row instead, and opens
 * over the page rather than pushing it down.
 *
 * OPEN/CLOSE IS THE CALLER'S, not held here. Both pages that show this
 * panel unmount it the moment a drill starts, so a Start pressed inside
 * the modal closes it by the page changing underneath — there is no
 * second closing rule to keep in step with the first.
 * =====================================================================
 */
import Modal from '../../components/Modal';
import type { FluencyPrefs } from './useFluencyPrefs';
import type { SessionStats } from './HarmonicFluencySession';

/**
 * The panel's name, exported so the link that opens it and the modal
 * that is it read from one string rather than two that can drift. Not
 * new copy — it is the word that was on the collapsed card.
 */
export const SESSION_SETTINGS_LABEL = 'Session Settings';

export default function FluencySessionSettings({
  open, onClose, prefs, flaggedOnly, onFlaggedOnlyChange, flaggedCount,
  onStart, caughtUp, lastSummary, sessionTarget,
}: {
  open: boolean;
  onClose: () => void;
  prefs: FluencyPrefs;
  flaggedOnly: boolean;
  onFlaggedOnlyChange: (on: boolean) => void;
  flaggedCount: number;
  onStart: () => void;
  caughtUp: boolean;
  lastSummary: SessionStats | null;
  sessionTarget: number;
}) {
  const { displayMode, setDisplayMode, timerMode, setTimerMode } = prefs;
  return (
    <Modal open={open} onClose={onClose} title={SESSION_SETTINGS_LABEL}>
      <div className="space-y-5" data-testid="fluency-session-settings">
        <div>
          {/* The heading is the modal's own — repeating it here would
              name the panel twice on one screen. */}
          <p className="text-xs text-neutral-500 mt-0.5">
            {sessionTarget} cards per session · spaced repetition picks what's due
          </p>
        </div>

        {/* Display mode */}
        <div>
          <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1.5">display mode</div>
          <div className="inline-flex rounded-lg border border-neutral-200 dark:border-neutral-700 p-0.5 text-xs">
            {([
              { id: 'text', label: 'Text Only' },
              { id: 'number-grid', label: 'Number Grid' },
              { id: 'keyboard', label: 'Keyboard' },
            ] as const).map(opt => (
              <button
                key={opt.id}
                onClick={() => setDisplayMode(opt.id)}
                className={`px-3 py-1.5 rounded-md transition ${
                  displayMode === opt.id
                    ? 'bg-fluent text-white'
                    : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Timer */}
        <div>
          <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1.5">timer per card</div>
          <div className="inline-flex rounded-lg border border-neutral-200 dark:border-neutral-700 p-0.5 text-xs">
            {(['off', '5', '10', '15'] as const).map(opt => (
              <button
                key={opt}
                onClick={() => setTimerMode(opt)}
                className={`px-3 py-1.5 rounded-md transition ${
                  timerMode === opt
                    ? 'bg-fluent text-white'
                    : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100'
                }`}
              >
                {opt === 'off' ? 'off' : `${opt}s`}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-neutral-400 mt-1">
            timer forces answering speed — feedback still stays visible after you answer.
          </p>
        </div>

        {/* Flagged-only */}
        <div>
          <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={flaggedOnly}
              onChange={e => onFlaggedOnlyChange(e.target.checked)}
              disabled={flaggedCount === 0}
              className="h-4 w-4 rounded border-neutral-300 text-fluent focus:ring-fluent"
            />
            <span className={flaggedCount === 0 ? 'text-neutral-400' : ''}>
              Flagged Cards Only
            </span>
            <span className="text-[11px] text-neutral-400">
              {flaggedCount === 0
                ? '(flag a card during a session with ★ to enable)'
                : `· ${flaggedCount} flagged`}
            </span>
          </label>
        </div>

        <div>
          <button
            onClick={onStart}
            className="px-5 py-2.5 rounded-lg bg-fluent text-white text-sm font-medium hover:opacity-90"
          >
            Start Drill
          </button>
          {caughtUp && (
            <p className="mt-3 text-xs text-neutral-500 italic">
              you're all caught up in that selection! everything you've seen is scheduled further out — come back tomorrow for more reviews, or widen the categories to pick up new material.
            </p>
          )}
          {lastSummary && (
            <p className="mt-3 text-xs text-neutral-500">
              last session: <span className="font-mono text-fluent">{lastSummary.correct}/{lastSummary.total}</span> correct
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
