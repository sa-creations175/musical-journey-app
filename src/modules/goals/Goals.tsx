import { Fragment, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Goal, type GoalScope, type ProficiencyDefinition, type Song } from '../../lib/db';
import { GOALS_META, moduleMetaById } from '../../lib/moduleMeta';
import Modal from '../../components/Modal';
import { useToast } from '../../components/Toaster';
import CustomizeLayersModal from './CustomizeLayersModal';
import GoalFormModal from './GoalFormModal';
import GoalCreationFlow from './GoalCreationFlow';
import GoalSuggestionFlow from './GoalSuggestionFlow';
import WeeklyPlan from './WeeklyPlan';
import WeeklyPlanBanner from './WeeklyPlanBanner';
import PlanMonthBanner from './PlanMonthBanner';
import CarryoverBanner from './CarryoverBanner';
import MonthEndCleanupBanner from './MonthEndCleanupBanner';
import {
  endOfWeekLocal,
  loadConfirmedPlanForWeek,
  loadWeeklyAvailableDays,
  startOfWeekLocal,
} from './weeklyPlanData';
import { getWeeklyTimeEstimate } from '../../lib/weeklyAttempts';
import { buildRepertoireSessionBreakdownLines } from './repertoireBreakdown';
// Side-effect import: registers `__deleteShortHorizonGoals` on
// window so the operator can wipe all monthly + weekly goals from
// the browser console. Manual one-shot only — see devCleanup.ts.
import './devCleanup';
// Side-effect import: registers `__inspectLastWeekActivity` and
// `__wipeRepertoireRunThroughsInRange` for diagnosing whether the
// WeeklyPlan "last week" totals reflect real practice or stale
// dev-build clicks. See devInspectActivity.ts.
import './devInspectActivity';
// Side-effect import: registers `__wipeLastWeekActivity` and
// `__wipeMayGoals` browser-console helpers. Temporary dev tools —
// see devWipe.ts. DO NOT COMMIT (devWipe.ts is untracked locally).
import './devWipe';
import YearlyAnchorFlow, { type AnchorModuleId } from './YearlyAnchorFlow';
import { isNewVocabMetric } from './goalVocabulary';
import { isSuggestionFlowEditCandidate } from './editLoad';
import OnboardingFlow from './onboarding/OnboardingFlow';
import { seedProficiencyDefinitionsIfNeeded } from './data';
import { backfillSpacingStateIfNeeded } from '../../lib/spacingStateBackfill';
import {
  evaluateSongComfortablePathPrompts,
  evaluateSongOfMonthPrompts,
} from '../repertoire/songOfMonthPrompts';
import { SongOfMonthTbdNudgeBanner } from '../repertoire/SongOfMonthBanners';
import {
  progressSlotState,
  progressSlotText,
  progressSlotPercent,
  shouldShowSlots,
  type ProgressSlotState,
} from './goalRowSlots';
import { ActivityChart } from './activity/ActivityChart';
import {
  getDailyActivity,
  activityUnitForModule,
  binToWeek,
  binToMonth,
  binToYear,
  mondayOf,
  weeklyRange,
  monthlyRange,
  yearlyRange,
  type DailyActivityPoint,
} from './activity/dailyActivity';
// `mockActivityData` stays around as a DEV preview helper for
// substep reviews — not wired into production paths anymore now
// that 6c reads from the live data layer.
import { moduleForMetric, type GoalFlowModuleId } from './goalVocabulary';
import {
  dimensionForGoal,
  dimensionSortOrder,
  findAllChildren,
  findChildren,
  goalTypeLabel,
  isConcatenatedChildSummary,
  isCrossModuleUmbrella,
  umbrellaModuleId,
} from './umbrellaSummary';
import {
  classifyGoalPace,
  isDaysConsistencyGoal,
} from './byModulePace';
import { useThisWeekActivity } from './useThisWeekActivity';
import { goalWeekTime } from './goalWeekTime';
import { PacePill } from './atoms';
import {
  defaultAnchorName,
  isLegacyAnchorName,
} from './yearlyAnchorReview';
import {
  loadGoalsView,
  saveGoalsView,
  type GoalsView,
} from './goalsView';
import {
  loadLayerCollapse,
  saveLayerCollapse,
  loadHiddenLayers,
  saveHiddenLayers,
  type LayerCollapseOverrides,
} from './goalsLayerPrefs';
import {
  loadRowCollapse,
  resolveRowExpanded,
  saveRowCollapse,
  toggleRowExpanded,
  type RowCollapseState,
} from './goalRowCollapse';
import {
  getGoalFeasibility,
  isConsistencyMetric,
  loadDayProfileMix,
  rollupChildFeasibilities,
  type GoalFeasibility,
} from './progress';
import { FeasibilityPill, UmbrellaFeasibilityPill } from './FeasibilityPill';
import {
  feasibilityDetailText,
  formatUmbrellaDetail,
  isAllUnrecoverableRollup,
} from './feasibilityDetail';
import {
  groupByModule,
  isCurrentOrUpcoming,
  ORDERED_GOAL_MODULES,
} from './goalsByModule';
import { SECTION_PALETTE } from './moduleSectionPalette';
import { MODULE_DISPLAY_NAME } from './YearlyAnchorFlow';
import { deleteGoalsWithCascade } from './monthEndCleanup';
import {
  GoalSelectContext,
  useGoalSelect,
  type GoalSelectState,
} from './selectMode';
import { supabase } from '../../lib/supabase';
import { getCurrentUserId } from '../../lib/sync/currentUser';
import { beginPull, endPull } from '../../lib/sync/pullLock';
import { drain } from '../../lib/sync/engine';

/**
 * Goals — page-level component.
 *
 * Phase 1 sub-phase 3 step 4: layered home plus the goal creation /
 * edit modal. The "+ Set a goal" top button and per-layer
 * "+ Add" / "+ Aspire" links open the modal in create mode (with
 * the layer's scope pre-filled when applicable). Tapping any goal
 * row in the home opens the modal in edit mode pre-populated with
 * that goal's data; saving updates in place, deleting soft-deletes
 * via status='abandoned'.
 *
 * Onboarding (steps 5–9) wires its own resume-aware mini-flow on top
 * of this same data layer.
 */

export interface LayerDef {
  scope: GoalScope;
  title: string;
  /** Drives "+ Add" (measurable, target-bearing) vs "+ Aspire"
   *  (aspirational, open-text-first) link copy on empty states. */
  type: 'measurable' | 'aspirational';
  emptyMessage: string;
  addLabel: string;
}

/**
 * Action-up ordering — the layer the user adjusts most often
 * (this week) sits at the top, longest-horizon vision at the
 * bottom.
 */
export const LAYERS: LayerDef[] = [
  { scope: 'weekly',            title: 'This week',       type: 'measurable',   emptyMessage: 'No weekly goals yet',    addLabel: '+ Add' },
  { scope: 'monthly',           title: 'This month',      type: 'measurable',   emptyMessage: 'No monthly goals yet',   addLabel: '+ Add monthly goal' },
  { scope: 'quarterly',         title: 'This quarter',    type: 'measurable',   emptyMessage: 'No quarterly goals yet', addLabel: '+ Add' },
  { scope: 'yearly',            title: 'This year',       type: 'measurable',   emptyMessage: 'No yearly goals yet',    addLabel: '+ Add' },
  { scope: 'two_to_three_year', title: '2 — 3 years',     type: 'aspirational', emptyMessage: 'Not yet captured',       addLabel: '+ Aspire' },
  { scope: 'lifetime',          title: 'Lifetime vision', type: 'aspirational', emptyMessage: 'Not yet captured',       addLabel: '+ Aspire' },
];


type FormMode =
  | { kind: 'closed' }
  | { kind: 'create'; scope: GoalScope | null }
  | { kind: 'edit'; goal: Goal };

/** Phase 2 step 6g — passed from the page-level component down
 *  to every row so collapse state is a single source of truth
 *  across both views and persists across reloads. Scope is
 *  optional so the helper can tweak the default per row type
 *  (yearly umbrellas default collapsed for the redesign). */
interface RowCollapseAccess {
  isRowExpanded: (goalId: string, isUmbrella: boolean, scope?: GoalScope) => boolean;
  onToggleRow: (goalId: string, isUmbrella: boolean, scope?: GoalScope) => void;
}

export default function Goals() {
  // No default value — `goals` is `undefined` until the live query
  // resolves the first time. The onboarding latch effect below uses
  // that undefined sentinel to wait for a definitive answer before
  // deciding whether to enter the flow. Downstream consumers of
  // `goals` use `goals ?? []` defensively until the early-return
  // below fires.
  const goals = useLiveQuery(
    () => db.goals.where('status').equals('active').toArray(),
    [],
  );
  const proficiencyDefs = useLiveQuery(
    () => db.proficiencyDefinitions.toArray(),
    [],
    [] as ProficiencyDefinition[],
  );

  // Songs back the song-mode goal preview on Goals home (e.g.
  // "Take Mirror to Solid in C"). Cheap — songs is a small table.
  // Skill IDs for songs follow `repertoire:song:<song.id>` per
  // canonicalSkillId in src/modules/skills/registry.ts; we encode
  // that prefix-stripping inside songLookup so callers don't need
  // to reach into the registry.
  const songs = useLiveQuery(
    () => db.songs.toArray(),
    [],
    [] as Song[],
  );
  const songLookup = useMemo(() => {
    const bySkillId = new Map<string, Song>();
    for (const s of songs) bySkillId.set(`repertoire:song:${s.id}`, s);
    return (skillId: string) => bySkillId.get(skillId);
  }, [songs]);

  // Seed proficiency definitions on first mount. Lifecycle-aware
  // (defers until sync is ready); idempotent on re-runs.
  useEffect(() => {
    void seedProficiencyDefinitionsIfNeeded().catch(err => {
      console.warn('[goals] seedProficiencyDefinitionsIfNeeded failed', err);
    });
  }, []);

  // Phase 2 1h — one-time spacingState backfill from existing user
  // history. Pref-gated (PREF_SPACING_STATE_BACKFILL_V1) so it runs
  // exactly once. Mounted on Goals because that's where coverage
  // progress first becomes relevant.
  useEffect(() => {
    void backfillSpacingStateIfNeeded().catch(err => {
      console.warn('[goals] backfillSpacingStateIfNeeded failed', err);
    });
  }, []);

  // Song-of-the-Month prompt evaluation — surfaces the congrats /
  // TBD nudge when conditions are met. Dedupe + per-day cadence
  // live inside the evaluator, so it's cheap to call on every mount.
  useEffect(() => {
    void evaluateSongOfMonthPrompts().catch(err => {
      console.warn('[goals] evaluateSongOfMonthPrompts failed', err);
    });
    // Parallel evaluator for non-spotlight comfortable songs —
    // surfaces the same three-path choice (minus SotM copy +
    // queue advancement) on the next mount of PracticeSessions.
    void evaluateSongComfortablePathPrompts().catch(err => {
      console.warn('[goals] evaluateSongComfortablePathPrompts failed', err);
    });
  }, []);

  // All four Goals-home UI prefs use the same lazy-localStorage
  // pattern after 6h.2. The userPrefs / Dexie path was racing with
  // SyncContext's drain + pullAll('replace') — a write made just
  // before reload could be wiped on the next mount. Per-device UI
  // state isn't worth coordinating across devices anyway.
  const [collapseOverrides, setCollapseOverrides] =
    useState<LayerCollapseOverrides>(() => loadLayerCollapse());
  const [hiddenLayers, setHiddenLayers] = useState<GoalScope[]>(() =>
    loadHiddenLayers(),
  );
  const [activeView, setActiveView] = useState<GoalsView>(() => loadGoalsView());
  const [rowCollapse, setRowCollapse] = useState<RowCollapseState>(() =>
    loadRowCollapse(),
  );
  const [customizeOpen, setCustomizeOpen] = useState(false);
  /** Select mode — bulk goal deletion. `selected` holds checked goal
   *  ids. Entered via the header Select button (nothing pre-checked)
   *  or the month-end cleanup banner (its goals pre-checked). Not
   *  persisted — leaving the page exits select mode. */
  const [goalSelect, setGoalSelect] = useState<{
    active: boolean;
    selected: ReadonlySet<string>;
  }>({ active: false, selected: new Set<string>() });
  const [formMode, setFormMode] = useState<FormMode>({ kind: 'closed' });
  /** Phase 4 step 3 — WeeklyPlan modal. Auto-surfaced via the
   *  Sunday banner; also reachable from the explicit "Plan week"
   *  button in the toolbar so users on non-Sundays can still open it. */
  const [weeklyPlanOpen, setWeeklyPlanOpen] = useState(false);
  /** YearlyAnchorFlow open state. Two entry paths:
   *    · create — onRequestYearlyAnchor callback from GoalCreationFlow,
   *      or the yearly anchor backstop tap in by-module view.
   *    · edit — Edit button on the YearlyAnchorRow. `initialAnchor`
   *      carries the existing yearly umbrella so the flow opens
   *      pre-filled. */
  const [anchorMode, setAnchorMode] = useState<
    { moduleId: AnchorModuleId; initialAnchor?: Goal | null } | null
  >(null);
  /** Suggestion-flow open state. Two modes:
   *    · 'create' — driven by the per-anchor "+ Add monthly goal"
   *      affordance in by-module view. Caller pre-decides scope +
   *      module.
   *    · 'edit'   — driven by clicking edit on any monthly goal whose
   *      shape the suggestion flow can render (new-vocab metric,
   *      new-style umbrella, or Repertoire song queue children).
   *      Scope/module derived from the goal inside the flow. */
  const [suggestionFlow, setSuggestionFlow] = useState<
    | { mode: 'create'; scope: 'monthly'; moduleId: GoalFlowModuleId }
    | { mode: 'edit'; goal: Goal }
    | null
  >(null);
  /** Module picker for monthly / yearly goal creation, reached from a
   *  section's "Add/Edit Goal" affordance. The `modulePickerKind`
   *  discriminator records which path produced the module pick, so a
   *  single ModulePickerModal can serve both flows without duplicating
   *  UI. */
  const [modulePickerKind, setModulePickerKind] = useState<
    'monthly' | 'yearly' | null
  >(null);

  // Deep-link entry point for the Plan-your-month / Plan-your-week
  // banners on Dashboard and Practice Sessions. They navigate here as
  // /goals?plan=month or /goals?plan=week; we open the matching flow
  // and strip the param so a refresh won't re-open it.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const plan = searchParams.get('plan');
    if (plan !== 'month' && plan !== 'week') return;
    if (plan === 'month') setModulePickerKind('monthly');
    else setWeeklyPlanOpen(true);
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev);
        next.delete('plan');
        return next;
      },
      { replace: true },
    );
  }, [searchParams, setSearchParams]);
  // Onboarding visibility is gated by two latched flags rather than
  // a reactive expression on goals.length. We had a bug where adding
  // a goal mid-flow flipped goals.length === 0 to false, which
  // unmounted <OnboardingFlow> and dropped the user back on Goals
  // home in the middle of Screen 1.
  //
  //   onboardingActive   — latches true on the first resolved
  //                        render where the user has zero active
  //                        goals. Stays true even as goals are
  //                        added during the flow.
  //   onboardingDismissed — set only by OnboardingFlow's onExit
  //                        callback (Skip the rest / Done). The
  //                        sole kill switch.
  //
  // Both reset on tab reload / route remount so the spec's
  // "re-fires whenever zero active goals exist" rule holds across
  // sessions.
  //
  // The latch lives in render-time setState rather than a useEffect
  // (avoiding the cascading-render lint rule and an extra render).
  // Per React docs, conditional setState during render is the
  // canonical pattern for "storing information from previous
  // renders" — the guard `!onboardingActive` prevents any loop.
  const [onboardingActive, setOnboardingActive] = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);

  if (
    !onboardingActive
    && !onboardingDismissed
    && goals !== undefined
    && goals.length === 0
  ) {
    setOnboardingActive(true);
  }

  // Persist all four Goals-home UI prefs synchronously to
  // localStorage on every change. No hydrated-flag gate needed —
  // lazy initializers above ensure each first render's state
  // already matches storage, so the first effect run is a
  // harmless idempotent write.
  useEffect(() => {
    saveLayerCollapse(collapseOverrides);
  }, [collapseOverrides]);

  useEffect(() => {
    saveHiddenLayers(hiddenLayers);
  }, [hiddenLayers]);

  useEffect(() => {
    saveGoalsView(activeView);
  }, [activeView]);

  useEffect(() => {
    saveRowCollapse(rowCollapse);
  }, [rowCollapse]);

  // Stable accessors that resolve / mutate the row-collapse map
  // for any (goalId, isUmbrella) pair. Threaded through
  // LayerSection / ByModuleSection → UmbrellaRow → child GoalRow
  // so every row consults the same source of truth.
  const isRowExpanded = (goalId: string, isUmbrella: boolean, scope?: GoalScope) =>
    resolveRowExpanded(rowCollapse, goalId, isUmbrella, scope);
  const onToggleRow = (goalId: string, isUmbrella: boolean, scope?: GoalScope) =>
    setRowCollapse(s => toggleRowExpanded(s, goalId, isUmbrella, scope));

  const goalsByScope = useMemo(() => groupByScope(goals ?? []), [goals]);
  const visibleLayers = LAYERS.filter(l => !hiddenLayers.includes(l.scope));

  const toggleLayer = (scope: GoalScope) => {
    setCollapseOverrides(prev => {
      const current = effectiveCollapsed(prev[scope], (goalsByScope.get(scope) ?? []).length > 0);
      return { ...prev, [scope]: current ? 'expanded' : 'collapsed' };
    });
  };

  const setLayerHidden = (scope: GoalScope, hidden: boolean) => {
    setHiddenLayers(prev => {
      if (hidden) return prev.includes(scope) ? prev : [...prev, scope];
      return prev.filter(s => s !== scope);
    });
  };

  // ── Select mode ────────────────────────────────────────────────
  const enterSelectMode = (preselected: ReadonlyArray<string> = []) =>
    setGoalSelect({ active: true, selected: new Set(preselected) });
  const exitSelectMode = () =>
    setGoalSelect({ active: false, selected: new Set<string>() });
  /** Context value consumed by GoalRow / UmbrellaRow / WeeklyGoalRow
   *  via useGoalSelect — see selectMode.ts for why this is a context
   *  rather than threaded props. Memoized so row consumers only
   *  re-render when select state actually changes. */
  const goalSelectContextValue = useMemo<GoalSelectState>(
    () => ({
      active: goalSelect.active,
      selected: goalSelect.selected,
      toggle: goalId =>
        setGoalSelect(prev => {
          if (!prev.active) return prev;
          const next = new Set(prev.selected);
          if (next.has(goalId)) next.delete(goalId);
          else next.add(goalId);
          return { ...prev, selected: next };
        }),
    }),
    [goalSelect],
  );
  /** Delete every checked goal (umbrellas cascade into their
   *  same-scope children), then exit select mode. No confirmation
   *  dialog by design — same trust level as DeleteGoalButton's
   *  two-tap confirm, but the explicit checking IS the confirmation
   *  step here. */
  const deleteSelectedGoals = async () => {
    try {
      await deleteGoalsWithCascade([...goalSelect.selected]);
    } catch (err) {
      console.warn('[goals] bulk delete failed', err);
    }
    exitSelectMode();
  };

  // Wait for the goals live query to resolve before deciding what
  // to render — avoids briefly mounting either Goals home or
  // OnboardingFlow against the default-empty result and then
  // swapping. Render returns null for one frame; Dexie resolves
  // local IndexedDB queries in single-digit ms.
  if (goals === undefined) return null;

  // Latched-active visibility. Once the user is in the flow, only
  // explicit dismissal (onExit) flips it back off — so adding a
  // goal in Screen 1 keeps them on the screen instead of unmounting
  // OnboardingFlow mid-step.
  const showOnboarding = onboardingActive && !onboardingDismissed;
  if (showOnboarding) {
    return <OnboardingFlow onExit={() => setOnboardingDismissed(true)} />;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* No secondary page header — the sticky HARMONY bar already
          shows "Goals" as the page title. View-level controls
          (Select / Customize) live on the view-toggle row below. */}

      {goalSelect.active ? (
        /* Select-mode action bar — takes the banner stack's place so
           the actions sit exactly where the user entered select mode
           (top of page, no scrolling). Replaces the earlier sticky
           footer, which was invisible on mobile: MobileBottomNav is
           also fixed bottom-0 z-40 and renders later in the DOM, so
           it painted on top of the footer. */
        <div className="mb-4 rounded-md border border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-900/40 px-4 py-3 flex items-center gap-2">
          <span className="flex-1 text-sm text-neutral-700 dark:text-neutral-300 tabular-nums">
            {goalSelect.selected.size} selected
          </span>
          <button
            type="button"
            disabled={goalSelect.selected.size === 0}
            onClick={() => void deleteSelectedGoals()}
            className="px-3 py-1.5 rounded-md text-sm font-medium bg-needswork text-white hover:opacity-90 disabled:opacity-40"
          >
            Delete selected
          </button>
          <button
            type="button"
            onClick={exitSelectMode}
            className="px-3 py-1.5 rounded-md text-sm border border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-800"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="mb-4 flex flex-col gap-2">
          {/* Prompt to set monthly goals when the current month has no
              real (non-carry-over) monthly goal yet. Tapping opens the
              monthly creation flow (module picker → suggestion flow).
              Month is the foundation the week derives from, so this
              sits ABOVE Plan-your-week — set the month first. */}
          <PlanMonthBanner onPlanMonth={() => setModulePickerKind('monthly')} />
          <WeeklyPlanBanner onOpenPlan={() => setWeeklyPlanOpen(true)} />
          {/* Phase B Step 9b — surfaces uncovered items from last
              month's monthly target. Persistent: hides only on user
              decision (Accept/Decline per module via the review
              modal) or explicit X-dismiss. */}
          <CarryoverBanner />
          {/* Month-start cleanup — previous-month goals that are
              mathematically unrecoverable. Dismiss all deletes them in
              one tap; Select enters select mode with them pre-checked.
              Hides itself once none remain (reactive via useLiveQuery). */}
          <MonthEndCleanupBanner onSelect={ids => enterSelectMode(ids)} />
        </div>
      )}

      {/* Section heading introducing the view toggle. */}
      <div className="text-sm uppercase tracking-wide font-semibold text-neutral-600 dark:text-neutral-300 mb-1.5">
        View goals
      </div>
      {/* View toggle on the left; view-level controls (Select /
          Customize) aligned to the right of the same row. */}
      <div className="mb-4 flex items-center gap-2">
        <ViewToggle value={activeView} onChange={setActiveView} />
        <div className="ml-auto flex items-center gap-2">
          {/* Select-mode entry. Hidden while active — the action bar
              above carries Cancel as the exit. */}
          {!goalSelect.active && (
            <button
              type="button"
              onClick={() => enterSelectMode()}
              className="text-xs px-2.5 py-1.5 rounded-md text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              aria-label="select goals"
            >
              Select
            </button>
          )}
          <button
            type="button"
            onClick={() => setCustomizeOpen(true)}
            className="text-xs px-2.5 py-1.5 rounded-md text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 inline-flex items-center gap-1.5"
            aria-label="customize layers"
            title="customize layers"
          >
            <GearIcon />
            <span className="hidden sm:inline">Customize</span>
          </button>
        </div>
      </div>

      {/* Dev-only goal-wipe affordance for Phase 2 step 2 verification.
          Restored from the Phase 1.6 step 15 pattern; tree-shaken out
          of production builds via the import.meta.env.DEV guard.
          Remove once step 2 verification is fully done.

          Sync correctness: db.goals.clear() alone is NOT enough —
          sync is bidirectional, and pullAll() on focus/reconnect
          will repopulate local goals from Supabase via bulkPut, so
          "cleared" goals reappear. The full wipe needs three steps:
            1. Delete from Supabase first (so subsequent pulls have
               nothing to bring back).
            2. Suppress concurrent pulls via beginPull/endPull while
               local clear runs.
            3. Clear local table AND the syncQueue rows for goals
               (otherwise pending writes from prior creates drain
               to a now-empty cloud and re-create cloud rows). */}
      {import.meta.env.DEV && (
        <div className="mb-4 flex items-center gap-2">
          <button
            type="button"
            onClick={async () => {
              if (!confirm('Clear ALL goals from local database AND Supabase? This cannot be undone.')) return;
              setFormMode({ kind: 'closed' });
              const userId = getCurrentUserId();
              if (userId) {
                const { error } = await supabase
                  .from('goals')
                  .delete()
                  .eq('user_id', userId);
                if (error) {
                  console.warn('[goals dev-wipe] cloud delete failed', error);
                  // Bail out — clearing local without clearing cloud
                  // would just trigger the repopulation race we're
                  // trying to avoid.
                  alert(`Cloud delete failed: ${error.message}. Local NOT cleared. See console.`);
                  return;
                }
              }
              beginPull();
              try {
                await db.goals.clear();
                await db.syncQueue.where('tableName').equals('goals').delete();
              } finally {
                endPull();
              }
              setOnboardingDismissed(true);
            }}
            className="px-3 py-1.5 rounded-md text-xs font-medium border border-dashed border-needswork/60 text-needswork hover:bg-needswork/10"
          >
            Clear all goals (dev)
          </button>
        </div>
      )}

      <SongOfMonthTbdNudgeBanner />

      {/* Select-mode context wraps both views so every goal row —
          at any nesting depth — can read it without prop threading. */}
      <GoalSelectContext.Provider value={goalSelectContextValue}>
      {activeView === 'timeframe' ? (
        <div className="flex flex-col">
          {visibleLayers.map(layer => {
            let layerGoals = goalsByScope.get(layer.scope) ?? [];
            // For the Weekly layer, hide goals whose parent is a
            // monthly goal — those are confirmed-plan children
            // already surfaced in the "This week's challenge"
            // subsection summary. Stand-alone weekly goals (no
            // monthly parent, or parented to a yearly anchor) keep
            // appearing as explicit rows.
            if (layer.scope === 'weekly') {
              const monthlyGoalIds = new Set(
                (goals ?? [])
                  .filter(g => g.scope === 'monthly')
                  .map(g => g.id),
              );
              layerGoals = layerGoals.filter(
                g => !g.parentGoalId || !monthlyGoalIds.has(g.parentGoalId),
              );
            }
            const collapsed = effectiveCollapsed(
              collapseOverrides[layer.scope],
              layerGoals.length > 0,
            );
            return (
              <LayerSection
                key={layer.scope}
                layer={layer}
                goals={layerGoals}
                proficiencyDefs={proficiencyDefs}
                songLookup={songLookup}
                collapsed={collapsed}
                onToggle={() => toggleLayer(layer.scope)}
                onAdd={() => {
                  if (layer.scope === 'monthly') {
                    // Monthly creates route through GoalSuggestionFlow
                    // for parity with the by-module view. The flow
                    // needs a moduleId; the picker resolves that.
                    setModulePickerKind('monthly');
                  } else if (layer.scope === 'yearly') {
                    // Yearly anchors are also module-scoped — the
                    // picker resolves the moduleId then we route
                    // into YearlyAnchorFlow.
                    setModulePickerKind('yearly');
                  } else {
                    setFormMode({ kind: 'create', scope: layer.scope });
                  }
                }}
                onEditGoal={goal => {
                  if (isSuggestionFlowEditCandidate(goal)) {
                    setSuggestionFlow({ mode: 'edit', goal });
                  } else {
                    setFormMode({ kind: 'edit', goal });
                  }
                }}
                // Monthly-only props — LayerSection switches to the
                // anchor-aware MonthlyLayerBody when these are
                // supplied. Other scopes ignore them.
                allGoals={layer.scope === 'monthly' ? goals : undefined}
                onEditYearlyAnchor={
                  layer.scope === 'monthly'
                    ? (moduleId, anchor) =>
                        setAnchorMode({
                          moduleId: moduleId as AnchorModuleId,
                          initialAnchor: anchor,
                        })
                    : undefined
                }
                onSetYearlyAnchor={
                  layer.scope === 'monthly'
                    ? moduleId =>
                        setAnchorMode({
                          moduleId: moduleId as AnchorModuleId,
                        })
                    : undefined
                }
                onAddMonthlyGoal={
                  layer.scope === 'monthly'
                    ? moduleId =>
                        setSuggestionFlow({
                          mode: 'create',
                          scope: 'monthly',
                          moduleId,
                        })
                    : undefined
                }
                isRowExpanded={isRowExpanded}
                onToggleRow={onToggleRow}
              />
            );
          })}
          {visibleLayers.length === 0 && (
            <p className="text-sm text-neutral-500 italic py-8 text-center">
              All layers are hidden. Use Customize to bring them back.
            </p>
          )}
        </div>
      ) : (
        <ByModuleView
          goals={goals}
          proficiencyDefs={proficiencyDefs}
          songLookup={songLookup}
          onEditGoal={goal => {
            if (isSuggestionFlowEditCandidate(goal)) {
              setSuggestionFlow({ mode: 'edit', goal });
            } else {
              setFormMode({ kind: 'edit', goal });
            }
          }}
          onEditYearlyAnchor={(moduleId, anchor) =>
            setAnchorMode({
              moduleId: moduleId as AnchorModuleId,
              initialAnchor: anchor,
            })
          }
          onSetYearlyAnchor={moduleId =>
            setAnchorMode({ moduleId: moduleId as AnchorModuleId })
          }
          onAddMonthlyGoal={moduleId =>
            setSuggestionFlow({ mode: 'create', scope: 'monthly', moduleId })
          }
          isRowExpanded={isRowExpanded}
          onToggleRow={onToggleRow}
        />
      )}
      </GoalSelectContext.Provider>

      <CustomizeLayersModal
        open={customizeOpen}
        onClose={() => setCustomizeOpen(false)}
        layers={LAYERS}
        hiddenLayers={hiddenLayers}
        onSetHidden={setLayerHidden}
      />

      <ModulePickerModal
        open={modulePickerKind !== null}
        onClose={() => setModulePickerKind(null)}
        onPick={moduleId => {
          const kind = modulePickerKind;
          setModulePickerKind(null);
          if (kind === 'monthly') {
            setSuggestionFlow({
              mode: 'create',
              scope: 'monthly',
              moduleId,
            });
          } else if (kind === 'yearly') {
            setAnchorMode({ moduleId: moduleId as AnchorModuleId });
          }
        }}
        title={
          modulePickerKind === 'yearly'
            ? 'Set a yearly anchor'
            : 'Add a monthly goal'
        }
        description={
          modulePickerKind === 'yearly'
            ? 'Which module is this year anchored to?'
            : 'Which module is this month\'s focus?'
        }
      />

      {/* Entry-point routing:
            - All creates from layer-section "+ Add" → GoalCreationFlow.
            - Monthly edits whose shape the suggestion flow can render
              (new-vocab metric / new-style umbrella / Repertoire song
              queue) → GoalSuggestionFlow (handled below).
            - Other new-vocab edits → GoalCreationFlow.
            - Old-vocab edits → GoalFormModal.
          GoalFormModal stays mounted alongside GoalCreationFlow until
          all old-vocab goals are aged out / migrated. */}
      <GoalCreationFlow
        key={
          formMode.kind === 'edit' && isNewVocabMetric(formMode.goal.targetMetric)
            ? `edit-${formMode.goal.id}`
            : formMode.kind === 'create'
              ? 'create'
              : 'closed'
        }
        open={
          formMode.kind === 'create'
          || (formMode.kind === 'edit' && isNewVocabMetric(formMode.goal.targetMetric))
        }
        onClose={() => setFormMode({ kind: 'closed' })}
        initialGoal={
          formMode.kind === 'edit' && isNewVocabMetric(formMode.goal.targetMetric)
            ? formMode.goal
            : null
        }
        initialScope={formMode.kind === 'create' ? formMode.scope : null}
        onRequestYearlyAnchor={(moduleId) => {
          // GoalCreationFlow has already self-closed by the time
          // this fires; just open the anchor flow.
          setAnchorMode({ moduleId: moduleId as AnchorModuleId });
        }}
      />

      {/* Phase 2 step 5f — YearlyAnchorFlow mount.
            Opens when the user picks "Set yearly anchor first" on
            the GoalCreationFlow trigger interstitial. The user's
            in-progress goal draft is discarded; saving the anchor
            closes this flow and returns the user to the Goals home
            (Phase 7 polish: resume goal creation after save). */}
      <YearlyAnchorFlow
        key={
          anchorMode
            ? anchorMode.initialAnchor
              ? `anchor-edit-${anchorMode.initialAnchor.id}`
              : `anchor-create-${anchorMode.moduleId}`
            : 'anchor-closed'
        }
        open={anchorMode !== null}
        onClose={() => setAnchorMode(null)}
        moduleId={anchorMode?.moduleId ?? 'ear-training'}
        initialAnchor={anchorMode?.initialAnchor ?? null}
      />

      <GoalFormModal
        open={formMode.kind === 'edit' && !isNewVocabMetric(formMode.goal.targetMetric)}
        onClose={() => setFormMode({ kind: 'closed' })}
        initialGoal={
          formMode.kind === 'edit' && !isNewVocabMetric(formMode.goal.targetMetric)
            ? formMode.goal
            : null
        }
        initialScope={null}
      />

      {/* Short-horizon suggestion flow. Handles both:
            · create — driven by per-anchor "+ Add monthly goal" in
              by-module view. scope + moduleId pre-decided by caller.
            · edit — driven by clicking edit on a monthly goal whose
              shape this flow can render. scope + moduleId derived
              from the goal inside the flow.
          The key prop differs between modes to force a fresh remount
          on each open so each body's useState lazy initializers re-
          read editPrefill / suggest* defaults cleanly. */}
      <GoalSuggestionFlow
        key={
          suggestionFlow?.mode === 'edit'
            ? `suggestion-edit-${suggestionFlow.goal.id}`
            : suggestionFlow?.mode === 'create'
              ? `suggestion-create-${suggestionFlow.scope}-${suggestionFlow.moduleId}`
              : 'suggestion-closed'
        }
        open={suggestionFlow !== null}
        onClose={() => setSuggestionFlow(null)}
        scope={
          suggestionFlow?.mode === 'create'
            ? suggestionFlow.scope
            : 'monthly'
        }
        moduleId={
          suggestionFlow?.mode === 'create'
            ? suggestionFlow.moduleId
            : 'harmonic-fluency'
        }
        existingGoal={suggestionFlow?.mode === 'edit' ? suggestionFlow.goal : null}
      />

      {/* Phase 4 step 3 — WeeklyPlan modal. Mounted here so its
          state lives at the page level (Goals.tsx is also where the
          Sunday banner mounts via WeeklyPlanBanner above). */}
      <WeeklyPlan
        key={weeklyPlanOpen ? 'weekly-plan-open' : 'weekly-plan-closed'}
        open={weeklyPlanOpen}
        onClose={() => setWeeklyPlanOpen(false)}
      />
    </div>
  );
}

// -------------------------------------------------------------------

/** "May 31 → Jun 6" for the week beginning at `weekStart` (Sunday). */
function formatWeekRange(weekStart: number): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const start = new Date(weekStart).toLocaleDateString(undefined, opts);
  const end = new Date(endOfWeekLocal(weekStart)).toLocaleDateString(undefined, opts);
  return `${start} → ${end}`;
}

function LayerSection({
  layer,
  goals,
  proficiencyDefs,
  songLookup,
  collapsed,
  onToggle,
  onAdd,
  onEditGoal,
  allGoals,
  onEditYearlyAnchor,
  onSetYearlyAnchor,
  onAddMonthlyGoal,
  isRowExpanded,
  onToggleRow,
}: {
  layer: LayerDef;
  goals: Goal[];
  proficiencyDefs: ProficiencyDefinition[];
  songLookup: (skillId: string) => Song | undefined;
  collapsed: boolean;
  onToggle: () => void;
  onAdd: () => void;
  onEditGoal: (goal: Goal) => void;
  /** Optional — when set on the monthly layer, the section renders
   *  yearly anchor + nested monthly-goal rows per module (parity
   *  with by-module view's THIS MONTH section). All four below
   *  must be provided together. */
  allGoals?: Goal[];
  onEditYearlyAnchor?: (moduleId: GoalFlowModuleId, anchor: Goal) => void;
  onSetYearlyAnchor?: (moduleId: GoalFlowModuleId) => void;
  onAddMonthlyGoal?: (moduleId: GoalFlowModuleId) => void;
} & RowCollapseAccess) {
  const hasMonthlyAnchorWiring =
    layer.scope === 'monthly'
    && !!allGoals
    && !!onEditYearlyAnchor
    && !!onSetYearlyAnchor
    && !!onAddMonthlyGoal;
  // Muted period sub-line under the section title: the current week's
  // date range for THIS WEEK (lets the plan table drop its redundant
  // inner label), the current month + year for THIS MONTH.
  const headerSubLine =
    layer.scope === 'weekly'
      ? formatWeekRange(startOfWeekLocal(Date.now()))
      : layer.scope === 'monthly'
        ? new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
        : null;
  return (
    <section className="mb-3">
      {/* Header: chevron+title (toggle) on the left, goal count +
          per-layer "Add/Edit Goal" affordance on the right. The
          add button routes via the parent's onAdd, which already
          maps each scope to the right downstream flow (monthly →
          module picker → suggestion flow, yearly → module picker
          → anchor flow, weekly/other → creation flow). */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          className="flex-1 flex items-center gap-2 text-left rounded transition"
        >
          <Chevron open={!collapsed} />
          <div className="flex-1 min-w-0">
            <h2
              className="text-sm font-medium uppercase tracking-wide"
              style={{ color: LAYER_PALETTE.border }}
            >
              {layer.title}
            </h2>
            {headerSubLine && (
              <div className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                {headerSubLine}
              </div>
            )}
          </div>
          <span className="text-xs text-neutral-500">
            {goals.length === 0 ? '—' : `${goals.length} goal${goals.length === 1 ? '' : 's'}`}
          </span>
        </button>
        <button
          type="button"
          onClick={onAdd}
          className="text-xs text-neutral-600 dark:text-neutral-300 hover:text-fluent transition-colors shrink-0"
        >
          Add/Edit Goal
        </button>
      </div>
      {!collapsed && hasMonthlyAnchorWiring && (
        <div className="mt-3">
          <MonthlyLayerBody
            allGoals={allGoals!}
            proficiencyDefs={proficiencyDefs}
            songLookup={songLookup}
            onEditGoal={onEditGoal}
            onEditYearlyAnchor={onEditYearlyAnchor!}
            onSetYearlyAnchor={onSetYearlyAnchor!}
            onAddMonthlyGoal={onAddMonthlyGoal!}
            isRowExpanded={isRowExpanded}
            onToggleRow={onToggleRow}
          />
          <button
            type="button"
            onClick={onAdd}
            className="self-start text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 mt-3"
          >
            {layer.addLabel}
          </button>
        </div>
      )}

      {!collapsed && !hasMonthlyAnchorWiring && (
        <div className="mt-3 space-y-3">
          {/* Plan table renders directly under the expanded "This
              week" header — no intermediate "This week's challenge"
              card. The body's live query stays gated behind this
              LayerSection's expansion, so it still only mounts on tap. */}
          {layer.scope === 'weekly' && <WeeklyChallengeBody />}
          {goals.length === 0 ? (
            // The weekly section's empty prompt is suppressed — the
            // "Plan your week" banner + the WeeklyChallengeBody above
            // already own that entry point, so an empty This week
            // section just shows the planning UI, nothing redundant.
            layer.scope === 'weekly' ? null : (
              <div className="flex items-center gap-3 py-2">
                <span className="text-sm text-neutral-500 italic">{layer.emptyMessage}</span>
                <button
                  type="button"
                  onClick={onAdd}
                  className="text-sm text-neutral-700 dark:text-neutral-200 hover:underline"
                >
                  {layer.addLabel}
                </button>
              </div>
            )
          ) : (
            <div className="flex flex-col gap-3">
              {groupByModule(topLevelGoals(goals), goals).map(group => {
                const palette = group.moduleId
                  ? SECTION_PALETTE[group.moduleId]
                  : null;
                const groupContent = (
                  <ul className="flex flex-col gap-1.5">
                    {group.goals.map(g =>
                      g.isUmbrella ? (
                        <UmbrellaRow
                          key={g.id}
                          umbrella={g}
                          childGoals={findChildren(g, goals)}
                          layerType={layer.type}
                          proficiencyDefs={proficiencyDefs}
                          songLookup={songLookup}
                          onEditGoal={onEditGoal}
                          isRowExpanded={isRowExpanded}
                          onToggleRow={onToggleRow}
                        />
                      ) : (
                        <GoalRow
                          key={g.id}
                          goal={g}
                          layerType={layer.type}
                          proficiencyDefs={proficiencyDefs}
                          songLookup={songLookup}
                          onEdit={() => onEditGoal(g)}
                          isRowExpanded={isRowExpanded}
                          onToggleRow={onToggleRow}
                        />
                      ),
                    )}
                  </ul>
                );
                if (!palette || !group.moduleId) {
                  // Goals with no derivable module render flat —
                  // no colored container.
                  return (
                    <Fragment key={group.moduleId ?? '__no-module'}>
                      {groupContent}
                    </Fragment>
                  );
                }
                return (
                  <div
                    key={group.moduleId}
                    className="rounded-lg pl-3 pr-2 py-2"
                    style={{
                      backgroundColor: palette.bg,
                      borderLeft: `3px solid ${palette.border}`,
                    }}
                  >
                    <ModuleSubheader moduleId={group.moduleId} />
                    {groupContent}
                  </div>
                );
              })}
              <button
                type="button"
                onClick={onAdd}
                className="self-start text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 mt-1"
              >
                {layer.addLabel}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * The by-timeframe Weekly LayerSection's body content. Two modes:
 *
 *   · unconfirmed — no weekly goal rows linked to a monthly
 *     parent exist for this week. Shows the inline <WeeklyPlan />
 *     planning UI: review + propose + Confirm.
 *
 *   · confirmed — at least one such weekly goal exists. Shows a
 *     compact summary of the saved targets + a "Re-plan" button
 *     that wipes the confirmed goals and restores the planning UI.
 *
 * Rendered directly under the expanded "This week" LayerSection
 * (no intermediate wrapper card) — the section's own collapse
 * gates the mount, so the confirmed-goals live query still only
 * fires once the user expands This week.
 */
function WeeklyChallengeBody() {
  const weekStart = useMemo(() => startOfWeekLocal(Date.now()), []);
  const weekEnd = useMemo(() => endOfWeekLocal(weekStart), [weekStart]);
  // Detect by parent linkage + date overlap so weekly goals saved
  // mid-week via GoalCreationFlow (startDate = an arbitrary
  // millisecond, not Sunday-midnight) are recognized as part of
  // the confirmed plan when they're children of an active monthly
  // goal. See loadConfirmedPlanForWeek for the full predicate.
  const confirmedGoals = useLiveQuery<Goal[]>(
    async () => loadConfirmedPlanForWeek(weekStart, weekEnd),
    [weekStart, weekEnd],
  );

  // Live query in flight — render nothing rather than flash the
  // planning UI for a frame and then swap to the summary.
  if (confirmedGoals === undefined) {
    return (
      <div className="text-sm text-neutral-500 italic py-3">Loading…</div>
    );
  }

  if (confirmedGoals.length === 0) {
    return <WeeklyPlan inline open={false} onClose={() => {}} />;
  }

  return <ConfirmedWeeklyPlanSummary goals={confirmedGoals} />;
}

/**
 * Compact summary of an already-confirmed weekly plan: one row
 * per confirmed goal showing the module and target, optionally
 * with a small time estimate. "Re-plan" wipes the confirmed
 * goals so the planning UI returns on the next render.
 *
 * Time hints reuse `getWeeklyTimeEstimate` for the standard
 * attempt / session / lesson units. Unsupported units (days /
 * minutes / hours where the per-unit math isn't honest) drop the
 * time suffix rather than print a guess.
 */
function ConfirmedWeeklyPlanSummary({ goals }: { goals: Goal[] }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  // Song count drives whether the Repertoire breakdown shows the
  // Maintenance line. ≥2 songs → at least one maintenance
  // candidate exists (one for spotlight, anything else for
  // maintenance); 0 or 1 → spotlight line only. Mirrors the gate
  // used by WeeklyPlan's inline breakdown so both surfaces stay
  // consistent. Defaults to 0 while the query hydrates — the
  // Maintenance line appears as soon as the count resolves.
  const songCount = useLiveQuery<number>(
    async () => db.songs.count(),
    [],
  ) ?? 0;

  // Load the parent monthly goals so each weekly row can borrow its
  // activity name from the richer parent description. The weekly's
  // own description (written by WeeklyPlan.handleConfirm) is only
  // "Module — N unit this week" — no activity context. The monthly
  // typically reads like "Module — Major triads to fluent", which
  // is where the activity portion comes from after parseActivityName
  // strips the module prefix + any trailing target phrase.
  const parentIds = useMemo(
    () =>
      [...new Set(
        goals
          .map(g => g.parentGoalId)
          .filter((id): id is string => !!id),
      )],
    [goals],
  );
  const parentsById = useLiveQuery<Map<string, Goal>>(
    async () => {
      if (parentIds.length === 0) return new Map();
      const rows = await db.goals.bulkGet(parentIds);
      const map = new Map<string, Goal>();
      for (const r of rows) if (r) map.set(r.id, r);
      return map;
    },
    [parentIds],
  ) ?? new Map<string, Goal>();

  // Group the confirmed weekly rows by module so each module gets
  // one header (dot + label) with activities listed beneath it —
  // same visual hierarchy as the plan-table multi-row groups.
  // Group ordering follows ORDERED_GOAL_MODULES so the by-module
  // sequence stays consistent across every surface (Goals home,
  // weekly plan, picker, etc.).
  const orderedGroups = useMemo(() => {
    const map = new Map<GoalFlowModuleId, Goal[]>();
    for (const g of goals) {
      const moduleId = g.relatedModules[0] as GoalFlowModuleId | undefined;
      if (!moduleId) continue;
      const arr = map.get(moduleId) ?? [];
      arr.push(g);
      map.set(moduleId, arr);
    }
    return ORDERED_GOAL_MODULES
      .map(moduleId => [moduleId, map.get(moduleId) ?? []] as const)
      .filter(([, list]) => list.length > 0);
  }, [goals]);

  const handleReplan = async () => {
    if (busy) return;
    if (!confirm("Clear this week's saved plan and start over?")) return;
    setBusy(true);
    try {
      await db.goals.bulkDelete(goals.map(g => g.id));
      // Close the sync-queue race: the `deleting` Dexie hook
      // schedules an `enqueue` via setTimeout(0) (intentional — see
      // hooks.ts comment about PSD escape). If the user refreshes
      // before that task runs, the syncQueue stays empty, the next
      // replace-pull sees the cloud rows still present, and bulkPuts
      // them back into local Dexie — the confirmed plan reappears.
      //
      // Yield once so the queued setTimeout(0) callbacks fire and
      // land their items in syncQueue, then drain so Supabase
      // deletes the rows before the user can navigate away. The
      // outer busy=true state already renders "Clearing…", so the
      // wait is visible.
      await new Promise(resolve => setTimeout(resolve, 0));
      await drain();
      toast({
        message: "Plan cleared — set new targets to confirm.",
        variant: 'success',
      });
    } catch (err) {
      console.warn('[ConfirmedWeeklyPlanSummary] re-plan failed', err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 py-1">
      <div className="flex flex-col gap-3">
        {orderedGroups.map(([moduleId, moduleGoals]) => {
          const meta = moduleMetaById(moduleId);
          const moduleLabel = meta?.label ?? MODULE_DISPLAY_NAME[moduleId];
          const accentHex = meta?.accentHex ?? GOALS_META.accentHex;

          // Repertoire is special: instead of the per-goal listing
          // (which surfaces vague rows like "Repertoire — 6 days
          // this week" and gives the wrong ~18 min time estimate for
          // sessions), render the canonical per-session split that
          // matches what the session allocator actually delivers.
          // Maintenance line is gated on songCount ≥ 2 so it
          // doesn't appear when the user only has the spotlight.
          if (moduleId === 'repertoire') {
            const lines = buildRepertoireSessionBreakdownLines(songCount >= 2);
            return (
              <div key={moduleId}>
                <div className="flex items-center gap-2 text-sm font-medium text-neutral-800 dark:text-neutral-100">
                  <span
                    aria-hidden
                    className="inline-block w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: accentHex }}
                  />
                  <span>{moduleLabel}</span>
                </div>
                <ul
                  className="flex flex-col gap-1 pl-4 mt-1.5 border-l"
                  style={{ borderColor: `${accentHex}55` }}
                >
                  {lines.map((line, idx) => {
                    // Split on the em-dash that the helper inserts
                    // between activity name and time so we can give
                    // the activity portion the same "font-medium"
                    // treatment as the other module rows. Falls back
                    // to the whole line as bold if the dash is gone
                    // (defensive — shouldn't happen in practice).
                    const [name, rest] = line.split(' — ');
                    return (
                      <li
                        key={idx}
                        className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm text-neutral-700 dark:text-neutral-200"
                      >
                        <span className="font-medium">{name}</span>
                        {rest && (
                          <span className="text-neutral-600 dark:text-neutral-300">
                            — {rest}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          }

          return (
            <div key={moduleId}>
              <div className="flex items-center gap-2 text-sm font-medium text-neutral-800 dark:text-neutral-100">
                <span
                  aria-hidden
                  className="inline-block w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: accentHex }}
                />
                <span>{moduleLabel}</span>
              </div>
              <ul
                className="flex flex-col gap-1 pl-4 mt-1.5 border-l"
                style={{ borderColor: `${accentHex}55` }}
              >
                {moduleGoals.map(g => {
                  const target = g.targetValue ?? 0;
                  const unit = g.targetUnit ?? '';
                  const parent = g.parentGoalId
                    ? parentsById.get(g.parentGoalId)
                    : undefined;
                  const activityName =
                    parseActivityName(parent?.description, moduleLabel)
                    ?? parseActivityName(g.description, moduleLabel)
                    ?? g.description;

                  let timeText: string | null = null;
                  if (unit === 'attempts' || unit === 'sessions' || unit === 'lessons') {
                    const est = getWeeklyTimeEstimate(moduleId, target);
                    timeText = est.kind === 'point'
                      ? `~${formatMins(est.minutes)}`
                      : `~${formatMins(est.minMinutes)}–${formatMins(est.maxMinutes)}`;
                  } else if (unit === 'hours' && target > 0) {
                    timeText = `~${formatMins(target * 60)}`;
                  } else if (unit === 'minutes' && target > 0) {
                    timeText = `~${formatMins(target)}`;
                  }

                  return (
                    <li
                      key={g.id}
                      className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm text-neutral-700 dark:text-neutral-200"
                    >
                      <span className="font-medium">{activityName}</span>
                      <span className="text-neutral-600 dark:text-neutral-300">
                        — {target} {unit} this week
                      </span>
                      {timeText && (
                        <span className="text-xs text-neutral-500 dark:text-neutral-400">
                          · {timeText}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => void handleReplan()}
        disabled={busy}
        className="text-xs text-neutral-500 hover:text-fluent transition-colors disabled:opacity-50"
      >
        {busy ? 'Clearing…' : 'Re-plan'}
      </button>
    </div>
  );
}

/**
 * Parse the activity portion of a goal description: strip the
 * leading "Module — " prefix (case-insensitive) and any trailing
 * target phrase ("— 60 attempts this week", "60 attempts this
 * week"). Returns null when nothing useful remains, so callers can
 * chain through a fallback.
 *
 * Examples (with moduleLabel = "Shapes & Patterns"):
 *   "Shapes & Patterns — Major triads to fluent"
 *     → "Major triads to fluent"
 *   "Shapes & Patterns — 60 attempts this week"
 *     → null  (just a count phrase, no activity name)
 *   "Major triads — 60 attempts"  (no module prefix)
 *     → "Major triads"
 */
function parseActivityName(
  description: string | undefined,
  moduleLabel: string,
): string | null {
  if (!description) return null;
  let remaining = description.trim();

  // Strip "Module — " prefix (case-insensitive). Use both em-dash
  // and ASCII-dash separators since user-typed goals may use either.
  const lowered = remaining.toLowerCase();
  const moduleLower = moduleLabel.toLowerCase();
  for (const sep of [' — ', ' - ']) {
    const prefix = moduleLower + sep;
    if (lowered.startsWith(prefix)) {
      remaining = remaining.slice(moduleLabel.length + sep.length);
      break;
    }
  }

  // Strip trailing target phrase. Two shapes the codebase produces:
  //   · "— 60 attempts this week" (handleConfirm format)
  //   · " 60 attempts this week" (legacy / hand-typed)
  // Plus standalone "this week" / "this month" suffixes.
  remaining = remaining
    .replace(/\s*[—-]\s*\d+\s+\w+(\s+(this|per)\s+\w+)?\s*$/i, '')
    .replace(/\s+\d+\s+\w+(\s+(this|per)\s+\w+)?\s*$/i, '')
    .replace(/\s*(this|per)\s+\w+\s*$/i, '')
    .trim();

  if (remaining.length === 0) return null;
  // Reject pure-numeric leftovers — those are target phrases, not
  // activity names.
  if (/^\d+\s+\w+/.test(remaining) && !/\D/.test(remaining.split(/\s+/)[0])) {
    return null;
  }
  return remaining;
}

/** Compact "Xh Ym" / "Xm" formatter for inline summaries. Mirrors
 *  WeeklyPlan's internal formatMinutes — duplicated here to keep
 *  this file from importing internals across modules. */
function formatMins(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return '0m';
  const rounded = Math.round(min);
  const h = Math.floor(rounded / 60);
  const m = rounded - h * 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * Body of the by-timeframe MONTHLY layer when wired with the
 * anchor-aware props. Walks `ORDERED_GOAL_MODULES` and renders one
 * group per module that has either a yearly anchor or any monthly
 * goal. Each group mirrors the by-module section's Yearly + This
 * month subsections so the user sees the same hierarchy regardless
 * of which view they're in. Dimension rows inside use the same
 * collapsible GoalRow with `omitActivityChart` + `omitRowActions`
 * that by-module uses — collapsed by default, tap to expand.
 */
function MonthlyLayerBody({
  allGoals,
  proficiencyDefs,
  songLookup,
  onEditGoal,
  onEditYearlyAnchor,
  onSetYearlyAnchor,
  onAddMonthlyGoal,
  isRowExpanded,
  onToggleRow,
}: {
  allGoals: Goal[];
  proficiencyDefs: ProficiencyDefinition[];
  songLookup: (skillId: string) => Song | undefined;
  onEditGoal: (g: Goal) => void;
  onEditYearlyAnchor: (moduleId: GoalFlowModuleId, anchor: Goal) => void;
  onSetYearlyAnchor: (moduleId: GoalFlowModuleId) => void;
  onAddMonthlyGoal: (moduleId: GoalFlowModuleId) => void;
} & RowCollapseAccess) {
  return (
    <div className="flex flex-col gap-3">
      {ORDERED_GOAL_MODULES.map(moduleId => {
        const { yearlyAnchor, monthlyGoals: rawMonthlyGoals } =
          bucketModuleGoalsByTimeframe(moduleId, allGoals);
        // Hide modules that have neither an anchor nor monthly
        // goals — they'd render as an empty container.
        if (!yearlyAnchor && rawMonthlyGoals.length === 0) return null;
        const monthlyGoals = [...rawMonthlyGoals].sort(
          (a, b) => dimensionSortOrder(a) - dimensionSortOrder(b),
        );
        const palette = SECTION_PALETTE[moduleId];
        const meta = moduleMetaById(moduleId);
        const accentHex = meta?.accentHex ?? GOALS_META.accentHex;
        return (
          <div
            key={moduleId}
            className="rounded-lg pl-3 pr-2 py-2"
            style={{
              backgroundColor: palette.bg,
              borderLeft: `3px solid ${palette.border}`,
            }}
          >
            <ModuleSubheader moduleId={moduleId} />

            {/* YEARLY anchor */}
            <div className="flex flex-col gap-1.5 mb-3">
              <SubSectionLabel>Yearly</SubSectionLabel>
              {yearlyAnchor ? (
                <YearlyAnchorRow
                  umbrella={yearlyAnchor}
                  childGoals={findAllChildren(yearlyAnchor, allGoals)}
                  onEdit={() => onEditYearlyAnchor(moduleId, yearlyAnchor)}
                />
              ) : (
                <YearlyAnchorBackstop
                  moduleId={moduleId}
                  onClick={() => onSetYearlyAnchor(moduleId)}
                />
              )}
            </div>

            {/* THIS MONTH — nested under the yearly anchor with the
                same indent + accent border as the by-module view. */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <SubSectionLabel>This month</SubSectionLabel>
                {monthlyGoals.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onEditGoal(monthlyGoals[0])}
                    className="text-[11px] text-neutral-500 hover:text-fluent transition-colors"
                    aria-label="Edit this month's goal"
                  >
                    Edit
                  </button>
                )}
              </div>
              {monthlyGoals.length === 0 ? (
                <button
                  type="button"
                  onClick={() => onAddMonthlyGoal(moduleId)}
                  className="text-xs text-neutral-500 dark:text-neutral-400 italic hover:text-fluent transition-colors py-1"
                >
                  + Add monthly goal
                </button>
              ) : (
                <ul className="flex flex-col gap-1">
                  {monthlyGoals.map(g => (
                    <GoalRow
                      key={g.id}
                      goal={g}
                      layerType="measurable"
                      proficiencyDefs={proficiencyDefs}
                      songLookup={songLookup}
                      onEdit={() => onEditGoal(g)}
                      dimensionLabel={goalTypeLabel(g, moduleId)}
                      dimensionAccentHex={accentHex}
                      omitActivityChart
                      omitRowActions
                      isRowExpanded={isRowExpanded}
                      onToggleRow={onToggleRow}
                    />
                  ))}
                </ul>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Status fragment for the meta sub-line beneath a goal title. The
 * goal-row visual redesign collapses what used to be a multi-line
 * stack (dimension label, bold-italic title, prose sub-description,
 * separate progress slot) into one quiet "Type · status" line.
 *
 * Resolution order:
 *   in-progress  → "current/target"
 *   not-started  → "target {unit}" for consistency goals (so the
 *                  user sees "6 days/week" rather than "Not started"
 *                  for a habit they haven't logged this period),
 *                  otherwise the plain "Not started" label.
 *   umbrella     → null (umbrella aggregates don't carry one)
 *   hidden       → null (aspirational rows skip the slot entirely)
 */
export function goalRowMetaStatus(
  goal: Goal,
  slotState: ProgressSlotState,
): string | null {
  if (slotState.kind === 'in-progress') {
    return `${formatGoalNumber(slotState.currentValue)}/${formatGoalNumber(slotState.targetValue)}`;
  }
  if (slotState.kind === 'not-started') {
    if (
      isConsistencyMetric(goal.targetMetric)
      && slotState.targetValue > 0
      && slotState.targetUnit
    ) {
      return formatConsistencyTarget(slotState.targetValue, slotState.targetUnit);
    }
    return 'Not started';
  }
  return null;
}

/** Format a consistency goal's frequency target for the meta sub-line.
 *  Consistency goals carry a count + a cadence unit ('week' / 'month'),
 *  so the bare "{n} {unit}" join read as the ungrammatical "6 week".
 *  Render frequency cadences as "6×/week"; any non-cadence unit
 *  (defensive) keeps the plain "{n} {unit}" join. */
export function formatConsistencyTarget(value: number, unit: string): string {
  const n = formatGoalNumber(value);
  if (unit === 'week' || unit === 'month') return `${n}×/${unit}`;
  return `${n} ${unit}`;
}

function formatGoalNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/**
 * Phase 2 step 6a — GoalRow with reserved progress + feasibility
 * slots and a collapsed / expanded anatomy.
 *
 * Collapsed (default): description + target preview + progress
 * slot + feasibility slot — all glanceable in one tap target.
 *
 * Expanded: activity-chart placeholder (filled in 6b/6c) +
 * progress bar block + feasibility detail block + a divider, then
 * Edit / Delete actions. The divider keeps the data display
 * visually separate from the row-level actions.
 *
 * Both slots render in collapsed AND expanded states for
 * aspirational layers (`two_to_three_year`, `lifetime`) the slots
 * are skipped entirely — those layers are open-text reflections
 * with no measurable progress.
 *
 * Slot DOM hooks (`data-progress-slot`, `data-feasibility-slot`,
 * `data-activity-area`) are stable selectors Step 7 can target
 * without retrofitting the layout.
 */
function GoalRow({
  goal,
  layerType,
  onEdit,
  dimensionLabel,
  omitActivityChart,
  suppressFeasibilityDetail,
  omitRowActions,
  isRowExpanded,
  onToggleRow,
}: {
  goal: Goal;
  layerType: LayerDef['type'];
  proficiencyDefs: ProficiencyDefinition[];
  songLookup: (skillId: string) => Song | undefined;
  onEdit: () => void;
  /** When this row is a child of an umbrella, surfaces the
   *  user-facing dimension label above the description (e.g.
   *  "Breadth", "Mastery", "Accuracy" for ET/HF Depth goals,
   *  "Proficiency" for time-module Depth goals, "Consistency").
   *  Caller maps the canonical dimension via
   *  `dimensionDisplayLabel` before passing in. Null = no
   *  label rendered. */
  dimensionLabel?: string | null;
  /** When true, the expanded panel skips the activity chart
   *  entirely. Used by UmbrellaRow for its children — they
   *  share the umbrella's module, so their charts would be
   *  identical to the umbrella's. Standalone goals (no parent
   *  umbrella) keep their chart. */
  omitActivityChart?: boolean;
  /** When true, the expanded panel skips the feasibility
   *  detail text. Used by UmbrellaRow for an all-unrecoverable
   *  umbrella's children — per the 7d-amend spec, the unified
   *  message shows once at the umbrella level and per-child
   *  messages disappear. */
  suppressFeasibilityDetail?: boolean;
  /** When true, the expanded panel skips the Edit + Delete
   *  action row entirely. Used by ByModuleSection's monthly
   *  children — the "This month" subheader carries a single
   *  always-visible Edit button for the whole umbrella, so
   *  per-dimension actions become redundant. */
  omitRowActions?: boolean;
  /** Module accent for the dimension label. Falls back to the
   *  Goals page accent when not provided. */
  dimensionAccentHex?: string;
} & RowCollapseAccess) {
  const expanded = isRowExpanded(goal.id, false);
  const setExpanded = () => onToggleRow(goal.id, false);
  // Select mode — when active, the row tap toggles the checkbox
  // instead of expanding, and row actions (delete/expand body) hide.
  const select = useGoalSelect();
  const slotState = progressSlotState(goal, layerType);
  const showSlots = shouldShowSlots(layerType);
  const progressText = progressSlotText(slotState);
  const progressPct = progressSlotPercent(slotState);
  // Visual-redesign meta sub-line: "Type · status" e.g.
  // "Coverage · 4/26" / "Coverage · Not started" / "Consistency ·
  // 6 days/week". Falls back to type-only or status-only when one
  // side is missing.
  const derivedTypeLabel =
    dimensionLabel ?? goalTypeLabel(goal, moduleForMetric(goal.targetMetric));
  const metaStatus = goalRowMetaStatus(goal, slotState);
  const metaLine = derivedTypeLabel && metaStatus
    ? `${derivedTypeLabel} · ${metaStatus}`
    : (derivedTypeLabel ?? metaStatus ?? null);
  // Feasibility — passes goal.currentValue as the live numerator
  // for now. Phase 5 keeps that column in sync with spacingState
  // automatically; until then the read may lag a session or two.
  const feasibility = useMemo<GoalFeasibility>(
    () =>
      getGoalFeasibility(goal, {
        currentValue: goal.currentValue,
        today: new Date(),
        mix: loadDayProfileMix(),
      }),
    [goal],
  );


  return (
    <li
      data-testid="goal-row"
      className="border-t border-neutral-200/60 dark:border-neutral-800/60 first:border-t-0 pt-1.5 first:pt-0"
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={
            select.active ? () => select.toggle(goal.id) : setExpanded
          }
          aria-expanded={select.active ? undefined : expanded}
          className="flex-1 min-w-0 text-left px-2 py-1 -ml-2 rounded hover:bg-neutral-50 dark:hover:bg-neutral-900/40 transition flex items-center gap-3"
        >
          {select.active && (
            <SelectCheckbox checked={select.selected.has(goal.id)} />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-normal text-neutral-900 dark:text-neutral-100">
              {goal.description || <span className="italic text-neutral-500">(untitled goal)</span>}
            </div>
            {metaLine && (
              <div className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                {metaLine}
              </div>
            )}
          </div>

          <div className="flex items-center shrink-0">
            {showSlots && <FeasibilityPill feasibility={feasibility} />}
          </div>
        </button>
        {/* DeleteGoalButton renders on every row regardless of
            omitRowActions — that prop only suppresses the expanded-
            panel Edit affordance for ByModuleSection's per-dimension
            children. The header-level delete should always be
            reachable per spec ("each goal row"); the component
            handles its own yearly-anchor exclusion internally.
            Hidden in select mode — bulk delete replaces it there. */}
        {!select.active && (
          <div className="shrink-0 -mr-1">
            <DeleteGoalButton goal={goal} />
          </div>
        )}
      </div>

      {expanded && !select.active && (
        <div className="pl-2 pr-2 pb-3 -mx-2 space-y-3">
          {/* Activity chart slot — populated with mock data in
              step 6b. Step 6c swaps the mock generator for the
              live getDailyActivity helper without disturbing the
              <ActivityChart> contract. */}
          {!omitActivityChart && (
            <div data-activity-area>
              <LiveActivityChart goal={goal} />
            </div>
          )}

          {showSlots && (
            <div data-progress-slot data-variant="expanded" className="space-y-1">
              {slotState.kind === 'in-progress' && progressPct !== null && (
                <>
                  <div className="h-2 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${progressPct}%`,
                        backgroundColor: GOALS_META.accentHex,
                      }}
                    />
                  </div>
                  <div className="text-xs text-neutral-500 tabular-nums">
                    {progressText}
                  </div>
                </>
              )}
              {slotState.kind === 'not-started' && (
                <div className="text-xs text-neutral-500 italic">Not started</div>
              )}
              {slotState.kind === 'umbrella' && (
                <div className="text-xs text-neutral-500 italic">
                  Rolls up from sub-goals
                </div>
              )}
            </div>
          )}

          {(() => {
            if (!showSlots) return null;
            if (suppressFeasibilityDetail) return null;
            const detail = feasibilityDetailText(feasibility);
            if (!detail) return null;
            return (
              <div
                data-feasibility-slot
                data-variant="expanded"
                className="text-xs text-neutral-500 dark:text-neutral-400"
              >
                {detail}
              </div>
            );
          })()}

          {!omitRowActions && (
            <>
              {/* Divider — keeps actions visually distinct from data display. */}
              <hr className="border-neutral-200 dark:border-neutral-800" />

              <div className="flex items-center gap-2" data-testid="goal-row-actions">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit();
                  }}
                  className="text-xs px-2.5 py-1 rounded border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  Edit
                </button>
                {/* Delete moved to the row header (visible on the
                    collapsed row, two-tap confirm) — see DeleteGoalButton. */}
              </div>
            </>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * Phase 2 step 6c — live activity chart wrapper.
 *
 * Reads daily activity from the canonical per-module sources via
 * a Dexie live query, bins it into the chart shape that matches
 * the goal's scope, and renders the right sub-chart with the
 * module's accent + activity unit.
 *
 * Module identity is derived from `goal.targetMetric` via
 * `moduleForMetric`. Goals without a derivable module (umbrellas
 * with null metric, malformed records) and goals at scopes that
 * don't have a chart shape (quarterly, aspirational,
 * practice-consistency) fall through to the dispatcher's
 * "no chart" notice.
 *
 * Personal-history average is computed from the same daily
 * series for now — over the visible window. Step 7's feasibility
 * helper introduces a longer-window personal average; we'll
 * upgrade this signal then.
 */
function LiveActivityChart({
  goal,
  moduleIdOverride,
}: {
  goal: Goal;
  /** When provided, bypasses moduleForMetric(goal.targetMetric).
   *  Used by UmbrellaRow to thread its single shared module
   *  through the same data path as a regular child goal. */
  moduleIdOverride?: GoalFlowModuleId | null;
}) {
  // Stable across re-renders within one mount; recomputed on
  // remount so an open page across midnight refreshes via Dexie
  // live-query reactivity rather than `today` ticking.
  const today = useMemo(() => new Date(), []);
  const moduleId =
    moduleIdOverride !== undefined
      ? moduleIdOverride
      : moduleForMetric(goal.targetMetric);

  const range = useMemo(() => {
    if (goal.scope === 'weekly') return weeklyRange(today);
    if (goal.scope === 'monthly') return monthlyRange(today);
    if (goal.scope === 'yearly') return yearlyRange(today);
    return null;
  }, [goal.scope, today]);

  const daily = useLiveQuery(
    () =>
      moduleId && range
        ? getDailyActivity(moduleId, range)
        : Promise.resolve([] as DailyActivityPoint[]),
    [moduleId, range?.startMs, range?.endMs],
    [] as DailyActivityPoint[],
  );

  // Practice consistency is a meta-habit with no single
  // underlying source; the chart says so explicitly rather than
  // falling through to the generic placeholder.
  if (moduleId === 'practice-consistency') {
    return (
      <ActivityChart
        scope={goal.scope}
        emptyMessage="No single activity source for habit tracking"
      />
    );
  }

  if (!moduleId || !range) {
    return <ActivityChart scope={goal.scope} />;
  }

  const unit = activityUnitForModule(moduleId);
  const accent = moduleMetaById(moduleId)?.accentHex ?? GOALS_META.accentHex;
  const avg = averageOfNonZero(daily ?? []);

  if (goal.scope === 'weekly') {
    const weekStart = mondayOf(today);
    return (
      <ActivityChart
        scope="weekly"
        weekly={{
          values: binToWeek(daily ?? [], weekStart),
          weekStart,
          averageCount: avg,
          unit,
          accentHex: accent,
          today,
        }}
      />
    );
  }
  if (goal.scope === 'monthly') {
    return (
      <ActivityChart
        scope="monthly"
        monthly={{
          values: binToMonth(daily ?? [], today.getFullYear(), today.getMonth()),
          averageCount: avg,
          unit,
          accentHex: accent,
          today,
        }}
      />
    );
  }
  if (goal.scope === 'yearly') {
    const year = today.getFullYear();
    return (
      <ActivityChart
        scope="yearly"
        yearly={{
          values: binToYear(daily ?? [], year),
          year,
          averageCount: avg,
          unit,
          accentHex: accent,
          today,
        }}
      />
    );
  }
  return <ActivityChart scope={goal.scope} />;
}

/**
 * Window-relative average of non-zero days. Returns 0 when the
 * window is empty so the chart simply omits the average line +
 * gutter rather than drawing a misleading flat-zero overlay.
 */
function averageOfNonZero(daily: DailyActivityPoint[]): number {
  const nz = daily.filter(p => p.count > 0);
  if (nz.length === 0) return 0;
  return Math.round(nz.reduce((sum, p) => sum + p.count, 0) / nz.length);
}

/**
 * Render-time umbrella title.
 *
 *   - Cross-module umbrella (no shared module): use the stored
 *     description; no clean auto-fallback exists.
 *   - Empty description: synthesize the action-oriented default
 *     ("Build comprehensive Ear Training mastery in 2026").
 *   - Description matches the legacy "[Module] [Year]" default:
 *     substitute the new default.
 *   - Description is the legacy concatenated-child-descriptions
 *     run-on (umbrella + " and " in the text): substitute the
 *     new default. Catches umbrellas saved before yearly anchors
 *     had a real auto-name.
 *   - Anything else: treat as user-customized and display verbatim.
 *
 * Pure render-time substitution — never touches stored data.
 */
function umbrellaDisplayTitle(
  umbrella: Goal,
  moduleId: GoalFlowModuleId | null,
): string {
  const desc = umbrella.description?.trim() ?? '';
  const year = new Date(umbrella.targetDate).getFullYear();
  if (!moduleId) {
    return desc || '(unnamed anchor)';
  }
  const anchorId = moduleId as AnchorModuleId;
  if (
    !desc ||
    isLegacyAnchorName(desc, anchorId, year) ||
    isConcatenatedChildSummary(umbrella)
  ) {
    return defaultAnchorName(anchorId, year);
  }
  return desc;
}

/**
 * Hard-delete a goal. Thin wrapper over deleteGoalsWithCascade so the
 * single-row delete (DeleteGoalButton) and the bulk paths (select
 * mode, month-end dismiss) share one set of cascade rules:
 *   · umbrellas → same-scope children (yearly anchors share
 *     parentGoalId with monthly stowaways, so the cascade stays
 *     scope-filtered),
 *   · monthly goals → their weekly plan slices (a slice without its
 *     parent breaks confirmed-plan detection and re-planning then
 *     duplicates the week — see deleteGoalsWithCascade).
 */
async function hardDeleteGoal(goal: Goal): Promise<void> {
  await deleteGoalsWithCascade([goal.id]);
}

/**
 * Two-tap inline confirm delete. First tap flips the button to a
 * red "Confirm" state; second tap within ~3 s fires the delete.
 * Click outside or wait the timeout → resets. No modal, no native
 * confirm() dialog. Hidden entirely on yearly anchor rows (those
 * are intentionally more permanent — the user manages them through
 * the yearly anchor flow).
 */
function DeleteGoalButton({ goal }: { goal: Goal }) {
  const [armed, setArmed] = useState(false);

  // Yearly anchors stay non-deletable from this surface — see
  // umbrellaDisplayTitle for how they're rendered as permanent
  // anchor cards in the yearly-anchor flow.
  if (goal.scope === 'yearly' && goal.isUmbrella) return null;

  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), 3000);
    return () => window.clearTimeout(t);
  }, [armed]);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!armed) {
      setArmed(true);
      return;
    }
    try {
      await hardDeleteGoal(goal);
    } catch (err) {
      console.warn('[goals] hard delete failed', err);
      setArmed(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={armed ? `Confirm delete ${goal.description || 'goal'}` : `Delete ${goal.description || 'goal'}`}
      title={armed ? 'Tap again to confirm' : 'Delete'}
      className={
        armed
          ? 'inline-flex items-center justify-center w-6 h-6 rounded-md text-[11px] font-medium bg-needswork text-white hover:opacity-90'
          : 'inline-flex items-center justify-center w-6 h-6 rounded-md text-neutral-400 hover:text-needswork hover:bg-needswork/10'
      }
    >
      {armed ? '✓' : '×'}
    </button>
  );
}

/**
 * Return only goals that should appear at the top level of a
 * scope layer — excludes children whose parent is also in the
 * same list. Children render indented under their umbrella's
 * row instead of as siblings.
 */
function topLevelGoals(goals: Goal[]): Goal[] {
  const ids = new Set(goals.map(g => g.id));
  return goals.filter(
    g => !g.parentGoalId || !ids.has(g.parentGoalId),
  );
}

/**
 * Phase 2 step 6c.1 — umbrella goal row.
 *
 * Distinct from <GoalRow> because aggregate progress numbers
 * don't compose cleanly across umbrella children (coverage
 * count + accuracy % + consistency days don't sum). Both slots
 * are reserved for worst-case feasibility status — Step 7 fills
 * them in. For 6c.1 they render as inert pills, same shape as
 * <GoalRow>'s feasibility slot.
 *
 * Expanded view:
 *   - Single-module children → real activity chart, threaded
 *     through <LiveActivityChart> with moduleIdOverride
 *   - Cross-module children → "not available" message
 *   - Single-module with no children yet → real chart with
 *     zero-baseline ticks
 *   - Feasibility breakdown — placeholder until Step 7
 *   - Edit / Delete on the umbrella record itself
 *
 * Children render indented immediately below the umbrella row
 * with their own full <GoalRow> anatomy. Tapping the umbrella
 * header toggles ONLY the umbrella's own details — children's
 * collapse states are independent.
 */
function UmbrellaRow({
  umbrella,
  childGoals,
  layerType,
  proficiencyDefs,
  songLookup,
  onEditGoal,
  isRowExpanded,
  onToggleRow,
}: {
  umbrella: Goal;
  childGoals: Goal[];
  layerType: LayerDef['type'];
  proficiencyDefs: ProficiencyDefinition[];
  songLookup: (skillId: string) => Song | undefined;
  onEditGoal: (g: Goal) => void;
} & RowCollapseAccess) {
  // Default expanded for umbrellas — subtree (panel + children)
  // visible on first render. EXCEPT yearly umbrellas, which open
  // collapsed for the visual redesign: the heavy activity chart +
  // dimension children stay tucked behind a "Show activity ↓"
  // link, keeping the page glanceable.
  //
  // State is lifted to the page-level component (step 6g) so the
  // umbrella's collapse state survives across reloads and view
  // switches.
  const expanded = isRowExpanded(umbrella.id, true, umbrella.scope);
  const setExpanded = () => onToggleRow(umbrella.id, true, umbrella.scope);
  // Select mode — umbrella row itself is checkable (deleting it
  // cascades into same-scope children); its child rows below stay
  // visible so individual children can be checked instead.
  const select = useGoalSelect();
  // Filter out consistency-metric children for non-practice-
  // consistency umbrellas. Consistency dimension is part of the
  // yearly framework but is no longer a trackable child goal —
  // it's a recurring habit, not a cumulative target. The
  // practice-consistency module has its own three-part
  // consistency framework (weekly floor / monthly floor /
  // aspiration), so its children stay.
  const umbrellaModule = umbrellaModuleId(childGoals);
  const visibleChildGoals =
    umbrellaModule === 'practice-consistency'
      ? childGoals
      : childGoals.filter(c => !isConsistencyMetric(c.targetMetric));
  const showSlots = shouldShowSlots(layerType);
  const sharedModule = umbrellaModuleId(visibleChildGoals);
  const isCrossModule = isCrossModuleUmbrella(visibleChildGoals);
  const moduleAccent = sharedModule
    ? moduleMetaById(sharedModule)?.accentHex
    : undefined;
  const displayTitle = umbrellaDisplayTitle(umbrella, sharedModule);
  // Per-child feasibility + rollup. The collapsed pill reads
  // from the rollup; expanded "X on track · Y at risk"
  // breakdown lands in step 7e.
  const rollup = useMemo(() => {
    const today = new Date();
    const mix = loadDayProfileMix();
    const childFeasibilities = visibleChildGoals.map(c =>
      getGoalFeasibility(c, {
        currentValue: c.currentValue,
        today,
        mix,
      }),
    );
    return rollupChildFeasibilities(childFeasibilities);
  }, [visibleChildGoals]);

  const isYearlyUmbrella = umbrella.scope === 'yearly';
  return (
    <li
      data-testid="goal-row"
      data-umbrella
      className="border-t border-neutral-200/60 dark:border-neutral-800/60 first:border-t-0 pt-1.5 first:pt-0"
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={
            select.active ? () => select.toggle(umbrella.id) : setExpanded
          }
          aria-expanded={select.active ? undefined : expanded}
          className="flex-1 min-w-0 text-left px-2 py-1 -ml-2 rounded hover:bg-neutral-50 dark:hover:bg-neutral-900/40 transition flex items-center gap-3"
        >
          {select.active && (
            <SelectCheckbox checked={select.selected.has(umbrella.id)} />
          )}
          <div className="flex-1 min-w-0">
            <div
              className="text-[13px] font-normal text-neutral-900 dark:text-neutral-100 line-clamp-2"
              // Module accent applied to the whole title — single-
              // module umbrellas wear their module's color so the
              // user reads the row by-module at a glance. Cross-
              // module umbrellas (no shared accent) fall back to
              // the neutral palette.
              style={{
                color: moduleAccent ?? undefined,
              }}
            >
              {displayTitle}
            </div>
          </div>

          {showSlots && (
            <div className="flex items-center shrink-0">
              <UmbrellaFeasibilityPill rollup={rollup} />
            </div>
          )}
        </button>
        {!select.active && (
          <div className="shrink-0 -mr-1">
            <DeleteGoalButton goal={umbrella} />
          </div>
        )}
      </div>

      {/* Show-activity affordance only on the collapsed yearly
          umbrella. Other scopes have a richer expanded body that
          opens via the title tap; surfacing a second link there
          would be noisy. */}
      {isYearlyUmbrella && !expanded && (
        <button
          type="button"
          onClick={setExpanded}
          className="mt-1 text-[10px] text-neutral-500 dark:text-neutral-400 hover:text-fluent transition-colors"
        >
          Show activity ↓
        </button>
      )}

      {expanded && (
        <div className="pl-2 pr-2 pb-3 -mx-2 space-y-3">
          {/* Chart subtitle — only on the umbrella row. Children
              don't need it because their own unit gutter
              ("cards reviewed" / "minutes practiced") makes the
              data shape self-evident. */}
          <div className="text-[11px] text-neutral-500 italic mt-1">
            Activity toward this goal
          </div>
          <div data-activity-area>
            {isCrossModule ? (
              <ActivityChart
                scope={umbrella.scope}
                emptyMessage="Activity chart not available for cross-module goals"
              />
            ) : (
              <LiveActivityChart
                goal={umbrella}
                moduleIdOverride={sharedModule}
              />
            )}
          </div>

          {showSlots && (() => {
            const detail = formatUmbrellaDetail(rollup);
            if (!detail) return null;
            return (
              <div
                data-feasibility-slot
                data-variant="expanded"
                className="text-xs text-neutral-500 dark:text-neutral-400"
              >
                {detail}
              </div>
            );
          })()}

          <hr className="border-neutral-200 dark:border-neutral-800" />

          <div className="flex items-center gap-2" data-testid="goal-row-actions">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEditGoal(umbrella);
              }}
              className="text-xs px-2.5 py-1 rounded border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              Edit
            </button>
            {/* Delete moved to the row header (visible on the
                collapsed row, two-tap confirm) — see DeleteGoalButton.
                Umbrella delete now hard-deletes + cascades to same-
                scope children rather than abandoning the umbrella
                alone. */}
          </div>
        </div>
      )}

      {expanded && visibleChildGoals.length > 0 && (
        <ul
          className="mt-1.5 flex flex-col"
          data-umbrella-children
        >
          {visibleChildGoals.map(c => {
            const childModule = moduleForMetric(c.targetMetric);
            // Use the user-facing "Coverage" naming via goalTypeLabel
            // (rather than the framework's "Breadth") so child rows
            // read identically to non-umbrella goals across views.
            const label = goalTypeLabel(c, childModule);
            return (
              <GoalRow
                key={c.id}
                goal={c}
                layerType={layerType}
                proficiencyDefs={proficiencyDefs}
                songLookup={songLookup}
                onEdit={() => onEditGoal(c)}
                dimensionLabel={label}
                dimensionAccentHex={moduleAccent}
                omitActivityChart
                suppressFeasibilityDetail={isAllUnrecoverableRollup(rollup)}
                isRowExpanded={isRowExpanded}
                onToggleRow={onToggleRow}
              />
            );
          })}
        </ul>
      )}
    </li>
  );
}

// -------------------------------------------------------------------

/**
 * Phase 2 step 6e / 7f.2 — module subheader inside a timeframe
 * layer's module-group container.
 *
 * Small uppercase label colored to match the SECTION_PALETTE
 * border for the same module — keeps the group container in a
 * single tonal family. Practice consistency falls back to the
 * YearlyAnchor display name when ModuleMeta has no entry.
 */
function ModuleSubheader({ moduleId }: { moduleId: GoalFlowModuleId }) {
  const meta = moduleMetaById(moduleId);
  const label = meta?.label ?? MODULE_DISPLAY_NAME[moduleId];
  const palette = SECTION_PALETTE[moduleId];
  return (
    <div
      className="text-[10px] uppercase tracking-wide font-medium mb-1.5"
      style={{ color: palette.border }}
    >
      {label}
    </div>
  );
}

/**
 * Intermediary picker that resolves "which module is this monthly
 * goal for?" before opening GoalSuggestionFlow from the by-timeframe
 * view. The by-module view already knows the module (each anchor
 * row owns its own "+ Add monthly goal"), so the picker is only
 * needed from the timeframe entry point.
 */
function ModulePickerModal({
  open,
  onClose,
  onPick,
  title,
  description,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (moduleId: GoalFlowModuleId) => void;
  title: string;
  description: string;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
    >
      <div className="flex flex-col gap-2 py-1">
        {ORDERED_GOAL_MODULES.map(moduleId => {
          const meta = moduleMetaById(moduleId);
          // moduleMetaById's labels are already lowercase (the app
          // convention), but MODULE_DISPLAY_NAME's fallback for
          // practice-consistency lands as "Practice consistency".
          // Normalize at render so every row reads the same way.
          const label = (meta?.label ?? MODULE_DISPLAY_NAME[moduleId]).toLowerCase();
          const accent = meta?.accentHex ?? GOALS_META.accentHex;
          return (
            <button
              key={moduleId}
              type="button"
              onClick={() => onPick(moduleId)}
              className="w-full text-left rounded-lg border px-3 py-2.5 hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition-colors"
              style={{ borderColor: `${accent}55`, borderLeftWidth: 3, borderLeftColor: accent }}
            >
              <span className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

/**
 * Phase 2 step 6d — segmented pill toggle below the page header.
 * Switches the Goals home between the timeframe and module
 * views. Active segment fills with the Goals accent; inactive
 * is text-only with a subtle hover state.
 *
 * State is lifted to the page-level component (persisted via
 * userPref `goals.home.activeView`) so the rendered view
 * survives reloads.
 */
function ViewToggle({
  value,
  onChange,
}: {
  value: GoalsView;
  onChange: (next: GoalsView) => void;
}) {
  const segment = (id: GoalsView, label: string) => {
    const active = value === id;
    return (
      <button
        type="button"
        onClick={() => onChange(id)}
        aria-pressed={active}
        className="px-3 py-1 text-xs rounded-md transition"
        style={
          active
            ? { backgroundColor: GOALS_META.accentHex, color: 'white' }
            : { color: undefined }
        }
      >
        {label}
      </button>
    );
  };
  return (
    <div
      role="tablist"
      aria-label="Goals view"
      className="inline-flex items-center gap-1 p-0.5 rounded-md border border-black/[0.07] bg-neutral-50 dark:bg-neutral-900/40"
    >
      {segment('timeframe', 'By timeframe')}
      {segment('module', 'By module')}
    </div>
  );
}

/**
 * Phase 2 step 6f — by-module view.
 *
 * Module is top-level. Each module section shows either its
 * yearly umbrella (with full child hierarchy via findAllChildren)
 * or a dashed YearlyAnchorBackstop prompting the user to set one.
 * Standalone non-umbrella goals at lower scopes within the same
 * module render below the umbrella row.
 *
 * Goals are filtered to the current period + 7-day lookahead
 * window per spec — no past, no farther future. Aspirational
 * scopes are excluded (they live in by-timeframe's 2-3 year /
 * lifetime layers).
 *
 * Step 6g adds the per-section collapse state + persistence on
 * top of this structure.
 */
function ByModuleView({
  goals,
  proficiencyDefs,
  songLookup,
  onEditGoal,
  onEditYearlyAnchor,
  onSetYearlyAnchor,
  onAddMonthlyGoal,
  isRowExpanded,
  onToggleRow,
}: {
  goals: Goal[];
  proficiencyDefs: ProficiencyDefinition[];
  songLookup: (skillId: string) => Song | undefined;
  onEditGoal: (g: Goal) => void;
  onEditYearlyAnchor: (moduleId: GoalFlowModuleId, anchor: Goal) => void;
  onSetYearlyAnchor: (moduleId: GoalFlowModuleId) => void;
  onAddMonthlyGoal: (moduleId: GoalFlowModuleId) => void;
} & RowCollapseAccess) {
  // Stable across re-renders within one mount; matches the
  // pattern used by LiveActivityChart elsewhere.
  const today = useMemo(() => new Date(), []);
  const filtered = useMemo(
    () => goals.filter(g => isCurrentOrUpcoming(g, today)),
    [goals, today],
  );

  // Fetch this-week attempts + distinct days for every module with
  // at least one current weekly goal — single batched call powers
  // every section's pace pill / "X of Y days" text.
  const modulesWithWeekly = useMemo(() => {
    const set = new Set<GoalFlowModuleId>();
    for (const g of filtered) {
      if (g.scope !== 'weekly' || g.isUmbrella) continue;
      const m = moduleForMetric(g.targetMetric);
      if (m) set.add(m);
    }
    return [...set];
  }, [filtered]);
  const activity = useThisWeekActivity({
    modules: modulesWithWeekly,
    goalsVersion: filtered.length,
  });

  // Per-week available days drives the per-day time estimate on
  // every WeeklyGoalRow. Matches the WeeklyPlan formula: a
  // weeklyOverride for this Sunday wins, otherwise fall back to
  // the global practice_days_per_cadence goal value. Zero when
  // neither is set — callers omit the time segment.
  const availableDays = useLiveQuery(
    async () => {
      const override = await loadWeeklyAvailableDays(startOfWeekLocal(Date.now()));
      if (override !== null) return override;
      // `targetMetric` is not a Dexie index on the goals store — query
      // by the indexed `status` and filter the metric in JS (same
      // pattern as anchorLookup.ts).
      const consistency = await db.goals
        .where('status')
        .equals('active')
        .filter(g => g.targetMetric === 'practice_days_per_cadence')
        .first();
      return consistency?.targetValue ?? 0;
    },
    [],
    0,
  );

  return (
    <div className="flex flex-col gap-6">
      {ORDERED_GOAL_MODULES.map(moduleId => (
        <ByModuleSection
          key={moduleId}
          moduleId={moduleId}
          allGoals={filtered}
          proficiencyDefs={proficiencyDefs}
          songLookup={songLookup}
          onEditGoal={onEditGoal}
          onEditYearlyAnchor={onEditYearlyAnchor}
          onSetYearlyAnchor={onSetYearlyAnchor}
          onAddMonthlyGoal={onAddMonthlyGoal}
          isRowExpanded={isRowExpanded}
          onToggleRow={onToggleRow}
          activity={activity}
          availableDays={availableDays}
        />
      ))}
    </div>
  );
}

/**
 * One module's section in the by-module view: header in module
 * accent, then either the yearly umbrella row (with full child
 * hierarchy) or the dashed YearlyAnchorBackstop. Standalone
 * non-umbrella goals inside the module render flat below.
 */
/**
 * Header accent for the by-timeframe scope-layer titles. The
 * outer card chrome (left border + tint) was removed — content
 * fills full width — so only the title color remains.
 */
const LAYER_PALETTE = {
  border: '#2C2C2A',
};

/**
 * Group a module's goals into the three timeframe buckets the
 * redesigned by-module section renders:
 *
 *   yearly  — the module's yearly umbrella (one per module by
 *             assumed constraint). Null when no anchor exists.
 *   monthly — non-umbrella goals at monthly scope (whether or not
 *             they're parented to the yearly umbrella — the
 *             timeframe groups them either way).
 *   weekly  — non-umbrella goals at weekly scope.
 *
 * Module membership is the same predicate the legacy renderer
 * used: moduleForMetric for non-umbrellas, umbrellaModuleId over
 * children for umbrellas. Exported so the integration tests can
 * exercise the bucketing without mounting React.
 */
export function bucketModuleGoalsByTimeframe(
  moduleId: GoalFlowModuleId,
  allGoals: ReadonlyArray<Goal>,
): {
  yearlyAnchor: Goal | undefined;
  monthlyGoals: Goal[];
  weeklyGoals: Goal[];
} {
  const moduleGoals = allGoals.filter(g => {
    if (g.isUmbrella) {
      return umbrellaModuleId(findAllChildren(g, [...allGoals])) === moduleId;
    }
    return moduleForMetric(g.targetMetric) === moduleId;
  });
  const yearlyAnchor = moduleGoals.find(
    g => g.isUmbrella && g.scope === 'yearly',
  );
  const monthlyGoals = moduleGoals.filter(
    g => g.scope === 'monthly' && !g.isUmbrella,
  );
  const weeklyGoals = moduleGoals.filter(
    g => g.scope === 'weekly' && !g.isUmbrella,
  );
  return { yearlyAnchor, monthlyGoals, weeklyGoals };
}

function ByModuleSection({
  moduleId,
  allGoals,
  proficiencyDefs,
  songLookup,
  onEditGoal,
  onEditYearlyAnchor,
  onSetYearlyAnchor,
  onAddMonthlyGoal,
  isRowExpanded,
  onToggleRow,
  activity,
  availableDays,
}: {
  moduleId: GoalFlowModuleId;
  allGoals: Goal[];
  proficiencyDefs: ProficiencyDefinition[];
  songLookup: (skillId: string) => Song | undefined;
  onEditGoal: (g: Goal) => void;
  onEditYearlyAnchor: (moduleId: GoalFlowModuleId, anchor: Goal) => void;
  onSetYearlyAnchor: (moduleId: GoalFlowModuleId) => void;
  onAddMonthlyGoal: (moduleId: GoalFlowModuleId) => void;
  activity: ReturnType<typeof useThisWeekActivity>;
  /** Effective available days for this week — weeklyOverride if set,
   *  otherwise the global practice-consistency goal. Zero when
   *  neither is set; WeeklyGoalRow then omits the per-day estimate. */
  availableDays: number;
} & RowCollapseAccess) {
  const { yearlyAnchor, monthlyGoals: rawMonthlyGoals, weeklyGoals } = bucketModuleGoalsByTimeframe(
    moduleId,
    allGoals,
  );
  // Coverage → Consistency → Accuracy/Proficiency → Mastery → other.
  // Order users move through when setting a goal up — matches the
  // suggestion flow's section order.
  const monthlyGoals = useMemo(
    () => [...rawMonthlyGoals].sort(
      (a, b) => dimensionSortOrder(a) - dimensionSortOrder(b),
    ),
    [rawMonthlyGoals],
  );

  const meta = moduleMetaById(moduleId);
  const label = meta?.label ?? MODULE_DISPLAY_NAME[moduleId];
  const accentHex = meta?.accentHex ?? GOALS_META.accentHex;
  const palette = SECTION_PALETTE[moduleId];

  // THIS MONTH section is visible whenever the user has somewhere
  // useful to put a monthly goal — either an anchor that frames
  // them, or existing monthly goals to display. No anchor + no
  // monthlies means the section adds no information and we omit it.
  const showMonthlySection = !!yearlyAnchor || monthlyGoals.length > 0;
  // THIS WEEK section is shown only when there are weekly goals.
  const showWeeklySection = weeklyGoals.length > 0;

  return (
    <section
      className="rounded-lg pl-4 pr-3 py-3"
      style={{
        backgroundColor: palette.bg,
        borderLeft: `3px solid ${palette.border}`,
      }}
    >
      {/* Header — accent dot, module name, "Add/Edit Goal" link.
          The link opens the monthly suggestion flow (the
          suggestion flow itself prompts to set a yearly anchor
          first when one's missing — no need to gate the button
          here). */}
      <header className="flex items-center justify-between gap-2 mb-3">
        <h2
          className="flex items-center gap-2 text-sm font-medium"
          style={{ color: palette.border }}
        >
          <span
            aria-hidden
            className="inline-block w-2 h-2 rounded-full"
            style={{ backgroundColor: accentHex }}
          />
          {label}
        </h2>
        <button
          type="button"
          onClick={() => onAddMonthlyGoal(moduleId)}
          className="text-xs text-neutral-600 dark:text-neutral-300 hover:text-fluent transition-colors"
        >
          Add/Edit Goal
        </button>
      </header>

      <div className="flex flex-col gap-3">
        {/* YEARLY */}
        <div className="flex flex-col gap-1.5">
          <SubSectionLabel>Yearly</SubSectionLabel>
          {yearlyAnchor ? (
            <YearlyAnchorRow
              umbrella={yearlyAnchor}
              childGoals={findAllChildren(yearlyAnchor, allGoals)}
              onEdit={() => onEditYearlyAnchor(moduleId, yearlyAnchor)}
            />
          ) : (
            <YearlyAnchorBackstop
              moduleId={moduleId}
              onClick={() => onSetYearlyAnchor(moduleId)}
            />
          )}
        </div>

        {/* THIS MONTH */}
        {showMonthlySection && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <SubSectionLabel>This month</SubSectionLabel>
              {monthlyGoals.length > 0 && (
                <button
                  type="button"
                  onClick={() => onEditGoal(monthlyGoals[0])}
                  className="text-[11px] text-neutral-500 hover:text-fluent transition-colors"
                  aria-label="Edit this month's goal"
                >
                  Edit
                </button>
              )}
            </div>
            {monthlyGoals.length === 0 ? (
              <button
                type="button"
                onClick={() => onAddMonthlyGoal(moduleId)}
                className="text-xs text-neutral-500 dark:text-neutral-400 italic hover:text-fluent transition-colors py-1"
              >
                + Add monthly goal
              </button>
            ) : (
              <ul className="flex flex-col gap-1">
                {monthlyGoals.map(g => (
                  <GoalRow
                    key={g.id}
                    goal={g}
                    layerType="measurable"
                    proficiencyDefs={proficiencyDefs}
                    songLookup={songLookup}
                    onEdit={() => onEditGoal(g)}
                    dimensionLabel={goalTypeLabel(g, moduleId)}
                    dimensionAccentHex={accentHex}
                    omitActivityChart
                    omitRowActions
                    isRowExpanded={isRowExpanded}
                    onToggleRow={onToggleRow}
                  />
                ))}
              </ul>
            )}
          </div>
        )}

        {/* THIS WEEK */}
        {showWeeklySection && (
          <div className="flex flex-col gap-1.5">
            <SubSectionLabel>This week</SubSectionLabel>
            <ul className="flex flex-col gap-1.5">
              {weeklyGoals.map(g => (
                <WeeklyGoalRow
                  key={g.id}
                  goal={g}
                  moduleId={moduleId}
                  accentHex={accentHex}
                  actualAttempts={activity.attemptsByModule[moduleId] ?? 0}
                  daysWithActivity={activity.daysByModule[moduleId] ?? 0}
                  availableDays={availableDays}
                  onEdit={() => onEditGoal(g)}
                />
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

/** Small uppercase neutral-gray label for a sub-section header
 *  (YEARLY / THIS MONTH / THIS WEEK) inside a module card. */
function SubSectionLabel({ children }: { children: string }) {
  return (
    <div className="text-[10px] uppercase tracking-wide font-medium text-neutral-500 dark:text-neutral-400">
      {children}
    </div>
  );
}

/** Slim row for the YEARLY section — anchor display name + overall
 *  feasibility pill rolled up across the umbrella's current
 *  children. Whole row is clickable; opens the anchor's edit
 *  flow. Subtle background distinguishes the yearly row as the
 *  module's north-star context. */
function YearlyAnchorRow({
  umbrella,
  childGoals,
  onEdit,
}: {
  umbrella: Goal;
  childGoals: Goal[];
  /** Opens YearlyAnchorFlow in edit mode for this anchor. Fired by
   *  the row's always-visible Edit affordance. */
  onEdit: () => void;
}) {
  const sharedModule = umbrellaModuleId(childGoals);
  const title = umbrellaDisplayTitle(umbrella, sharedModule);
  const moduleAccent = sharedModule
    ? moduleMetaById(sharedModule)?.accentHex
    : undefined;
  // Filter consistency children out of the rollup — same rule the
  // UmbrellaRow uses for its feasibility computation.
  const visibleChildGoals =
    sharedModule === 'practice-consistency'
      ? childGoals
      : childGoals.filter(c => !isConsistencyMetric(c.targetMetric));
  const rollup = useMemo(() => {
    const today = new Date();
    const mix = loadDayProfileMix();
    return rollupChildFeasibilities(
      visibleChildGoals.map(c =>
        getGoalFeasibility(c, {
          currentValue: c.currentValue,
          today,
          mix,
        }),
      ),
    );
  }, [visibleChildGoals]);

  return (
    <div className="w-full rounded-md bg-white/50 dark:bg-neutral-900/30 px-3 py-2 flex items-start justify-between gap-3">
      <span
        className="flex-1 min-w-0 text-[13px] font-normal text-neutral-900 dark:text-neutral-100 line-clamp-2"
        style={{ color: moduleAccent ?? undefined }}
      >
        {title}
      </span>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onEdit}
          className="text-[10px] text-neutral-500 hover:text-fluent transition-colors"
          aria-label="Edit yearly anchor"
        >
          Edit
        </button>
        <UmbrellaFeasibilityPill rollup={rollup} />
      </div>
    </div>
  );
}

/**
 * Compact weekly-goal row for the THIS WEEK sub-section.
 *
 * Layout: small type label above the description on the left;
 * target + time + pace pill (or "X of Y days" muted text count
 * for consistency goals) on the right. Tapping the row opens the
 * goal's edit flow.
 *
 * Pace classification varies by goal flavor (see byModulePace.ts):
 *   · Coverage / mastery — actual = goal.currentValue
 *   · Attempts / sessions / lessons — actual = this-week attempts
 *     for the module (passed in as actualAttempts)
 *   · Days / consistency — no pill; shows "X of Y days" muted text
 *     where X is days with practice this week for the module
 */
function WeeklyGoalRow({
  goal,
  moduleId,
  actualAttempts,
  daysWithActivity,
  availableDays,
  onEdit,
}: {
  goal: Goal;
  moduleId: GoalFlowModuleId;
  accentHex: string;
  actualAttempts: number;
  daysWithActivity: number;
  availableDays: number;
  onEdit: () => void;
}) {
  // Select mode — row tap toggles the checkbox instead of opening edit.
  const select = useGoalSelect();
  const typeLabel = goalTypeLabel(goal, moduleId);

  // Decide the actual numerator the pace classifier sees:
  //   coverage / mastery goals — items acquired so far (currentValue)
  //   anything else with a pace pill — this-week attempts.
  const isCoverageOrMastery =
    !!goal.targetMetric &&
    (dimensionForGoal(goal) === 'Breadth' || dimensionForGoal(goal) === 'Mastery');
  const paceActual = isCoverageOrMastery
    ? goal.currentValue
    : actualAttempts;
  const pace = classifyGoalPace({ goal, actual: paceActual, now: Date.now() });

  const isDays = isDaysConsistencyGoal(goal);
  const targetUnit = goal.targetUnit ?? '';
  const target = goal.targetValue;
  // Meta status: progress-style fraction so the row reads
  // identically to monthly/yearly goal rows ("Type · X/Y unit").
  const metaStatus = isDays
    ? `${daysWithActivity}/${target ?? '—'} days`
    : target != null
      ? `${paceActual}/${target}${targetUnit ? ` ${targetUnit}` : ''}`
      : null;
  // Per-day time hint = weekly time estimate ÷ availableDays. Omitted
  // when either side is missing (consistency-days goals have no
  // attempt-derived time, and zero available-days would divide by
  // zero). Mirrors the unit/format used in the WeeklyPlan modal.
  const perDayTime = !isDays && availableDays > 0
    ? buildPerDayTimeText(goalWeekTime(goal), availableDays)
    : null;
  const metaLine = [typeLabel, metaStatus, perDayTime]
    .filter((s): s is string => !!s)
    .join(' · ') || null;

  return (
    <li className="border-t border-neutral-200/60 dark:border-neutral-800/60 first:border-t-0 pt-1.5 first:pt-0">
      <button
        type="button"
        onClick={select.active ? () => select.toggle(goal.id) : onEdit}
        className="w-full text-left rounded px-2 py-1 -mx-2 hover:bg-white/40 dark:hover:bg-neutral-900/30 transition flex items-center gap-3"
      >
        {select.active && (
          <SelectCheckbox checked={select.selected.has(goal.id)} />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-normal text-neutral-900 dark:text-neutral-100 truncate">
            {goal.description || (
              <span className="italic text-neutral-500">(untitled goal)</span>
            )}
          </div>
          {metaLine && (
            <div className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-0.5">
              {metaLine}
            </div>
          )}
        </div>

        <div className="flex items-center shrink-0">
          {!isDays && pace.kind === 'pill' && (
            <PacePill
              color={pace.color}
              label={paceLabelForColor(pace.color)}
            />
          )}
        </div>
      </button>
    </li>
  );
}

/** Plain English label inside the pace pill. */
function paceLabelForColor(color: 'green' | 'amber' | 'red'): string {
  switch (color) {
    case 'green': return 'on pace';
    case 'amber': return 'a little behind';
    case 'red':   return 'behind';
  }
}

/** Per-day time text for a weekly goal: divide the weekly estimate
 *  by `availableDays` and format as "~N min/day" / "~N–M min/day" /
 *  "~Xh Ym/day". Returns null when the estimate is missing, zero,
 *  or days is non-positive — caller drops the segment. */
function buildPerDayTimeText(
  weekTime: ReturnType<typeof goalWeekTime>,
  availableDays: number,
): string | null {
  if (!weekTime || availableDays <= 0) return null;
  const e = weekTime.estimate;
  if (e.kind === 'point') {
    if (e.minutes <= 0) return null;
    return `~${formatPerDay(e.minutes / availableDays)}/day`;
  }
  if (e.maxMinutes <= 0) return null;
  return `~${formatPerDay(e.minMinutes / availableDays)}–${formatPerDay(e.maxMinutes / availableDays)}/day`;
}

function formatPerDay(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return '0 min';
  const rounded = Math.max(1, Math.round(min));
  if (rounded < 60) return `${rounded} min`;
  const h = Math.floor(rounded / 60);
  const mn = rounded - h * 60;
  if (mn === 0) return `${h}h`;
  return `${h}h ${mn}m`;
}

/**
 * Dashed prompt that lives in a module section when no yearly
 * umbrella exists. Permanent until the user sets one. Tap opens
 * YearlyAnchorFlow with the module pre-filled.
 */
function YearlyAnchorBackstop({
  moduleId,
  onClick,
}: {
  moduleId: GoalFlowModuleId;
  onClick: () => void;
}) {
  const meta = moduleMetaById(moduleId);
  const label = meta?.label ?? MODULE_DISPLAY_NAME[moduleId];
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left px-3 py-3 rounded border border-dashed border-neutral-300 dark:border-neutral-700 text-sm text-neutral-500 italic hover:bg-neutral-50 dark:hover:bg-neutral-900/40 transition"
    >
      Set a yearly anchor for {label}
    </button>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      className={`shrink-0 text-neutral-400 transition-transform ${open ? 'rotate-90' : ''}`}
      aria-hidden
    >
      <path d="M3 1.5L7 5L3 8.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

/**
 * Select-mode check indicator. Purely visual — the whole row button
 * is the tap target (44px-friendly), so this is aria-hidden and
 * non-interactive. Checked state wears the Goals module accent.
 */
function SelectCheckbox({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      data-testid="select-checkbox"
      data-checked={checked}
      className={`shrink-0 w-[18px] h-[18px] rounded border flex items-center justify-center text-[11px] leading-none transition-colors ${
        checked
          ? 'text-white'
          : 'border-neutral-300 dark:border-neutral-600 text-transparent'
      }`}
      style={
        checked
          ? {
              backgroundColor: GOALS_META.accentHex,
              borderColor: GOALS_META.accentHex,
            }
          : undefined
      }
    >
      ✓
    </span>
  );
}

// -------------------------------------------------------------------

function groupByScope(goals: Goal[]): Map<GoalScope, Goal[]> {
  const m = new Map<GoalScope, Goal[]>();
  for (const g of goals) {
    const arr = m.get(g.scope) ?? [];
    arr.push(g);
    m.set(g.scope, arr);
  }
  return m;
}

function effectiveCollapsed(
  override: 'collapsed' | 'expanded' | undefined,
  hasGoals: boolean,
): boolean {
  if (override === 'collapsed') return true;
  if (override === 'expanded') return false;
  return !hasGoals;
}
