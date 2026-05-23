import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { db } from '../../lib/db';
import { PRACTICE_SESSIONS_META, moduleMetaById } from '../../lib/moduleMeta';
import { resolveProposalStart } from './proposalAcceptance';
import { recordEndOfMonth } from '../../lib/prompts';
import {
  evaluateSongComfortablePathPrompts,
  evaluateSongOfMonthPrompts,
} from '../repertoire/songOfMonthPrompts';
import {
  SongComfortablePathChoiceBanner,
  SongOfMonthCongratsBanner,
} from '../repertoire/SongOfMonthBanners';
import { useSessionTimer } from '../../lib/sessionTimer/SessionTimerContext';
import Modal from '../../components/Modal';
import GoalsNudgeBanner from './GoalsNudgeBanner';
import ManualLogForm from './ManualLogForm';
import RecentSessionsList from './RecentSessionsList';
import VacationManager from './VacationManager';
import GoalsNeedTodayScreen from './GoalsNeedTodayScreen';
import { loadPrefill, saveLastIntentKind } from './inputsPrefill';
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
import {
  clearProposalDraft,
  readProposalDraft,
  writeProposalDraft,
  type ProposalDraftView,
} from './proposalDraft';
import { readActiveSessionDraft } from '../../lib/sessionTimer/activeSessionDraft';
import BehindPaceBanner from './BehindPaceBanner';
import type { BehindPaceNotice } from '../../lib/sessionAlgorithm/weeklyPace';
import type { GoalFlowModuleId } from '../goals/goalVocabulary';

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
type View = 'home' | 'goals-need' | 'questionnaire' | 'proposal' | 'abundance';

export default function PracticeSessions() {
  const navigate = useNavigate();
  const location = useLocation();
  const { state: timerState, armSession, reset } = useSessionTimer();

  const [view, setView] = useState<View>('home');
  const [proposals, setProposals] = useState<ProposalCardData[]>([]);
  const [generating, setGenerating] = useState(false);
  const [showColdStart, setShowColdStart] = useState(false);
  const [hasEarlierSessionsToday, setHasEarlierSessionsToday] = useState(false);
  const [initialDayProfile, setInitialDayProfile] =
    useState<DayProfileChoice | null>(null);
  /** Pre-seeded Q1 time selection coming out of the
   *  GoalsNeedTodayScreen. Carried into InputQuestionnaire so the
   *  user's picked-on-the-prior-screen time survives without a
   *  second tap. */
  const [initialTimeMinutes, setInitialTimeMinutes] =
    useState<number | null>(null);
  const [feasibilityEntries, setFeasibilityEntries] = useState<
    ReadonlyArray<FeasibilityBannerEntry>
  >([]);
  /** True when the user has at least one active goal. Drives the
   *  routing decision in handleStartSession — zero goals skips the
   *  "What your goals need today" screen entirely. */
  const [hasActiveGoals, setHasActiveGoals] = useState(false);
  // Phase 4 Step 4 — weekly-pace notice state. Notices come back
  // from buildSessionPlan alongside the proposal cards; dismissedPace­
  // Modules tracks per-session dismissal so re-renders don't lose
  // the user's "x"-clicks. Resets on each fresh proposal generation
  // (intentionally — a new session deserves a fresh look).
  const [behindPaceNotices, setBehindPaceNotices] = useState<
    ReadonlyArray<BehindPaceNotice>
  >([]);
  const [dismissedPaceModules, setDismissedPaceModules] = useState<
    ReadonlySet<string>
  >(new Set());
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

  // Song-of-the-Month prompt evaluation — fires on every mount of
  // the Practice Sessions surface (which the user lands on after
  // completing a session, and again on revisit). The evaluator
  // dedupes congrats per songId + caps the TBD nudge to once per
  // local day per umbrella, so cheap to call repeatedly.
  useEffect(() => {
    void evaluateSongOfMonthPrompts().catch(err => {
      console.warn('[PracticeSessions] evaluateSongOfMonthPrompts failed', err);
    });
    // Parallel evaluator for non-spotlight songs that reach
    // comfortable in their original key. Same cadence — dedupe is
    // per-songId per prompt type, so the two evaluators don't race.
    void evaluateSongComfortablePathPrompts().catch(err => {
      console.warn('[PracticeSessions] evaluateSongComfortablePathPrompts failed', err);
    });
  }, []);

  // Tapping the Practice Sessions nav item while already on
  // /practice-sessions creates a new history entry but doesn't
  // remount this component — internal view state would otherwise
  // strand the user on the abundance / questionnaire / proposal
  // surface. location.key changes on every navigation (including
  // same-URL re-navigations from NavLink), so we use it as the
  // signal to reset back to the home view. On the first mount the
  // reset is a no-op (state is already the defaults).
  useEffect(() => {
    if (location.pathname !== '/practice-sessions') return;
    setView('home');
    setAbundanceReason(null);
    setActivePath(null);
    setProposals([]);
    setBehindPaceNotices([]);
    setDismissedPaceModules(new Set());
    setLastInputs(null);
    setInitialDayProfile(null);
    setInitialTimeMinutes(null);
    setSessionInProgressOpen(false);
  }, [location.key, location.pathname]);

  // --- Proposal-screen refresh recovery -------------------------------
  // Gates the persist effect so it can't clear the draft on the initial
  // 'home' render, before the restore effect below has read it.
  const hydratedRef = useRef(false);

  // First mount: if a draft exists and there's no session to resume,
  // restore whichever session-creation screen the user was on
  // (questionnaire / abundance / proposal) — so a refresh doesn't drop
  // to home. A resumable / live session owns recovery — ResumeSessionGate
  // handles that — so it takes precedence here. Runs once; the async read
  // naturally resolves after the location.key reset effect's synchronous
  // view='home', so it wins.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        if (timerState.status !== 'idle') return;
        if (await readActiveSessionDraft()) return;
        const draft = await readProposalDraft();
        if (cancelled || !draft) return;
        setProposals(draft.proposals);
        setLastInputs(draft.lastInputs);
        setBehindPaceNotices(draft.behindPaceNotices);
        setActivePath(draft.activePath);
        setAbundanceReason(draft.abundanceReason);
        setInitialDayProfile(draft.initialDayProfile);
        setInitialTimeMinutes(draft.initialTimeMinutes);
        setView(draft.view);
      } finally {
        if (!cancelled) hydratedRef.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
    // Mount-only restore; intentionally not re-running on state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist the active session-creation screen (questionnaire /
  // abundance / proposal); clear it once the user leaves to home /
  // goals-need or accepts (accept clears separately — it navigates away
  // without a view change). The location.key reset → view='home' clears
  // it here on nav-away too. Gated on hydratedRef so the initial 'home'
  // render can't wipe the draft before the restore reads it.
  useEffect(() => {
    if (!hydratedRef.current) return;
    const persistable =
      view === 'questionnaire' ||
      view === 'abundance' ||
      (view === 'proposal' && proposals.length > 0);
    if (persistable) {
      void writeProposalDraft({
        view: view as ProposalDraftView,
        proposals,
        lastInputs,
        behindPaceNotices: [...behindPaceNotices],
        activePath,
        abundanceReason,
        initialDayProfile,
        initialTimeMinutes,
      });
    } else {
      void clearProposalDraft();
    }
  }, [
    view,
    proposals,
    lastInputs,
    behindPaceNotices,
    activePath,
    abundanceReason,
    initialDayProfile,
    initialTimeMinutes,
  ]);

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
    void db.goals.where('status').equals('active').count().then(n => {
      if (!cancelled) setHasActiveGoals(n > 0);
    });
    return () => {
      cancelled = true;
    };
  }, [view]);

  const handleStartSession = (dayProfile?: DayProfileChoice) => {
    setInitialDayProfile(dayProfile ?? null);
    setInitialTimeMinutes(null);
    if (timerState.status === 'running' || timerState.status === 'paused') {
      // Don't open the questionnaire on top of a live session — a
      // new startSession would clobber the existing one's
      // accumulating active time. Surface the prompt; the user
      // picks Resume or End-and-start-new.
      setSessionInProgressOpen(true);
      return;
    }
    // With active goals, surface the "what your goals need today"
    // intro screen first so the user picks a time against real
    // context. Zero-goals users skip straight to the questionnaire
    // (it carries its own time picker). The Deep tap-through from
    // the feasibility banner also bypasses the intro — the user has
    // already committed to a focused session, so we honor that
    // intent rather than re-asking.
    if (hasActiveGoals && !dayProfile) {
      setView('goals-need');
    } else {
      setView('questionnaire');
    }
  };

  const handleGoalsNeedFullSession = async (minutes: number) => {
    // Bypass the questionnaire entirely — the user committed to the
    // full session length, balanced intent, and a 'full' context
    // (the whole point of the Full session button: keyboard + device
    // available, every module in scope). Day plan still falls back
    // to the saved prefill since it's an axis the button doesn't
    // express. Builds a complete InputQuestionnaireResult and runs
    // the same generate pipeline the questionnaire's Generate would
    // have triggered.
    const prefill = await loadPrefill({
      hasEarlierSessionsToday,
    });
    const inputs: InputQuestionnaireResult = {
      timeMinutes: minutes,
      context: 'full',
      dayPlan: prefill.dayPlan ?? { kind: 'just_this_session' },
      intent: { kind: 'balanced' },
      energy: { focus: null, motivation: null, inspiration: null },
    };
    await handleQuestionnaireGenerate(inputs);
  };

  const handleGoalsNeedCustomize = (minutes: number) => {
    // User explicitly opts into the questionnaire. Carry the daily-
    // need total through so Q1 still surfaces the "Full session — X
    // min" pill as the goal-aware default — they're customizing the
    // OTHER axes (intent / context / day plan), not necessarily the
    // time.
    setInitialTimeMinutes(minutes);
    setView('questionnaire');
  };

  const handleGoalsNeedSkip = () => {
    // Caller has fallen through (no goals / load timed out / user
    // tapped skip). Bypass the intro and let the questionnaire's
    // own time picker drive.
    setInitialTimeMinutes(null);
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
        extras: {
          context: endedState.context,
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
        setBehindPaceNotices([]);
        setView('abundance');
      } else {
        setAbundanceReason(null);
        setProposals(plan.cards);
        setBehindPaceNotices(plan.behindPaceNotices);
        setDismissedPaceModules(new Set());
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

  /**
   * Phase 4 Step 4 — "Add to this session" wired off a behind-pace
   * notice. Dismisses the notice and re-runs the proposal generator
   * with the named module force-included past the context hard
   * filter. Keeps the user's other inputs (time / context / day-
   * profile / intent / energy) intact via lastInputs.
   *
   * v1 implementation note: force-include just regenerates with the
   * named module passed through to `buildSessionPlan` via a new
   * forceIncludeModules option. The actual block-injection logic
   * lives in sessionGenerator; this handler stays UI-only.
   */
  const handleAddModuleFromBehindPace = async (moduleId: GoalFlowModuleId) => {
    if (!lastInputs || generating) return;
    setDismissedPaceModules(prev => {
      const next = new Set(prev);
      next.add(moduleId);
      return next;
    });
    setGenerating(true);
    try {
      const earlierSessionsToday = await countEarlierSessionsToday();
      const plan = await buildSessionPlan(
        lastInputs,
        { earlierSessionsToday },
        { forceIncludeModules: [moduleId] },
      );
      if (plan.kind === 'proposals') {
        setProposals(plan.cards);
        // Keep behindPaceNotices intact — the user may want to add
        // another behind-pace module too. The dismissed set hides
        // the one they just acted on.
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[PracticeSessions] add-module regenerate failed', e);
    } finally {
      setGenerating(false);
    }
  };

  const handleProposalAccept = (
    card: ProposalCardData,
    opts: { hardBlock: boolean },
  ) => {
    if (card.blocks.length === 0) return;
    // Single source of truth for the arm payload, derived only from
    // `card.blocks` — the user's (possibly reordered) block list as
    // ProposalCard hands it back via the Start button's onClick
    // spreading `{ ...data, blocks: orderedBlocks }`. The resolver
    // iterates the list in order, so any reorder the user applied
    // flows through to the armed session's currentBlockIndex=0
    // landing.
    //
    // Prep-flow redesign: we navigate to the active-session screen
    // (the prep screen for block 1) rather than straight to the first
    // block's module. The session `start` fires on arrival there
    // (useStartArmedSessionOnArrival), so the block timer begins at
    // prep and module navigation is deferred to GO (step 3).
    const { armBlocks } = resolveProposalStart(card.blocks);

    // Persist the intent kind the user committed to. Surfaces as a
    // "Last time: …" hint on the next questionnaire open — purely
    // informational, no pre-selection.
    if (lastInputs) {
      void saveLastIntentKind(lastInputs.intent.kind);
    }

    // Arm — don't start. The actual `start` action fires when the
    // user arrives at the first block's module (handled by
    // useStartArmedSessionOnArrival in Layout). Keeps session-time
    // = practice-time; questionnaire-fill + proposal-browse don't
    // get counted.
    armSession({
      origin: 'practice-sessions',
      hardBlock: opts.hardBlock,
      context: lastInputs?.context ?? 'keys',
      // Prep-flow: each block opens on its prep screen.
      startInPrep: true,
      blocks: armBlocks,
    });
    // Accepted → the proposal is consumed (the active-session draft now
    // owns recovery). Clear here because accept navigates away without a
    // view change, so the persist effect won't clear it.
    void clearProposalDraft();
    navigate('/practice-sessions/active');
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
          // Block-swap picker needs the context to filter the
          // "Different module" list to context-allowed modules.
          context={lastInputs?.context ?? 'keys'}
          feasibilityBanner={
            <FeasibilityBanner
              entries={feasibilityEntries}
              onTapDeep={() => {
                setView('questionnaire');
                setInitialDayProfile('deep');
              }}
            />
          }
          behindPaceBanner={
            <BehindPaceBanner
              notices={behindPaceNotices}
              dismissed={dismissedPaceModules}
              onAddModule={handleAddModuleFromBehindPace}
              onDismiss={moduleId =>
                setDismissedPaceModules(prev => {
                  const next = new Set(prev);
                  next.add(moduleId);
                  return next;
                })
              }
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
        <SongOfMonthCongratsBanner />
        <SongComfortablePathChoiceBanner />
        <GoalsNudgeBanner />
        <VacationManager />
        <RecentSessionsList />
        <ManualLogForm />
      </div>

      <GoalsNeedTodayScreen
        open={view === 'goals-need'}
        hasEarlierSessionsToday={hasEarlierSessionsToday}
        onFullSession={handleGoalsNeedFullSession}
        onCustomize={handleGoalsNeedCustomize}
        onClose={handleGoalsNeedSkip}
      />

      <InputQuestionnaire
        open={view === 'questionnaire'}
        onClose={() => setView('home')}
        onGenerate={handleQuestionnaireGenerate}
        hasEarlierSessionsToday={hasEarlierSessionsToday}
        initialDayProfile={initialDayProfile}
        initialTimeMinutes={initialTimeMinutes}
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
