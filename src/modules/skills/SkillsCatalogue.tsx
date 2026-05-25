import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useSearchParams } from 'react-router-dom';
import { db } from '../../lib/db';
import { TIER_BADGE_CLASS, TIER_LABEL } from '../../lib/tier';
import {
  buildSkillRegistry,
  pickAttentionItems,
  pickStrongSpots,
  summariseByModule,
  tierDistribution,
  type SkillRecord,
} from './registry';
import SkillsGrid from './SkillsGrid';
import ModuleGroupedView from './ModuleGroupedView';
import SkillDetailPanel from './SkillDetailPanel';
import TierDistributionBar from './TierDistributionBar';
import { moduleMetaById } from '../../lib/moduleMeta';
import ModuleGlyph from '../../components/ModuleGlyph';

/** Submodule ids that roll up into the Ear Training meta-module on
 *  the summary + grid view. */
const EAR_TRAINING_SUBMODULES = ['intervals', 'chord-recognition', 'chord-progressions', 'scales-modes'];
const EAR_TRAINING_META_ID = 'ear-training';

/**
 * Skills Catalogue landing.
 *
 * View layers:
 *   1. Summary (default) — top callouts, attention list, strong spots,
 *      per-module cards.
 *   2. Grid (via "view all skills" or a module card) — unified
 *      searchable list with filters.
 *   3. Detail panel (modal) — opens on any skill click, supports
 *      priority / tag / note editing and jump-to-module.
 *
 * The registry is rebuilt whenever core tables mutate (live-query
 * counts on attempts, drill-sessions, flashcard-states, annotations,
 * songs). The rebuild walks the whole catalogue but is cheap at
 * realistic data volumes (single-digit ms).
 */
export default function SkillsCatalogue() {
  // Live signal — re-runs the registry build whenever any source
  // mutates. Four cheap counts keep the dependency tight.
  const liveSignal = useLiveQuery(async () => {
    const [a, d, f, s, ann, songs] = await Promise.all([
      db.attempts.count(),
      db.drillSessions.count(),
      db.flashcardStates.count(),
      db.songPracticeLog.count(),
      db.skillAnnotations.count(),
      db.songs.count(),
    ]);
    return { a, d, f, s, ann, songs };
  }, []);

  const [records, setRecords] = useState<SkillRecord[] | null>(null);
  useEffect(() => {
    (async () => {
      const built = await buildSkillRegistry();
      setRecords(built);
    })();
  }, [liveSignal]);

  const [searchParams] = useSearchParams();
  const urlModuleFilter = searchParams.get('module') ?? undefined;
  const [view, setView] = useState<{ kind: 'summary' } | { kind: 'grid'; moduleFilter?: string }>(
    urlModuleFilter ? { kind: 'grid', moduleFilter: urlModuleFilter } : { kind: 'summary' },
  );
  const [selectedSkill, setSelectedSkill] = useState<SkillRecord | null>(null);

  // Keep view in sync if the `?module=<id>` param changes after mount
  // (e.g. the user navigates between Dashboard preview cards with
  // the catalogue already open).
  useEffect(() => {
    if (!urlModuleFilter) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setView({ kind: 'grid', moduleFilter: urlModuleFilter });
  }, [urlModuleFilter]);

  const dist = useMemo(() => records ? tierDistribution(records) : null, [records]);
  const attention = useMemo(() => records ? pickAttentionItems(records, 5) : [], [records]);
  const strong = useMemo(() => records ? pickStrongSpots(records, 5) : [], [records]);
  const byModule = useMemo(() => records ? summariseByModule(records) : [], [records]);

  // Roll up the four Ear Training submodules into a single meta
  // card on the summary. The individual submodules still appear in
  // the drill-in (grouped by submodule), so no data is hidden.
  const displayedModules = useMemo(() => collapseEarTraining(byModule), [byModule]);

  // Records filtered by the current module filter, expanding the
  // ear-training meta back into its submodules.
  const recordsForView = useMemo(() => {
    if (!records) return [];
    if (view.kind !== 'grid' || !view.moduleFilter) return records;
    if (view.moduleFilter === EAR_TRAINING_META_ID) {
      return records.filter(r => EAR_TRAINING_SUBMODULES.includes(r.moduleId));
    }
    return records.filter(r => r.moduleId === view.moduleFilter);
  }, [records, view]);

  // When the selected skill changes in the registry (e.g. after the
  // user sets a priority inside the detail panel), swap its reference
  // so the panel re-renders with fresh data without closing.
  useEffect(() => {
    if (!selectedSkill || !records) return;
    const fresh = records.find(r => r.skillId === selectedSkill.skillId);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (fresh && fresh !== selectedSkill) setSelectedSkill(fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records]);

  return (
    <div className="space-y-6 pb-16">
      {/* Header */}
      <header className="space-y-1">
        {view.kind === 'grid' && (
          <button
            onClick={() => setView({ kind: 'summary' })}
            className="text-xs text-neutral-500 hover:text-fluent"
          >
            ← back to summary
          </button>
        )}
        <h1 className="text-2xl font-medium tracking-tight">skills catalogue</h1>
        <p className="text-neutral-500 text-sm">
          every tracked skill across the app, organised. a mission-control view of your practice landscape.
        </p>
      </header>

      {!records && (
        <div className="py-12 text-center text-sm text-neutral-500">
          aggregating your skills…
        </div>
      )}

      {records && dist && view.kind === 'summary' && (
        <SummaryView
          records={records}
          distribution={dist}
          attention={attention}
          strong={strong}
          byModule={displayedModules}
          onViewAll={() => setView({ kind: 'grid' })}
          onViewModule={moduleId => setView({ kind: 'grid', moduleFilter: moduleId })}
          onSelectSkill={setSelectedSkill}
        />
      )}

      {records && view.kind === 'grid' && (
        <div className="space-y-3">
          {view.moduleFilter ? (
            <>
              {(() => {
                // Module drill-in: render a rich header with the
                // module's sidebar icon + accent so the identity
                // stays anchored while the user scrolls.
                const activeModule = displayedModules.find(m => m.moduleId === view.moduleFilter);
                const meta = view.moduleFilter === EAR_TRAINING_META_ID
                  ? moduleMetaById('ear-training')
                  : moduleMetaById(view.moduleFilter);
                return (
                  <div
                    className="rounded-lg border p-3 flex items-center gap-3"
                    style={{ borderColor: meta ? `${meta.accentHex}33` : undefined }}
                  >
                    {meta ? (
                      <ModuleGlyph meta={meta} size={36} fontSize={18} />
                    ) : (
                      <span
                        aria-hidden
                        className="w-9 h-9 rounded-md flex items-center justify-center text-lg shrink-0 bg-neutral-100 dark:bg-neutral-800 text-neutral-500"
                      >◦</span>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] uppercase tracking-wide text-neutral-500">
                        module drill-in
                      </div>
                      <div className="text-sm font-medium truncate">
                        {activeModule?.moduleLabel ?? view.moduleFilter}
                      </div>
                    </div>
                    <button
                      onClick={() => setView({ kind: 'grid' })}
                      className="text-xs hover:underline shrink-0"
                      style={meta ? { color: meta.accentHex } : undefined}
                    >
                      show all modules →
                    </button>
                  </div>
                );
              })()}
              {/* Module drill-in: single module, first category
                  expanded by default so the view feels alive. */}
              <ModuleGroupedView
                records={recordsForView}
                onSelectSkill={setSelectedSkill}
                defaultExpansion="first-category"
              />
            </>
          ) : (
            <>
              {/* Flat filter grid still available via toggle, but the
                  default "view all" is the hierarchical view so users
                  don't drown in 300+ rows. */}
              <ViewAllToggleGrid
                records={records}
                onSelectSkill={setSelectedSkill}
              />
            </>
          )}
        </div>
      )}

      {selectedSkill && (
        <SkillDetailPanel
          skill={selectedSkill}
          onClose={() => setSelectedSkill(null)}
          onMutated={async () => {
            // Mutation triggered the live query via annotation count,
            // which re-runs the effect above. No manual refetch needed.
          }}
        />
      )}
    </div>
  );
}

// -------------------------------------------------------------------
// Summary view
// -------------------------------------------------------------------

interface SummaryProps {
  records: SkillRecord[];
  distribution: ReturnType<typeof tierDistribution>;
  attention: SkillRecord[];
  strong: SkillRecord[];
  byModule: ReturnType<typeof summariseByModule>;
  onViewAll: () => void;
  onViewModule: (moduleId: string) => void;
  onSelectSkill: (skill: SkillRecord) => void;
}

function SummaryView({
  records,
  distribution,
  attention,
  strong,
  byModule,
  onViewAll,
  onViewModule,
  onSelectSkill,
}: SummaryProps) {
  return (
    <div className="space-y-6">
      {/* Top callouts */}
      <section className="rounded-2xl border border-black/[0.07] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.07)] backdrop-blur p-4 sm:p-6 space-y-4">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <div>
            <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-600 dark:text-neutral-300">
              proficiency distribution
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              {records.length} skills tracked across {byModule.length} module{byModule.length === 1 ? '' : 's'}
            </p>
          </div>
          <button
            onClick={onViewAll}
            className="px-3 py-1.5 rounded-md border border-fluent text-fluent text-xs font-medium hover:bg-fluent/10"
          >
            view all skills →
          </button>
        </div>
        <TierDistributionBar distribution={distribution} />
        <div className="text-xs text-neutral-500 leading-relaxed">
          {distribution.mastered > 0 && (
            <span><span className="text-mastered font-medium">{distribution.mastered}</span> at mastered</span>
          )}
          {distribution.mastered > 0 && (distribution.stale > 0 || distribution.untouched > 0) && <span className="mx-2">·</span>}
          {distribution.stale > 0 && (
            <span><span className="text-neutral-500 font-medium">{distribution.stale}</span> going stale</span>
          )}
          {distribution.stale > 0 && distribution.untouched > 0 && <span className="mx-2">·</span>}
          {distribution.untouched > 0 && (
            <span><span className="text-neutral-500 font-medium">{distribution.untouched}</span> untouched</span>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Attention list */}
        <section className="rounded-2xl border border-developing/30 bg-gradient-to-br from-developing/5 to-needswork/5 p-4 sm:p-5">
          <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-600 dark:text-neutral-300 mb-3">
            what needs attention
          </h2>
          {attention.length === 0 ? (
            <p className="text-xs text-neutral-500 italic">
              nothing urgent — everything's within range. choose something from "view all skills" to focus anyway.
            </p>
          ) : (
            <ul className="divide-y divide-neutral-200/60 dark:divide-neutral-800/60">
              {attention.map(r => (
                <li key={r.skillId}>
                  <button
                    onClick={() => onSelectSkill(r)}
                    className="w-full flex items-center gap-3 py-2 text-left hover:bg-fluent/5 rounded px-2 -mx-2 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{r.name}</div>
                      <div className="text-[11px] text-neutral-500 truncate">
                        {r.moduleLabel} · {r.category}
                      </div>
                    </div>
                    {r.currentTier && (
                      <span className={`shrink-0 px-1.5 py-0.5 rounded-full border text-[10px] font-medium ${TIER_BADGE_CLASS[r.currentTier]}`}>
                        {TIER_LABEL[r.currentTier]}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Strong spots */}
        <section className="rounded-2xl border border-fluent/30 bg-gradient-to-br from-fluent/5 to-mastered/5 p-4 sm:p-5">
          <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-600 dark:text-neutral-300 mb-3">
            your strong spots
          </h2>
          {strong.length === 0 ? (
            <p className="text-xs text-neutral-500 italic">
              log more practice to surface fluent + mastered skills here.
            </p>
          ) : (
            <ul className="divide-y divide-neutral-200/60 dark:divide-neutral-800/60">
              {strong.map(r => (
                <li key={r.skillId}>
                  <button
                    onClick={() => onSelectSkill(r)}
                    className="w-full flex items-center gap-3 py-2 text-left hover:bg-fluent/5 rounded px-2 -mx-2 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{r.name}</div>
                      <div className="text-[11px] text-neutral-500 truncate">
                        {r.moduleLabel} · last {r.daysSince === 0 ? 'today' : r.daysSince === null ? 'never' : `${r.daysSince}d ago`}
                      </div>
                    </div>
                    {r.currentTier && (
                      <span className={`shrink-0 px-1.5 py-0.5 rounded-full border text-[10px] font-medium ${TIER_BADGE_CLASS[r.currentTier]}`}>
                        {TIER_LABEL[r.currentTier]}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Modules at a glance — visual language matches the sidebar:
          same module icons, same accent colour per module, same
          name formatting. */}
      <section className="rounded-2xl border border-black/[0.07] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.07)] backdrop-blur p-4 sm:p-6 space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-600 dark:text-neutral-300">
          modules at a glance
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {byModule.map(m => {
            const meta = moduleMetaById(m.moduleId);
            return (
              <button
                key={m.moduleId}
                onClick={() => onViewModule(m.moduleId)}
                className="text-left rounded-lg border p-3 transition-colors"
                style={{
                  borderColor: meta ? `${meta.accentHex}33` : undefined,
                  borderWidth: 1,
                }}
                onMouseEnter={e => { if (meta) e.currentTarget.style.borderColor = meta.accentHex; }}
                onMouseLeave={e => { if (meta) e.currentTarget.style.borderColor = `${meta.accentHex}33`; }}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  {meta ? (
                    <ModuleGlyph meta={meta} size={28} fontSize={14} />
                  ) : (
                    <span aria-hidden className="w-7 h-7 rounded-md flex items-center justify-center text-[14px] shrink-0 bg-neutral-100 dark:bg-neutral-800 text-neutral-500">◦</span>
                  )}
                  <span className="text-sm font-medium flex-1 truncate">{m.moduleLabel}</span>
                  <span className="text-[10px] text-neutral-500 font-mono tabular-nums">
                    {m.count} skill{m.count === 1 ? '' : 's'}
                  </span>
                </div>
                <TierDistributionBar distribution={m.distribution} compact />
                <div className="text-[10px] text-neutral-500 mt-1.5">
                  {m.lastPracticed === null
                    ? 'no recent activity'
                    : `last practised ${formatHumanAgo(m.lastPracticed)}`}
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <Link
                    to={m.moduleRoute}
                    onClick={e => e.stopPropagation()}
                    className="text-[10px] hover:underline"
                    style={meta ? { color: meta.accentHex } : undefined}
                  >
                    open module →
                  </Link>
                  <span className="text-[10px] text-neutral-400">view skills</span>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function collapseEarTraining(byModule: ReturnType<typeof summariseByModule>): ReturnType<typeof summariseByModule> {
  const ear = byModule.filter(m => EAR_TRAINING_SUBMODULES.includes(m.moduleId));
  const rest = byModule.filter(m => !EAR_TRAINING_SUBMODULES.includes(m.moduleId));
  if (ear.length === 0) return byModule;

  // Merge counts + distribution across submodules.
  const merged: ReturnType<typeof summariseByModule>[number] = {
    moduleId: EAR_TRAINING_META_ID,
    moduleLabel: 'ear training',
    moduleRoute: '/ear-training',
    count: 0,
    distribution: {
      mastered: 0, fluent: 0, developing: 0, needsWork: 0,
      stale: 0, untouched: 0, total: 0,
    },
    lastPracticed: null,
  };
  for (const m of ear) {
    merged.count += m.count;
    merged.distribution.mastered   += m.distribution.mastered;
    merged.distribution.fluent     += m.distribution.fluent;
    merged.distribution.developing += m.distribution.developing;
    merged.distribution.needsWork  += m.distribution.needsWork;
    merged.distribution.stale      += m.distribution.stale;
    merged.distribution.untouched  += m.distribution.untouched;
    merged.distribution.total      += m.distribution.total;
    if (m.lastPracticed !== null && (merged.lastPracticed === null || m.lastPracticed > merged.lastPracticed)) {
      merged.lastPracticed = m.lastPracticed;
    }
  }

  // Slot Ear Training first (pedagogical ordering), then the rest.
  return [merged, ...rest];
}

function formatHumanAgo(ts: number): string {
  const days = Math.floor((Date.now() - ts) / (24 * 60 * 60 * 1000));
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} week${days < 14 ? '' : 's'} ago`;
  return `${Math.floor(days / 30)} month${days < 60 ? '' : 's'} ago`;
}

/**
 * "View all skills" surface — hierarchical by default (module →
 * category → skills, all collapsed), with a toggle to swap into the
 * flat filterable grid for cross-module search.
 */
function ViewAllToggleGrid({
  records,
  onSelectSkill,
}: {
  records: SkillRecord[];
  onSelectSkill: (skill: SkillRecord) => void;
}) {
  const [mode, setMode] = useState<'hierarchy' | 'flat'>('hierarchy');
  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="all-skills layout" className="inline-flex rounded-md border border-neutral-200 dark:border-neutral-700 p-0.5 text-xs">
        {(['hierarchy', 'flat'] as const).map(m => (
          <button
            key={m}
            role="radio"
            aria-checked={mode === m}
            onClick={() => setMode(m)}
            className={`px-2.5 py-1 rounded transition ${
              mode === m
                ? 'bg-fluent text-white'
                : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100'
            }`}
          >
            {m === 'hierarchy' ? 'grouped' : 'search all'}
          </button>
        ))}
      </div>
      {mode === 'hierarchy' ? (
        <ModuleGroupedView
          records={records}
          onSelectSkill={onSelectSkill}
          defaultExpansion="all-collapsed"
        />
      ) : (
        <SkillsGrid records={records} onSelectSkill={onSelectSkill} />
      )}
    </div>
  );
}
