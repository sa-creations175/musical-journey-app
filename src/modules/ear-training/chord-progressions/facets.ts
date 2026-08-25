/**
 * Chord progressions' tier facet.
 *
 * Eight curriculum tiers, genre-grouped, straight off the catalog. The
 * keys are progression ids, which is the vocabulary this drill's pool
 * and its focus panel already use.
 *
 * A tier the catalog does not populate is not offered — an empty chip
 * invites a tap that resolves to nothing.
 */
import type { Facet } from '../../../lib/facetSelection';
import { PROGRESSIONS, TIER_NAMES } from './catalog';

/** Tiers present in the catalog, in ascending order. */
export function catalogTiers(): number[] {
  return [...new Set(PROGRESSIONS.map(p => p.tier))].sort((a, b) => a - b);
}

export function chordProgressionFacets(): Facet[] {
  return [{
    id: 'tier',
    label: 'tier',
    values: catalogTiers().map(tier => ({
      id: String(tier),
      label: TIER_NAMES[tier] ?? `Tier ${tier}`,
      keys: PROGRESSIONS.filter(p => p.tier === tier).map(p => p.id),
    })),
  }];
}

/**
 * Carry a stored single-tier preference into the multi-select shape.
 *
 * =====================================================================
 * A STORED VALUE IS NEVER SILENTLY DROPPED.
 *
 * `PREF_TIER` held one tier or the string 'all'. Both are meaningful and
 * both survive:
 *
 *   'all'          → every chip lit, which is what the strip's default
 *                    is anyway and what 'all' always meant.
 *   a valid tier   → that one chip lit. The reader picked it; opening on
 *                    something wider would quietly widen their pool.
 *   anything else  → treated as unset, so the lit-everything default
 *                    applies. A tier that no longer exists in the
 *                    catalog would otherwise select nothing and leave
 *                    the reader looking at an empty strip wondering
 *                    what they did.
 *
 * Returns `null` for "no usable stored value", so the caller can tell
 * that from a stored 'all' — they happen to produce the same selection
 * today, and a caller that conflated them would have no way to notice
 * if that stopped being true.
 * =====================================================================
 */
export function selectionFromStoredTier(
  stored: unknown,
  facets: readonly Facet[],
): Record<string, readonly string[]> | null {
  const tierFacet = facets.find(f => f.id === 'tier');
  if (!tierFacet) return null;
  if (stored === 'all') return { tier: tierFacet.values.map(v => v.id) };
  const asId = typeof stored === 'number' ? String(stored)
    : typeof stored === 'string' ? stored : null;
  if (asId === null) return null;
  return tierFacet.values.some(v => v.id === asId) ? { tier: [asId] } : null;
}
