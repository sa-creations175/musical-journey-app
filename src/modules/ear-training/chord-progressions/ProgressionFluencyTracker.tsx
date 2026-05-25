import { useMemo, useState } from 'react';
import { type AttemptRecord } from '../../../lib/db';
import { ROLLING_WINDOW_SIZE } from '../../../lib/adaptiveSelection';
import { daysBetween, localDayKey } from '../../../lib/dailyGoal';
import {
  MIN_ATTEMPTS_FOR_TIER,
  TIER_BADGE_CLASS,
  TIER_BAR_CLASS,
  TIER_LABEL,
  TIER_TEXT_CLASS,
  computeTier,
  type Tier,
} from '../../../lib/tier';
import { PROGRESSIONS, TIER_NAMES, type Progression } from './catalog';
import { KEYS, containsSlashChords } from './progressionTheory';
import EtItemCurationButton from '../EtItemCurationButton';
import EtItemStatus from '../EtItemStatus';
import EtRowCheckbox from '../EtRowCheckbox';
import EtBulkActionBar from '../EtBulkActionBar';
import EtSelectToggle from '../EtSelectToggle';
import { useEtCurationsLive } from '../useEtCurations';
import { useEtSelection, type EtSelectionState } from '../useEtSelection';
import type { EtItemCuration } from '../../../lib/db';
import { ALL_MOTIONS, INTERVAL_NAME, parseMotionId } from './ChordMotionTab';
import AssociationsEditor from './AssociationsEditor';

const MODULE_ID = 'chord-progressions';
type ViewMode = 'full-progression' | 'key-detection' | 'chord-motion' | 'must-knows';

interface RollingStats {
  correct: number;
  total: number;
  percent: number;
  tier: Tier;
}

function rollingFor(attempts: AttemptRecord[], itemId: string): RollingStats {
  const filtered = attempts
    .filter(a => a.moduleId === MODULE_ID && a.itemId === itemId)
    .sort((a, b) => b.timestamp - a.timestamp);
  const recent = filtered.slice(0, ROLLING_WINDOW_SIZE);
  const correct = recent.filter(a => a.correct).length;
  const total = recent.length;
  const today = localDayKey();
  const latestTs = filtered[0]?.timestamp;
  const daysSince = latestTs ? daysBetween(localDayKey(new Date(latestTs)), today) : null;
  const tier = computeTier({
    windowCorrect: correct,
    windowTotal: total,
    daysSinceLastAttempt: daysSince,
  });
  return {
    correct,
    total,
    percent: total === 0 ? 0 : Math.round((correct / total) * 100),
    tier,
  };
}

interface ProgRowProps {
  progression: Progression;
  attempts: AttemptRecord[];
  curation?: EtItemCuration;
  selection?: EtSelectionState;
}

function ProgRow({ progression, attempts, curation, selection }: ProgRowProps) {
  const chord = rollingFor(attempts, progression.id);
  const pattern = rollingFor(attempts, `${progression.id}-pattern`);
  const inversion = rollingFor(attempts, `${progression.id}-inversion`);
  const hasSlash = containsSlashChords(progression.numerals);
  const dim = curation?.hidden ? 'opacity-60' : '';

  return (
    <div className={`py-3 first:pt-0 last:pb-0 grid lg:grid-cols-[280px,1fr] gap-3 sm:gap-4 ${dim}`}>
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {selection && <EtRowCheckbox itemRef={progression.id} selection={selection} />}
          <span className="font-medium text-sm">{progression.name}</span>
          <EtItemStatus curation={curation} />
          <EtItemCurationButton
            itemRef={progression.id}
            defaultLabel={progression.name}
            itemKindLabel="Progression"
          />
          {progression.isMustKnow && (
            <span className="text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 border border-fluent/40 bg-fluent/10 text-fluent">
              ★ must-know
            </span>
          )}
          {hasSlash && (
            <span
              className="text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 border border-info/40 bg-info/10 text-info"
              title="contains slash chords / inversions"
            >
              inv
            </span>
          )}
          <span className={`text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 border ${TIER_BADGE_CLASS[chord.tier]}`}>
            {TIER_LABEL[chord.tier]}
          </span>
        </div>
        <div className="text-xs text-neutral-500 font-mono mt-1">{progression.numerals.join(' ')}</div>
        <div className="text-[10px] text-neutral-400 mt-0.5">
          tier {progression.tier} · {progression.tierName}
        </div>
        <div className="mt-2">
          <AssociationsEditor progressionId={progression.id} />
        </div>
      </div>
      <div className="min-w-0 space-y-2">
        <StatRow label="chord accuracy" stats={chord} />
        {hasSlash && <StatRow label="inversion accuracy" stats={inversion} />}
        <StatRow label="pattern recognition" stats={pattern} />
      </div>
    </div>
  );
}

function StatRow({ label, stats }: { label: string; stats: RollingStats }) {
  const isUntouched = stats.tier === 'untouched';
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs text-neutral-500 mb-1 gap-2 flex-wrap">
        <span>{label}</span>
        <span className="font-mono">
          {isUntouched ? (
            <span className="text-neutral-400">
              no data yet — needs {MIN_ATTEMPTS_FOR_TIER} ({stats.total}/{MIN_ATTEMPTS_FOR_TIER})
            </span>
          ) : (
            <>
              {stats.correct}/{stats.total}
              <span className="ml-1">· {stats.percent}%</span>
              <span className={`ml-1 ${TIER_TEXT_CLASS[stats.tier]}`}>— {TIER_LABEL[stats.tier]}</span>
            </>
          )}
        </span>
      </div>
      <div className="h-2 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
        <div
          className={`h-full ${TIER_BAR_CLASS[stats.tier]} transition-all`}
          style={{ width: stats.total === 0 ? 0 : `${Math.max(4, stats.percent)}%` }}
        />
      </div>
    </div>
  );
}

// --- Reusable generic stat row ---------------------------------------

// Simple label + stats row for new-tab sections (Key Detection, Chord
// Motion). Same visual vocabulary as the full-progression rows but
// without the associations editor / slash chord badges.
function SimpleStatRow({ label, stats, extra }: { label: string; stats: RollingStats; extra?: string }) {
  return (
    <div className="py-2.5 first:pt-0 last:pb-0 grid sm:grid-cols-[160px,1fr] gap-2 items-center">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{label}</span>
          <span className={`text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 border ${TIER_BADGE_CLASS[stats.tier]}`}>
            {TIER_LABEL[stats.tier]}
          </span>
        </div>
        {extra && <div className="text-[10px] text-neutral-400 mt-0.5">{extra}</div>}
      </div>
      <StatRow label="rolling accuracy" stats={stats} />
    </div>
  );
}

// --- Full progression / must-knows views -----------------------------

interface CuratableViewProps {
  attempts: AttemptRecord[];
  curations: ReadonlyMap<string, EtItemCuration>;
  selection: EtSelectionState;
}

function FullProgressionView({ attempts, curations, selection }: CuratableViewProps) {
  const tierGroups = useMemo(() => (
    Object.keys(TIER_NAMES).map(n => Number(n)).sort((a, b) => a - b).map(tier => ({
      key: String(tier),
      title: `Tier ${tier} — ${TIER_NAMES[tier]}`,
      progressions: PROGRESSIONS.filter(p => p.tier === tier),
    }))
  ), []);
  return (
    <div className="space-y-5">
      {tierGroups.map(group => (
        <div key={group.key}>
          <h3 className="text-xs uppercase tracking-wide text-neutral-500 mb-2">{group.title}</h3>
          <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {group.progressions.map(prog => (
              <ProgRow
                key={prog.id}
                progression={prog}
                attempts={attempts}
                curation={curations.get(prog.id)}
                selection={selection}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function MustKnowsView({ attempts, curations, selection }: CuratableViewProps) {
  const mustKnows = useMemo(() => PROGRESSIONS.filter(p => p.isMustKnow), []);
  return (
    <div>
      <h3 className="text-xs uppercase tracking-wide text-neutral-500 mb-2">
        must-know progressions ({mustKnows.length})
      </h3>
      <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
        {mustKnows.map(prog => (
          <ProgRow
            key={prog.id}
            progression={prog}
            attempts={attempts}
            curation={curations.get(prog.id)}
            selection={selection}
          />
        ))}
      </div>
    </div>
  );
}

// --- Key Detection view ---------------------------------------------

function KeyDetectionView({ attempts }: { attempts: AttemptRecord[] }) {
  return (
    <div>
      <h3 className="text-xs uppercase tracking-wide text-neutral-500 mb-2">accuracy per key</h3>
      <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
        {KEYS.map(k => {
          const stats = rollingFor(attempts, `key-detection:${k}`);
          return <SimpleStatRow key={k} label={`${k} major`} stats={stats} />;
        })}
      </div>
    </div>
  );
}

// --- Chord Motion view ----------------------------------------------

function ChordMotionView({ attempts }: { attempts: AttemptRecord[] }) {
  // Group motions by distance (2nds, 3rds, …) and show each as a
  // "startDeg → destDeg (dir)" row. Each attempt row reuses the same
  // rolling-window tier logic as the full-progression rows.
  const groups = useMemo(() => {
    const byDistance = new Map<number, typeof ALL_MOTIONS>();
    for (const m of ALL_MOTIONS) {
      const list = byDistance.get(m.distance) ?? [];
      list.push(m);
      byDistance.set(m.distance, list);
    }
    return Array.from(byDistance.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([dist, motions]) => ({
        key: String(dist),
        title: `${INTERVAL_NAME[dist as 2 | 3 | 4 | 5 | 6 | 7]}s — ${motions.length} motions`,
        motions,
      }));
  }, []);

  // Also roll up per scaffolding mode so the user can see whether
  // Minimal mode is lagging Full.
  const scaffoldStats = useMemo(() => ([
    { mode: 'full' as const, label: 'full scaffolding', stats: rollingFor(attempts, 'motion-mode:full') },
    { mode: 'partial' as const, label: 'partial scaffolding', stats: rollingFor(attempts, 'motion-mode:partial') },
    { mode: 'minimal' as const, label: 'minimal scaffolding', stats: rollingFor(attempts, 'motion-mode:minimal') },
  ]), [attempts]);

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-xs uppercase tracking-wide text-neutral-500 mb-2">accuracy by scaffolding</h3>
        <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {scaffoldStats.map(s => (
            <SimpleStatRow
              key={s.mode}
              label={s.label}
              stats={s.stats}
              extra="full credit only — half-credit Minimal rounds count as wrong here"
            />
          ))}
        </div>
      </div>
      {groups.map(g => (
        <div key={g.key}>
          <h3 className="text-xs uppercase tracking-wide text-neutral-500 mb-2">{g.title}</h3>
          <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {g.motions.map(m => {
              const id = `motion:${m.startLabel}-${m.destLabel}-${m.direction}`;
              const parsed = parseMotionId(id);
              const stats = rollingFor(attempts, id);
              const label = `${m.startLabel} → ${m.destLabel}`;
              const extra = `${m.direction === 'asc' ? 'ascending' : 'descending'} · ${parsed?.distance ?? ''}${parsed ? INTERVAL_NAME[parsed.distance].slice(-2) : ''}${m.isDiatonic ? '' : ' · chromatic'}`;
              return <SimpleStatRow key={id} label={label} stats={stats} extra={extra} />;
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// --- Top-level tracker ----------------------------------------------

interface Props { attempts: AttemptRecord[]; }

const VIEW_TABS: Array<{ id: ViewMode; label: string }> = [
  { id: 'full-progression', label: 'full progression' },
  { id: 'key-detection', label: 'key detection' },
  { id: 'chord-motion', label: 'chord motion' },
  { id: 'must-knows', label: 'must-knows only' },
];

export default function ProgressionFluencyTracker({ attempts }: Props) {
  const [view, setView] = useState<ViewMode>('full-progression');
  const allRefs = useMemo(() => PROGRESSIONS.map(p => p.id), []);
  const curations = useEtCurationsLive(allRefs);
  const selection = useEtSelection();
  // Bulk select only meaningful on the progression-listing views;
  // key-detection / chord-motion don't render per-progression rows.
  const selectionApplies = view === 'full-progression' || view === 'must-knows';

  return (
    <section className="rounded-2xl border border-black/[0.07] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.07)] backdrop-blur p-3 sm:p-5">
      <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-base sm:text-lg font-medium tracking-tight">fluency tracker</h2>
          {selectionApplies && <EtSelectToggle selection={selection} />}
        </div>
        <div className="inline-flex rounded-lg border border-neutral-200 dark:border-neutral-700 p-0.5 text-xs flex-wrap">
          {VIEW_TABS.map(opt => (
            <button
              key={opt.id}
              onClick={() => setView(opt.id)}
              className={`px-3 py-1.5 rounded-md transition ${
                view === opt.id
                  ? 'bg-fluent text-white'
                  : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      {view === 'full-progression' && (
        <FullProgressionView attempts={attempts} curations={curations} selection={selection} />
      )}
      {view === 'must-knows' && (
        <MustKnowsView attempts={attempts} curations={curations} selection={selection} />
      )}
      {view === 'key-detection' && <KeyDetectionView attempts={attempts} />}
      {view === 'chord-motion' && <ChordMotionView attempts={attempts} />}
      {selectionApplies && selection.active && (
        <EtBulkActionBar
          selected={selection.selected}
          curations={curations}
          onClear={selection.clear}
          onExit={selection.exit}
        />
      )}
    </section>
  );
}
