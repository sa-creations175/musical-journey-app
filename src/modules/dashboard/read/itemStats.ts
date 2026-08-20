/**
 * The read layer's one per-item computation.
 *
 * Every number the dashboard shows for a single catalog item comes from
 * here: accuracy, coverage, recency. Three places used to compute this
 * independently and disagree (`docs/RULE_LEGIBILITY.md` §1.12); the
 * point of this module is that there is now one.
 *
 * Pure. No Dexie, no React, no clock of its own — `now` is passed in.
 * `AttemptRecord` is a type-only import so nothing here pulls the
 * database at runtime.
 *
 * ─── The three rules, in one place ───────────────────────────────────
 *
 * ACCURACY — the mean score over the last `ACCURACY_WINDOW` (20)
 *   engagements that are eligible for it. Fewer than 20: use what
 *   exists. Zero: `null`, so callers render a dash rather than `0%`,
 *   which would read as "you got everything wrong".
 *
 * COVERAGE — see `CoverageRule`. Default is 3+ engagements. An item
 *   seen once, guessed wrong and never revisited must stay on the
 *   uncovered list, or that list stops being trustworthy.
 *
 * RECENCY — the timestamp of the most recent engagement, counting
 *   EVERY engagement including the ones excluded from accuracy.
 *
 * ─── Why recency counts what accuracy excludes ───────────────────────
 *
 * `excludeFromFluency` marks an attempt made in a focus pool of fewer
 * than 4 items. It is excluded from accuracy because a 3-item pool
 * inflates a percentage — a blind guess is right one time in three and
 * short-term recall carries the rest. It is counted toward coverage and
 * recency because you did practise the item; coverage asks whether you
 * did the thing, and recency asks when you last touched it. Neither
 * question is about whether the answer was a genuine fluency signal.
 *
 * This is exactly where the old implementations diverged.
 * `dashboard/aggregation.ts` dropped excluded rows before reading the
 * last timestamp, so a week of focus practice left an item reading as
 * untouched for a week. `skills/registry.ts` read the timestamp from
 * the unfiltered list. Registry was right; this module encodes that.
 */
import type { AttemptRecord } from '../../../lib/db';
import { fluencyValue, normaliseFeel } from '../../../lib/fluencyScale';
import { canonicalItemId } from './canonicalItemId';

/** Engagements the accuracy mean is taken over. */
export const ACCURACY_WINDOW = 20;

/** Default coverage bar: an item is covered at this many engagements. */
export const COVERAGE_MIN_ENGAGEMENTS = 3;

/**
 * What the accuracy column MEANS for a given module — the same column
 * position carrying two different questions.
 *
 * `measured` — the app marked the answer right or wrong. Ear training,
 *   harmonic fluency, reading, production vocabulary. The number is
 *   percent correct.
 *
 * `self-rated` — no right or wrong exists. Shapes & Patterns and Song
 *   Repertoire are played at a keyboard and the player rates the rep on
 *   the four-step fluency scale. The number is the mean of those
 *   ratings projected onto 0–100, and the column is labelled *fluency*,
 *   not accuracy.
 *
 * Carried on every `ItemStats` rather than inferred by the caller so a
 * self-rated 75 can never be presented as "75% correct". The affordance
 * reads this field.
 */
export type AccuracyKind = 'measured' | 'self-rated';

/**
 * How an item earns coverage.
 *
 * `engagements` — the default. Coverage means you did the thing, N
 *   times. N is `COVERAGE_MIN_ENGAGEMENTS` for every drill.
 *
 * `score` — production lessons only. A lesson is not a rep you repeat;
 *   it has a reading path and a doing path, and the five-step lesson
 *   scale tracks how far down it you got. Coverage is "tried it" (75):
 *   reading a lesson and taking it in are worth recording, but neither
 *   is practice, so `read it` and `deep dive` leave it uncovered.
 */
export type CoverageRule =
  | { kind: 'engagements'; min: number }
  | { kind: 'score'; min: number };

export const DEFAULT_COVERAGE_RULE: CoverageRule = {
  kind: 'engagements',
  min: COVERAGE_MIN_ENGAGEMENTS,
};

/** Production lessons: coverage means you did the thing, not that you
 *  understood the words. */
export const LESSON_COVERAGE_RULE: CoverageRule = { kind: 'score', min: 75 };

/**
 * One recorded engagement with one catalog item, normalised across the
 * very different things the six modules store.
 *
 * `score` is 0–100 so measured and self-rated collapse onto one axis:
 * a right answer is 100, a wrong one 0, and a self-rated rep is its
 * fluency value (25 / 50 / 75 / 100). What the number MEANS still
 * differs, which is what `AccuracyKind` carries.
 */
export interface Engagement {
  itemRef: string;
  timestamp: number;
  /** 0–100. */
  score: number;
  /** Excluded from accuracy; still counts for coverage and recency. */
  excludeFromFluency?: boolean;
}

export interface ItemStats {
  itemRef: string;
  accuracyKind: AccuracyKind;
  /** Every engagement, excluded ones included. Coverage and the
   *  item-level attempt readout both use this. */
  engagementCount: number;
  /** How many were flagged `excludeFromFluency`. Exposed so an
   *  affordance can say "12 attempts, 4 of them in focus mode" rather
   *  than leaving the gap between coverage and accuracy unexplained. */
  excludedCount: number;
  /** Engagements inside the accuracy window. 0 when every engagement
   *  was excluded. */
  windowTotal: number;
  /** Window engagements scoring a full 100. Meaningful for `measured`
   *  items, where it is the count of correct answers. For `self-rated`
   *  items it is the count of `in flow` reps, which is not what the
   *  column shows — read `score` instead. */
  windowCorrect: number;
  /** Mean window score, 0–100, or `null` when the window is empty.
   *  Null is not zero: it means no eligible signal, and the caller
   *  renders a dash. */
  score: number | null;
  /** Most recent engagement over ALL engagements. Null when none. */
  lastAt: number | null;
  covered: boolean;
}

export interface ItemStatsOptions {
  accuracyKind?: AccuracyKind;
  coverageRule?: CoverageRule;
}

/** An item with nothing logged against it. Distinct from an item with
 *  only excluded attempts, which has a non-zero `engagementCount`. */
export function emptyItemStats(
  itemRef: string,
  options: ItemStatsOptions = {},
): ItemStats {
  return {
    itemRef,
    accuracyKind: options.accuracyKind ?? 'measured',
    engagementCount: 0,
    excludedCount: 0,
    windowTotal: 0,
    windowCorrect: 0,
    score: null,
    lastAt: null,
    covered: false,
  };
}

function isCovered(
  rule: CoverageRule,
  engagementCount: number,
  score: number | null,
): boolean {
  if (rule.kind === 'engagements') return engagementCount >= rule.min;
  return score !== null && score >= rule.min;
}

/**
 * Stats for one item from its engagements. Input order does not
 * matter — engagements are sorted newest-first here, so a caller
 * cannot produce a wrong window by handing them over unsorted.
 */
export function itemStatsFromEngagements(
  itemRef: string,
  engagements: ReadonlyArray<Engagement>,
  options: ItemStatsOptions = {},
): ItemStats {
  const accuracyKind = options.accuracyKind ?? 'measured';
  const coverageRule = options.coverageRule ?? DEFAULT_COVERAGE_RULE;
  if (engagements.length === 0) return emptyItemStats(itemRef, options);

  const sorted = [...engagements].sort((a, b) => b.timestamp - a.timestamp);
  // Recency spans every engagement. Accuracy spans only the eligible
  // ones. Taking `lastAt` before the filter is the whole point.
  const lastAt = sorted[0].timestamp;
  const excludedCount = sorted.filter(e => e.excludeFromFluency).length;

  const window = sorted
    .filter(e => !e.excludeFromFluency)
    .slice(0, ACCURACY_WINDOW);
  const windowTotal = window.length;
  const windowCorrect = window.filter(e => e.score === 100).length;
  const score = windowTotal === 0
    ? null
    : window.reduce((sum, e) => sum + e.score, 0) / windowTotal;

  return {
    itemRef,
    accuracyKind,
    engagementCount: sorted.length,
    excludedCount,
    windowTotal,
    windowCorrect,
    score,
    lastAt,
    covered: isCovered(coverageRule, sorted.length, score),
  };
}

/**
 * Bucket engagements by `itemRef` and compute stats for each.
 *
 * Only items with at least one engagement appear. Enumerating the full
 * catalog is the caller's job — the denominator must come from the
 * catalog, never from what happens to be in the log, so this function
 * deliberately cannot supply it.
 */
export function itemStatsByRef(
  engagements: ReadonlyArray<Engagement>,
  options: ItemStatsOptions = {},
): Map<string, ItemStats> {
  const byRef = new Map<string, Engagement[]>();
  for (const e of engagements) {
    const bucket = byRef.get(e.itemRef);
    if (bucket) bucket.push(e);
    else byRef.set(e.itemRef, [e]);
  }
  const out = new Map<string, ItemStats>();
  for (const [itemRef, bucket] of byRef) {
    out.set(itemRef, itemStatsFromEngagements(itemRef, bucket, options));
  }
  return out;
}

// =====================================================================
// Converters — the module-specific shapes that feed the primitive
// =====================================================================

/**
 * A right/wrong attempt row. `itemRef` is canonicalised here so every
 * caller buckets identically; see `canonicalItemId`.
 */
export function engagementFromAttempt(attempt: AttemptRecord): Engagement {
  return {
    itemRef: canonicalItemId(attempt.moduleId, attempt.itemId),
    timestamp: attempt.timestamp,
    score: attempt.correct ? 100 : 0,
    ...(attempt.excludeFromFluency ? { excludeFromFluency: true } : {}),
  };
}

export function engagementsFromAttempts(
  attempts: ReadonlyArray<AttemptRecord>,
): Engagement[] {
  return attempts.map(engagementFromAttempt);
}

/**
 * A self-rated rep — a Shapes & Patterns drill session or a Repertoire
 * practice session.
 *
 * Returns `null` when the rating is absent or unreadable. Absence is
 * not a low rating: "log the time and say nothing else" is a supported
 * path in both modules, and coercing an unrated session to a number
 * would invent a fluency signal the player never gave. Callers drop
 * nulls rather than defaulting them.
 *
 * The raw value goes through `normaliseFeel`, which folds the legacy
 * fifth step (`breakthrough`, dropped — a breakthrough is an event, not
 * a level) onto `in flow`.
 */
export function engagementFromRating(
  itemRef: string,
  timestamp: number,
  rawFeel: number | null | undefined,
): Engagement | null {
  const feel = normaliseFeel(rawFeel);
  if (feel === null) return null;
  return { itemRef, timestamp, score: fluencyValue(feel) };
}
