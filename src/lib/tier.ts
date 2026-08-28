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

export type Tier =
  | 'mastered' | 'fluent' | 'developing' | 'needsWork'
  | 'stale' | 'started' | 'untouched';

/**
 * `untouched` IS ZERO. `started` IS THE WORK BELOW THE GRADE LINE.
 *
 * These were one band until now, and that band was a lie on every
 * grid that drew it: a card answered four times painted the same
 * pixels as one never seen, so a page of real practice read as a page
 * of nothing. The threshold has not moved — five attempts is still
 * what it takes to be graded — but the space beneath it is no longer
 * one colour.
 *
 *   untouched   0 attempts            nothing has happened
 *   started     1 .. MIN-1 attempts   work done, not enough to grade
 *   graded      MIN+ attempts         needsWork / developing / fluent / mastered
 *
 * A null tier (an item whose module cannot compute one) folds onto
 * `untouched` AT THE RENDER SITE, for the same reason: no data is the
 * one thing that may look like no data.
 *
 * `started` deliberately carries the SAME adaptive weight `untouched`
 * carries. Splitting the band is a change to what the user can see,
 * not to what the scheduler picks.
 */
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
  if (windowTotal === 0) return 'untouched';
  if (windowTotal < MIN_ATTEMPTS_FOR_TIER) return 'started';
  const pct = windowCorrect / windowTotal;
  let base: Exclude<Tier, 'stale' | 'started' | 'untouched'>;
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

/**
 * Every tier, best first — the one order the surfaces that list them
 * all should walk. Three files kept their own copy of this list and a
 * new band had to be remembered in each; now it is remembered here.
 * `started` sits below `stale` and above `untouched`: less is known
 * about it than a decayed grade, more than nothing.
 */
export const TIER_ORDER: ReadonlyArray<Tier> = [
  'mastered', 'fluent', 'developing', 'needsWork', 'stale', 'started', 'untouched',
];

// Adaptive-selection base weight per tier. Caller feeds this into
// AdaptiveCandidate.baseWeight; the recent-history multiplier is applied
// separately inside adaptiveSelection.ts.
export const TIER_WEIGHT: Record<Tier, number> = {
  mastered: 0.4,
  fluent: 0.5,
  developing: 1.5,
  needsWork: 2.5,
  stale: 1.8,
  // Same as `untouched` on purpose — see the note on MIN_ATTEMPTS_FOR_TIER.
  started: 1.0,
  untouched: 1.0,
};

/**
 * The tier's name, as the reader sees it.
 *
 * TITLE CASE BECAUSE EVERY ONE OF THESE IS A STATUS WORD. They are the
 * app's own vocabulary for describing the reader — Fluent is a rating,
 * not an adjective someone chose — and in lowercase, inside a legend
 * reading "not started, started, needs work…", they parse as ordinary
 * description rather than as the six things a cell can be.
 *
 * Cased HERE rather than at each call site because this is the one
 * definition. `CategoryCard`'s badge renders it through an `uppercase`
 * class and so is unaffected on screen; `ProgressDetail`'s legend and
 * its two item badges paint it as written, and are what change.
 */
export const TIER_LABEL: Record<Tier, string> = {
  mastered: 'Mastered',
  fluent: 'Fluent',
  developing: 'Developing',
  needsWork: 'Needs Work',
  stale: 'Stale',
  started: 'Started',
  untouched: 'Not Started',
};

export const TIER_DESCRIPTION: Record<Tier, string> = {
  mastered: '20/20 correct over the last 20 attempts',
  fluent: '80–99% over the last 20 attempts',
  developing: '50–79% over the last 20 attempts',
  needsWork: 'below 50% over the last 20 attempts',
  stale: 'was fluent or mastered, no attempts in 30+ days',
  started: 'fewer than 5 attempts',
  untouched: 'no attempts yet',
};

// Tailwind class literals — written out fully so JIT picks them up.
export const TIER_BAR_CLASS: Record<Tier, string> = {
  mastered: 'bg-mastered',
  fluent: 'bg-fluent',
  developing: 'bg-developing',
  needsWork: 'bg-needswork',
  stale: 'bg-neutral-400 dark:bg-neutral-500',
  // Tinted, not grey. The whole point of the band is that it cannot be
  // mistaken for the empty one — and `info` carries no accuracy meaning,
  // so it cannot be mistaken for a grade either.
  started: 'bg-info/40 dark:bg-info/50',
  untouched: 'bg-neutral-200 dark:bg-neutral-700',
};

export const TIER_TEXT_CLASS: Record<Tier, string> = {
  mastered: 'text-mastered',
  fluent: 'text-fluent',
  developing: 'text-developing',
  needsWork: 'text-needswork',
  stale: 'text-neutral-500',
  started: 'text-info',
  untouched: 'text-neutral-400',
};

export const TIER_BADGE_CLASS: Record<Tier, string> = {
  mastered: 'bg-mastered/10 text-mastered border-mastered/30',
  fluent: 'bg-fluent/10 text-fluent border-fluent/30',
  developing: 'bg-developing/10 text-developing border-developing/30',
  needsWork: 'bg-needswork/10 text-needswork border-needswork/30',
  stale: 'bg-neutral-200/40 text-neutral-500 border-neutral-300 dark:bg-neutral-700/40 dark:border-neutral-600',
  started: 'bg-info/10 text-info border-info/30',
  untouched: 'bg-neutral-100/50 text-neutral-500 border-neutral-200 dark:bg-neutral-800/50 dark:border-neutral-700',
};
