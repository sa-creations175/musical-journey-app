import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../lib/db';
import ModuleIntro from '../../../components/ModuleIntro';
import DailyGoalBar from '../../../components/DailyGoalBar';
import { getPref, setPref } from '../../../lib/userPrefs';
import { useUrlTabSync } from '../../../lib/useUrlTabSync';
import { focusSelectionKey } from '../../../lib/goalConfig';
import HearScaleTab from './HearScaleTab';
import SitInsideTab from './SitInsideTab';
import ModeReferenceSection from './ModeReferenceSection';
import FluencyTracker from './FluencyTracker';
import FocusPanel from './FocusPanel';
import { MODES, type ModeSortOrder } from './catalog';
import {
  MODULE_ID,
  PREF_SCOPE,
  PREF_SORT_ORDER,
  SCOPE_LABELS,
  filterModesByScope,
  type ModeScope,
} from './shared';

type Tab = 'scale' | 'vamp';

function isTab(v: string): v is Tab {
  return v === 'scale' || v === 'vamp';
}

const PREF_FOCUS = focusSelectionKey(MODULE_ID);

// Scope presets shown in the top-level selector. Order matches the
// spec: "All modes" is always first.
const SCOPE_OPTIONS: ModeScope[] = ['all', 'church', 'minor-variants', 'brightest', 'darkest'];

export default function ScalesModes() {
  const [params] = useSearchParams();
  /**
   * `?focus=dorian,phrygian&tab=vamp` — a dashboard row tap.
   *
   * THE TAB IS PART OF WHAT THE ROW MEANT, not just where it lives.
   * The catalog leaf is `dorian-tab1` or `dorian-tab2` because hearing
   * a scale and naming a mode over a vamp are different skills; the
   * pool underneath is the same nine modes, so the mode travels as the
   * focus set and the skill travels as the tab. A mode row covers both
   * and sends no tab, which lands on whichever was already open.
   */
  const focusKeys = useMemo(() => {
    const raw = params.get('focus');
    if (!raw) return undefined;
    const keys = raw.split(',').map(k => k.trim()).filter(Boolean);
    return keys.length > 0 ? keys : undefined;
  }, [params]);

  const [tab, setTab] = useState<Tab>(() => {
    const raw = params.get('tab');
    return raw && isTab(raw) ? raw : 'scale';
  });
  const [sort, setSort] = useState<ModeSortOrder>('brightness');
  const [scope, setScope] = useState<ModeScope>('all');
  const [showFocusPanel, setShowFocusPanel] = useState(false);
  /**
   * FOCUS PROTECTION STILL APPLIES to a pool the dashboard sent — each
   * tab computes it from `pool.length`, which is the rule measured on
   * the items themselves.
   */
  const [focusActive, setFocusActive] = useState(
    (focusKeys?.length ?? 0) > 0,
  );
  const [focusSelection, setFocusSelection] = useState<string[]>(
    focusKeys ? [...focusKeys] : [],
  );

  // Nothing in this module persists the tab, so there is no async read
  // to race the URL — unlike chord progressions, where the stored tab
  // resolved after this and won.
  useUrlTabSync<Tab>('tab', isTab, setTab);

  useEffect(() => {
    (async () => {
      const s = await getPref<ModeSortOrder>(PREF_SORT_ORDER, 'brightness');
      setSort(s === 'parentScale' ? 'parentScale' : 'brightness');
      const sc = await getPref<ModeScope>(PREF_SCOPE, 'all');
      setScope(SCOPE_OPTIONS.includes(sc) ? sc : 'all');
    })();
  }, []);

  const saveSort = async (s: ModeSortOrder) => {
    setSort(s);
    await setPref(PREF_SORT_ORDER, s);
  };

  const saveScope = async (s: ModeScope) => {
    setScope(s);
    await setPref(PREF_SCOPE, s);
  };

  const attempts = useLiveQuery(
    () => db.attempts.where('moduleId').equals(MODULE_ID).toArray(),
    [],
  ) ?? [];

  const persistedFocus = useLiveQuery(
    async () => getPref<string[]>(PREF_FOCUS, []),
    [],
  ) ?? [];

  // Active pool that both tabs draw from. Focus mode overrides scope —
  // an explicit user selection always wins.
  const pool = useMemo(() => {
    if (focusActive) {
      const set = new Set(focusSelection);
      return MODES.filter(m => set.has(m.id));
    }
    return filterModesByScope(MODES, scope);
  }, [focusActive, focusSelection, scope]);

  const onStartFocus = async (keys: string[]) => {
    await setPref(PREF_FOCUS, keys);
    setFocusSelection(keys);
    setFocusActive(true);
    setShowFocusPanel(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Link to="/ear-training" className="text-xs text-neutral-500 hover:text-fluent">
          ← ear training
        </Link>
        <Link
          to="/ear-training/scales-modes/calendar"
          className="text-xs text-neutral-500 hover:text-fluent"
        >
          view calendar →
        </Link>
      </div>

      <DailyGoalBar moduleId={MODULE_ID} />

      {/* Scope selector + focus button + dynamic status line. Universal
          "all first" scope pattern shared with the other ear-training
          modules. Scope is ignored while focus mode is active. */}
      <div className="flex flex-col items-center gap-2">
        {!focusActive && (
          <div className="inline-flex rounded-lg border border-neutral-200 dark:border-neutral-700 p-0.5 text-xs flex-wrap justify-center">
            {SCOPE_OPTIONS.map(opt => (
              <button
                key={opt}
                onClick={() => saveScope(opt)}
                className={`px-3 py-1.5 rounded-md transition ${
                  scope === opt
                    ? 'bg-fluent text-white'
                    : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100'
                }`}
                title={SCOPE_LABELS[opt]}
              >
                {SCOPE_LABELS[opt]}
              </button>
            ))}
          </div>
        )}
        <button
          onClick={() => setShowFocusPanel(true)}
          className="text-xs text-neutral-500 hover:text-fluent"
        >
          ⊞ focus on specific modes
        </button>
        <p className="text-[11px] text-neutral-500 inline-flex items-center gap-2">
          <span>
            {focusActive
              // `pool`, not the selection: a key naming no mode would
              // otherwise be counted as one that does.
              ? `focused practice — ${pool.length} mode${pool.length === 1 ? '' : 's'} selected`
              : `${SCOPE_LABELS[scope]} — ${pool.length} in pool`}
          </span>
          {focusActive && (
            <button
              onClick={() => setFocusActive(false)}
              className="text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 underline"
            >
              exit focus
            </button>
          )}
        </p>
      </div>

      {/* Sort toggle for the mode reference cards + fluency tracker. */}
      <div className="flex items-center justify-end flex-wrap gap-2">
        <span className="text-[11px] text-neutral-500 uppercase tracking-wide">sort reference:</span>
        <div className="inline-flex rounded-lg border border-neutral-200 dark:border-neutral-700 p-0.5 text-xs">
          {([
            { id: 'brightness', label: 'brightness (brightest → darkest)' },
            { id: 'parentScale', label: 'parent scale position' },
          ] as const).map(opt => (
            <button
              key={opt.id}
              onClick={() => saveSort(opt.id)}
              className={`px-3 py-1.5 rounded-md transition ${
                sort === opt.id
                  ? 'bg-fluent text-white'
                  : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <section className="rounded-2xl border border-black/[0.07] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.07)] backdrop-blur p-3 sm:p-5 space-y-4">
        <div className="inline-flex rounded-lg border border-neutral-200 dark:border-neutral-700 p-0.5 text-sm">
          {([
            { id: 'scale', label: 'hear the scale' },
            { id: 'vamp', label: 'sit inside the mode' },
          ] as const).map(opt => (
            <button
              key={opt.id}
              onClick={() => setTab(opt.id)}
              aria-pressed={tab === opt.id}
              className={`px-3 py-1.5 rounded-md transition ${
                tab === opt.id
                  ? 'bg-fluent text-white'
                  : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {tab === 'scale' ? (
          <HearScaleTab attempts={attempts} pool={pool} focusActive={focusActive} />
        ) : (
          <SitInsideTab attempts={attempts} pool={pool} focusActive={focusActive} />
        )}
      </section>

      <ModeReferenceSection sort={sort} />
      <FluencyTracker attempts={attempts} sort={sort} />

      {showFocusPanel && (
        <FocusPanel
          initialSelection={persistedFocus}
          onStart={onStartFocus}
          onCancel={() => setShowFocusPanel(false)}
          focusActive={focusActive}
          attempts={attempts}
        />
      )}

      {/* Learn-more card — secondary, below the practice surface. */}
      <ModuleIntro
        accent="blue"
        headline="Modes are emotional worlds, not just scales."
        description="Train your ear to recognize the feel of each mode — the color, character, and atmosphere — so you can spot them in real music and use them intentionally in your own playing."
        bullets={[
          'Hear and identify each mode by its **scale sound**',
          'Sit inside modal environments and recognize their **atmosphere**',
          'Build personal associations between modes and music you love',
          'Connect modal concepts across **ear training** and **theory**',
        ]}
      />
    </div>
  );
}
