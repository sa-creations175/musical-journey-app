/**
 * The dashboard on a phone.
 *
 * =====================================================================
 * IT IS NOT THE TABLE MADE SMALLER. THE TABLE IS NOT HERE AT ALL.
 *
 * The desktop dashboard is six columns of numbers with a name on the
 * left, and at 390px that layout fails in the worst possible way: the
 * name column collapses to a chevron and an ⓘ with NO TEXT, the "skill"
 * header prints on top of "accuracy / fluency", and the right-hand
 * columns run off the edge. Fifteen rows of numbers identifying
 * nothing — worse than no dashboard, because it looks like one.
 *
 * A narrower table would not have fixed it. Six columns do not fit, and
 * the honest response to "this does not fit" is a different shape, not
 * the same shape squeezed. So the phone gets its own screen and the
 * table is not rendered here at all — not hidden, not scrolled, not
 * present. NOTHING ON THIS SCREEN SCROLLS SIDEWAYS.
 *
 * The desktop table is untouched and still the answer above `md`.
 * =====================================================================
 *
 * TWO VIEWS, because there are two questions and they want opposite
 * shapes. "How is each module doing" wants six things side by side, at
 * a glance, comparable. "What is weakest anywhere" wants one list, in
 * order, with the numbers legible. One screen answering both would
 * answer neither well.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ModuleTree } from '../read/query';
import type { TreeNode } from '../read/tree';
import ModuleCards from './ModuleCards';
import SkillsList, {
  GroupToggle, GroupedSkills, MeasureSwitch, type SkillRow,
} from './SkillsList';
import { DEFAULT_MEASURE, type Measure } from './measures';
import { FRESHNESS_STEP_DEFAULT_DAYS } from './freshnessScale';
import { getFreshnessStepDays } from './freshnessPrefs';
import FreshnessScaleStrip from './FreshnessScaleStrip';
import { categoryHref } from './categoryHref';
import { TIER_LEGEND } from './tierLegend';

export type MobileView = 'modules' | 'skills';

/**
 * MODULES IS THE DEFAULT because it is the question you have on
 * arrival. You open the dashboard to see where you stand, not to find
 * the single weakest thing — that is what you come back for once the
 * shape has told you which module to look at.
 */
export const DEFAULT_MOBILE_VIEW: MobileView = 'modules';

const VIEWS: ReadonlyArray<{ id: MobileView; label: string }> = [
  { id: 'modules', label: 'Modules' },
  { id: 'skills', label: 'Skills' },
];

export default function MobileDashboard({
  modules, now,
}: {
  modules: readonly ModuleTree[];
  now: number;
}) {
  const [view, setView] = useState<MobileView>(DEFAULT_MOBILE_VIEW);
  const [measure, setMeasure] = useState<Measure>(DEFAULT_MEASURE);
  /** Grouped by module on arrival — see `GroupToggle`. */
  const [grouped, setGrouped] = useState(true);
  const navigate = useNavigate();

  /**
   * How long a freshness step is, from settings.
   *
   * Defaulted to the shipped value rather than held null: the bars are
   * drawn on first paint either way, and a reader who has never touched
   * the setting sees exactly what the default draws.
   */
  const [stepDays, setStepDays] = useState(FRESHNESS_STEP_DEFAULT_DAYS);
  useEffect(() => {
    let live = true;
    void getFreshnessStepDays().then(v => { if (live) setStepDays(v); });
    return () => { live = false; };
  }, []);

  /**
   * Every category on the phone, flattened once.
   *
   * The SAME depth-1 nodes the Modules strip draws a square for — one
   * list, two shapes, so a category cannot appear in one view and not
   * the other.
   */
  const rows: SkillRow[] = modules.flatMap(module =>
    module.root.children.map(node => ({
      moduleId: module.moduleId,
      moduleLabel: module.root.label,
      label: node.label,
      node,
    })));

  /**
   * Where a category goes when opened, from either view.
   *
   * ONE ANSWER FOR BOTH. A strip cell and a skill row are the same
   * category seen two ways, and landing on different pages depending
   * on which you tapped would make them read as different things.
   */
  const openCategory = (moduleId: string, node: TreeNode) => {
    navigate(categoryHref(moduleId, node));
  };

  return (
    <div data-testid="mobile-dashboard" data-view={view} className="pb-8 px-1">
      <ViewSwitch view={view} onChange={setView} />

      {modules.length === 0 ? (
        <div data-testid="mobile-dashboard-empty" className="p-6 text-sm text-neutral-500">
          Nothing to show yet.
        </div>
      ) : view === 'modules' ? (
        <ModuleCards modules={modules} now={now} onOpenCategory={openCategory} />
      ) : (
        <div className="space-y-2">
          <MeasureSwitch measure={measure} onChange={setMeasure} />
          <div className="flex justify-end">
            <GroupToggle grouped={grouped} onChange={setGrouped} />
          </div>
          {grouped ? (
            <GroupedSkills
              rows={rows}
              measure={measure}
              now={now}
              stepDays={stepDays}
              onOpen={row => openCategory(row.moduleId, row.node)}
            />
          ) : (
            <SkillsList
              rows={rows}
              measure={measure}
              now={now}
              stepDays={stepDays}
              // Mixed across modules, so each row has to say which one
              // it came from — the heading that would have said so is
              // exactly what this view drops.
              showModule
              onOpen={row => openCategory(row.moduleId, row.node)}
            />
          )}
          {/* UNDER THE BARS IT EXPLAINS, and only on this tab. A
              percentage explains itself; a position on a seven-rung
              scale does not. */}
          {measure === 'freshness' && <FreshnessScaleStrip stepDays={stepDays} />}
        </div>
      )}

      <TierLegendStrip />
    </div>
  );
}

/**
 * The two views, as a segmented control.
 *
 * At the TOP, and always visible: it is the one control on this screen,
 * and a reader who cannot find the other view will conclude the phone
 * dashboard only does one thing.
 */
function ViewSwitch({
  view, onChange,
}: {
  view: MobileView;
  onChange: (v: MobileView) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Dashboard view"
      data-testid="mobile-view-switch"
      className="flex gap-1 p-0.5 mb-3 rounded-lg bg-neutral-100 dark:bg-neutral-800"
    >
      {VIEWS.map(v => {
        const on = v.id === view;
        return (
          <button
            key={v.id}
            type="button"
            role="tab"
            aria-selected={on}
            data-testid={`mobile-view-${v.id}`}
            onClick={() => onChange(v.id)}
            className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition ${
              on
                ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 shadow-sm'
                : 'text-neutral-500'
            }`}
          >
            {v.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * What a colour means, on screen in both views.
 *
 * COLOUR IS NEVER THE ONLY SIGNAL — every row on this screen carries
 * its numbers as text, and this says what the colour adds. Both are
 * needed: the numbers cannot be scanned six modules at a time, and the
 * colour cannot be read precisely.
 */
export function TierLegendStrip() {
  return (
    <ul
      data-testid="mobile-tier-legend"
      className="mt-4 flex flex-wrap gap-x-3 gap-y-1.5 text-[10px] text-neutral-500"
    >
      {TIER_LEGEND.map(entry => (
        <li key={entry.label} className="inline-flex items-center gap-1.5" data-legend-label={entry.label}>
          <span className="inline-flex gap-0.5" aria-hidden>
            {entry.swatches.map(cls => (
              <span key={cls} className={`w-2.5 h-2.5 rounded-sm ${cls}`} />
            ))}
          </span>
          <span>{entry.label}</span>
        </li>
      ))}
    </ul>
  );
}
