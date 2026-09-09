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
 * FOLDED UNTIL ASKED FOR (ruling 28).
 *
 * Ten rows of chips above a Start button is a page that opens on its
 * own settings. It opens folded, and the toggle carries the count when
 * something is active — so a deck that has quietly become eleven cards
 * says why on the control that made it so, rather than leaving the
 * reader to open a panel to find out whether anything is on.
 *
 * ONE RESET FOR THE WHOLE ROW, not one per facet. Clearing "the ♭6 in
 * E♭ and A♭" used to be three presses in three places; the reader's
 * intention was one thing and now the control is.
 *
 * =====================================================================
 * THE WORDS ARE RULED AND THEY LIVE IN `facetDisplay`.
 *
 * Row labels, the Distance phrases and the Progression chips are
 * rulings 24, 26 and 27, written down in `docs/HARMONIC_FLUENCY_COPY.md`
 * and read from there by a test. Nothing here invents one.
 *
 * WHAT IS NOT WORDING IS THE SPELLING. A value goes through
 * `facetDisplay` on the way to the eye, so `Ab` reads A♭ and `b6` reads
 * ♭6 the way they do everywhere else in the app. The stored value is
 * unchanged, and it is still what the URL carries and what a card is
 * matched against.
 * =====================================================================
 */
import { useState } from 'react';
import type { Flashcard } from './catalog';
import type { FacetName } from './facets';
import {
  availableValues, offerableFacets, type FacetFilter,
} from './facetFilter';
import { facetRowLabel, facetValueLabel } from './facetDisplay';

/** Approved copy — `docs/HARMONIC_FLUENCY_COPY.md`, 8 Sep 2026. */
export const FILTERS_LABEL = 'Filters';
export const CLEAR_FILTERS_LABEL = 'Clear Filters';

/**
 * How many filters are on.
 *
 * COUNTED IN FACETS, NOT IN CHIPS. "Filters · 2" means two of the rows
 * are saying something; asking for E♭ and A♭ on one row is one
 * narrowing with two alternatives in it, and calling that two would
 * make the number disagree with the reader's own account of what they
 * did.
 */
export function activeFacetCount(filter: FacetFilter): number {
  return Object.values(filter).filter(v => v !== undefined && v.length > 0).length;
}

export default function FacetFilterRow({
  cards, filter, onChange, onClearAll,
}: {
  /** The cards the chip row has put in play. */
  cards: readonly Flashcard[];
  filter: FacetFilter;
  onChange: (name: FacetName, values: readonly string[]) => void;
  /** Empties every facet at once. */
  onClearAll: () => void;
}) {
  const facets = offerableFacets(cards);
  const [open, setOpen] = useState(false);
  const active = activeFacetCount(filter);

  if (facets.length === 0) return null;

  return (
    <div className="flex flex-col gap-2" data-testid="facet-filter-row">
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          data-testid="facet-filter-toggle"
          aria-expanded={open}
          onClick={() => setOpen(o => !o)}
          className="inline-flex items-center gap-1.5 text-[11px] font-medium text-neutral-500 hover:text-fluent"
        >
          <span aria-hidden className="text-[9px] leading-none">
            {open ? '▼' : '▶'}
          </span>
          {/* THE COUNT ONLY WHEN IT IS FOLDED. Open, the lit chips are
              on screen saying the same thing, and a number beside them
              would be the same fact twice. */}
          {!open && active > 0 ? `${FILTERS_LABEL} · ${active}` : FILTERS_LABEL}
        </button>
      </div>

      {open && (
        <div className="flex flex-col gap-1.5">
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
                <span className="text-[10px] uppercase tracking-wide text-neutral-400 shrink-0">
                  {facetRowLabel(name)}
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
                      {/* The value is still the stored one — `data-testid`
                          above carries it unchanged and it is what
                          `onChange` sends — and only its spelling
                          reaches the eye. See `facetDisplay`. */}
                      {facetValueLabel(name, value)}
                    </button>
                  );
                })}
              </div>
            );
          })}

          {active > 0 && (
            <div>
              <button
                type="button"
                data-testid="facet-clear-all"
                onClick={onClearAll}
                className="text-[10px] text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300 underline"
              >
                {CLEAR_FILTERS_LABEL}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
