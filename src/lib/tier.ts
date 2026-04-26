// Skill-tier classification, shared across quiz modules.
// Tiers are derived from (rolling-window correct/total) + (days since last attempt).
//
// ─── Vocabulary status (Phase 1 sub-phase 6 audit, April 26, 2026) ───
//
// The labels in this file (mastered / fluent / developing / needsWork /
// stale / untouched) are the LEGACY measured-accuracy vocabulary. The
// canonical replacement is the garden vocabulary seeded into the
// `proficiencyDefinitions` table for the `skill` scope:
//
//   planting     < 50%      First contact; building the representations
//   sprouting    50–65%     Familiar but not yet stable
//   branching    65–80%     Right more than wrong; getting dependable
//   rooted       80–94%     Consistent across varied contexts
//   seasoned     95%+       Internalized, automatic, freed up for flow
//   maintenance  (post)     Earned; refresh occasionally
//
// Surfaces that still render Tier (and therefore have NOT yet been
// reconciled to the canonical garden vocabulary):
//
//   - src/modules/skills/SkillsGrid.tsx        (filters, sort, badges)
//   - src/modules/skills/SkillDetailPanel.tsx
//   - src/modules/ear-training/intervals/FluencyTracker.tsx
//   - src/modules/ear-training/chord-recognition/ChordFluencyTracker.tsx
//   - src/modules/ear-training/chord-progressions/* fluency surfaces
//   - src/modules/ear-training/scales-modes/* fluency surfaces
//
// Reconciliation is deferred to Phase 2, where:
//
//   1. Acquisition-stage detection lands (per Q8 — system-inferred
//      acquisition state replacing user-declared mode toggles).
//   2. Spacing state begins populating per item, with the algorithm
//      consuming the band thresholds directly.
//
// At that point the band breakpoints (which differ subtly between
// Tier and garden — Tier's "developing 50–79%" splits into the garden's
// "sprouting 50–65%" + "branching 65–80%") need a single source of
// truth. The plan is to introduce a `computeStage()` here that returns
// the garden levels, retire `computeTier()`, and migrate the surfaces
// listed above to render the new labels. Until then, Tier remains the
// only accuracy-band classifier in production.
//
// The Goals form's `items_at_level` level dropdown is the only Phase 1
// surface that renders the canonical garden vocabulary — see
// src/modules/goals/GoalFormModal.tsx::LevelSelect.

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
