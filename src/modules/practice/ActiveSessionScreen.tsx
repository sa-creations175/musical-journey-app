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
import ConfirmDialog from '../../components/ConfirmDialog';
import MetronomeControl from '../../components/MetronomeControl';
import { buildPrepItemBreakdown } from './prepItemBreakdown';
import { canExtendBlock } from './blockExtendEligibility';
import InSessionDrillRunner from './InSessionDrillRunner';
import { isScaleRunnerBlock } from './inSessionScaleRunner';

const PRACTICE_SESSIONS_REF = 'practice-sessions';
const PRACTICE_SESSIONS_HOME_ROUTE = '/practice-sessions';

// Prep-screen time-adjustment pills. Deltas in seconds; the reducer
// clamps the result to [30s, plannedSeconds * 2].
const DRILL_ADJUST_OPTIONS: ReadonlyArray<{ label: string; deltaSec: number }> = [
  { label: '+30s', deltaSec: 30 },
  { label: '+1 min', deltaSec: 60 },
  { label: '+2 min', deltaSec: 120 },
  { label: '+5 min', deltaSec: 300 },
  { label: '−30s', deltaSec: -30 },
];

// Rating-screen extend pills — absolute re-drill lengths ("drill again
// for exactly this long"). No −30s here (that only adjusts the planned
// total on the prep screen). ScalesDrillModal keeps its own matching
// copy for the per-item rating extend.
const EXTEND_DRILL_OPTIONS: ReadonlyArray<{ label: string; seconds: number }> = [
  { label: '+30s', seconds: 30 },
  { label: '+1 min', seconds: 60 },
  { label: '+2 min', seconds: 120 },
  { label: '+5 min', seconds: 300 },
];

// prep   — configure BPM/style + drill duration, then tap Ready.
// running— active drill; the drill timer counts down.
// rating — Flying / Cruising / Crawling + next-block preview.
type Phase = 'prep' | 'running' | 'rating';

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
    reset,
    startDrill,
    completeDrill,
    adjustDrillTime,
    extendDrill,
  } = useSessionTimer();
  const times = useSessionTimes();

  // `launched` covers the Ready → reach-the-drill window: the reducer
  // block phase is still `prep` (drill timer idle) but the UI should
  // show the launch/running view. Everything else derives from the
  // reducer phase, so a remount (drill ends on the module page → we
  // return here for rating) restores the right screen with no effects
  // fighting over local state.
  const [launched, setLaunched] = useState(false);
  const [pendingRating, setPendingRating] = useState<PerformanceRating | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  // True while the in-session drill runner (Level 3) is walking the
  // block's cells over this screen, instead of having navigated to the
  // module.
  const [runnerActive, setRunnerActive] = useState(false);

  // Note: `launched` + `pendingRating` are reset directly in the
  // advance handlers (handleRatingNext / handleSkipBlock) rather than
  // via a block-change effect — a same-block remount (drill ends on
  // the module page → we return here for rating) re-inits these from
  // useState defaults, and only advancing into a NEW block needs the
  // explicit reset.

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

  // Bounce off the screen when there's no session — UNLESS one is
  // armed (pendingStart). The prep-flow lands here first; the Layout
  // start hook fires startSession on this route, flipping idle →
  // running within a frame, so we wait rather than bounce.
  useEffect(() => {
    if (state.status === 'idle' && !state.pendingStart) {
      navigate(PRACTICE_SESSIONS_HOME_ROUTE, { replace: true });
    }
  }, [state.status, state.pendingStart, navigate]);

  // idle + armed: render nothing for the one frame until the start
  // hook promotes the session to running. idle + not armed: the
  // effect above is routing us home; render nothing meanwhile.
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

  // The drill timer is the countdown source of truth — prep + rating
  // time don't touch it. `drillRemainingMs` reads the adjusted
  // duration during prep (preview) and counts down once drilling.
  const drillRemainingMs = times.drillRemainingMs;
  const adjustedDrillSec = currentBlock.adjustedDrillSeconds;
  const isOvertime = times.blockPhase === 'drill' && drillRemainingMs <= 0;
  const isEnded = state.status === 'ended';

  // UI phase is derived from the reducer block phase (single source of
  // truth), with `launched` covering the Ready→reach-the-drill window
  // where the reducer is still in `prep`.
  //   reducer 'rating' → rating · reducer 'drill' → running ·
  //   reducer 'prep'  → prep, or running once the user tapped Ready.
  const uiPhase: Phase =
    times.blockPhase === 'rating'
      ? 'rating'
      : times.blockPhase === 'drill'
        ? 'running'
        : launched
          ? 'running'
          : 'prep';

  // Per-item breakdown of the (adjusted) drill budget — the prep card's
  // source of truth, reused by GO auto-nav as the drill playlist (which
  // cell, how long). null when there's nothing to itemize.
  const itemBreakdown = buildPrepItemBreakdown(
    currentBlock.itemRefs,
    adjustedDrillSec,
  );
  // The prep card's headline drill time = the sum of the per-item rows
  // (each ≥60s) when there's a breakdown, so the total matches what the
  // runner will actually spend; otherwise the block's adjusted total.
  const prepTotalSec = itemBreakdown
    ? itemBreakdown.reduce((sum, row) => sum + row.seconds, 0)
    : adjustedDrillSec;
  // Level 3: scale blocks open an in-session runner on GO (the only
  // safe in-session modal today); everything else routes to the module.
  const isScaleBlock = isScaleRunnerBlock(itemBreakdown);

  // GO (Level 3 auto-nav): start the drill timer and drop the user
  // straight onto the drill. Scale blocks open the in-session runner
  // over this screen (driven by the per-item breakdown); everything
  // else routes to the module home. The prep-phase guard keeps a
  // re-tap from restarting an in-flight drill timer.
  const goToDrill = () => {
    if (times.blockPhase === 'prep') startDrill();
    if (isScaleBlock && itemBreakdown) {
      setRunnerActive(true);
      return;
    }
    if (route) {
      setActiveModuleRef(currentBlock.moduleRef);
      navigate(route);
    }
    // Routeless, non-runner block: the drill timer is running; the
    // user drills against the on-screen running view.
  };

  // The running view's "open" button (shown when the user is on this
  // screen mid-drill, e.g. after navigating back) re-issues GO.
  const handleQuickLaunch = () => {
    goToDrill();
  };

  // Ready = GO for now (the 4-3-2-1 countdown of step 4 will later sit
  // between them). `launched` keeps the running view up for the
  // routeless / navigated-back cases.
  const handleReady = () => {
    setLaunched(true);
    goToDrill();
  };

  // End now → rating. complete-drill finalizes drillMs + moves the
  // block to its rating phase (uiPhase derives 'rating'); the pause
  // keeps the rating window from counting as drill time.
  const handleEndActivity = () => {
    completeDrill();
    pauseSession({ reason: 'manual' });
  };

  // Rating-screen extend: resume, re-enter the drill with a fresh
  // `seconds`-long segment, and head back to the drill surface — the
  // in-session runner for scale blocks, the module otherwise.
  const handleExtend = (seconds: number) => {
    resumeSession();
    extendDrill(seconds);
    setLaunched(true);
    if (isScaleBlock && itemBreakdown) {
      setRunnerActive(true);
      return;
    }
    if (route) {
      setActiveModuleRef(currentBlock.moduleRef);
      navigate(route);
    }
  };

  // The in-session runner finished its cells (or the user dismissed
  // the drill) → close it and move the block to its rating phase.
  const handleRunnerComplete = () => {
    setRunnerActive(false);
    completeDrill();
  };

  // "Go back to drills" (scale-block rating screen) — re-open the
  // in-session runner from the top of the item list so the user can
  // revisit any scale in the block. Distinct from extend: extend adds a
  // fixed amount to the current block, this restarts the FULL runner and
  // lets the user pick which scale to redo. Re-enter the drill phase
  // (uiPhase → 'running' so the runner branch renders) with the block's
  // planned total, then mount a fresh runner (it starts at the first
  // item). `completeDrill` on finish returns here for rating.
  const handleGoBackToDrills = () => {
    resumeSession();
    extendDrill(prepTotalSec);
    setLaunched(true);
    setRunnerActive(true);
  };

  // Skip — advance past this block without marking it completed.
  // The reducer's advanceBlock with markStatus='skipped' finalises
  // the block as 'skipped'; recordBlockEngagements (end-of-session
  // pipeline) only writes spacingState for status==='completed', so
  // skipped blocks don't count toward session stats. The skipped
  // block stays skipped — advanceBlock only walks forward, so it
  // doesn't reappear later in the session. Hidden for warm-up blocks
  // (chord-quiz / scale-prep / S&P scales warm-up): those are bound
  // to a downstream song / cell and shouldn't be skipped on their
  // own — skipping the parent block is the right escape hatch.
  const handleSkipBlock = () => {
    advanceBlock({ markStatus: 'skipped' });
    setLaunched(false);
    setPendingRating(null);
    setRunnerActive(false);
    // Stay on the active-session screen — the next block opens on its
    // prep screen (reducer starts it in `prep`). On the last block,
    // advanceBlock auto-ends so the 'ended' branch renders the summary.
  };

  const handleRatingNext = () => {
    resumeSession();
    advanceBlock({
      rating: pendingRating ?? undefined,
      markStatus: 'completed',
    });
    setLaunched(false);
    setPendingRating(null);
    setRunnerActive(false);
    // Stay here — the next block opens on its prep screen (module
    // navigation happens on GO, step 3). For the last block,
    // advanceBlock auto-ends the session and the 'ended' branch
    // renders the EndOfSessionSummary.
  };

  const handleEndSessionEarly = () => {
    resumeSession();
    endSession({
      rating: pendingRating ?? undefined,
      markStatus: 'completed',
    });
  };

  // Discard — tear down the session without persisting anything.
  // `reset` returns the timer to INITIAL_SESSION_STATE; the
  // navigate-on-idle effect above takes care of routing back. No
  // runEndOfSessionPipeline call, so no practiceSessions /
  // practiceBlocks / spacingState writes ever fire.
  const handleDiscardConfirm = () => {
    setDiscardOpen(false);
    reset();
    navigate(PRACTICE_SESSIONS_HOME_ROUTE, { replace: true });
  };

  if (isEnded) {
    return <EndOfSessionSummary />;
  }

  // -------------------------------------------------------------
  // Prep phase — the only configuration surface. Block timer is
  // already running (started on arrival / advance); the drill timer
  // stays idle until Ready. All metronome config lives here via the
  // shared MetronomeControl (last-used settings persist).
  // -------------------------------------------------------------
  if (uiPhase === 'prep') {
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
              Up next · {moduleLabel}
            </div>
            <h2 className="text-lg font-medium text-neutral-800 dark:text-neutral-100">
              {currentBlock.label ?? currentBlock.moduleRef}
            </h2>
          </header>

          {/* Drill duration + inline adjustment. */}
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] uppercase tracking-wider text-neutral-500">
                drill time
              </span>
              <span
                className="font-mono tabular-nums text-2xl"
                style={{ color: accent }}
              >
                {formatActiveTime(prepTotalSec * 1000)}
              </span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {DRILL_ADJUST_OPTIONS.map(opt => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => adjustDrillTime(opt.deltaSec)}
                  className="px-2 py-1 rounded-md border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-fluent hover:text-fluent text-xs font-medium"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Per-item breakdown — what's coming + each item's share of
              the drill budget. Updates live as the +/- pills change the
              total. */}
          {itemBreakdown && (
            <ul className="space-y-1 border-t border-neutral-200/70 dark:border-neutral-800 pt-3">
              {itemBreakdown.map(row => (
                <li
                  key={row.itemRef}
                  className="flex items-baseline justify-between gap-3 text-sm"
                >
                  <span className="text-neutral-700 dark:text-neutral-200 truncate">
                    {row.label}
                  </span>
                  <span className="font-mono tabular-nums text-xs text-neutral-500 shrink-0">
                    {formatActiveTime(row.seconds * 1000)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/* Metronome — BPM / groove / on-off. Settings persist. */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] uppercase tracking-wider text-neutral-500">
              metronome
            </span>
            <MetronomeControl />
          </div>
        </section>

        <button
          type="button"
          onClick={handleReady}
          className="w-full px-3 py-3 rounded-md bg-fluent text-white text-sm font-medium hover:opacity-90"
        >
          Ready — start drill
        </button>

        <div className="flex items-center justify-center gap-4">
          {!currentBlock.isWarmup && (
            <>
              <button
                type="button"
                onClick={handleSkipBlock}
                className="text-[11px] text-neutral-500 hover:text-fluent underline-offset-2 hover:underline"
                title="advance past this block without logging it as completed"
              >
                skip this block
              </button>
              <span className="text-neutral-300 dark:text-neutral-700">·</span>
            </>
          )}
          <button
            type="button"
            onClick={() => setDiscardOpen(true)}
            className="text-[11px] text-neutral-500 hover:text-needswork underline-offset-2 hover:underline"
          >
            discard session
          </button>
        </div>

        <ConfirmDialog
          open={discardOpen}
          title="Discard this session?"
          message="Your progress won't be saved."
          confirmLabel="Yes, discard"
          cancelLabel="Keep practicing"
          variant="danger"
          onConfirm={handleDiscardConfirm}
          onCancel={() => setDiscardOpen(false)}
        />
      </div>
    );
  }

  // -------------------------------------------------------------
  // Between-blocks phase (5c rating + 5d preview).
  // -------------------------------------------------------------
  if (uiPhase === 'rating') {
    const isLastBlock =
      state.currentBlockIndex === state.blocks.length - 1;
    const nextBlock = !isLastBlock
      ? state.blocks[state.currentBlockIndex! + 1]
      : null;
    const nextMeta = nextBlock ? moduleMetaById(nextBlock.moduleRef) : null;
    const nextAccent = nextMeta?.accentHex ?? '#4a9088';
    const nextLabel = nextMeta?.label ?? nextBlock?.moduleRef ?? '';
    const eligibleToExtend = canExtendBlock(currentBlock);

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

        {/* Extend — resume the drill for more time on eligible blocks
            (flashcards / S&P drills / repertoire; not warm-ups or
            mental viz). Returns to this screen when the extra time
            ends. Subsequent blocks aren't compressed. */}
        {eligibleToExtend && (
          <div className="space-y-1.5">
            <div className="text-[10px] uppercase tracking-wider text-neutral-500 text-center">
              want more time on this?
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {EXTEND_DRILL_OPTIONS.map(opt => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => handleExtend(opt.seconds)}
                  className="flex-1 px-3 py-2 rounded-md border text-sm font-medium hover:opacity-90"
                  style={{ color: accent, borderColor: accent }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Go back to drills — scale blocks only (the in-session runner
            is the thing being re-opened). Restarts the full runner from
            the top so the user can revisit any scale; distinct from the
            extend pills above, which add time to the current block.
            Secondary text-style so it sits below "Next block". */}
        {isScaleBlock && itemBreakdown && (
          <button
            type="button"
            onClick={handleGoBackToDrills}
            className="w-full text-sm text-neutral-500 hover:text-fluent underline-offset-2 hover:underline"
          >
            ← Go back to drills
          </button>
        )}

        <button
          type="button"
          onClick={handleRatingNext}
          className="w-full px-3 py-2 rounded-md bg-fluent text-white text-sm font-medium hover:opacity-90"
        >
          {nextBlock ? 'Next block →' : 'finish session'}
        </button>

        <div className="flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={handleEndSessionEarly}
            className="text-[11px] text-neutral-500 hover:text-fluent underline-offset-2 hover:underline"
          >
            end session early
          </button>
          <span className="text-neutral-300 dark:text-neutral-700">·</span>
          <button
            type="button"
            onClick={() => setDiscardOpen(true)}
            className="text-[11px] text-neutral-500 hover:text-needswork underline-offset-2 hover:underline"
          >
            discard session
          </button>
        </div>

        <ConfirmDialog
          open={discardOpen}
          title="Discard this session?"
          message="Your progress won't be saved."
          confirmLabel="Yes, discard"
          cancelLabel="Keep practicing"
          variant="danger"
          onConfirm={handleDiscardConfirm}
          onCancel={() => setDiscardOpen(false)}
        />
      </div>
    );
  }

  // -------------------------------------------------------------
  // Running phase — the launch/running view, with the in-session drill
  // runner layered over it for scale blocks (Level 3 auto-nav).
  // -------------------------------------------------------------
  return (
    <>
      {runnerActive && itemBreakdown && (
        <InSessionDrillRunner
          items={itemBreakdown}
          onComplete={handleRunnerComplete}
        />
      )}
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
            {formatActiveTime(drillRemainingMs)}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-neutral-500 mt-1">
            {isOvertime ? 'time’s up' : 'drill time'}
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

      <div className="flex items-center justify-center gap-4">
        {!currentBlock.isWarmup && (
          <button
            type="button"
            onClick={handleSkipBlock}
            className="text-[11px] text-neutral-500 hover:text-fluent underline-offset-2 hover:underline"
            title="advance past this block without logging it as completed"
          >
            skip this block
          </button>
        )}
        {!currentBlock.isWarmup && (
          <span className="text-neutral-300 dark:text-neutral-700">·</span>
        )}
        <button
          type="button"
          onClick={() => setDiscardOpen(true)}
          className="text-[11px] text-neutral-500 hover:text-needswork underline-offset-2 hover:underline"
        >
          discard session
        </button>
      </div>

      <ConfirmDialog
        open={discardOpen}
        title="Discard this session?"
        message="Your progress won't be saved."
        confirmLabel="Yes, discard"
        cancelLabel="Keep practicing"
        variant="danger"
        onConfirm={handleDiscardConfirm}
        onCancel={() => setDiscardOpen(false)}
      />
      </div>
    </>
  );
}
