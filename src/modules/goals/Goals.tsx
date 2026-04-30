import { Fragment, useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Goal, type GoalScope, type GoalStatus, type ProficiencyDefinition, type Song } from '../../lib/db';
import { GOALS_META, moduleMetaById } from '../../lib/moduleMeta';
import CustomizeLayersModal from './CustomizeLayersModal';
import GoalFormModal from './GoalFormModal';
import GoalCreationFlow from './GoalCreationFlow';
import YearlyAnchorFlow, { type AnchorModuleId } from './YearlyAnchorFlow';
import { isNewVocabMetric } from './goalVocabulary';
import OnboardingFlow from './onboarding/OnboardingFlow';
import { seedProficiencyDefinitionsIfNeeded } from './data';
import { backfillSpacingStateIfNeeded } from '../../lib/spacingStateBackfill';
import { describeGoalTarget } from './describeGoal';
import {
  progressSlotState,
  progressSlotText,
  progressSlotPercent,
  shouldShowSlots,
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
  dimensionDisplayLabel,
  dimensionForGoal,
  findAllChildren,
  findChildren,
  isConcatenatedChildSummary,
  isCrossModuleUmbrella,
  umbrellaModuleId,
  umbrellaSubtitle,
} from './umbrellaSummary';
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
  groupByModule,
  isCurrentOrUpcoming,
  ORDERED_GOAL_MODULES,
} from './goalsByModule';
import { MODULE_DISPLAY_NAME } from './YearlyAnchorFlow';
import { supabase } from '../../lib/supabase';
import { getCurrentUserId } from '../../lib/sync/currentUser';
import { beginPull, endPull } from '../../lib/sync/pullLock';

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
  { scope: 'monthly',           title: 'This month',      type: 'measurable',   emptyMessage: 'No monthly goals yet',   addLabel: '+ Add' },
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
 *  across both views and persists across reloads. */
interface RowCollapseAccess {
  isRowExpanded: (goalId: string, isUmbrella: boolean) => boolean;
  onToggleRow: (goalId: string, isUmbrella: boolean) => void;
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
  const [formMode, setFormMode] = useState<FormMode>({ kind: 'closed' });
  /** Phase 2 step 5f — YearlyAnchorFlow open state.
   *  Driven by GoalCreationFlow's onRequestYearlyAnchor callback
   *  (the user picked "Set yearly anchor first" on the
   *  interstitial). When non-null, the flow is mounted open with
   *  the picked module. */
  const [anchorMode, setAnchorMode] = useState<{ moduleId: AnchorModuleId } | null>(null);
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
  const isRowExpanded = (goalId: string, isUmbrella: boolean) =>
    resolveRowExpanded(rowCollapse, goalId, isUmbrella);
  const onToggleRow = (goalId: string, isUmbrella: boolean) =>
    setRowCollapse(s => toggleRowExpanded(s, goalId, isUmbrella));

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
      <header className="mb-6 flex items-center gap-3">
        <span
          aria-hidden
          className="inline-flex items-center justify-center w-8 h-8 rounded-md text-base font-medium"
          style={{
            backgroundColor: `${GOALS_META.accentHex}1a`,
            color: GOALS_META.accentHex,
          }}
        >
          {GOALS_META.icon}
        </span>
        <h1 className="text-2xl font-semibold text-neutral-800 dark:text-neutral-100 flex-1">
          Goals
        </h1>
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
      </header>

      <ViewToggle value={activeView} onChange={setActiveView} />

      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setFormMode({ kind: 'create', scope: null })}
          className="px-3 py-1.5 rounded-md text-sm font-medium text-white"
          style={{ backgroundColor: GOALS_META.accentHex }}
        >
          + Set a goal
        </button>
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
        )}
      </div>

      {activeView === 'timeframe' ? (
        <div className="flex flex-col">
          {visibleLayers.map(layer => {
            const layerGoals = goalsByScope.get(layer.scope) ?? [];
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
                onAdd={() => setFormMode({ kind: 'create', scope: layer.scope })}
                onEditGoal={goal => setFormMode({ kind: 'edit', goal })}
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
          onEditGoal={goal => setFormMode({ kind: 'edit', goal })}
          onSetYearlyAnchor={moduleId =>
            setAnchorMode({ moduleId: moduleId as AnchorModuleId })
          }
          isRowExpanded={isRowExpanded}
          onToggleRow={onToggleRow}
        />
      )}

      <CustomizeLayersModal
        open={customizeOpen}
        onClose={() => setCustomizeOpen(false)}
        layers={LAYERS}
        hiddenLayers={hiddenLayers}
        onSetHidden={setLayerHidden}
      />

      {/* Phase 1.6 step 15 entry-point routing:
            - All creates open GoalCreationFlow.
            - Edits route by vocabulary: new-vocab metrics open
              GoalCreationFlow (decoders preserve all state); old-
              vocab metrics open GoalFormModal (still works, no
              decoder support).
          GoalFormModal stays mounted alongside GoalCreationFlow until
          all old-vocab goals are aged out / migrated. The key prop on
          GoalCreationFlow forces a fresh remount per open, so its
          useState lazy initializer re-runs against the current
          initialGoal / initialScope. */}
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
        key={anchorMode ? `anchor-${anchorMode.moduleId}` : 'anchor-closed'}
        open={anchorMode !== null}
        onClose={() => setAnchorMode(null)}
        moduleId={anchorMode?.moduleId ?? 'ear-training'}
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
    </div>
  );
}

// -------------------------------------------------------------------

function LayerSection({
  layer,
  goals,
  proficiencyDefs,
  songLookup,
  collapsed,
  onToggle,
  onAdd,
  onEditGoal,
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
} & RowCollapseAccess) {
  return (
    <section className="border-b border-neutral-200 dark:border-neutral-800 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="w-full flex items-center gap-2 py-3 text-left hover:bg-neutral-50 dark:hover:bg-neutral-900/40 px-2 -mx-2 rounded transition"
      >
        <Chevron open={!collapsed} />
        <h2 className="text-sm font-medium text-neutral-700 dark:text-neutral-200 flex-1">
          {layer.title}
        </h2>
        <span className="text-xs text-neutral-500">
          {goals.length === 0 ? '—' : `${goals.length} goal${goals.length === 1 ? '' : 's'}`}
        </span>
      </button>
      {!collapsed && (
        <div className="pl-6 pb-4">
          {goals.length === 0 ? (
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
          ) : (
            <ul className="flex flex-col gap-1.5">
              {groupByModule(topLevelGoals(goals), goals).map(group => (
                <Fragment key={group.moduleId ?? '__no-module'}>
                  {group.moduleId && (
                    <ModuleSubheader moduleId={group.moduleId} />
                  )}
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
                </Fragment>
              ))}
              <li>
                <button
                  type="button"
                  onClick={onAdd}
                  className="text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 mt-1"
                >
                  {layer.addLabel}
                </button>
              </li>
            </ul>
          )}
        </div>
      )}
    </section>
  );
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
  proficiencyDefs,
  songLookup,
  onEdit,
  dimensionLabel,
  dimensionAccentHex,
  omitActivityChart,
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
  /** Module accent for the dimension label. Falls back to the
   *  Goals page accent when not provided. */
  dimensionAccentHex?: string;
} & RowCollapseAccess) {
  const expanded = isRowExpanded(goal.id, false);
  const setExpanded = () => onToggleRow(goal.id, false);
  const target = describeGoalTarget(goal, proficiencyDefs, songLookup);
  const slotState = progressSlotState(goal, layerType);
  const showSlots = shouldShowSlots(layerType);
  const progressText = progressSlotText(slotState);
  const progressPct = progressSlotPercent(slotState);

  const handleDelete = async () => {
    if (!confirm('Delete this goal? This moves it to abandoned status.')) return;
    try {
      await db.goals.update(goal.id, {
        status: 'abandoned' satisfies GoalStatus,
      });
    } catch (err) {
      console.warn('[goals] delete failed', err);
    }
  };

  return (
    <li data-testid="goal-row">
      <button
        type="button"
        onClick={setExpanded}
        aria-expanded={expanded}
        className="w-full text-left px-2 py-1.5 -mx-2 rounded hover:bg-neutral-50 dark:hover:bg-neutral-900/40 transition flex items-start gap-3"
      >
        <div className="flex-1 min-w-0">
          {dimensionLabel && (
            <div
              className="text-[10px] uppercase tracking-wide font-medium mb-0.5"
              style={{ color: dimensionAccentHex ?? GOALS_META.accentHex }}
            >
              {dimensionLabel}
            </div>
          )}
          <div className="text-sm text-neutral-700 dark:text-neutral-200">
            {goal.description || <span className="italic text-neutral-500">(untitled goal)</span>}
          </div>
          {target && (
            <div className="text-xs text-neutral-500 mt-0.5">{target}</div>
          )}
        </div>

        {showSlots && (
          <div className="flex items-center gap-2 shrink-0 pt-0.5">
            <span
              data-progress-slot
              className="text-xs tabular-nums text-neutral-600 dark:text-neutral-300 min-w-[3.5rem] text-right"
            >
              {progressText}
            </span>
            <span
              data-feasibility-slot
              aria-hidden
              className="inline-flex items-center justify-center text-xs text-neutral-300 dark:text-neutral-600 border border-dashed border-neutral-300 dark:border-neutral-700 rounded-full px-2 py-0.5 min-w-[3.5rem] h-5"
              title="Feasibility — coming in step 7"
            >
              —
            </span>
          </div>
        )}
      </button>

      {expanded && (
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

          {showSlots && (
            <div
              data-feasibility-slot
              data-variant="expanded"
              className="text-xs text-neutral-400 italic"
              aria-hidden
            >
              Feasibility status arrives in step 7
            </div>
          )}

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
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void handleDelete();
              }}
              className="text-xs px-2.5 py-1 rounded text-needswork hover:bg-needswork/10"
            >
              Delete
            </button>
          </div>
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
  // visible on first render. Tapping the umbrella header
  // collapses the entire subtree. Children remain individually
  // collapsible inside the subtree.
  //
  // State is lifted to the page-level component (step 6g) so the
  // umbrella's collapse state survives across reloads and view
  // switches.
  const expanded = isRowExpanded(umbrella.id, true);
  const setExpanded = () => onToggleRow(umbrella.id, true);
  const subtitle = umbrellaSubtitle(childGoals);
  const showSlots = shouldShowSlots(layerType);
  const sharedModule = umbrellaModuleId(childGoals);
  const isCrossModule = isCrossModuleUmbrella(childGoals);
  const moduleAccent = sharedModule
    ? moduleMetaById(sharedModule)?.accentHex
    : undefined;
  const displayTitle = umbrellaDisplayTitle(umbrella, sharedModule);

  const handleDelete = async () => {
    if (
      !confirm(
        'Delete this umbrella goal? Its sub-goals stay active. This moves the umbrella to abandoned status.',
      )
    )
      return;
    try {
      await db.goals.update(umbrella.id, {
        status: 'abandoned' satisfies GoalStatus,
      });
    } catch (err) {
      console.warn('[goals] umbrella delete failed', err);
    }
  };

  return (
    <li data-testid="goal-row" data-umbrella>
      <button
        type="button"
        onClick={setExpanded}
        aria-expanded={expanded}
        className="w-full text-left px-2 py-1.5 -mx-2 rounded hover:bg-neutral-50 dark:hover:bg-neutral-900/40 transition flex items-start gap-3"
      >
        <div className="flex-1 min-w-0">
          <div
            className="text-sm font-medium"
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
          {subtitle && (
            <div className="text-xs text-neutral-500 mt-0.5">{subtitle}</div>
          )}
        </div>

        {showSlots && (
          <div className="flex items-center gap-2 shrink-0 pt-0.5">
            {/* Both slots reserved for worst-case feasibility
                rollup. Step 7 fills them in. Inert dashed pills
                for now so the layout is committed and won't shift
                when real status data arrives. */}
            <span
              data-progress-slot
              data-umbrella
              aria-hidden
              className="inline-flex items-center justify-center text-xs text-neutral-300 dark:text-neutral-600 border border-dashed border-neutral-300 dark:border-neutral-700 rounded-full px-2 py-0.5 min-w-[3.5rem] h-5"
              title="Worst-case feasibility — coming in step 7"
            >
              —
            </span>
            <span
              data-feasibility-slot
              aria-hidden
              className="inline-flex items-center justify-center text-xs text-neutral-300 dark:text-neutral-600 border border-dashed border-neutral-300 dark:border-neutral-700 rounded-full px-2 py-0.5 min-w-[3.5rem] h-5"
              title="Worst-case feasibility — coming in step 7"
            >
              —
            </span>
          </div>
        )}
      </button>

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

          {showSlots && (
            <div
              data-feasibility-slot
              data-variant="expanded"
              className="text-xs text-neutral-400 italic"
              aria-hidden
            >
              Per-child feasibility breakdown arrives in step 7
            </div>
          )}

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
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void handleDelete();
              }}
              className="text-xs px-2.5 py-1 rounded text-needswork hover:bg-needswork/10"
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {expanded && childGoals.length > 0 && (
        <ul
          className="pl-4 mt-1.5 ml-2 flex flex-col gap-1.5 border-l border-neutral-200 dark:border-neutral-800"
          data-umbrella-children
        >
          {childGoals.map(c => {
            const dim = dimensionForGoal(c);
            const childModule = moduleForMetric(c.targetMetric);
            const label = dim ? dimensionDisplayLabel(dim, childModule) : null;
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
 * Phase 2 step 6e — module subheader inside a timeframe layer.
 *
 * Small uppercase label in the module's accent color, marking
 * the start of that module's goal cluster within the scope.
 * Practice consistency has no ModuleMeta entry (it's a meta-
 * habit, not a learning module) so we fall back to the YearlyAnchor
 * display name + neutral text color.
 *
 * Renders as an <li> inside the layer's <ul> so the surrounding
 * gap-1.5 spacing applies cleanly between subheader and first
 * goal row.
 */
function ModuleSubheader({ moduleId }: { moduleId: GoalFlowModuleId }) {
  const meta = moduleMetaById(moduleId);
  const label = meta?.label ?? MODULE_DISPLAY_NAME[moduleId];
  return (
    <li
      className="text-[10px] uppercase tracking-wide font-medium pt-1.5 first:pt-0"
      style={{ color: meta?.accentHex }}
    >
      {label}
    </li>
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
      className="mb-4 inline-flex items-center gap-1 p-0.5 rounded-md border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/40"
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
  onSetYearlyAnchor,
  isRowExpanded,
  onToggleRow,
}: {
  goals: Goal[];
  proficiencyDefs: ProficiencyDefinition[];
  songLookup: (skillId: string) => Song | undefined;
  onEditGoal: (g: Goal) => void;
  onSetYearlyAnchor: (moduleId: GoalFlowModuleId) => void;
} & RowCollapseAccess) {
  // Stable across re-renders within one mount; matches the
  // pattern used by LiveActivityChart elsewhere.
  const today = useMemo(() => new Date(), []);
  const filtered = useMemo(
    () => goals.filter(g => isCurrentOrUpcoming(g, today)),
    [goals, today],
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
          onSetYearlyAnchor={onSetYearlyAnchor}
          isRowExpanded={isRowExpanded}
          onToggleRow={onToggleRow}
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
function ByModuleSection({
  moduleId,
  allGoals,
  proficiencyDefs,
  songLookup,
  onEditGoal,
  onSetYearlyAnchor,
  isRowExpanded,
  onToggleRow,
}: {
  moduleId: GoalFlowModuleId;
  allGoals: Goal[];
  proficiencyDefs: ProficiencyDefinition[];
  songLookup: (skillId: string) => Song | undefined;
  onEditGoal: (g: Goal) => void;
  onSetYearlyAnchor: (moduleId: GoalFlowModuleId) => void;
} & RowCollapseAccess) {
  // A goal belongs to this module when its derived module
  // matches. Non-umbrella → moduleForMetric. Umbrella → same
  // function over its children via umbrellaModuleId.
  const moduleGoals = allGoals.filter(g => {
    if (g.isUmbrella) {
      return umbrellaModuleId(findAllChildren(g, allGoals)) === moduleId;
    }
    return moduleForMetric(g.targetMetric) === moduleId;
  });

  const yearlyUmbrella = moduleGoals.find(
    g => g.isUmbrella && g.scope === 'yearly',
  );

  // "Standalone" = not the umbrella itself and not parented to
  // it. (Parented goals already render under <UmbrellaRow> via
  // findAllChildren.)
  const standalone = moduleGoals.filter(
    g =>
      g.id !== yearlyUmbrella?.id &&
      (yearlyUmbrella ? g.parentGoalId !== yearlyUmbrella.id : true),
  );

  const meta = moduleMetaById(moduleId);
  const label = meta?.label ?? MODULE_DISPLAY_NAME[moduleId];

  return (
    <section>
      <h2
        className="text-sm font-medium uppercase tracking-wide mb-2"
        style={{ color: meta?.accentHex }}
      >
        {label}
      </h2>

      {yearlyUmbrella ? (
        <ul className="flex flex-col gap-1.5">
          <UmbrellaRow
            umbrella={yearlyUmbrella}
            childGoals={findAllChildren(yearlyUmbrella, allGoals)}
            layerType="measurable"
            proficiencyDefs={proficiencyDefs}
            songLookup={songLookup}
            onEditGoal={onEditGoal}
            isRowExpanded={isRowExpanded}
            onToggleRow={onToggleRow}
          />
        </ul>
      ) : (
        <YearlyAnchorBackstop
          moduleId={moduleId}
          onClick={() => onSetYearlyAnchor(moduleId)}
        />
      )}

      {standalone.length > 0 && (
        <ul className="flex flex-col gap-1.5 mt-2">
          {standalone.map(g =>
            g.isUmbrella ? (
              <UmbrellaRow
                key={g.id}
                umbrella={g}
                childGoals={findAllChildren(g, allGoals)}
                layerType="measurable"
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
                layerType="measurable"
                proficiencyDefs={proficiencyDefs}
                songLookup={songLookup}
                onEdit={() => onEditGoal(g)}
                isRowExpanded={isRowExpanded}
                onToggleRow={onToggleRow}
              />
            ),
          )}
        </ul>
      )}
    </section>
  );
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
