/**
 * Narrowing the pool below the category.
 *
 * =====================================================================
 * IT SITS UNDER THE CHIP ROW BECAUSE IT READS WHAT THE CHIP ROW SAYS.
 *
 * The chips choose which categories are in play; this chooses which of
 * their cards are. So the values it offers are the values those
 * categories actually hold — light one more category and a facet may
 * appear, put one out and a value may go. A control offering twelve
 * keys on a category that asks about three would be offering nine
 * presses that return nothing.
 *
 * =====================================================================
 * NOTHING IS OFFERED THAT CANNOT CHANGE THE SCREEN.
 *
 * A facet every card in the pool answers the same way is not a filter,
 * it is a label. Same call `AxisViewToggle` makes for an axis with one
 * ordering, and the same reason: a control that does nothing teaches a
 * reader that the controls do nothing.
 *
 * =====================================================================
 * ALL COPY HERE IS PLACEHOLDER. Every visible string is the facet's own
 * field name and its own values, printed as they are stored. That is
 * deliberately the least invented thing available — the labels are
 * Silas's to write, and they are listed in the report.
 * =====================================================================
 */
import type { Flashcard } from './catalog';
import type { FacetName } from './facets';
import {
  availableValues, offerableFacets, type FacetFilter,
} from './facetFilter';

export default function FacetFilterRow({
  cards, filter, onChange,
}: {
  /** The cards the chip row has put in play. */
  cards: readonly Flashcard[];
  filter: FacetFilter;
  onChange: (name: FacetName, values: readonly string[]) => void;
}) {
  const facets = offerableFacets(cards);
  if (facets.length === 0) return null;

  return (
    <div
      className="flex flex-col gap-1.5"
      data-testid="facet-filter-row"
    >
      {facets.map(name => {
        const values = availableValues(cards, name);
        const chosen = filter[name] ?? [];
        return (
          <div
            key={name}
            className="flex items-center gap-1.5 flex-wrap"
            data-testid="facet-filter"
            data-facet={name}
          >
            {/* PLACEHOLDER: the facet's own field name. */}
            <span className="text-[10px] uppercase tracking-wide text-neutral-400 shrink-0">
              {name}
            </span>
            {values.map(value => {
              const on = chosen.includes(value);
              return (
                <button
                  key={value}
                  type="button"
                  data-testid={`facet-value-${name}-${value}`}
                  data-on={on ? 'true' : 'false'}
                  aria-pressed={on}
                  onClick={() => onChange(
                    name,
                    on ? chosen.filter(v => v !== value) : [...chosen, value],
                  )}
                  className={`text-[11px] rounded border px-2 py-1 transition ${
                    on
                      ? 'border-fluent bg-fluent/10 text-fluent'
                      : 'border-neutral-300 text-neutral-600 hover:border-neutral-400 '
                        + 'dark:border-neutral-700 dark:text-neutral-300 dark:hover:border-neutral-500'
                  }`}
                >
                  {/* PLACEHOLDER: the stored value, printed as stored. */}
                  {value}
                </button>
              );
            })}
            {chosen.length > 0 && (
              <button
                type="button"
                data-testid={`facet-clear-${name}`}
                onClick={() => onChange(name, [])}
                className="text-[10px] text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300 underline px-1"
              >
                {/* PLACEHOLDER. */}
                clear
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
