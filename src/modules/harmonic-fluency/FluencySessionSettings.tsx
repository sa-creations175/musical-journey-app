/**
 * The collapsed settings a drill runs under, plus the plain Start
 * button beside them.
 *
 * LIFTED OUT OF THE MODULE HOME UNCHANGED. The markup and every string
 * are the ones that were there; what moved is that a category page can
 * now show the same panel, so the display mode, the timer and the
 * flagged-only drill are configured the same way wherever a drill is
 * started rather than only on the way through the home.
 */
import type { FluencyPrefs } from './useFluencyPrefs';
import type { SessionStats } from './HarmonicFluencySession';

export default function FluencySessionSettings({
  prefs, flaggedOnly, onFlaggedOnlyChange, flaggedCount,
  onStart, caughtUp, lastSummary, sessionTarget,
}: {
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
    <details className="rounded-2xl border border-black/[0.07] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.07)] backdrop-blur">
      <summary className="cursor-pointer select-none px-4 sm:px-5 py-3 text-sm font-medium">
        Session Settings
      </summary>
      <div className="px-1 pb-1">
        <section className="rounded-2xl border border-black/[0.07] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.07)] backdrop-blur p-4 sm:p-5 space-y-5">
        <div>
          {/* The heading lives on the <summary> now — repeating it
              here would name the panel twice on one screen. */}
          <p className="text-xs text-neutral-500 mt-0.5">
            {sessionTarget} cards per session · spaced repetition picks what's due
          </p>
        </div>

        {/* Display mode */}
        <div>
          <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1.5">display mode</div>
          <div className="inline-flex rounded-lg border border-neutral-200 dark:border-neutral-700 p-0.5 text-xs">
            {([
              { id: 'text', label: 'text only' },
              { id: 'number-grid', label: 'number grid' },
              { id: 'keyboard', label: 'keyboard' },
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
              flagged cards only
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
            Start drill
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
        </section>
      </div>
    </details>
  );
}
