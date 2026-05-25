import { useMemo, useState } from 'react';
import { TIER_BADGE_CLASS, TIER_LABEL, type Tier } from '../../lib/tier';
import type { FreshnessTier } from '../shapes-and-patterns/drillModel';
import type { SkillRecord } from './registry';
import type { SkillPriority, SkillType } from '../../lib/db';
import { moduleMetaById } from '../../lib/moduleMeta';
import ModuleGlyph from '../../components/ModuleGlyph';

interface Props {
  records: SkillRecord[];
  /** Pre-filter by module id — skips the module filter UI. */
  moduleFilter?: string;
  onSelectSkill: (skill: SkillRecord) => void;
}

type SortOption =
  | 'recent'
  | 'least-recent'
  | 'name'
  | 'tier-desc'
  | 'priority'
  | 'total-time';

const TIER_SORT_ORDER: Record<Tier, number> = {
  mastered: 0,
  fluent: 1,
  developing: 2,
  needsWork: 3,
  stale: 4,
  untouched: 5,
};

const PRIORITY_SORT_ORDER: Record<SkillPriority | 'unset', number> = {
  deep: 0,
  maintenance: 1,
  comfort: 2,
  unset: 3,
};

const SKILL_TYPE_LABEL: Record<SkillType, string> = {
  'theory':                   'theory',
  'ear':                      'ear',
  'physical-chord-shape':     'chord shape',
  'physical-scale':           'scale',
  'physical-voice-leading':   'voice-leading',
  'physical-mental-viz':      'mental viz',
  'song':                     'song',
  'production':               'production',
};

const FRESHNESS_SORT_LABEL: Record<FreshnessTier, string> = {
  fresh: 'fresh',
  recent: 'recent',
  aging: 'aging',
  stale: 'stale',
};

/**
 * Filterable + sortable grid of every skill. Search + multi-select
 * filters narrow the row pool; sort controls the ordering. Click any
 * row to surface the detail panel via `onSelectSkill`.
 *
 * Filter state is local to the grid — no URL sync — because the
 * catalogue's summary → drill-in path already narrows by module via
 * `moduleFilter`. Users who want a permalinked saved view can use
 * the catalogue summary's module cards instead.
 */
export default function SkillsGrid({ records, moduleFilter, onSelectSkill }: Props) {
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState<Set<Tier>>(new Set());
  const [priorityFilter, setPriorityFilter] = useState<Set<SkillPriority | 'unset'>>(new Set());
  const [typeFilter, setTypeFilter] = useState<Set<SkillType>>(new Set());
  const [freshnessFilter, setFreshnessFilter] = useState<Set<FreshnessTier>>(new Set());
  const [moduleMultiFilter, setModuleMultiFilter] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<SortOption>('recent');

  // Derive the modules in scope for the filter UI. When a
  // `moduleFilter` is active, we skip the UI entirely and just pin
  // results to that single module.
  const moduleOptions = useMemo(() => {
    const set = new Map<string, string>();
    for (const r of records) set.set(r.moduleId, r.moduleLabel);
    return [...set.entries()].map(([moduleId, label]) => ({ moduleId, label }));
  }, [records]);

  // Search matching expanded beyond skill name: also matches module
  // label, category label, skill type, and tags. Lets a user type
  // "ear training" or "modal-interchange" and find everything under
  // that lens.
  const skillMatchesQuery = (r: SkillRecord, q: string): boolean => {
    if (!q) return true;
    if (r.name.toLowerCase().includes(q)) return true;
    if (r.category.toLowerCase().includes(q)) return true;
    if (r.moduleLabel.toLowerCase().includes(q)) return true;
    if (r.moduleId.toLowerCase().includes(q)) return true;
    if (r.skillType.toLowerCase().includes(q)) return true;
    if (r.tags.some(t => t.toLowerCase().includes(q))) return true;
    if (r.note?.toLowerCase().includes(q) ?? false) return true;
    return false;
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = records.slice();
    if (moduleFilter) list = list.filter(r => r.moduleId === moduleFilter);
    if (moduleMultiFilter.size > 0) list = list.filter(r => moduleMultiFilter.has(r.moduleId));
    if (tierFilter.size > 0) list = list.filter(r => r.currentTier !== null && tierFilter.has(r.currentTier));
    if (priorityFilter.size > 0) {
      list = list.filter(r => priorityFilter.has((r.priority ?? 'unset') as SkillPriority | 'unset'));
    }
    if (typeFilter.size > 0) list = list.filter(r => typeFilter.has(r.skillType));
    if (freshnessFilter.size > 0) list = list.filter(r => freshnessFilter.has(r.freshness));
    if (q) list = list.filter(r => skillMatchesQuery(r, q));
    list.sort(sortComparator(sort));
    return list;
  }, [records, search, moduleFilter, moduleMultiFilter, tierFilter, priorityFilter, typeFilter, freshnessFilter, sort]);

  // When searching, surface matching modules / categories as a
  // header so the user immediately sees the conceptual groupings
  // their query touched — not just the flat skill rows.
  const searchSummary = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    const moduleSet = new Map<string, string>();
    const categorySet = new Map<string, string>();
    for (const r of records) {
      if (r.moduleLabel.toLowerCase().includes(q) || r.moduleId.toLowerCase().includes(q)) {
        moduleSet.set(r.moduleId, r.moduleLabel);
      }
      if (r.category.toLowerCase().includes(q)) {
        categorySet.set(`${r.moduleId}:${r.category}`, `${r.category} · ${r.moduleLabel}`);
      }
    }
    if (moduleSet.size === 0 && categorySet.size === 0) return null;
    return {
      modules: [...moduleSet.entries()].map(([id, label]) => ({ id, label })),
      categories: [...categorySet.entries()].map(([key, label]) => ({ key, label })),
    };
  }, [records, search]);

  const toggle = <T extends string>(set: Set<T>, value: T, update: (next: Set<T>) => void) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    update(next);
  };

  const clearAllFilters = () => {
    setSearch('');
    setTierFilter(new Set());
    setPriorityFilter(new Set());
    setTypeFilter(new Set());
    setFreshnessFilter(new Set());
    setModuleMultiFilter(new Set());
  };

  const hasActiveFilters =
    search !== '' ||
    tierFilter.size > 0 ||
    priorityFilter.size > 0 ||
    typeFilter.size > 0 ||
    freshnessFilter.size > 0 ||
    moduleMultiFilter.size > 0;

  return (
    <div className="space-y-3">
      {/* Search + sort row */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="search by name, tag, or note…"
            className="w-full rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-1.5 text-sm"
          />
        </div>
        <label className="inline-flex items-center gap-2 text-xs text-neutral-500">
          sort:
          <select
            value={sort}
            onChange={e => setSort(e.target.value as SortOption)}
            className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1"
          >
            <option value="recent">most recent</option>
            <option value="least-recent">least recent</option>
            <option value="name">name a→z</option>
            <option value="tier-desc">tier (highest first)</option>
            <option value="priority">priority</option>
            <option value="total-time">total time invested</option>
          </select>
        </label>
        {hasActiveFilters && (
          <button
            onClick={clearAllFilters}
            className="text-xs text-neutral-500 hover:text-fluent underline-offset-2 hover:underline"
          >
            clear filters
          </button>
        )}
      </div>

      {/* Filter chip rows */}
      <div className="rounded-md border border-black/[0.07] p-3 space-y-2">
        <FilterRow label="tier">
          {(['mastered', 'fluent', 'developing', 'needsWork', 'stale', 'untouched'] as Tier[]).map(t => (
            <Chip
              key={t}
              active={tierFilter.has(t)}
              onClick={() => toggle(tierFilter, t, setTierFilter)}
              label={TIER_LABEL[t]}
            />
          ))}
        </FilterRow>
        <FilterRow label="freshness">
          {(['fresh', 'recent', 'aging', 'stale'] as FreshnessTier[]).map(f => (
            <Chip
              key={f}
              active={freshnessFilter.has(f)}
              onClick={() => toggle(freshnessFilter, f, setFreshnessFilter)}
              label={FRESHNESS_SORT_LABEL[f]}
            />
          ))}
        </FilterRow>
        <FilterRow label="priority">
          {(['deep', 'maintenance', 'comfort', 'unset'] as Array<SkillPriority | 'unset'>).map(p => (
            <Chip
              key={p}
              active={priorityFilter.has(p)}
              onClick={() => toggle(priorityFilter, p, setPriorityFilter)}
              label={p}
            />
          ))}
        </FilterRow>
        <FilterRow label="type">
          {Object.entries(SKILL_TYPE_LABEL).map(([type, label]) => (
            <Chip
              key={type}
              active={typeFilter.has(type as SkillType)}
              onClick={() => toggle(typeFilter, type as SkillType, setTypeFilter)}
              label={label}
            />
          ))}
        </FilterRow>
        {!moduleFilter && moduleOptions.length > 1 && (
          <FilterRow label="module">
            {moduleOptions.map(m => (
              <Chip
                key={m.moduleId}
                active={moduleMultiFilter.has(m.moduleId)}
                onClick={() => toggle(moduleMultiFilter, m.moduleId, setModuleMultiFilter)}
                label={m.label}
              />
            ))}
          </FilterRow>
        )}
      </div>

      {/* Row count + matching-context header. When the query also
          matches module / category names, surface those as callouts
          above the individual results. */}
      <div className="space-y-2">
        <div className="text-[11px] text-neutral-500">
          <span className="font-mono tabular-nums">{filtered.length}</span> of{' '}
          <span className="font-mono tabular-nums">{records.length}</span> skills
        </div>
        {searchSummary && (
          <div className="rounded-md border border-fluent/30 bg-fluent/5 p-2.5 space-y-1 text-xs">
            {searchSummary.modules.length > 0 && (
              <div>
                <span className="text-[10px] uppercase tracking-wide text-fluent font-medium mr-2">matching modules</span>
                {searchSummary.modules.map(m => (
                  <span key={m.id} className="inline-block mr-1.5 px-1.5 py-0.5 rounded-full bg-fluent/10 text-fluent text-[10px]">
                    {m.label}
                  </span>
                ))}
              </div>
            )}
            {searchSummary.categories.length > 0 && (
              <div>
                <span className="text-[10px] uppercase tracking-wide text-fluent font-medium mr-2">matching categories</span>
                {searchSummary.categories.map(c => (
                  <span key={c.key} className="inline-block mr-1.5 px-1.5 py-0.5 rounded-full bg-fluent/10 text-fluent text-[10px]">
                    {c.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="py-8 text-center text-sm text-neutral-500 italic border border-dashed border-neutral-200 dark:border-neutral-800 rounded-md">
          no skills match these filters — try broadening the search.
        </div>
      ) : (
        <div className="rounded-md border border-black/[0.07] overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-3 py-2 text-[10px] uppercase tracking-wide text-neutral-500 font-medium border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/40 dark:bg-neutral-900/40">
            <div className="col-span-4">name</div>
            <div className="col-span-2">module</div>
            <div className="col-span-2">tier</div>
            <div className="col-span-2">freshness · last</div>
            <div className="col-span-1">priority</div>
            <div className="col-span-1 text-right">total</div>
          </div>
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {filtered.map(r => (
              <li key={r.skillId}>
                <button
                  onClick={() => onSelectSkill(r)}
                  className="w-full grid grid-cols-12 gap-2 items-center px-3 py-2.5 text-left text-sm hover:bg-fluent/5 transition-colors"
                >
                  <div className="col-span-4 min-w-0">
                    <div className="truncate font-medium">{r.name}</div>
                    <div className="truncate text-[10px] text-neutral-500">{r.category}</div>
                  </div>
                  <div className="col-span-2 text-xs truncate inline-flex items-center gap-1.5">
                    {(() => {
                      const meta = moduleMetaById(r.moduleId);
                      return (
                        <>
                          {meta && <ModuleGlyph meta={meta} size={16} fontSize={10} />}
                          <span className="truncate text-neutral-500">{r.moduleLabel}</span>
                        </>
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
                    <span className={freshnessTextClass(r.freshness)}>{r.freshness}</span>
                    <span className="text-neutral-400 mx-1">·</span>
                    <span>{r.daysSince === null ? 'never' : r.daysSince === 0 ? 'today' : `${r.daysSince}d`}</span>
                  </div>
                  <div className="col-span-1 text-[11px] text-neutral-500">
                    {r.priority ?? '—'}
                  </div>
                  <div className="col-span-1 text-[11px] text-neutral-500 text-right font-mono tabular-nums">
                    {formatTotal(r.totalTime)}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[10px] uppercase tracking-wide text-neutral-500 w-16 shrink-0">{label}</span>
      <div className="flex items-center gap-1 flex-wrap">{children}</div>
    </div>
  );
}

function Chip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-0.5 rounded-full border text-[11px] transition ${
        active
          ? 'bg-fluent text-white border-fluent'
          : 'border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:border-fluent hover:text-fluent'
      }`}
    >
      {label}
    </button>
  );
}

function freshnessTextClass(f: FreshnessTier): string {
  switch (f) {
    case 'fresh':  return 'text-fluent';
    case 'recent': return 'text-developing';
    case 'aging':  return 'text-needswork';
    case 'stale':  return 'text-neutral-400';
  }
}

function formatTotal(seconds: number): string {
  if (seconds === 0) return '—';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm === 0 ? `${h}h` : `${h}h${mm}m`;
}

function sortComparator(sort: SortOption): (a: SkillRecord, b: SkillRecord) => number {
  switch (sort) {
    case 'recent':
      return (a, b) => (b.lastPracticed ?? 0) - (a.lastPracticed ?? 0);
    case 'least-recent':
      return (a, b) => (a.lastPracticed ?? Infinity) - (b.lastPracticed ?? Infinity);
    case 'name':
      return (a, b) => a.name.localeCompare(b.name);
    case 'tier-desc':
      return (a, b) => {
        const ta = a.currentTier ? TIER_SORT_ORDER[a.currentTier] : 99;
        const tb = b.currentTier ? TIER_SORT_ORDER[b.currentTier] : 99;
        return ta - tb;
      };
    case 'priority':
      return (a, b) => {
        const pa = PRIORITY_SORT_ORDER[(a.priority ?? 'unset') as SkillPriority | 'unset'];
        const pb = PRIORITY_SORT_ORDER[(b.priority ?? 'unset') as SkillPriority | 'unset'];
        return pa - pb;
      };
    case 'total-time':
      return (a, b) => b.totalTime - a.totalTime;
  }
}
