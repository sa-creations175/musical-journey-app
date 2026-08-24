import { useMemo } from 'react';
import type { AttemptRecord } from '../../../lib/db';
import { ROLLING_WINDOW_SIZE } from '../../../lib/adaptiveSelection';
import { daysBetween, localDayKey } from '../../../lib/dailyGoal';
import {
  TIER_BADGE_CLASS,
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
import ProgressBar from '../../../components/ProgressBar';
import { barSegments, unratedLabel } from '../../../lib/progressBar';
import {
  spacingIntervalFor, useSpacingIntervals,
} from '../../../lib/useSpacingIntervals';
import { useEtCurationsLive } from '../useEtCurations';
import { useEtSelection, type EtSelectionState } from '../useEtSelection';
import type { EtItemCuration } from '../../../lib/db';

interface Stats {
  /** The window's own rows. The strip needs each rep's outcome and
   *  timestamp; the old code reduced exactly these to totals and
   *  dropped them. */
  window: AttemptRecord[];
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
    window: recent,
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
  const intervals = useSpacingIntervals(MODULE_ID);
  // One instant for every strip on the screen.
  const now = Date.now();

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
            intervals={intervals}
            now={now}
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
  intervals,
  now,
}: {
  mode: Mode;
  attempts: AttemptRecord[];
  intervals: ReadonlyMap<string, number>;
  now: number;
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
        {/* EACH SUB-SKILL FADES ON ITS OWN REF. Scale recognition and
            vamp recognition are separately scheduled, so one interval
            for both would age the rarer one at the commoner's rate. */}
        {/* The bar's aria-label carries the MODE too. Every row has a
            "scale recognition" bar, so the sub-skill alone would give a
            screen reader fourteen identically-named progress bars with
            no way to tell which mode each belongs to. */}
        <StatRow
          label="scale recognition"
          barLabel={`${mode.name} scale recognition`}
          stats={scaleStats}
          intervalDays={spacingIntervalFor(intervals, scaleItemId(mode))}
          now={now}
        />
        <StatRow
          label="vamp recognition"
          barLabel={`${mode.name} vamp recognition`}
          stats={vampStats}
          intervalDays={spacingIntervalFor(intervals, vampItemId(mode))}
          now={now}
        />
      </div>
    </div>
  );
}

function StatRow({
  label, barLabel, stats, intervalDays, now,
}: {
  /** Shown on screen, beside the numbers. */
  label: string;
  /** Announced to a screen reader — carries the mode, which the
   *  on-screen label does not need because the row heading is right
   *  there. */
  barLabel: string;
  stats: Stats;
  /** REQUIRED. A default would compile at both call sites and leave a
   *  missed one rendering solid ticks with nothing to say so. */
  intervalDays: number;
  now: number;
}) {
  const seg = barSegments({
    correct: stats.correct,
    wrong: stats.total - stats.correct,
  });
  const pending = unratedLabel(seg);
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs text-neutral-500 mb-1 gap-2 flex-wrap">
        <span>{label}</span>
        <span className="font-mono">
          {pending !== null ? (
            <span className="text-neutral-400">{pending}</span>
          ) : (
            <>
              {stats.correct}/{stats.total}
              <span className="ml-1">· {stats.percent}%</span>
              <span className={`ml-1 ${TIER_TEXT_CLASS[stats.tier]}`}>— {TIER_LABEL[stats.tier]}</span>
            </>
          )}
        </span>
      </div>
      <ProgressBar
        attempts={stats.window}
        intervalDays={intervalDays}
        now={now}
        label={barLabel}
      />
    </div>
  );
}
