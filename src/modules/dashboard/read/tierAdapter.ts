/**
 * The bridge from `ItemStats` to the legacy `Tier` vocabulary.
 *
 * WHY THIS FILE EXISTS
 *
 * Three places computed per-item tiers independently and disagreed
 * (`docs/RULE_LEGIBILITY.md` §1.12): `dashboard/aggregation.ts`,
 * `skills/registry.ts`, and `ChordRecognitionQuiz.tsx`. The Dashboard,
 * the Skills catalogue and the in-quiz tracker could show different
 * tiers for the same item. This is the one implementation all of them
 * now call, sitting on top of the read layer's `itemStats` primitive.
 *
 * It is a BRIDGE, not the destination. The new dashboard reads
 * accuracy / coverage / recency directly off `ItemStats`; `Tier` is the
 * six-band vocabulary the current surfaces speak. This file keeps them
 * agreeing until those surfaces are replaced, and then it goes away.
 *
 * Pure — no Dexie, no clock of its own.
 */
import type { AttemptRecord } from '../../../lib/db';
import { MASTERY_WINDOW, MIN_ATTEMPTS_FOR_TIER } from '../../../lib/tier';
import type { TreeNode } from './tree';
import { computeTier, type Tier } from '../../../lib/tier';
import { catalogRollupKey } from './canonicalItemId';
import type { ModuleCatalog } from './catalogs';
import { statsForAttemptCatalog } from './adapters';
import {
  engagementsFromAttempts,
  itemStatsByRef,
  itemStatsFromEngagements,
  type Engagement,
  type ItemStats,
} from './itemStats';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface TierCounts {
  mastered: number;
  fluent: number;
  developing: number;
  needsWork: number;
  stale: number;
  started: number;
  untouched: number;
  total: number;
}

export function emptyTierCounts(): TierCounts {
  return {
    mastered: 0, fluent: 0, developing: 0,
    needsWork: 0, stale: 0, started: 0, untouched: 0, total: 0,
  };
}

export function bumpTier(counts: TierCounts, tier: Tier): void {
  counts.total += 1;
  switch (tier) {
    case 'mastered':   counts.mastered += 1;   break;
    case 'fluent':     counts.fluent += 1;     break;
    case 'developing': counts.developing += 1; break;
    case 'needsWork':  counts.needsWork += 1;  break;
    case 'stale':      counts.stale += 1;      break;
    case 'started':    counts.started += 1;    break;
    case 'untouched':  counts.untouched += 1;  break;
  }
}

/**
 * Tier for one item.
 *
 * `daysSinceLastAttempt` comes from `stats.lastAt`, which spans EVERY
 * engagement including focus-protected ones. That is the divergence
 * this collapse fixes: `aggregation.ts` used to drop excluded rows
 * before reading the timestamp, so a week of focus practice could tip
 * an item into `stale` while the player was drilling it daily.
 */
export function tierFromItemStats(stats: ItemStats, now: number): Tier {
  return computeTier({
    windowCorrect: stats.windowCorrect,
    windowTotal: stats.windowTotal,
    daysSinceLastAttempt: stats.lastAt === null
      ? null
      : Math.floor((now - stats.lastAt) / DAY_MS),
  });
}

/**
 * Registry's shape: the tier plus the timestamp its freshness reads.
 *
 * `last` spans every engagement, for the same reason as above — the
 * Skills catalogue's "last practised" must not claim you haven't
 * touched something you drilled yesterday in focus mode.
 */
export function tierAndLastFromAttempts(
  attempts: ReadonlyArray<AttemptRecord>,
  now: number,
): { tier: Tier; last: number | null } {
  const stats = itemStatsFromEngagements('', engagementsFromAttempts(attempts));
  return { tier: tierFromItemStats(stats, now), last: stats.lastAt };
}

/** As above, for callers that have already built engagements (a
 *  module whose signal is not right/wrong). */
export function tierAndLastFromEngagements(
  engagements: ReadonlyArray<Engagement>,
  now: number,
): { tier: Tier; last: number | null } {
  const stats = itemStatsFromEngagements('', engagements);
  return { tier: tierFromItemStats(stats, now), last: stats.lastAt };
}

/**
 * Aggregation's shape: tier counts across every item present in a set
 * of attempts.
 *
 * NOTE ON THE DENOMINATOR. `total` here counts items THAT APPEAR IN
 * THE LOG, not items in the catalog. That is a real gap — a coverage
 * denominator must be the full catalog — but it is pre-existing
 * behaviour and fixing it needs the catalog enumeration that lands in
 * step 3. Preserved exactly as-is here so this step changes one thing
 * at a time. `snapshotHarmonicFluency` already walks its catalog and
 * so already reports a true `untouched` count; the ear-training
 * snapshots do not, and the two have never agreed about what `total`
 * means.
 */
export function tierCountsFromAttempts(
  attempts: ReadonlyArray<AttemptRecord>,
  now: number,
): TierCounts {
  const counts = emptyTierCounts();
  for (const stats of itemStatsByRef(engagementsFromAttempts(attempts)).values()) {
    bumpTier(counts, tierFromItemStats(stats, now));
  }
  return counts;
}

/**
 * Bucket attempts by module, then by the catalog row they roll up
 * into. The shape `skills/registry.ts` walks.
 *
 * Keying on `catalogRollupKey` rather than the raw `itemId` is what
 * makes a chord-recognition lookup by bare chord id find attempts
 * stored as `chordId:inversion`.
 */
export function bucketAttemptsForCatalog(
  attempts: ReadonlyArray<AttemptRecord>,
): Map<string, Map<string, AttemptRecord[]>> {
  const byModule = new Map<string, Map<string, AttemptRecord[]>>();
  for (const a of attempts) {
    const mod = byModule.get(a.moduleId) ?? new Map<string, AttemptRecord[]>();
    const key = catalogRollupKey(a.moduleId, a.itemId);
    const arr = mod.get(key);
    if (arr) arr.push(a);
    else mod.set(key, [a]);
    byModule.set(a.moduleId, mod);
  }
  return byModule;
}

/**
 * Tier counts across a FULL CATALOG rather than across whatever
 * happens to be in the log.
 *
 * This is the fix for the denominator gap documented on
 * `tierCountsFromAttempts` above. Every catalog row is tallied: one
 * with no engagements lands in `untouched`, so `total` is the catalog
 * size and stays put whether you have practised nothing or everything.
 *
 * The numerator is filtered to catalog membership by construction —
 * stats are looked up BY catalog ref, so an attempt against a ref the
 * catalog no longer holds contributes to nothing. That is what keeps a
 * percentage from exceeding 100% when stored practice outlives a
 * catalog entry, the way it did for the cut chord shapes.
 *
 * A row that merges several stored refs (Reading's conceptual
 * knowledge) is tiered on their engagements combined — one row, one
 * verdict, over everything it aggregates.
 */
export function tierCountsForCatalog(
  catalog: ModuleCatalog,
  attempts: ReadonlyArray<AttemptRecord>,
  now: number,
): TierCounts {
  const counts = emptyTierCounts();
  for (const stats of statsForAttemptCatalog(catalog, attempts)) {
    bumpTier(counts, tierFromItemStats(stats, now));
  }
  return counts;
}


// =====================================================================
// A TREE ROW'S TIER
// =====================================================================

/**
 * The tier a NODE reads as — a whole category, not one item.
 *
 * =====================================================================
 * AN APPROXIMATION, AND IT SAYS SO.
 *
 * `tierFromItemStats` above is exact: it has the real rolling window
 * for one item. A category has no such window — it has the MEAN of its
 * leaves' scores and a count of every engagement beneath it. So this
 * projects the mean back onto a window: the count stands in for
 * `windowTotal` and the mean decides how much of it was right.
 *
 * That is the same approximation `aggregation.ts` has made for the
 * dashboard's own tier counts since it shipped, and the same one
 * `registry.ts` makes from a flashcard's lifetime totals. Named here so
 * a third copy does not appear.
 *
 * WHAT IT GETS RIGHT is the thing the colour is for: the band. What it
 * cannot get right is `mastered`, which needs a full window of twenty
 * with nothing wrong — over a category that is a claim about every item
 * at once, and the mean cannot tell twenty perfect items from forty
 * items averaging perfect. It is reachable, and it means what it says.
 *
 * SELF-RATED SCORES ARE NOT PERCENTAGES. Shapes & Patterns and the
 * production lessons rate on a four-rung feel scale projected onto
 * 0–100, where 75 is "comfortable" rather than "three quarters right".
 * The thresholds still separate the rungs in the same order, so the
 * band is honest; what would not be honest is calling a self-rated
 * category `mastered`, which would mean twenty clean run-throughs
 * nobody counted. Self-rated tops out at `fluent`.
 * =====================================================================
 */
export function tierForNode(node: TreeNode, now: number): Tier {
  if (node.score === null || node.engagementCount === 0) return 'untouched';
  if (node.engagementCount < MIN_ATTEMPTS_FOR_TIER) return 'started';

  const windowTotal = Math.min(MASTERY_WINDOW, node.engagementCount);
  const windowCorrect = Math.round((node.score / 100) * windowTotal);
  const daysSince = node.recency.mostRecentAt === null
    ? null
    : Math.floor((now - node.recency.mostRecentAt) / DAY_MS);
  const tier = computeTier({ windowCorrect, windowTotal, daysSinceLastAttempt: daysSince });

  // See the header: a rating scale cannot earn a perfect measured
  // window, so it stops one rung below rather than claiming one.
  if (node.accuracyKind === 'self-rated' && tier === 'mastered') return 'fluent';
  return tier;
}
