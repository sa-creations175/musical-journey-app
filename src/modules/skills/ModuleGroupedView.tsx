import { useMemo, useState } from 'react';
import { TIER_BADGE_CLASS, TIER_LABEL } from '../../lib/tier';
import type { SkillRecord } from './registry';
import TierDistributionBar from './TierDistributionBar';

interface Props {
  records: SkillRecord[];
  onSelectSkill: (skill: SkillRecord) => void;
}

/**
 * Grouped, collapsible view of skills inside a single module (or
 * meta-module). Each group header shows the count + mini
 * distribution bar; expanding surfaces the individual rows.
 *
 * Grouping strategy depends on the module composition:
 *   - Single module with a mix of categories → group by `category`.
 *   - Meta-group with multiple modules (e.g. "ear training") →
 *     group by `moduleLabel`. The caller pre-filters records.
 *
 * The hook `inferGrouping` picks automatically — if the records span
 * more than one moduleId, group by module; otherwise group by
 * category. Ear Training's four submodules naturally light up the
 * module-level grouping without a bespoke switch.
 */
export default function ModuleGroupedView({ records, onSelectSkill }: Props) {
  const grouped = useMemo(() => groupSkills(records), [records]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggle = (key: string) =>
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="space-y-3">
      {grouped.map(group => {
        const isCollapsed = collapsed[group.key] === true;
        return (
          <section key={group.key} className="rounded-md border border-neutral-200 dark:border-neutral-800 overflow-hidden">
            <button
              onClick={() => toggle(group.key)}
              aria-expanded={!isCollapsed}
              className="w-full px-3 py-2.5 flex items-center gap-3 bg-neutral-50/60 dark:bg-neutral-900/60 border-b border-neutral-200 dark:border-neutral-800 text-left"
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                className={`shrink-0 text-neutral-500 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
                aria-hidden
              >
                <path d="M3 1.5L7 5L3 8.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{group.label}</div>
                <div className="text-[11px] text-neutral-500 truncate">
                  {group.items.length} skill{group.items.length === 1 ? '' : 's'}
                </div>
              </div>
              <div className="w-32 shrink-0 hidden sm:block">
                <TierDistributionBar
                  distribution={{
                    mastered: group.items.filter(r => r.currentTier === 'mastered').length,
                    fluent: group.items.filter(r => r.currentTier === 'fluent').length,
                    developing: group.items.filter(r => r.currentTier === 'developing').length,
                    needsWork: group.items.filter(r => r.currentTier === 'needsWork').length,
                    stale: group.items.filter(r => r.currentTier === 'stale').length,
                    untouched: group.items.filter(r => r.currentTier === 'untouched').length,
                    total: group.items.length,
                  }}
                  compact
                />
              </div>
            </button>
            {!isCollapsed && (
              <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {group.items.map(r => (
                  <li key={r.skillId}>
                    <button
                      onClick={() => onSelectSkill(r)}
                      className="w-full grid grid-cols-12 gap-2 items-center px-3 py-2.5 text-left text-sm hover:bg-fluent/5 transition-colors"
                    >
                      <div className="col-span-5 min-w-0">
                        <div className="truncate font-medium">{r.name}</div>
                        <div className="truncate text-[10px] text-neutral-500">{r.moduleLabel}</div>
                      </div>
                      <div className="col-span-2">
                        {r.currentTier ? (
                          <span className={`px-1.5 py-0.5 rounded-full border text-[10px] font-medium ${TIER_BADGE_CLASS[r.currentTier]}`}>
                            {TIER_LABEL[r.currentTier]}
                          </span>
                        ) : (
                          <span className="text-[10px] text-neutral-400">—</span>
                        )}
                      </div>
                      <div className="col-span-2 text-xs text-neutral-500">
                        {r.freshness}
                      </div>
                      <div className="col-span-2 text-[11px] text-neutral-500 truncate">
                        {r.daysSince === null ? 'never' : r.daysSince === 0 ? 'today' : `${r.daysSince}d ago`}
                      </div>
                      <div className="col-span-1 text-[11px] text-neutral-500 text-right">
                        {r.priority ?? '—'}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

// -------------------------------------------------------------------

interface Group {
  key: string;
  label: string;
  items: SkillRecord[];
  order: number;
}

function groupSkills(records: SkillRecord[]): Group[] {
  if (records.length === 0) return [];
  const moduleIds = new Set(records.map(r => r.moduleId));
  // Multi-module filter (e.g. the "ear training" meta) → group by
  // moduleLabel so submodules surface as sub-headers.
  if (moduleIds.size > 1) {
    const buckets = new Map<string, Group>();
    for (const r of records) {
      const key = r.moduleId;
      const g = buckets.get(key) ?? {
        key,
        label: r.moduleLabel,
        items: [],
        order: MODULE_ORDER.indexOf(key),
      };
      g.items.push(r);
      buckets.set(key, g);
    }
    return [...buckets.values()].sort((a, b) => a.order - b.order);
  }

  // Single module → group by category. Category ordering comes from
  // insertion order of records (which the registry emits in a
  // pedagogically-sensible sequence).
  const buckets = new Map<string, Group>();
  let nextOrder = 0;
  for (const r of records) {
    const key = r.category;
    const g = buckets.get(key) ?? {
      key,
      label: r.category,
      items: [],
      order: nextOrder++,
    };
    g.items.push(r);
    buckets.set(key, g);
  }
  return [...buckets.values()].sort((a, b) => a.order - b.order);
}

const MODULE_ORDER = [
  'intervals',
  'chord-recognition',
  'chord-progressions',
  'scales-modes',
  'harmonic-fluency',
  'repertoire',
  'shapes-and-patterns',
];
