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
 *   - Soft (default): on countdown reaching 0, extend pills appear
 *     (+2 / +5 / +10 min). User taps End manually to move on.
 *   - Hard (opt-in): on countdown reaching 0, a 5-second grace
 *     auto-advances. User can interrupt by extending or ending.
 *
 * Rating phase (5c):
 *   - User taps End → screen pauses the timer + transitions to a
 *     rating phase showing three vertically-stacked buttons
 *     (Flying / Cruising / Crawling). Always optional — Next can
 *     fire with no rating selected (missed ratings will batch at
 *     session end in Step 6e).
 *   - On Next, the timer resumes and advanceBlock dispatches with
 *     the chosen rating. The advance auto-ends the session if this
 *     was the last block.
 *   - Hard-block grace bypasses the rating phase for now — quick-
 *     tap-during-grace integration is a future refinement once the
 *     UX has been exercised in real use.
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

export const HARD_BLOCK_GRACE_MS = 5000;
const EXTEND_OPTIONS_MIN: ReadonlyArray<number> = [2, 5, 10];

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

interface Props {
  /** Hard-block mode: auto-advance after a 5-second grace once the
   *  countdown reaches 0. Defaults to soft. */
  hardBlock?: boolean;
}

export default function ActiveSessionScreen({ hardBlock = false }: Props = {}) {
  const navigate = useNavigate();
  const {
    state,
    setActiveModuleRef,
    advanceBlock,
    endSession,
    pauseSession,
    resumeSession,
  } = useSessionTimer();
  const times = useSessionTimes();

  const [phase, setPhase] = useState<Phase>('running');
  const [pendingRating, setPendingRating] = useState<PerformanceRating | null>(null);
  const [extensionSeconds, setExtensionSeconds] = useState(0);
  const [hardGraceStart, setHardGraceStart] = useState<number | null>(null);

  // Reset all per-block state when the current block changes — fresh
  // block, fresh extension bank + grace + rating draft.
  useEffect(() => {
    setPhase('running');
    setPendingRating(null);
    setExtensionSeconds(0);
    setHardGraceStart(null);
  }, [state.currentBlockIndex]);

  // Model (b) — keep activeModuleRef tracking the practice-sessions
  // surface while we're on this screen.
  useEffect(() => {
    if (state.status === 'idle' || state.status === 'ended') return;
    if (state.activeModuleRef !== PRACTICE_SESSIONS_REF) {
      setActiveModuleRef(PRACTICE_SESSIONS_REF);
    }
  }, [state.status, state.activeModuleRef, setActiveModuleRef]);

  // Bounce off the screen when there's no session.
  useEffect(() => {
    if (state.status === 'idle') {
      navigate(PRACTICE_SESSIONS_HOME_ROUTE, { replace: true });
    }
  }, [state.status, navigate]);

  // Hard-block grace — schedule auto-advance once it starts. Cleanup
  // cancels the timeout if the user extends or ends manually.
  useEffect(() => {
    if (hardGraceStart === null) return;
    const id = window.setTimeout(() => {
      advanceBlock({ markStatus: 'completed' });
    }, HARD_BLOCK_GRACE_MS);
    return () => window.clearTimeout(id);
  }, [hardGraceStart, advanceBlock]);

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
  const totalSec = currentBlock.plannedSeconds + extensionSeconds;
  const remainingSec = Math.max(0, totalSec - elapsedSec);
  const isOvertime = elapsedSec >= totalSec;
  const isEnded = state.status === 'ended';

  // Start the hard-block grace at the moment we cross the 0-mark.
  // Idempotent: subsequent ticks see hardGraceStart already set.
  if (
    hardBlock &&
    isOvertime &&
    !isEnded &&
    phase === 'running' &&
    hardGraceStart === null
  ) {
    queueMicrotask(() => setHardGraceStart(Date.now()));
  }

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

  const handleExtend = (mins: number) => {
    setExtensionSeconds(s => s + mins * 60);
    setHardGraceStart(null);
  };

  const handleRatingNext = () => {
    resumeSession();
    advanceBlock({
      rating: pendingRating ?? undefined,
      markStatus: 'completed',
    });
  };

  const handleEndSessionEarly = () => {
    resumeSession();
    endSession({
      rating: pendingRating ?? undefined,
      markStatus: 'completed',
    });
  };

  const graceRemainingSec =
    hardGraceStart !== null
      ? Math.max(
          0,
          Math.ceil((HARD_BLOCK_GRACE_MS - (Date.now() - hardGraceStart)) / 1000),
        )
      : null;

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

        {isOvertime && (
          <div className="flex items-center justify-center gap-1.5">
            {EXTEND_OPTIONS_MIN.map(m => (
              <button
                key={m}
                type="button"
                onClick={() => handleExtend(m)}
                className="px-3 py-1 rounded-md border text-xs font-medium hover:opacity-90"
                style={{ color: accent, borderColor: accent }}
              >
                +{m} min
              </button>
            ))}
          </div>
        )}

        {hardBlock && graceRemainingSec !== null && (
          <p className="text-center text-[11px] italic text-neutral-500">
            auto-advancing in {graceRemainingSec}s · tap an extend pill or
            end manually to interrupt
          </p>
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
