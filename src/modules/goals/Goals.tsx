import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Goal, type GoalScope } from '../../lib/db';
import { GOALS_META } from '../../lib/moduleMeta';
import { getPref, setPref } from '../../lib/userPrefs';
import CustomizeLayersModal from './CustomizeLayersModal';

/**
 * Goals — page-level component.
 *
 * Phase 1 sub-phase 3 step 3: layered home with the six scopes in
 * action-up ordering, per-layer collapse with persistence, and a
 * Customize panel for hiding layers entirely.
 *
 * The "+ Set a goal" top button and per-layer "+ Add" / "+ Reflect"
 * links open the goal creation form. Step 3 wires the *state* —
 * `formOpenForScope` records which scope (if any) the form should
 * pre-fill. Step 4 renders the actual form when this state is set;
 * for step 3, opening the form just toggles the state and we render
 * a temporary "form coming in step 4" placeholder.
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
 * bottom. Goal creation forms can pre-fill scope from this list.
 */
export const LAYERS: LayerDef[] = [
  { scope: 'weekly',            title: 'This week',       type: 'measurable',   emptyMessage: 'No weekly goals yet',    addLabel: '+ Add' },
  { scope: 'monthly',           title: 'This month',      type: 'measurable',   emptyMessage: 'No monthly goals yet',   addLabel: '+ Add' },
  { scope: 'quarterly',         title: 'This quarter',    type: 'measurable',   emptyMessage: 'No quarterly goals yet', addLabel: '+ Add' },
  { scope: 'yearly',            title: 'This year',       type: 'measurable',   emptyMessage: 'No yearly goals yet',    addLabel: '+ Add' },
  { scope: 'two_to_three_year', title: '2 — 3 years',     type: 'aspirational', emptyMessage: 'Not yet captured',       addLabel: '+ Reflect' },
  { scope: 'lifetime',          title: 'Lifetime vision', type: 'aspirational', emptyMessage: 'Not yet captured',       addLabel: '+ Reflect' },
];

/** userPref key for per-scope collapse override. Absence falls
 *  back to the empty/populated heuristic. */
const PREF_LAYER_COLLAPSE = 'goals.home.layerCollapse';
type LayerCollapseOverrides = Partial<Record<GoalScope, 'collapsed' | 'expanded'>>;

/** userPref key for layers fully hidden from the home view. */
const PREF_HIDDEN_LAYERS = 'goals.home.hiddenLayers';

export default function Goals() {
  const goals = useLiveQuery(
    () => db.goals.where('status').equals('active').toArray(),
    [],
    [] as Goal[],
  );

  const [collapseOverrides, setCollapseOverrides] = useState<LayerCollapseOverrides>({});
  const [hiddenLayers, setHiddenLayers] = useState<GoalScope[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [, setFormOpenForScope] = useState<GoalScope | null>(null);

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

  // Persist collapse overrides.
  useEffect(() => {
    if (!hydrated) return;
    void setPref(PREF_LAYER_COLLAPSE, collapseOverrides);
  }, [collapseOverrides, hydrated]);

  // Persist hidden layers.
  useEffect(() => {
    if (!hydrated) return;
    void setPref(PREF_HIDDEN_LAYERS, hiddenLayers);
  }, [hiddenLayers, hydrated]);

  const goalsByScope = groupByScope(goals);
  const visibleLayers = LAYERS.filter(l => !hiddenLayers.includes(l.scope));

  const toggleLayer = (scope: GoalScope) => {
    setCollapseOverrides(prev => {
      const current = effectiveCollapsed(prev[scope], (goalsByScope.get(scope) ?? []).length > 0);
      // Flip and record explicit override.
      return { ...prev, [scope]: current ? 'expanded' : 'collapsed' };
    });
  };

  const setLayerHidden = (scope: GoalScope, hidden: boolean) => {
    setHiddenLayers(prev => {
      if (hidden) return prev.includes(scope) ? prev : [...prev, scope];
      return prev.filter(s => s !== scope);
    });
  };

  const openFormForScope = (scope: GoalScope | null) => {
    setFormOpenForScope(scope);
    // Step 4 renders the actual form; for step 3, surface a console
    // breadcrumb so the wiring is verifiable in the meantime.
    console.log('[goals] open form for scope', scope);
  };

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

      <div className="mb-4">
        <button
          type="button"
          onClick={() => openFormForScope(null)}
          className="px-3 py-1.5 rounded-md text-sm font-medium text-white"
          style={{ backgroundColor: GOALS_META.accentHex }}
        >
          + Set a goal
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
              collapsed={collapsed}
              onToggle={() => toggleLayer(layer.scope)}
              onAdd={() => openFormForScope(layer.scope)}
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
    </div>
  );
}

// -------------------------------------------------------------------

function LayerSection({
  layer,
  goals,
  collapsed,
  onToggle,
  onAdd,
}: {
  layer: LayerDef;
  goals: Goal[];
  collapsed: boolean;
  onToggle: () => void;
  onAdd: () => void;
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
                <li key={g.id} className="text-sm text-neutral-700 dark:text-neutral-200">
                  {/* Step 3 renders a minimal row; the rich goal card
                      with progress / edit / delete affordances lands
                      in step 4. */}
                  {g.description || <span className="italic text-neutral-500">(untitled goal)</span>}
                </li>
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

/**
 * Resolve effective collapse state:
 *   - Explicit user override wins
 *   - Otherwise: empty layers default collapsed, populated layers
 *     default expanded
 */
function effectiveCollapsed(
  override: 'collapsed' | 'expanded' | undefined,
  hasGoals: boolean,
): boolean {
  if (override === 'collapsed') return true;
  if (override === 'expanded') return false;
  return !hasGoals;
}
