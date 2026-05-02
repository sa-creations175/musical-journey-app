import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PRACTICE_SESSIONS_META, moduleMetaById } from '../../lib/moduleMeta';
import { recordEndOfMonth } from '../../lib/prompts';
import { useSessionTimer } from '../../lib/sessionTimer/SessionTimerContext';
import Modal from '../../components/Modal';
import GoalsNudgeBanner from './GoalsNudgeBanner';
import ManualLogForm from './ManualLogForm';
import RecentSessionsList from './RecentSessionsList';
import VacationManager from './VacationManager';
import InputQuestionnaire from './InputQuestionnaire';
import ProposalScreen from './ProposalScreen';
import FeasibilityBanner from './FeasibilityBanner';
import { shouldShowColdStartBanner } from './coldStartBannerPref';
import {
  loadFeasibilityBannerEntries,
  type FeasibilityBannerEntry,
} from './feasibilityBannerData';
import {
  endActiveSessionForPipeline,
  runEndOfSessionPipeline,
} from './endOfSessionPersistence';
import {
  buildSessionPlan,
  buildSessionProposalsForPath,
  type AbundancePath,
  type SessionPlanReason,
} from './sessionGenerator';
import { countEarlierSessionsToday } from './sessionsToday';
import AbundancePathScreen, {
  type AbundancePathChoice,
} from './AbundancePathScreen';
import type {
  DayProfileChoice,
  InputQuestionnaireResult,
} from './inputs';
import type { ProposalCardData } from './proposalTypes';

/**
 * Practice Sessions home (Phase 3 Step 7a).
 *
 * The user's entry point into the generator-driven flow. State
 * machine across three views:
 *
 *   home — landing state. CTA "Start a session", recent sessions,
 *          goals nudge / vacation banner, manual log fallback.
 *   questionnaire — bottom sheet (Step 3). Open / close locally.
 *   proposal — full-page proposal cards (Step 4) once the
 *              questionnaire generates.
 *
 * Active session execution lives at /practice-sessions/active and
 * is reached via navigate() on proposal acceptance.
 *
 * 7b lands the feasibility banner; 7c the Deep tap-through; 7d the
 * disappear-when-clear behavior; 7e the ordering reconciliation
 * with the existing goals nudge.
 */
type View = 'home' | 'questionnaire' | 'proposal' | 'abundance';

export default function PracticeSessions() {
  const navigate = useNavigate();
  const { state: timerState, armSession, reset } = useSessionTimer();

  const [view, setView] = useState<View>('home');
  const [proposals, setProposals] = useState<ProposalCardData[]>([]);
  const [generating, setGenerating] = useState(false);
  const [showColdStart, setShowColdStart] = useState(false);
  const [hasEarlierSessionsToday, setHasEarlierSessionsToday] = useState(false);
  const [initialDayProfile, setInitialDayProfile] =
    useState<DayProfileChoice | null>(null);
  const [feasibilityEntries, setFeasibilityEntries] = useState<
    ReadonlyArray<FeasibilityBannerEntry>
  >([]);
  // Step 8 — abundance flow state. abundanceReason drives the
  // path-screen header copy + which card set renders. lastInputs
  // caches the questionnaire result so the user can pick a path or
  // regenerate without re-answering. activePath records which path
  // produced the current proposal so the proposal screen can render
  // Back / Regenerate affordances and Regenerate keeps the path.
  const [abundanceReason, setAbundanceReason] =
    useState<SessionPlanReason | null>(null);
  const [lastInputs, setLastInputs] =
    useState<InputQuestionnaireResult | null>(null);
  const [activePath, setActivePath] = useState<AbundancePath | null>(null);
  // "You have a session in progress" prompt — fires when the user
  // taps Start a session while a session is already running or
  // paused. Lets them resume the existing one or end it cleanly
  // (full persistence pipeline) before starting fresh.
  const [sessionInProgressOpen, setSessionInProgressOpen] = useState(false);
  const [endingActive, setEndingActive] = useState(false);

  // End-of-month bookkeeping (idempotent per YYYY-MM).
  useEffect(() => {
    void recordEndOfMonth().catch(err => {
      console.warn('[PracticeSessions] recordEndOfMonth failed', err);
    });
  }, []);

  // Cold-start banner flag, earlier-sessions count, and feasibility
  // entries refreshed on every mount of the home view (e.g. after
  // the user finishes a session and the Done handler resets back
  // here).
  useEffect(() => {
    if (view !== 'home') return;
    let cancelled = false;
    void shouldShowColdStartBanner().then(v => {
      if (!cancelled) setShowColdStart(v);
    });
    void countEarlierSessionsToday().then(c => {
      if (!cancelled) setHasEarlierSessionsToday(c > 0);
    });
    void loadFeasibilityBannerEntries().then(entries => {
      if (!cancelled) setFeasibilityEntries(entries);
    });
    return () => {
      cancelled = true;
    };
  }, [view]);

  const handleStartSession = (dayProfile?: DayProfileChoice) => {
    setInitialDayProfile(dayProfile ?? null);
    if (timerState.status === 'running' || timerState.status === 'paused') {
      // Don't open the questionnaire on top of a live session — a
      // new startSession would clobber the existing one's
      // accumulating active time. Surface the prompt; the user
      // picks Resume or End-and-start-new.
      setSessionInProgressOpen(true);
      return;
    }
    setView('questionnaire');
  };

  const handleResumeActiveSession = () => {
    setSessionInProgressOpen(false);
    // Route to wherever the active session is anchored. activeModuleRef
    // tracks the user's location per model (b); when it's a known
    // module, send them there directly. Fall back to the active
    // session screen otherwise.
    const activeMeta = timerState.activeModuleRef
      ? moduleMetaById(timerState.activeModuleRef)
      : null;
    navigate(activeMeta?.route ?? '/practice-sessions/active');
  };

  const handleEndAndStartNew = async () => {
    if (endingActive) return;
    setEndingActive(true);
    try {
      // Snapshot a post-end state via the pure reducer so persist
      // sees the current block's finalized activeMs even though we
      // never dispatched endSession() to the live timer. The
      // pipeline writes practiceSessions + practiceBlocks rows,
      // fires per-item engagements + goal recompute + songKey
      // engagements, marks the cold-start banner seen.
      const endedState = endActiveSessionForPipeline(timerState);
      await runEndOfSessionPipeline({
        state: endedState,
        summary: {
          sessionRating: null,
          affirmation: null,
          batchRatings: {},
        },
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[PracticeSessions] flush of abandoned session failed', e);
      // Continue anyway — better to start fresh than block the user.
    } finally {
      reset();
      setSessionInProgressOpen(false);
      setEndingActive(false);
      setView('questionnaire');
    }
  };

  const handleQuestionnaireGenerate = async (
    inputs: InputQuestionnaireResult,
  ) => {
    if (generating) return;
    setGenerating(true);
    try {
      const earlierSessionsToday = await countEarlierSessionsToday();
      const plan = await buildSessionPlan(inputs, { earlierSessionsToday });
      setLastInputs(inputs);
      setActivePath(null);
      if (plan.kind === 'abundance') {
        setAbundanceReason(plan.reason);
        setProposals([]);
        setView('abundance');
      } else {
        setAbundanceReason(null);
        setProposals(plan.cards);
        setView('proposal');
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[PracticeSessions] buildSessionPlan failed', e);
      // Stay on questionnaire so the user can adjust + retry.
    } finally {
      setGenerating(false);
    }
  };

  // Step 8c — user picked an abundance path. Generate path-specific
  // proposals and route to the proposal screen. activePath sticks
  // around so 8d (Back) and 8e (Regenerate) can return / re-run.
  const handlePathPick = async (choice: AbundancePathChoice) => {
    // 8f fallback paths route the user out of the planner entirely.
    if (choice === 'just-play') {
      navigate('/harmonic-diary');
      return;
    }
    if (choice === 'set-goal') {
      navigate('/goals');
      return;
    }
    if (choice === 'rest') {
      setView('home');
      setAbundanceReason(null);
      setLastInputs(null);
      return;
    }

    if (!lastInputs || generating) return;
    setGenerating(true);
    try {
      const cards = await buildSessionProposalsForPath(choice, lastInputs);
      setProposals(cards);
      setActivePath(choice);
      setView('proposal');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[PracticeSessions] buildSessionProposalsForPath failed', e);
    } finally {
      setGenerating(false);
    }
  };

  const handleBackToPaths = () => {
    setActivePath(null);
    setView('abundance');
  };

  const handleRegeneratePath = async () => {
    if (!activePath || !lastInputs || generating) return;
    setGenerating(true);
    try {
      const cards = await buildSessionProposalsForPath(activePath, lastInputs);
      setProposals(cards);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[PracticeSessions] regenerate path failed', e);
    } finally {
      setGenerating(false);
    }
  };

  const handleProposalAccept = (card: ProposalCardData) => {
    if (card.blocks.length === 0) return;
    const firstBlock = card.blocks[0];
    const firstMeta = moduleMetaById(firstBlock.moduleRef);
    const startRoute = firstMeta?.route ?? '/practice-sessions/active';

    // Arm — don't start. The actual `start` action fires when the
    // user arrives at the first block's module (handled by
    // useStartArmedSessionOnArrival in Layout). Keeps session-time
    // = practice-time; questionnaire-fill + proposal-browse don't
    // get counted.
    armSession({
      origin: 'practice-sessions',
      blocks: card.blocks.map(b => ({
        moduleRef: b.moduleRef,
        itemRefs: [...b.itemRefs],
        label: b.activityDescription,
        plannedSeconds: b.plannedSeconds,
      })),
    });
    navigate(startRoute);
  };

  // -------------------------------------------------------------
  // Abundance / fallback path-choice view (Step 8b + 8f)
  // -------------------------------------------------------------
  if (view === 'abundance' && abundanceReason) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6">
        <AbundancePathScreen
          reason={abundanceReason}
          onPick={handlePathPick}
          onTryDifferentInputs={() => setView('questionnaire')}
        />
      </div>
    );
  }

  // -------------------------------------------------------------
  // Proposal view
  // -------------------------------------------------------------
  if (view === 'proposal') {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        <ProposalScreen
          proposals={proposals}
          onAccept={handleProposalAccept}
          onTryDifferentInputs={() => setView('questionnaire')}
          onBackToPaths={activePath ? handleBackToPaths : undefined}
          onRegeneratePath={activePath ? handleRegeneratePath : undefined}
          regenerating={generating}
          showColdStartBanner={showColdStart}
          feasibilityBanner={
            <FeasibilityBanner
              entries={feasibilityEntries}
              onTapDeep={() => {
                setView('questionnaire');
                setInitialDayProfile('deep');
              }}
            />
          }
        />
        {proposals.length === 0 && (
          <div className="text-center text-sm text-neutral-500 py-6 space-y-3">
            <p>
              No proposals available yet — set a few goals first so the
              algorithm has something to plan with.
            </p>
            <button
              type="button"
              onClick={() => setView('home')}
              className="text-xs text-fluent hover:underline"
            >
              ← back to Practice Sessions
            </button>
          </div>
        )}
      </div>
    );
  }

  // -------------------------------------------------------------
  // Home view (questionnaire renders alongside as a portal)
  // -------------------------------------------------------------
  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <header className="mb-6 flex items-center gap-3">
        <span
          aria-hidden
          className="inline-flex items-center justify-center w-8 h-8 rounded-md text-base font-medium"
          style={{
            backgroundColor: `${PRACTICE_SESSIONS_META.accentHex}1a`,
            color: PRACTICE_SESSIONS_META.accentHex,
          }}
        >
          {PRACTICE_SESSIONS_META.icon}
        </span>
        <h1 className="text-2xl font-semibold text-neutral-800 dark:text-neutral-100 flex-1">
          Practice Sessions
        </h1>
      </header>

      <button
        type="button"
        onClick={() => handleStartSession()}
        className="w-full mb-5 px-4 py-3 rounded-md bg-fluent text-white text-base font-medium hover:opacity-90"
      >
        Start a session
      </button>

      {/*
        Stacking order — Step 7e:

          1. FeasibilityBanner — actionable behind-pace alert. Fires
             only when the user has active goals AND at least one is
             at_risk or critical. Most urgent surface; takes the top
             slot when present.

          2. GoalsNudgeBanner — cold-start nudge for users with zero
             active goals. Mutually exclusive with FeasibilityBanner
             (which requires active goals to have anything to flag),
             so they never compete for visual prominence; the order
             only matters for source readability + the once-in-a-
             blue-moon edge case where the goal count flips during a
             render.

          3. VacationManager — active-vacation banner (when in one)
             OR collapsed "plan a vacation" trigger. Always present;
             cheap visual.

          4. RecentSessionsList + ManualLogForm — passive list +
             fallback log form. Below the alerts because they're
             history, not action surfaces.
      */}
      <div className="flex flex-col gap-5">
        <FeasibilityBanner
          entries={feasibilityEntries}
          onTapDeep={() => handleStartSession('deep')}
        />
        <GoalsNudgeBanner />
        <VacationManager />
        <RecentSessionsList />
        <ManualLogForm />
      </div>

      <InputQuestionnaire
        open={view === 'questionnaire'}
        onClose={() => setView('home')}
        onGenerate={handleQuestionnaireGenerate}
        hasEarlierSessionsToday={hasEarlierSessionsToday}
        initialDayProfile={initialDayProfile}
      />

      <Modal
        open={sessionInProgressOpen}
        onClose={() => {
          if (endingActive) return;
          setSessionInProgressOpen(false);
        }}
        title="You have a session in progress"
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleEndAndStartNew}
              disabled={endingActive}
              className={`px-3 py-1.5 rounded-md border text-sm ${
                endingActive
                  ? 'border-neutral-200 text-neutral-400 cursor-not-allowed'
                  : 'border-neutral-200 dark:border-neutral-700 hover:border-fluent hover:text-fluent'
              }`}
            >
              {endingActive ? 'ending…' : 'end & start new'}
            </button>
            <button
              type="button"
              onClick={handleResumeActiveSession}
              disabled={endingActive}
              data-autofocus
              className="px-4 py-1.5 rounded-md bg-fluent text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              resume session
            </button>
          </div>
        }
      >
        <p className="text-sm text-neutral-700 dark:text-neutral-200">
          Resume where you left off, or end it and start fresh. Ending
          saves what you've practiced so far — the in-progress block
          gets logged with whatever active time it's already
          accumulated.
        </p>
      </Modal>
    </div>
  );
}
