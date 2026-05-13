/**
 * Phase 3 Step 5a–5d — Active session execution screen.
 *
 * One block at a time, full-screen focus. Reads from the global
 * timer; doesn't start sessions itself (proposal acceptance does
 * that, supplying the block list).
 *
 * Between-blocks (5c rating + 5d preview) share one surface: rating
 * buttons at top, a "you just completed X" line, a preview of the
 * next block, then Start to advance. Last block swaps Start for a
 * Finish button. An "end session early" link sits below for any
 * block.
 *
 * activeModuleRef wiring (per the 1b design call, model b):
 *   - While on this screen, activeModuleRef = 'practice-sessions'.
 *   - On quick-launch, set activeModuleRef = block.moduleRef
 *     before navigating.
 *   - On return, the on-mount effect resets to 'practice-sessions'.
 *
 * Soft-block vs hard-block (5b):
 *   - Soft (default): on countdown reaching 0, the global
 *     BlockExpiryModal pops up with extend pills (+1 / +2 / +5 / +10 min)
 *     and a "Next block" button. The modal handles all expiry UX so
 *     it works regardless of which route the user is on.
 *   - Hard (opt-in): same modal, plus a 5s auto-advance grace if the
 *     user doesn't interact.
 *
 * Rating phase (5c):
 *   - User taps "end this activity" → screen pauses the timer +
 *     transitions to a rating phase showing three vertically-stacked
 *     buttons (Flying / Cruising / Crawling). Always optional —
 *     Next can fire with no rating selected (missed ratings batch at
 *     session end in Step 6e).
 *   - User can also reach the rating phase via the global expiry
 *     modal's "Next block" button: that dispatches request-block-end,
 *     navigates here, and a reactive effect transitions phase to
 *     rating + clears the flag.
 *   - On Next, the timer resumes and advanceBlock dispatches with
 *     the chosen rating. The advance auto-ends the session if this
 *     was the last block.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { moduleMetaById } from '../../lib/moduleMeta';
import {
  useSessionTimer,
  useSessionTimes,
} from '../../lib/sessionTimer/SessionTimerContext';
import { formatActiveTime } from '../../lib/sessionTimer/formatActiveTime';
import type { PerformanceRating } from '../../lib/sessionTimer/types';
import EndOfSessionSummary from './EndOfSessionSummary';

const PRACTICE_SESSIONS_REF = 'practice-sessions';
const PRACTICE_SESSIONS_HOME_ROUTE = '/practice-sessions';

type Phase = 'running' | 'rating';

interface RatingOption {
  value: PerformanceRating;
  label: string;
  /** Tailwind classes for the button's accent. Per design: warm /
   *  neutral / cool, not red. */
  activeClass: string;
  inactiveClass: string;
}

const RATING_OPTIONS: ReadonlyArray<RatingOption> = [
  {
    value: 'flying',
    label: 'Flying',
    activeClass: 'bg-amber-500 text-white border-amber-500',
    inactiveClass:
      'border-amber-500/40 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10',
  },
  {
    value: 'cruising',
    label: 'Cruising',
    activeClass: 'bg-neutral-500 text-white border-neutral-500',
    inactiveClass:
      'border-neutral-400 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-500/10',
  },
  {
    value: 'crawling',
    label: 'Crawling',
    activeClass: 'bg-teal-600 text-white border-teal-600',
    inactiveClass:
      'border-teal-600/40 text-teal-700 dark:text-teal-400 hover:bg-teal-600/10',
  },
];

export default function ActiveSessionScreen() {
  const navigate = useNavigate();
  const {
    state,
    setActiveModuleRef,
    advanceBlock,
    endSession,
    pauseSession,
    resumeSession,
    consumeBlockEndRequest,
  } = useSessionTimer();
  const times = useSessionTimes();

  const [phase, setPhase] = useState<Phase>('running');
  const [pendingRating, setPendingRating] = useState<PerformanceRating | null>(null);

  // Reset per-block UI state on block change.
  useEffect(() => {
    setPhase('running');
    setPendingRating(null);
  }, [state.currentBlockIndex]);

  // Cross-screen handoff from the global BlockExpiryModal: when the
  // user taps "Next block" there, the modal dispatches
  // request-block-end (which atomically pauses with reason 'manual'
  // in the reducer) + navigates here. Pick the flag up reactively,
  // flip phase to rating, consume the flag.
  useEffect(() => {
    if (!state.blockEndRequested) return;
    setPhase('rating');
    consumeBlockEndRequest();
  }, [state.blockEndRequested, consumeBlockEndRequest]);

  // Model (b) — set activeModuleRef = 'practice-sessions' once on
  // mount. The dep array is intentionally empty: re-firing on every
  // state.activeModuleRef change would clobber the explicit update
  // that handleQuickLaunch / handleRatingNext make right before
  // navigating away to the next block's module.
  //
  // The auto-pause hook in Layout reads activeModuleRef + pathname
  // to decide pause/resume; setting it here once is enough because
  // any subsequent change is intentional (caused by an outbound
  // navigation, with the new value matching the new route).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (state.status === 'idle' || state.status === 'ended') return;
    if (state.activeModuleRef !== PRACTICE_SESSIONS_REF) {
      setActiveModuleRef(PRACTICE_SESSIONS_REF);
    }
  }, []);

  // Bounce off the screen when there's no session.
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
  // Per-block route override (set by sessionGenerator for blocks that
  // need a deeper destination than moduleMeta.route — currently
  // Production Vocab → /production?view=vocabulary). Falls back to
  // the module's default route.
  const route = currentBlock.quickLaunchRoute ?? moduleMeta?.route ?? null;

  const elapsedSec = Math.floor(times.blockActiveMs / 1000);
  const totalSec = currentBlock.plannedSeconds + currentBlock.extensionSeconds;
  const remainingSec = Math.max(0, totalSec - elapsedSec);
  const isOvertime = elapsedSec >= totalSec;
  const isEnded = state.status === 'ended';

  const handleQuickLaunch = () => {
    if (!route) return;
    setActiveModuleRef(currentBlock.moduleRef);
    navigate(route);
  };

  // 5c — End now transitions to the rating phase rather than
  // advancing immediately. Pause keeps activeMs honest while the
  // user takes their time choosing a rating.
  const handleEndActivity = () => {
    pauseSession({ reason: 'manual' });
    setPhase('rating');
  };

  const handleRatingNext = () => {
    const isLast =
      state.currentBlockIndex !== null &&
      state.currentBlockIndex >= state.blocks.length - 1;
    const nextBlock =
      !isLast && state.currentBlockIndex !== null
        ? state.blocks[state.currentBlockIndex + 1]
        : null;
    const nextMeta = nextBlock ? moduleMetaById(nextBlock.moduleRef) : null;

    resumeSession();
    advanceBlock({
      rating: pendingRating ?? undefined,
      markStatus: 'completed',
    });

    // Auto-navigate into the next block's module, mirroring the
    // session-start flow (PracticeSessions.handleProposalAccept).
    // The active session screen is the between-blocks surface; the
    // module is where the user actually practices.
    const nextRoute = nextBlock?.quickLaunchRoute ?? nextMeta?.route ?? null;
    if (nextBlock && nextRoute) {
      setActiveModuleRef(nextBlock.moduleRef);
      navigate(nextRoute);
    }
    // For the last block, advanceBlock auto-ends the session. Stay
    // on this screen so the 'ended'-status branch renders the
    // EndOfSessionSummary.
  };

  const handleEndSessionEarly = () => {
    resumeSession();
    endSession({
      rating: pendingRating ?? undefined,
      markStatus: 'completed',
    });
  };

  if (isEnded) {
    return <EndOfSessionSummary />;
  }

  // -------------------------------------------------------------
  // Between-blocks phase (5c rating + 5d preview).
  // -------------------------------------------------------------
  if (phase === 'rating') {
    const isLastBlock =
      state.currentBlockIndex === state.blocks.length - 1;
    const nextBlock = !isLastBlock
      ? state.blocks[state.currentBlockIndex! + 1]
      : null;
    const nextMeta = nextBlock ? moduleMetaById(nextBlock.moduleRef) : null;
    const nextAccent = nextMeta?.accentHex ?? '#4a9088';
    const nextLabel = nextMeta?.label ?? nextBlock?.moduleRef ?? '';

    return (
      <div className="max-w-xl mx-auto px-4 py-6 space-y-4">
        <div className="text-center text-[11px] uppercase tracking-wider text-neutral-500">
          Block {(state.currentBlockIndex ?? 0) + 1} of {state.blocks.length}
        </div>

        <section
          className="rounded-lg border p-5 sm:p-6 space-y-5"
          style={{ borderColor: accent, backgroundColor: `${accent}0a`, borderLeftWidth: 3 }}
        >
          <div className="text-center space-y-1">
            <div
              className="text-[11px] uppercase tracking-wider font-medium"
              style={{ color: accent }}
            >
              {moduleLabel}
            </div>
            <h2 className="text-base font-medium">
              How did{' '}
              <span className="text-neutral-700 dark:text-neutral-200">
                {currentBlock.label ?? currentBlock.moduleRef}
              </span>{' '}
              go?
            </h2>
            <p className="text-[11px] text-neutral-500">
              Optional — tap one or skip with the button below.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            {RATING_OPTIONS.map(opt => {
              const active = pendingRating === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPendingRating(active ? null : opt.value)}
                  aria-pressed={active}
                  className={`w-full px-3 py-3 rounded-md border text-sm font-medium transition-colors ${
                    active ? opt.activeClass : opt.inactiveClass
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* 5d preview — next-block card OR last-block close-out copy. */}
        {nextBlock ? (
          <section
            className="rounded-lg border p-3 space-y-1.5"
            style={{ borderColor: nextAccent, borderLeftWidth: 3 }}
          >
            <div
              className="text-[10px] uppercase tracking-wider font-medium"
              style={{ color: nextAccent }}
            >
              Up next · {nextLabel}
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <div className="text-sm font-medium text-neutral-800 dark:text-neutral-100 truncate">
                {nextBlock.label ?? nextBlock.moduleRef}
              </div>
              <div className="font-mono tabular-nums text-xs text-neutral-500 shrink-0">
                {formatActiveTime(nextBlock.plannedSeconds * 1000)}
              </div>
            </div>
          </section>
        ) : (
          <section className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3 text-center">
            <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-0.5">
              Final block
            </div>
            <p className="text-sm text-neutral-700 dark:text-neutral-200">
              You're at the last block. Finish to wrap the session.
            </p>
          </section>
        )}

        <button
          type="button"
          onClick={handleRatingNext}
          className="w-full px-3 py-2 rounded-md bg-fluent text-white text-sm font-medium hover:opacity-90"
        >
          {nextBlock ? 'start next' : 'finish session'}
        </button>

        <div className="text-center">
          <button
            type="button"
            onClick={handleEndSessionEarly}
            className="text-[11px] text-neutral-500 hover:text-fluent underline-offset-2 hover:underline"
          >
            end session early
          </button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // Running phase
  // -------------------------------------------------------------
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
          <div
            className="font-mono tabular-nums text-6xl"
            style={{ color: isOvertime ? accent : undefined }}
          >
            {formatActiveTime(remainingSec * 1000)}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-neutral-500 mt-1">
            {isOvertime ? 'time’s up' : 'remaining'}
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
