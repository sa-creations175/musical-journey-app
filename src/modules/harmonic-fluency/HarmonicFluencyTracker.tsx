import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type AttemptRecord } from '../../lib/db';
import ProgressBar from '../../components/ProgressBar';
import {
  FALLBACK_INTERVAL_DAYS, barSegments, unratedLabel, type TickAttempt,
} from '../../lib/progressBar';
import {
  spacingIntervalFor, useSpacingIntervals,
} from '../../lib/useSpacingIntervals';
import { ROLLING_WINDOW_SIZE } from '../../lib/adaptiveSelection';
import { daysBetween, localDayKey } from '../../lib/dailyGoal';
import {
  TIER_BADGE_CLASS,
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
  /**
   * The window's reps, each carrying ITS OWN card's interval.
   *
   * A category is not an item. "Pentatonic scales" is 41 cards on 41
   * schedules, so there is no single interval for this row — see
   * `TickAttempt.intervalDays`.
   */
  window: TickAttempt[];
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
  spacingIntervals: ReadonlyMap<string, number>,
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
    // Each rep fades against the card it was ON, not against the
    // category. Two reps of the same age in one strip read differently
    // when their cards are on different schedules — which is the whole
    // reason this row could not use a single interval.
    window: recent.map(a => ({
      correct: a.correct,
      timestamp: a.timestamp,
      intervalDays: spacingIntervalFor(spacingIntervals, a.itemId),
    })),
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

  const spacingIntervals = useSpacingIntervals(MODULE_ID);
  const now = Date.now();

  const rows = useMemo(
    () => CATEGORY_ORDER.map(
      cat => computeCategoryStats(cat, attempts, spacingIntervals),
    ),
    [attempts, spacingIntervals],
  );

  return (
    <section className="rounded-2xl border border-black/[0.07] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.07)] backdrop-blur p-3 sm:p-5">
      <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-base sm:text-lg font-medium tracking-tight">fluency tracker</h2>
        <span className="text-[11px] sm:text-xs text-neutral-500">
          rolling window: last {ROLLING_WINDOW_SIZE} attempts per category
        </span>
      </div>
      <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
        {rows.map(r => {
          const seg = barSegments({
            correct: r.rollingCorrect,
            wrong: r.rollingTotal - r.rollingCorrect,
          });
          const pending = unratedLabel(seg);
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
                    {pending !== null ? (
                      <span className="text-neutral-400">{pending}</span>
                    ) : (
                      <>
                        {r.rollingCorrect}/{r.rollingTotal}
                        <span className="ml-1">· {r.percent}%</span>
                        <span className={`ml-1 ${TIER_TEXT_CLASS[r.tier]}`}>— {TIER_LABEL[r.tier]}</span>
                      </>
                    )}
                  </span>
                </div>
                {/* `intervalDays` here is only the FALLBACK for a rep
                    whose card has no spacing row; every tick normally
                    carries its own. A category has no interval of its
                    own to pass. */}
                <ProgressBar
                  attempts={r.window}
                  intervalDays={FALLBACK_INTERVAL_DAYS}
                  now={now}
                  label={r.label}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
