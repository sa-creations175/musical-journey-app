/**
 * Resolving a facet selection to a set of item keys.
 *
 * =====================================================================
 * OR WITHIN A FACET, AND WITHIN A FACET ONLY.
 *
 * "Dissonant or imperfect, and far" is one thought, and it is two
 * different operations: the values inside one facet widen the set, and
 * each facet narrows it. Getting that backwards — OR-ing across facets
 * — turns every added tap into a bigger pool, which reads as the
 * control doing nothing.
 *
 * A FACET WITH NOTHING SELECTED DOES NOT CONSTRAIN. It is not an empty
 * set intersected with the rest, which would resolve everything to
 * nothing the moment a facet went untouched. "No opinion" and "none of
 * these" are different answers and only one of them is expressible by
 * tapping.
 * =====================================================================
 *
 * The keys come from the CALLER, computed off its own catalog. This
 * file never learns what an interval or a chord is; it intersects sets
 * of strings. That is what lets a second drill adopt it by supplying
 * different facets rather than by extending anything here.
 */

export interface FacetValue {
  id: string;
  label: string;
  /** The item keys this value selects, derived from the drill's own
   *  catalog. Never a hand-maintained list of combinations. */
  keys: readonly string[];
}

export interface Facet {
  id: string;
  label: string;
  values: readonly FacetValue[];
}

/** facet id → the value ids currently selected in it. */
export type FacetSelection = Readonly<Record<string, readonly string[]>>;

export const NO_SELECTION: FacetSelection = {};

/**
 * Every value of every facet, selected.
 *
 * =====================================================================
 * THE FULL POOL SHOULD LOOK FULL.
 *
 * Nothing selected resolves to everything, which is correct and reads
 * as empty. A reader arriving at a strip with no chip lit cannot tell
 * "you have all thirteen" from "you have none of them", and the number
 * beside it is doing all the work.
 *
 * THIS IS A UI STATE, NOT A CONTRACT CHANGE. `resolveFacets` is
 * untouched: everything selected already resolves to everything,
 * because each facet's union is its whole pool and intersecting whole
 * pools gives the whole pool. "Nothing selected does not constrain"
 * stays true as a rule — it is simply no longer the state a drill
 * starts in.
 * =====================================================================
 */
export function allSelected(facets: readonly Facet[]): FacetSelection {
  const out: Record<string, readonly string[]> = {};
  for (const facet of facets) {
    if (facet.values.length === 0) continue;
    out[facet.id] = facet.values.map(v => v.id);
  }
  return out;
}

export interface Resolution {
  /**
   * The keys the selection resolves to, in a deterministic order.
   *
   * EMPTY MEANS EMPTY, and only when `narrowed` is true. An unnarrowed
   * resolution also carries no keys, which is why the two fields have
   * to be read together — see `appliedKeys`.
   */
  keys: readonly string[];
  /** True when at least one facet constrains the pool. */
  narrowed: boolean;
}

/**
 * Which values of `facetId` are selected, ignoring ids the facet does
 * not offer.
 *
 * Filtered rather than trusted: a stale selection surviving a catalog
 * change would otherwise intersect against keys nothing can serve, and
 * the pool would go quietly empty with every chip looking untouched.
 */
function selectedValues(facet: Facet, selection: FacetSelection): FacetValue[] {
  const ids = new Set(selection[facet.id] ?? []);
  return facet.values.filter(v => ids.has(v.id));
}

export function resolveFacets(
  facets: readonly Facet[],
  selection: FacetSelection,
): Resolution {
  let acc: string[] | null = null;
  let narrowed = false;

  for (const facet of facets) {
    const chosen = selectedValues(facet, selection);
    if (chosen.length === 0) continue;
    narrowed = true;

    // OR inside the facet. Deduped, because two values of one facet can
    // legitimately name the same item.
    const union = new Set<string>();
    const order: string[] = [];
    for (const value of chosen) {
      for (const key of value.keys) {
        if (union.has(key)) continue;
        union.add(key);
        order.push(key);
      }
    }

    // AND across facets. The first constraining facet fixes the order,
    // so the result is deterministic without sorting — sorting would
    // impose an order the caller never asked for.
    acc = acc === null ? order : acc.filter(k => union.has(k));
  }

  return { keys: acc ?? [], narrowed };
}

/**
 * The keys to actually serve, or `null` for "do not narrow".
 *
 * =====================================================================
 * A SELECTION THAT RESOLVES TO NOTHING IS NOT APPLIED.
 *
 * Cross-facet combinations get small fast, and some are genuinely
 * empty. Applying an empty set would leave the drill with nothing to
 * serve — a blank question, or a crash, depending on the drill. The
 * caller keeps whatever pool it had and the strip says the selection
 * resolves to nothing, which is the only honest thing on screen.
 *
 * `null` is returned for BOTH the unnarrowed and the empty case, and
 * they are not the same instruction: unnarrowed means "serve
 * everything", empty means "keep serving what you were". The caller
 * tells them apart by `narrowed`, which is why this returns the keys
 * and not a boolean.
 * =====================================================================
 */
export function appliedKeys(resolution: Resolution): readonly string[] | null {
  if (!resolution.narrowed) return null;
  if (resolution.keys.length === 0) return null;
  return resolution.keys;
}

/** Tapping a value selects it, or deselects it if it was selected. */
export function toggleFacetValue(
  selection: FacetSelection,
  facetId: string,
  valueId: string,
): FacetSelection {
  const current = selection[facetId] ?? [];
  const next = current.includes(valueId)
    ? current.filter(v => v !== valueId)
    : [...current, valueId];
  const out: Record<string, readonly string[]> = { ...selection };
  // A facet with no selections is REMOVED rather than left as an empty
  // array, so "untouched" and "everything deselected again" are the
  // same state — which is what tapping a lone chip twice should give.
  if (next.length === 0) delete out[facetId];
  else out[facetId] = next;
  return out;
}
