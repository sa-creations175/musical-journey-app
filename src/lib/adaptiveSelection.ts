// Generic weighted picker for adaptive practice across any quiz module.
// Callers supply a per-item `baseWeight` (typically derived from the
// module's tier system via tier.ts#TIER_WEIGHT) plus an `inRecentHistory`
// flag. This file stays tier-agnostic so modules can plug in their own
// classification schemes.

export const RECENT_HISTORY_SIZE = 10;
export const ROLLING_WINDOW_SIZE = 20;
export const RECENT_HISTORY_MULTIPLIER = 1.3;

export interface AdaptiveCandidate<T> {
  item: T;
  baseWeight: number;
  inRecentHistory: boolean;
}

export function effectiveWeight<T>(c: AdaptiveCandidate<T>): number {
  return c.inRecentHistory ? c.baseWeight : c.baseWeight * RECENT_HISTORY_MULTIPLIER;
}

export function pickAdaptive<T>(candidates: AdaptiveCandidate<T>[], rng: () => number = Math.random): T {
  if (candidates.length === 0) {
    throw new Error('pickAdaptive: empty candidate pool');
  }
  const weights = candidates.map(effectiveWeight);
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0) {
    return candidates[Math.floor(rng() * candidates.length)].item;
  }
  let r = rng() * total;
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r <= 0) return candidates[i].item;
  }
  return candidates[candidates.length - 1].item;
}
