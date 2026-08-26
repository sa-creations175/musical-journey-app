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
import { useState } from 'react';
import type { ModuleTree } from '../read/query';
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

  return (
    <div data-testid="mobile-dashboard" data-view={view} className="pb-8 px-1">
      <ViewSwitch view={view} onChange={setView} />

      {modules.length === 0 ? (
        <div data-testid="mobile-dashboard-empty" className="p-6 text-sm text-neutral-500">
          Nothing to show yet.
        </div>
      ) : view === 'modules' ? (
        <ModulesPlaceholder modules={modules} now={now} />
      ) : (
        <SkillsPlaceholder modules={modules} now={now} />
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

/**
 * A module per row, with its name showing.
 *
 * THE MINIMUM THE TABLE FAILED TO DO. The strip of per-category cells,
 * the sub-line and the footer counts arrive next; what this establishes
 * is that the phone renders its own thing, that every row is
 * identifiable, and that nothing runs off the side.
 */
function ModulesPlaceholder({
  modules, now,
}: {
  modules: readonly ModuleTree[];
  now: number;
}) {
  void now;
  return (
    <div className="space-y-2" data-testid="mobile-modules">
      {modules.map(m => (
        <section
          key={m.moduleId}
          data-testid="mobile-module-card"
          data-module={m.moduleId}
          className="rounded-xl border border-black/[0.07] bg-white dark:bg-neutral-900 p-3"
        >
          <div className="font-medium text-sm">{m.root.label}</div>
        </section>
      ))}
    </div>
  );
}

function SkillsPlaceholder({
  modules, now,
}: {
  modules: readonly ModuleTree[];
  now: number;
}) {
  void now;
  return (
    <div className="space-y-1" data-testid="mobile-skills">
      {modules.flatMap(m => m.root.children.map(child => (
        <div
          key={`${m.moduleId}:${child.id}`}
          data-testid="mobile-skill-row"
          className="rounded-lg border border-black/[0.07] bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
        >
          {child.label}
        </div>
      )))}
    </div>
  );
}
