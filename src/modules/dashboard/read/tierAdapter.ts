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
import { computeTier, type Tier } from '../../../lib/tier';
import { catalogRollupKey } from './canonicalItemId';
import type { ModuleCatalog } from './catalogs';
import {
  emptyItemStats,
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
  untouched: number;
  total: number;
}

export function emptyTierCounts(): TierCounts {
  return {
    mastered: 0, fluent: 0, developing: 0,
    needsWork: 0, stale: 0, untouched: 0, total: 0,
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
  for (const stats of itemStatsForCatalog(catalog, attempts)) {
    bumpTier(counts, tierFromItemStats(stats, now));
  }
  return counts;
}

/**
 * Stats for every row in a catalog, in catalog order. Rows with no
 * engagements come back as `emptyItemStats` rather than being omitted —
 * an uncovered item is part of the denominator, which is the whole
 * point of walking the catalog instead of the log.
 */
export function itemStatsForCatalog(
  catalog: ModuleCatalog,
  attempts: ReadonlyArray<AttemptRecord>,
): ItemStats[] {
  const byRef = new Map<string, Engagement[]>();
  for (const e of engagementsFromAttempts(attempts)) {
    const bucket = byRef.get(e.itemRef);
    if (bucket) bucket.push(e);
    else byRef.set(e.itemRef, [e]);
  }
  const options = {
    accuracyKind: catalog.accuracyKind,
    ...(catalog.coverageRule ? { coverageRule: catalog.coverageRule } : {}),
  };
  return catalog.items.map(item => {
    const engagements = item.itemRefs.flatMap(ref => byRef.get(ref) ?? []);
    return engagements.length === 0
      ? emptyItemStats(item.id, options)
      : itemStatsFromEngagements(item.id, engagements, options);
  });
}
