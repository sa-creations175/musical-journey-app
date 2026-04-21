import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type AttemptRecord } from '../../lib/db';
import { ROLLING_WINDOW_SIZE } from '../../lib/adaptiveSelection';
import { daysBetween, localDayKey } from '../../lib/dailyGoal';
import {
  MIN_ATTEMPTS_FOR_TIER,
  TIER_BADGE_CLASS,
  TIER_BAR_CLASS,
  TIER_LABEL,
  TIER_TEXT_CLASS,
  computeTier,
} from '../../lib/tier';
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  FLASHCARDS,
  type FlashcardCategory,
} from './catalog';

const MODULE_ID = 'harmonic-fluency';

interface CategoryStats {
  category: FlashcardCategory;
  label: string;
  totalCardsInCategory: number;
  cardsSeen: number;
  rollingCorrect: number;
  rollingTotal: number;
  percent: number;
  tier: ReturnType<typeof computeTier>;
  lastPracticedDaysAgo: number | null;
}

function computeCategoryStats(
  category: FlashcardCategory,
  attempts: AttemptRecord[],
): CategoryStats {
  const catCards = FLASHCARDS.filter(c => c.category === category);
  const catCardIds = new Set(catCards.map(c => c.id));
  const catAttempts = attempts
    .filter(a => a.moduleId === MODULE_ID && catCardIds.has(a.itemId))
    .sort((a, b) => b.timestamp - a.timestamp);
  const recent = catAttempts.slice(0, ROLLING_WINDOW_SIZE);
  const correct = recent.filter(a => a.correct).length;
  const total = recent.length;
  const cardsSeen = new Set(catAttempts.map(a => a.itemId)).size;
  const today = localDayKey();
  const latestTs = catAttempts[0]?.timestamp;
  const daysSince = latestTs
    ? daysBetween(localDayKey(new Date(latestTs)), today)
    : null;
  const tier = computeTier({
    windowCorrect: correct,
    windowTotal: total,
    daysSinceLastAttempt: daysSince,
  });
  return {
    category,
    label: CATEGORY_LABELS[category],
    totalCardsInCategory: catCards.length,
    cardsSeen,
    rollingCorrect: correct,
    rollingTotal: total,
    percent: total === 0 ? 0 : Math.round((correct / total) * 100),
    tier,
    lastPracticedDaysAgo: daysSince,
  };
}

export default function HarmonicFluencyTracker() {
  const attempts = useLiveQuery(
    () => db.attempts.where('moduleId').equals(MODULE_ID).toArray(),
    [],
  ) ?? [];

  const rows = useMemo(
    () => CATEGORY_ORDER.map(cat => computeCategoryStats(cat, attempts)),
    [attempts],
  );

  return (
    <section className="rounded-card border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 backdrop-blur p-3 sm:p-5">
      <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-base sm:text-lg font-medium tracking-tight">fluency tracker</h2>
        <span className="text-[11px] sm:text-xs text-neutral-500">
          rolling window: last {ROLLING_WINDOW_SIZE} attempts per category
        </span>
      </div>
      <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
        {rows.map(r => {
          const isUntouched = r.tier === 'untouched';
          return (
            <div key={r.category} className="py-3 first:pt-0 last:pb-0 grid sm:grid-cols-[240px,1fr] gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{r.label}</span>
                  <span className={`text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 border ${TIER_BADGE_CLASS[r.tier]}`}>
                    {TIER_LABEL[r.tier]}
                  </span>
                </div>
                <div className="text-[11px] text-neutral-500 mt-0.5">
                  {r.cardsSeen}/{r.totalCardsInCategory} cards seen
                  {r.lastPracticedDaysAgo !== null && (
                    <>
                      {' · '}
                      last practiced{' '}
                      {r.lastPracticedDaysAgo === 0
                        ? 'today'
                        : r.lastPracticedDaysAgo === 1
                          ? 'yesterday'
                          : `${r.lastPracticedDaysAgo}d ago`}
                    </>
                  )}
                </div>
              </div>
              <div className="min-w-0">
                <div className="flex items-baseline justify-between text-xs text-neutral-500 mb-1 gap-2 flex-wrap">
                  <span>accuracy</span>
                  <span className="font-mono">
                    {isUntouched ? (
                      <span className="text-neutral-400">
                        no data yet — needs {MIN_ATTEMPTS_FOR_TIER} ({r.rollingTotal}/{MIN_ATTEMPTS_FOR_TIER})
                      </span>
                    ) : (
                      <>
                        {r.rollingCorrect}/{r.rollingTotal}
                        <span className="ml-1">· {r.percent}%</span>
                        <span className={`ml-1 ${TIER_TEXT_CLASS[r.tier]}`}>— {TIER_LABEL[r.tier]}</span>
                      </>
                    )}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                  <div
                    className={`h-full ${TIER_BAR_CLASS[r.tier]} transition-all`}
                    style={{ width: r.rollingTotal === 0 ? 0 : `${Math.max(4, r.percent)}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
