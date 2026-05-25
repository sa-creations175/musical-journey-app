/**
 * Deferred-review prompt (defer-a-block feature).
 *
 * Shown by ActiveSessionScreen once the active block queue is exhausted
 * but the user deferred one or more blocks earlier (state.deferredBlocks
 * non-empty, currentBlockIndex null, session still running/paused). It's
 * the last gate before the end-of-session summary.
 *
 * Per deferred block: "Do it now" (re-runs it as the current block via
 * the normal prep → drill → rating flow) or "Skip" (records it skipped).
 * "End session" at the bottom skips all remaining and ends.
 *
 * Self-contained — reads deferredBlocks + the defer actions straight off
 * the session-timer context, so ActiveSessionScreen just renders it.
 */
import { useSessionTimer } from '../../lib/sessionTimer/SessionTimerContext';
import { moduleMetaById } from '../../lib/moduleMeta';

export default function DeferredReviewPrompt() {
  const { state, resumeDeferredBlock, skipDeferredBlock, endDeferredReview } =
    useSessionTimer();
  const deferred = state.deferredBlocks;

  return (
    <div className="max-w-xl mx-auto px-4 py-6 space-y-4">
      <header className="space-y-1">
        <h1 className="text-lg font-semibold text-neutral-800 dark:text-neutral-100">
          Before you finish — you deferred these
        </h1>
        <p className="text-sm text-neutral-500">
          Do them now while you're here, or skip them for this session.
        </p>
      </header>

      <ul className="space-y-3">
        {deferred.map(block => {
          const meta = moduleMetaById(block.moduleRef);
          const moduleLabel = meta?.label ?? block.moduleRef;
          const accent = meta?.accentHex ?? '#4a9088';
          return (
            <li
              key={block.id}
              className="rounded-lg border border-black/[0.07] p-3 space-y-2"
              style={{ borderLeftColor: accent, borderLeftWidth: 3 }}
            >
              <div className="space-y-0.5">
                <span
                  className="text-[10px] uppercase tracking-wider"
                  style={{ color: accent }}
                >
                  {moduleLabel}
                </span>
                {block.label && (
                  <p className="text-sm text-neutral-700 dark:text-neutral-200">
                    {block.label}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => resumeDeferredBlock(block.id)}
                  className="px-3 py-1.5 rounded-md bg-fluent text-white text-xs font-medium hover:opacity-90"
                >
                  Do it now
                </button>
                <button
                  type="button"
                  onClick={() => skipDeferredBlock(block.id)}
                  className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 text-xs font-medium hover:border-needswork hover:text-needswork"
                >
                  Skip
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={endDeferredReview}
        className="w-full px-3 py-3 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm font-medium text-neutral-600 dark:text-neutral-300 hover:border-fluent hover:text-fluent"
      >
        End session
      </button>
    </div>
  );
}
