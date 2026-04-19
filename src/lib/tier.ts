// Skill-tier classification, shared across quiz modules.
// Tiers are derived from (rolling-window correct/total) + (days since last attempt).

export type Tier = 'mastered' | 'fluent' | 'developing' | 'needsWork' | 'stale' | 'untouched';

export const MIN_ATTEMPTS_FOR_TIER = 5;
export const MASTERY_WINDOW = 20;
export const STALE_DAYS = 30;

export interface TierInput {
  windowCorrect: number;
  windowTotal: number;
  daysSinceLastAttempt: number | null;
}

export function computeTier(input: TierInput): Tier {
  const { windowCorrect, windowTotal, daysSinceLastAttempt } = input;
  if (windowTotal < MIN_ATTEMPTS_FOR_TIER) return 'untouched';
  const pct = windowCorrect / windowTotal;
  let base: Exclude<Tier, 'stale' | 'untouched'>;
  if (windowTotal >= MASTERY_WINDOW && windowCorrect === windowTotal) base = 'mastered';
  else if (pct >= 0.8) base = 'fluent';
  else if (pct >= 0.5) base = 'developing';
  else base = 'needsWork';
  if ((base === 'mastered' || base === 'fluent') &&
      daysSinceLastAttempt !== null && daysSinceLastAttempt >= STALE_DAYS) {
    return 'stale';
  }
  return base;
}

// Adaptive-selection base weight per tier. Caller feeds this into
// AdaptiveCandidate.baseWeight; the recent-history multiplier is applied
// separately inside adaptiveSelection.ts.
export const TIER_WEIGHT: Record<Tier, number> = {
  mastered: 0.4,
  fluent: 0.5,
  developing: 1.5,
  needsWork: 2.5,
  stale: 1.8,
  untouched: 1.0,
};

export const TIER_LABEL: Record<Tier, string> = {
  mastered: 'mastered',
  fluent: 'fluent',
  developing: 'developing',
  needsWork: 'needs work',
  stale: 'stale',
  untouched: 'untouched',
};

export const TIER_DESCRIPTION: Record<Tier, string> = {
  mastered: '20/20 correct over the last 20 attempts',
  fluent: '80–99% over the last 20 attempts',
  developing: '50–79% over the last 20 attempts',
  needsWork: 'below 50% over the last 20 attempts',
  stale: 'was fluent or mastered, no attempts in 30+ days',
  untouched: 'fewer than 5 attempts',
};

// Tailwind class literals — written out fully so JIT picks them up.
export const TIER_BAR_CLASS: Record<Tier, string> = {
  mastered: 'bg-mastered',
  fluent: 'bg-fluent',
  developing: 'bg-developing',
  needsWork: 'bg-needswork',
  stale: 'bg-neutral-400 dark:bg-neutral-500',
  untouched: 'bg-neutral-200 dark:bg-neutral-700',
};

export const TIER_TEXT_CLASS: Record<Tier, string> = {
  mastered: 'text-mastered',
  fluent: 'text-fluent',
  developing: 'text-developing',
  needsWork: 'text-needswork',
  stale: 'text-neutral-500',
  untouched: 'text-neutral-400',
};

export const TIER_BADGE_CLASS: Record<Tier, string> = {
  mastered: 'bg-mastered/10 text-mastered border-mastered/30',
  fluent: 'bg-fluent/10 text-fluent border-fluent/30',
  developing: 'bg-developing/10 text-developing border-developing/30',
  needsWork: 'bg-needswork/10 text-needswork border-needswork/30',
  stale: 'bg-neutral-200/40 text-neutral-500 border-neutral-300 dark:bg-neutral-700/40 dark:border-neutral-600',
  untouched: 'bg-neutral-100/50 text-neutral-500 border-neutral-200 dark:bg-neutral-800/50 dark:border-neutral-700',
};
