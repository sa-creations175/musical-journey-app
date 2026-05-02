import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PRACTICE_SESSIONS_META } from '../../lib/moduleMeta';
import { recordEndOfMonth } from '../../lib/prompts';
import { useSessionTimer } from '../../lib/sessionTimer/SessionTimerContext';
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
import { buildSessionProposals } from './sessionGenerator';
import { countEarlierSessionsToday } from './sessionsToday';
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
type View = 'home' | 'questionnaire' | 'proposal';

export default function PracticeSessions() {
  const navigate = useNavigate();
  const { startSession } = useSessionTimer();

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
    setView('questionnaire');
  };

  const handleQuestionnaireGenerate = async (
    inputs: InputQuestionnaireResult,
  ) => {
    if (generating) return;
    setGenerating(true);
    try {
      const built = await buildSessionProposals(inputs);
      setProposals(built);
      setView('proposal');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[PracticeSessions] buildSessionProposals failed', e);
      // Stay on questionnaire so the user can adjust + retry.
    } finally {
      setGenerating(false);
    }
  };

  const handleProposalAccept = (card: ProposalCardData) => {
    startSession({
      origin: 'practice-sessions',
      // Model (b) per the 1b/5a design call — active session screen
      // owns the practice-sessions ref while it's mounted; quick-
      // launches into individual modules update activeRef
      // dynamically.
      activeModuleRef: 'practice-sessions',
      blocks: card.blocks.map(b => ({
        moduleRef: b.moduleRef,
        itemRefs: [...b.itemRefs],
        label: b.activityDescription,
        plannedSeconds: b.plannedSeconds,
      })),
    });
    navigate('/practice-sessions/active');
  };

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
    </div>
  );
}
