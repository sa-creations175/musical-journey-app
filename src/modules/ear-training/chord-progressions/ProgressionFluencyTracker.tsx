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
import { containsSlashChords } from './progressionTheory';
import AssociationsEditor from './AssociationsEditor';

const MODULE_ID = 'chord-progressions';
type ViewMode = 'tier' | 'must-knows';

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

interface ProgRowProps { progression: Progression; attempts: AttemptRecord[]; }

function ProgRow({ progression, attempts }: ProgRowProps) {
  const chord = rollingFor(attempts, progression.id);
  const pattern = rollingFor(attempts, `${progression.id}-pattern`);
  const inversion = rollingFor(attempts, `${progression.id}-inversion`);
  const hasSlash = containsSlashChords(progression.numerals);

  return (
    <div className="py-3 first:pt-0 last:pb-0 grid lg:grid-cols-[280px,1fr] gap-3 sm:gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{progression.name}</span>
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

interface Props { attempts: AttemptRecord[]; }

export default function ProgressionFluencyTracker({ attempts }: Props) {
  const [view, setView] = useState<ViewMode>('tier');

  const tierGroups = useMemo(() => {
    return Object.keys(TIER_NAMES).map(n => Number(n)).sort((a, b) => a - b).map(tier => ({
      key: String(tier),
      title: `Tier ${tier} — ${TIER_NAMES[tier]}`,
      progressions: PROGRESSIONS.filter(p => p.tier === tier),
    }));
  }, []);

  const mustKnows = useMemo(() => PROGRESSIONS.filter(p => p.isMustKnow), []);

  return (
    <section className="rounded-card border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 backdrop-blur p-3 sm:p-5">
      <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-base sm:text-lg font-medium tracking-tight">fluency tracker</h2>
        <div className="inline-flex rounded-lg border border-neutral-200 dark:border-neutral-700 p-0.5 text-xs">
          {([
            { id: 'tier', label: 'tier view' },
            { id: 'must-knows', label: 'must-knows only' },
          ] as const).map(opt => (
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
      {view === 'tier' ? (
        <div className="space-y-5">
          {tierGroups.map(group => (
            <div key={group.key}>
              <h3 className="text-xs uppercase tracking-wide text-neutral-500 mb-2">{group.title}</h3>
              <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {group.progressions.map(prog => (
                  <ProgRow key={prog.id} progression={prog} attempts={attempts} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div>
          <h3 className="text-xs uppercase tracking-wide text-neutral-500 mb-2">
            must-know progressions ({mustKnows.length})
          </h3>
          <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {mustKnows.map(prog => (
              <ProgRow key={prog.id} progression={prog} attempts={attempts} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
