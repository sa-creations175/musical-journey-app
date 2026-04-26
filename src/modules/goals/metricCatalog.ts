import type { ProficiencyScope } from '../../lib/db';

/**
 * Goal-target metric catalog. The metric defines what the goal is
 * measuring — number of items at a level, hours spent, items
 * completed, or a custom user-defined target.
 *
 * The set is intentionally tight in Phase 1; new metrics plug in
 * here without restructuring the form. The goal record stores:
 *
 *   targetMetric: MetricType
 *   targetValue:  number
 *   targetUnit:   string | null   — for items_at_level, holds the
 *                                   picked level identifier (e.g.
 *                                   'cross-key', 'rooted'); for
 *                                   hours_on_modules / count_completed
 *                                   it's a fixed unit string; for
 *                                   custom it's user-defined.
 */

export type MetricType =
  | 'items_at_level'
  | 'hours_on_modules'
  | 'count_completed'
  | 'custom';

export interface MetricDef {
  id: MetricType;
  label: string;
  /** When true, the form surfaces a secondary level dropdown whose
   *  options derive from the proficiency scopes present in the
   *  goal's relatedItems. Only `items_at_level` needs this. */
  needsLevel: boolean;
  /** Fixed unit string for the metric (`'hours'`, `'items'`).
   *  `null` when the unit varies (`items_at_level`: unit is the
   *  picked level; `custom`: unit is user-defined). */
  defaultUnit: string | null;
}

export const METRICS: MetricDef[] = [
  {
    id: 'items_at_level',
    label: 'Number of items at level X',
    needsLevel: true,
    defaultUnit: null,
  },
  {
    id: 'hours_on_modules',
    label: 'Hours on selected modules',
    needsLevel: false,
    defaultUnit: 'hours',
  },
  {
    id: 'count_completed',
    label: 'Number of items completed',
    needsLevel: false,
    defaultUnit: 'items',
  },
  {
    id: 'custom',
    label: 'Custom — define your own',
    needsLevel: false,
    defaultUnit: null,
  },
];

export const METRIC_BY_ID: Map<string, MetricDef> = new Map(
  METRICS.map(m => [m.id, m]),
);

/**
 * Map a moduleId from the skills registry to its proficiency scope.
 * Drives the level-dropdown grouping when a goal has selected
 * related items: the form derives "scopes present" from the modules
 * the items belong to, then groups level options under those scope
 * headers.
 */
export function scopeForModuleId(moduleId: string): ProficiencyScope {
  if (moduleId === 'repertoire') return 'song';
  if (moduleId === 'production') return 'production';
  // Everything else (harmonic-fluency, ear-training submodules,
  // shapes-and-patterns) is a measured-accuracy "skill" module.
  return 'skill';
}

/**
 * Resolve the set of proficiency scopes whose levels should appear
 * in the goal-form level dropdown, given a list of selected related
 * items. When nothing is selected, return all three scopes — the
 * user is choosing a level before they've picked items.
 */
export function scopesPresentInRelatedItems(
  itemsByModuleId: ReadonlyArray<{ moduleId: string }>,
): ProficiencyScope[] {
  if (itemsByModuleId.length === 0) return ['song', 'skill', 'production'];
  const set = new Set<ProficiencyScope>();
  for (const it of itemsByModuleId) set.add(scopeForModuleId(it.moduleId));
  return Array.from(set);
}
