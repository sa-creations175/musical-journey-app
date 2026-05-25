import { useMemo } from 'react';
import type { AttemptRecord } from '../../../lib/db';
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
import { sortModes, type Mode, type ModeSortOrder } from './catalog';
import { MODULE_ID, scaleItemId, vampItemId } from './shared';
import EtItemCurationButton from '../EtItemCurationButton';
import EtItemStatus from '../EtItemStatus';
import EtRowCheckbox from '../EtRowCheckbox';
import EtBulkActionBar from '../EtBulkActionBar';
import EtSelectToggle from '../EtSelectToggle';
import { useEtCurationsLive } from '../useEtCurations';
import { useEtSelection, type EtSelectionState } from '../useEtSelection';
import type { EtItemCuration } from '../../../lib/db';

interface Stats {
  correct: number;
  total: number;
  percent: number;
  tier: Tier;
  lastTimestamp: number | null;
}

function rollingFor(attempts: AttemptRecord[], itemId: string): Stats {
  const filtered = attempts
    .filter(a => a.moduleId === MODULE_ID && a.itemId === itemId)
    .sort((a, b) => b.timestamp - a.timestamp);
  const recent = filtered.slice(0, ROLLING_WINDOW_SIZE);
  const correct = recent.filter(a => a.correct).length;
  const total = recent.length;
  const today = localDayKey();
  const latestTs = filtered[0]?.timestamp ?? null;
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
    lastTimestamp: latestTs,
  };
}

function lastPracticedLabel(a: Stats, b: Stats): string {
  const ts = Math.max(a.lastTimestamp ?? 0, b.lastTimestamp ?? 0);
  if (ts === 0) return 'never practiced';
  const today = localDayKey();
  const days = daysBetween(localDayKey(new Date(ts)), today);
  if (days === 0) return 'today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

interface Props {
  attempts: AttemptRecord[];
  sort: ModeSortOrder;
}

export default function FluencyTracker({ attempts, sort }: Props) {
  const modes = useMemo(() => sortModes(sort), [sort]);
  const itemRefs = useMemo(() => modes.map(m => m.id), [modes]);
  const curations = useEtCurationsLive(itemRefs);
  const selection = useEtSelection();

  return (
    <section className="rounded-2xl border border-black/[0.07] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.07)] backdrop-blur p-3 sm:p-5 space-y-4">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-base sm:text-lg font-medium tracking-tight">fluency tracker</h2>
          <EtSelectToggle selection={selection} />
        </div>
        <p className="text-[11px] text-neutral-500">scale recognition · vamp recognition · last practiced</p>
      </div>
      <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
        {modes.map(mode => (
          <ModeRow
            key={mode.id}
            mode={mode}
            attempts={attempts}
            curation={curations.get(mode.id)}
            selection={selection}
          />
        ))}
      </div>
      {selection.active && (
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

function ModeRow({
  mode,
  attempts,
  curation,
  selection,
}: {
  mode: Mode;
  attempts: AttemptRecord[];
  curation: EtItemCuration | undefined;
  selection: EtSelectionState;
}) {
  const scaleStats = rollingFor(attempts, scaleItemId(mode));
  const vampStats = rollingFor(attempts, vampItemId(mode));
  const dim = curation?.hidden ? 'opacity-60' : '';

  return (
    <div className={`py-3 first:pt-0 last:pb-0 grid lg:grid-cols-[220px,1fr] gap-3 sm:gap-4 ${dim}`}>
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <EtRowCheckbox itemRef={mode.id} selection={selection} />
          <span className="font-medium text-sm">{mode.name}</span>
          <EtItemStatus curation={curation} />
          <EtItemCurationButton
            itemRef={mode.id}
            defaultLabel={mode.name}
            itemKindLabel="Mode"
          />
          <span className={`text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 border ${TIER_BADGE_CLASS[scaleStats.tier]}`}>
            {TIER_LABEL[scaleStats.tier]}
          </span>
        </div>
        <div className="text-[10px] text-neutral-500 mt-0.5">
          last practiced: {lastPracticedLabel(scaleStats, vampStats)}
        </div>
      </div>
      <div className="min-w-0 space-y-2">
        <StatRow label="scale recognition" stats={scaleStats} />
        <StatRow label="vamp recognition" stats={vampStats} />
      </div>
    </div>
  );
}

function StatRow({ label, stats }: { label: string; stats: Stats }) {
  const isUntouched = stats.tier === 'untouched';
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs text-neutral-500 mb-1 gap-2 flex-wrap">
        <span>{label}</span>
        <span className="font-mono">
          {isUntouched ? (
            <span className="text-neutral-400">
              no data — needs {MIN_ATTEMPTS_FOR_TIER} ({stats.total}/{MIN_ATTEMPTS_FOR_TIER})
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
