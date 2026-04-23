import type { TierDistribution } from './registry';

const TIERS: Array<{ key: keyof Omit<TierDistribution, 'total'>; label: string; cls: string }> = [
  { key: 'mastered',  label: 'mastered',   cls: 'bg-mastered' },
  { key: 'fluent',    label: 'fluent',     cls: 'bg-fluent' },
  { key: 'developing',label: 'developing', cls: 'bg-developing' },
  { key: 'needsWork', label: 'needs work', cls: 'bg-needswork' },
  { key: 'stale',     label: 'stale',      cls: 'bg-neutral-400 dark:bg-neutral-500' },
  { key: 'untouched', label: 'untouched',  cls: 'bg-neutral-200 dark:bg-neutral-700' },
];

/**
 * Horizontal stacked bar that visualises the breakdown of a skill
 * pool by tier. `compact` strips the legend for use inside module
 * summary cards; full form (below the top callouts) lists counts
 * alongside each segment.
 */
export default function TierDistributionBar({
  distribution,
  compact = false,
}: {
  distribution: TierDistribution;
  compact?: boolean;
}) {
  const total = distribution.total;
  if (total === 0) {
    return (
      <div className="text-xs text-neutral-500 italic py-2">no skills tracked yet</div>
    );
  }
  return (
    <div className={compact ? 'space-y-1' : 'space-y-2'}>
      <div className={`flex overflow-hidden rounded-full ${compact ? 'h-1.5' : 'h-2.5'} bg-neutral-100 dark:bg-neutral-800`}>
        {TIERS.map(t => {
          const n = distribution[t.key];
          if (n === 0) return null;
          const pct = (n / total) * 100;
          return (
            <span
              key={t.key}
              className={`${t.cls} transition-all`}
              style={{ width: `${pct}%` }}
              title={`${t.label}: ${n}`}
            />
          );
        })}
      </div>
      {!compact && (
        <ul className="flex items-center gap-3 flex-wrap text-[10px] text-neutral-500">
          {TIERS.map(t => {
            const n = distribution[t.key];
            if (n === 0) return null;
            return (
              <li key={t.key} className="inline-flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${t.cls}`} aria-hidden />
                <span className="font-mono tabular-nums">{n}</span>
                <span>{t.label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
