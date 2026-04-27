import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Goal, type GoalScope, type ProficiencyDefinition, type Song } from '../../lib/db';
import { GOALS_META } from '../../lib/moduleMeta';
import { getPref, setPref } from '../../lib/userPrefs';
import CustomizeLayersModal from './CustomizeLayersModal';
import GoalFormModal from './GoalFormModal';
import GoalCreationFlow from './GoalCreationFlow'; // TEMP: shell verification — remove with the dev-only button below
import OnboardingFlow from './onboarding/OnboardingFlow';
import { seedProficiencyDefinitionsIfNeeded } from './data';
import { describeGoalTarget } from './describeGoal';

/**
 * Goals — page-level component.
 *
 * Phase 1 sub-phase 3 step 4: layered home plus the goal creation /
 * edit modal. The "+ Set a goal" top button and per-layer
 * "+ Add" / "+ Reflect" links open the modal in create mode (with
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
  /** Drives "+ Add" (measurable, target-bearing) vs "+ Reflect"
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
  { scope: 'two_to_three_year', title: '2 — 3 years',     type: 'aspirational', emptyMessage: 'Not yet captured',       addLabel: '+ Reflect' },
  { scope: 'lifetime',          title: 'Lifetime vision', type: 'aspirational', emptyMessage: 'Not yet captured',       addLabel: '+ Reflect' },
];

const PREF_LAYER_COLLAPSE = 'goals.home.layerCollapse';
type LayerCollapseOverrides = Partial<Record<GoalScope, 'collapsed' | 'expanded'>>;

const PREF_HIDDEN_LAYERS = 'goals.home.hiddenLayers';

type FormMode =
  | { kind: 'closed' }
  | { kind: 'create'; scope: GoalScope | null }
  | { kind: 'edit'; goal: Goal };

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

  const [collapseOverrides, setCollapseOverrides] = useState<LayerCollapseOverrides>({});
  const [hiddenLayers, setHiddenLayers] = useState<GoalScope[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>({ kind: 'closed' });
  const [tryNewFlowOpen, setTryNewFlowOpen] = useState(false); // TEMP: shell verification — remove
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

  // Hydrate prefs once.
  useEffect(() => {
    (async () => {
      const [collapse, hidden] = await Promise.all([
        getPref<LayerCollapseOverrides>(PREF_LAYER_COLLAPSE, {}),
        getPref<GoalScope[]>(PREF_HIDDEN_LAYERS, []),
      ]);
      setCollapseOverrides(collapse ?? {});
      setHiddenLayers(Array.isArray(hidden) ? hidden : []);
      setHydrated(true);
    })();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void setPref(PREF_LAYER_COLLAPSE, collapseOverrides);
  }, [collapseOverrides, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    void setPref(PREF_HIDDEN_LAYERS, hiddenLayers);
  }, [hiddenLayers, hydrated]);

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

      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setFormMode({ kind: 'create', scope: null })}
          className="px-3 py-1.5 rounded-md text-sm font-medium text-white"
          style={{ backgroundColor: GOALS_META.accentHex }}
        >
          + Set a goal
        </button>
        {/* TEMP: shell verification — remove this button once Phase 1.6 step 2 is verified */}
        <button
          type="button"
          onClick={() => setTryNewFlowOpen(true)}
          className="px-3 py-1.5 rounded-md text-sm font-medium border border-dashed border-neutral-400 text-neutral-700 dark:text-neutral-200"
        >
          Try new flow (dev)
        </button>
      </div>

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
            />
          );
        })}
        {visibleLayers.length === 0 && (
          <p className="text-sm text-neutral-500 italic py-8 text-center">
            All layers are hidden. Use Customize to bring them back.
          </p>
        )}
      </div>

      <CustomizeLayersModal
        open={customizeOpen}
        onClose={() => setCustomizeOpen(false)}
        layers={LAYERS}
        hiddenLayers={hiddenLayers}
        onSetHidden={setLayerHidden}
      />

      <GoalFormModal
        open={formMode.kind !== 'closed'}
        onClose={() => setFormMode({ kind: 'closed' })}
        initialGoal={formMode.kind === 'edit' ? formMode.goal : null}
        initialScope={formMode.kind === 'create' ? formMode.scope : null}
      />

      {/* TEMP: shell verification — remove this mount once verified */}
      <GoalCreationFlow
        open={tryNewFlowOpen}
        onClose={() => setTryNewFlowOpen(false)}
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
}: {
  layer: LayerDef;
  goals: Goal[];
  proficiencyDefs: ProficiencyDefinition[];
  songLookup: (skillId: string) => Song | undefined;
  collapsed: boolean;
  onToggle: () => void;
  onAdd: () => void;
  onEditGoal: (goal: Goal) => void;
}) {
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
              {goals.map(g => (
                <GoalRow
                  key={g.id}
                  goal={g}
                  proficiencyDefs={proficiencyDefs}
                  songLookup={songLookup}
                  onEdit={() => onEditGoal(g)}
                />
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

function GoalRow({
  goal,
  proficiencyDefs,
  songLookup,
  onEdit,
}: {
  goal: Goal;
  proficiencyDefs: ProficiencyDefinition[];
  songLookup: (skillId: string) => Song | undefined;
  onEdit: () => void;
}) {
  const target = describeGoalTarget(goal, proficiencyDefs, songLookup);
  return (
    <li>
      <button
        type="button"
        onClick={onEdit}
        className="w-full text-left px-2 py-1.5 -mx-2 rounded hover:bg-neutral-50 dark:hover:bg-neutral-900/40 transition"
      >
        <div className="text-sm text-neutral-700 dark:text-neutral-200">
          {goal.description || <span className="italic text-neutral-500">(untitled goal)</span>}
        </div>
        {target && (
          <div className="text-xs text-neutral-500 mt-0.5">{target}</div>
        )}
      </button>
    </li>
  );
}

// -------------------------------------------------------------------

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
