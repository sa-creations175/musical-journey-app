import { useMemo, useState } from 'react';
import { TIER_BADGE_CLASS, TIER_LABEL } from '../../lib/tier';
import { moduleMetaById } from '../../lib/moduleMeta';
import type { SkillRecord } from './registry';
import TierDistributionBar from './TierDistributionBar';

interface Props {
  records: SkillRecord[];
  onSelectSkill: (skill: SkillRecord) => void;
  /**
   * Default-open strategy.
   *   'first-category' — open the first category header on mount
   *                      (used for the single-module drill-in).
   *   'all-collapsed'  — everything closed by default (used for
   *                      the "view all skills" surface). Users
   *                      expand as they need.
   */
  defaultExpansion?: 'first-category' | 'all-collapsed';
}

/**
 * Grouped, collapsible view of skills. Supports two layouts:
 *
 *   1. Single module → one level: category headers with skills.
 *   2. Multi-module   → two levels: module header → category header
 *                       → skills. Used for the "view all skills"
 *                       surface so users can drill in without
 *                       scrolling through every skill.
 *
 * Layout is chosen automatically from the input. Default expansion
 * controls let the caller tune the first-impression density.
 */
export default function ModuleGroupedView({
  records,
  onSelectSkill,
  defaultExpansion = 'first-category',
}: Props) {
  const layout = useMemo(() => classify(records), [records]);
  return layout.kind === 'multi' ? (
    <MultiModuleView layout={layout} defaultExpansion={defaultExpansion} onSelectSkill={onSelectSkill} />
  ) : (
    <SingleModuleView layout={layout} defaultExpansion={defaultExpansion} onSelectSkill={onSelectSkill} />
  );
}

// -------------------------------------------------------------------
// Grouping pipeline
// -------------------------------------------------------------------

interface CategoryGroup {
  key: string;
  label: string;
  items: SkillRecord[];
}

interface ModuleGroup {
  moduleId: string;
  moduleLabel: string;
  categories: CategoryGroup[];
  total: number;
}

type Layout =
  | { kind: 'single'; categories: CategoryGroup[] }
  | { kind: 'multi'; modules: ModuleGroup[] };

function classify(records: SkillRecord[]): Layout {
  if (records.length === 0) return { kind: 'single', categories: [] };
  const moduleIds = new Set(records.map(r => r.moduleId));
  if (moduleIds.size <= 1) {
    return { kind: 'single', categories: groupByCategory(records) };
  }
  return { kind: 'multi', modules: groupByModuleThenCategory(records) };
}

function groupByCategory(records: SkillRecord[]): CategoryGroup[] {
  const buckets = new Map<string, CategoryGroup>();
  for (const r of records) {
    const g = buckets.get(r.category) ?? { key: r.category, label: r.category, items: [] };
    g.items.push(r);
    buckets.set(r.category, g);
  }
  // Preserve insertion order (registry emits pedagogical sequence).
  return [...buckets.values()];
}

function groupByModuleThenCategory(records: SkillRecord[]): ModuleGroup[] {
  const buckets = new Map<string, ModuleGroup>();
  for (const r of records) {
    const existing = buckets.get(r.moduleId);
    if (existing) {
      const cat = existing.categories.find(c => c.key === r.category);
      if (cat) cat.items.push(r);
      else existing.categories.push({ key: r.category, label: r.category, items: [r] });
      existing.total += 1;
    } else {
      buckets.set(r.moduleId, {
        moduleId: r.moduleId,
        moduleLabel: r.moduleLabel,
        categories: [{ key: r.category, label: r.category, items: [r] }],
        total: 1,
      });
    }
  }
  const out = [...buckets.values()];
  out.sort((a, b) => MODULE_ORDER.indexOf(a.moduleId) - MODULE_ORDER.indexOf(b.moduleId));
  return out;
}

const MODULE_ORDER = [
  'harmonic-fluency',
  'intervals',
  'chord-recognition',
  'chord-progressions',
  'scales-modes',
  'shapes-and-patterns',
  'repertoire',
  'production',
];

// -------------------------------------------------------------------
// Single-module layout (category headers only)
// -------------------------------------------------------------------

function SingleModuleView({
  layout,
  defaultExpansion,
  onSelectSkill,
}: {
  layout: Extract<Layout, { kind: 'single' }>;
  defaultExpansion: 'first-category' | 'all-collapsed';
  onSelectSkill: (skill: SkillRecord) => void;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    const out: Record<string, boolean> = {};
    for (let i = 0; i < layout.categories.length; i++) {
      const c = layout.categories[i];
      // First category open (default) or everything closed.
      out[c.key] = defaultExpansion === 'first-category' ? i !== 0 : true;
    }
    return out;
  });
  const toggle = (k: string) => setCollapsed(p => ({ ...p, [k]: !p[k] }));

  return (
    <div className="space-y-3">
      {layout.categories.map(g => (
        <CategorySection
          key={g.key}
          group={g}
          collapsed={collapsed[g.key] === true}
          onToggle={() => toggle(g.key)}
          onSelectSkill={onSelectSkill}
        />
      ))}
    </div>
  );
}

// -------------------------------------------------------------------
// Multi-module layout (module → category → skills)
// -------------------------------------------------------------------

function MultiModuleView({
  layout,
  defaultExpansion,
  onSelectSkill,
}: {
  layout: Extract<Layout, { kind: 'multi' }>;
  defaultExpansion: 'first-category' | 'all-collapsed';
  onSelectSkill: (skill: SkillRecord) => void;
}) {
  // Outer module keys: closed by default unless first-category mode
  // (rare — multi-module usually means "view all," where we want
  // everything closed). Inner category keys prefixed with module id
  // to avoid collisions.
  const [moduleCollapsed, setModuleCollapsed] = useState<Record<string, boolean>>(() => {
    const out: Record<string, boolean> = {};
    for (const m of layout.modules) {
      out[m.moduleId] = defaultExpansion === 'all-collapsed';
    }
    return out;
  });
  const [catCollapsed, setCatCollapsed] = useState<Record<string, boolean>>(() => {
    const out: Record<string, boolean> = {};
    for (const m of layout.modules) {
      for (const c of m.categories) out[`${m.moduleId}:${c.key}`] = true; // collapsed
    }
    return out;
  });
  const toggleModule = (k: string) => setModuleCollapsed(p => ({ ...p, [k]: !p[k] }));
  const toggleCat = (k: string) => setCatCollapsed(p => ({ ...p, [k]: !p[k] }));

  return (
    <div className="space-y-3">
      {layout.modules.map(m => {
        const meta = moduleMetaById(m.moduleId);
        const moduleIsCollapsed = moduleCollapsed[m.moduleId] === true;
        return (
          <section
            key={m.moduleId}
            className="rounded-md border overflow-hidden"
            style={{ borderColor: meta ? `${meta.accentHex}33` : undefined }}
          >
            <button
              onClick={() => toggleModule(m.moduleId)}
              aria-expanded={!moduleIsCollapsed}
              className="w-full px-3 py-3 flex items-center gap-3 text-left transition-colors"
              style={{ backgroundColor: meta ? `${meta.accentHex}0f` : undefined }}
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                className={`shrink-0 transition-transform ${moduleIsCollapsed ? '' : 'rotate-90'}`}
                style={{ color: meta?.accentHex }}
                aria-hidden
              >
                <path d="M3 1.5L7 5L3 8.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span
                aria-hidden
                className="w-7 h-7 rounded-md flex items-center justify-center text-sm shrink-0"
                style={meta ? { backgroundColor: `${meta.accentHex}22`, color: meta.accentHex } : undefined}
              >
                {meta?.icon ?? '◦'}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{m.moduleLabel}</div>
                <div className="text-[11px] text-neutral-500 truncate">
                  {m.total} skill{m.total === 1 ? '' : 's'} across {m.categories.length} categor{m.categories.length === 1 ? 'y' : 'ies'}
                </div>
              </div>
            </button>
            {!moduleIsCollapsed && (
              <div className="px-3 py-2 space-y-2">
                {m.categories.map(c => (
                  <CategorySection
                    key={`${m.moduleId}:${c.key}`}
                    group={c}
                    collapsed={catCollapsed[`${m.moduleId}:${c.key}`] === true}
                    onToggle={() => toggleCat(`${m.moduleId}:${c.key}`)}
                    onSelectSkill={onSelectSkill}
                    compact
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

// -------------------------------------------------------------------
// Shared category section
// -------------------------------------------------------------------

function CategorySection({
  group,
  collapsed,
  onToggle,
  onSelectSkill,
  compact,
}: {
  group: CategoryGroup;
  collapsed: boolean;
  onToggle: () => void;
  onSelectSkill: (skill: SkillRecord) => void;
  compact?: boolean;
}) {
  const dist = useMemo(() => ({
    mastered: group.items.filter(r => r.currentTier === 'mastered').length,
    fluent: group.items.filter(r => r.currentTier === 'fluent').length,
    developing: group.items.filter(r => r.currentTier === 'developing').length,
    needsWork: group.items.filter(r => r.currentTier === 'needsWork').length,
    stale: group.items.filter(r => r.currentTier === 'stale').length,
    untouched: group.items.filter(r => r.currentTier === 'untouched').length,
    total: group.items.length,
  }), [group.items]);

  return (
    <section
      className={compact
        ? 'rounded-md border border-neutral-200/60 dark:border-neutral-800/60 overflow-hidden'
        : 'rounded-md border border-neutral-200 dark:border-neutral-800 overflow-hidden'}
    >
      <button
        onClick={onToggle}
        aria-expanded={!collapsed}
        className={`w-full flex items-center gap-3 text-left ${
          compact ? 'px-2.5 py-2' : 'px-3 py-2.5'
        } bg-neutral-50/60 dark:bg-neutral-900/60 border-b border-neutral-200 dark:border-neutral-800`}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          className={`shrink-0 text-neutral-500 transition-transform ${collapsed ? '' : 'rotate-90'}`}
          aria-hidden
        >
          <path d="M3 1.5L7 5L3 8.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div className="flex-1 min-w-0">
          <div className={`${compact ? 'text-xs' : 'text-sm'} font-medium truncate`}>{group.label}</div>
          <div className="text-[11px] text-neutral-500 truncate">
            {group.items.length} skill{group.items.length === 1 ? '' : 's'}
          </div>
        </div>
        <div className="w-32 shrink-0 hidden sm:block">
          <TierDistributionBar distribution={dist} compact />
        </div>
      </button>
      {!collapsed && (
        <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {group.items.map(r => (
            <li key={r.skillId}>
              <button
                onClick={() => onSelectSkill(r)}
                className="w-full grid grid-cols-12 gap-2 items-center px-3 py-2.5 text-left text-sm hover:bg-fluent/5 transition-colors"
              >
                <div className="col-span-5 min-w-0">
                  <div className="truncate font-medium">{r.name}</div>
                  {(() => {
                    const meta = moduleMetaById(r.moduleId);
                    return (
                      <div className="truncate text-[10px] inline-flex items-center gap-1">
                        {meta && (
                          <span
                            aria-hidden
                            className="inline-flex items-center justify-center w-3.5 h-3.5 rounded text-[9px] shrink-0"
                            style={{ backgroundColor: `${meta.accentHex}22`, color: meta.accentHex }}
                          >
                            {meta.icon}
                          </span>
                        )}
                        <span className="text-neutral-500">{r.moduleLabel}</span>
                      </div>
                    );
                  })()}
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
}
