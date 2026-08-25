/**
 * The filter strip: facet chips, and how many items they resolve to.
 *
 * =====================================================================
 * THE COUNT IS NOT DECORATION.
 *
 * Cross-facet combinations get small fast — dissonant AND far is two
 * intervals — and nothing else on screen tells the reader that before
 * they drill it. So the number is rendered from the SAME resolution the
 * caller applies, not from a count maintained beside it: this component
 * and its caller both call `resolveFacets` with the same inputs, so
 * they cannot disagree.
 *
 * A SMALL COUNT IS NOT BLOCKED, disabled, greyed or warned about. Two
 * items is a legitimate thing to drill and the reader can see that it
 * is two.
 *
 * ZERO IS SAID, NOT SHOWN AS "0". A selection resolving to nothing is
 * not applied — the caller keeps the pool it had — so a bare 0 beside a
 * drill still serving thirteen intervals would be a lie about what is
 * happening.
 * =====================================================================
 */
import {
  resolveFacets, type Facet, type FacetSelection,
} from '../lib/facetSelection';

export interface FilterStripProps {
  facets: readonly Facet[];
  selection: FacetSelection;
  onToggle: (facetId: string, valueId: string) => void;
  /** The module's accent, from `moduleMeta`. */
  accentHex: string;
  /** How many items the drill holds when nothing is selected. */
  poolSize: number;
  /**
   * How many items are ACTUALLY being served right now.
   *
   * Differs from `poolSize` exactly when a narrowing is already in
   * force — and that is the only case the zero-state message reads it.
   * Saying "keeping your previous pool of 25" while the drill is
   * serving thirteen ascending intervals would be a specific false
   * claim, where the vaguer wording it replaced merely said nothing.
   *
   * Defaults to `poolSize`, which is correct for a drill that has not
   * narrowed anything yet.
   */
  servingSize?: number;
}

export default function FilterStrip({
  facets, selection, onToggle, accentHex, poolSize, servingSize,
}: FilterStripProps) {
  const serving = servingSize ?? poolSize;
  const resolution = resolveFacets(facets, selection);
  const empty = resolution.narrowed && resolution.keys.length === 0;

  return (
    <div
      className="rounded-lg border border-black/[0.07] px-3 py-2 space-y-1.5"
      data-testid="filter-strip"
    >
      {facets.map(facet => {
        const chosen = new Set(selection[facet.id] ?? []);
        return (
          <div key={facet.id} className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] uppercase tracking-wide text-neutral-500 w-20 shrink-0">
              {facet.label}
            </span>
            {facet.values.map(value => {
              const on = chosen.has(value.id);
              return (
                <button
                  key={value.id}
                  type="button"
                  aria-pressed={on}
                  data-testid="facet-chip"
                  data-facet={facet.id}
                  data-value={value.id}
                  onClick={() => onToggle(facet.id, value.id)}
                  className={`px-2 py-0.5 rounded-md text-[11px] border transition ${
                    on
                      ? 'text-white border-transparent'
                      : 'border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:border-neutral-400'
                  }`}
                  style={on ? { backgroundColor: accentHex } : undefined}
                >
                  {value.label}
                </button>
              );
            })}
          </div>
        );
      })}

      <div className="text-[11px] text-neutral-500 tabular-nums" data-testid="filter-count">
        {empty ? (
          // Said, not shown as a number, and paired with what is still
          // being served so the screen never contradicts itself.
          <span data-testid="filter-count-empty">
            No items match — keeping your previous pool of {serving}
          </span>
        ) : resolution.narrowed ? (
          <>{resolution.keys.length} of {poolSize}</>
        ) : (
          <>{poolSize} in pool</>
        )}
      </div>
    </div>
  );
}
