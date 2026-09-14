/**
 * The grid of cards, and the expansion state that goes with it.
 *
 * Exists so three module homes do not each keep their own `useState`
 * for which card is open — the same reason `ModuleGroupedView` owns its
 * collapse map rather than asking every caller for one.
 *
 * CARDS EXPAND INDEPENDENTLY. An accordion that closes the previous
 * card would mean comparing two categories is impossible, and comparing
 * is most of what this screen is for.
 *
 * THE GRID NEVER DECIDES AN ORDER. It renders `cards` in the order
 * given, and the adapter takes that order from the list that generated
 * the content — `CATEGORY_ORDER`, the reading skills, the sub-module
 * list. An order decided here would be a per-screen sort wearing
 * derivation's clothes.
 *
 * WHAT THE READER ASKS FOR IS A DIFFERENT THING, and is why `sortable`
 * exists. Every ordering it offers is a rearrangement of the same
 * cards, the declared order is the default, and nothing moves until the
 * control is pressed. See `cardSort.ts` for the orders themselves and
 * for the ladder they read.
 */
import { useState } from 'react';
import CategoryCard from './CategoryCard';
import { CardGrid, NO_MODULE_ACCENT } from './cardShell';
import { moduleMetaById } from '../../lib/moduleMeta';
import {
  CARD_SORT_FIELD, CARD_SORT_LABEL, CARD_SORT_ORDERS,
  resolveCardSort, sortCards, type CardSortId,
} from './cardSort';
import { useAxisViews } from './useAxisViews';
import { groupCardTotal, groupedCards, type CardGroup } from './cardGroups';
import type { CategoryCardModel } from './model';

/**
 * Re-exported from `cardShell`, which owns them now that the song card
 * lays out through the same grid at the same width. Kept as exports
 * here so the callers that already import them are not made to know
 * which file the constant moved to.
 */
export { CARD_MIN_WIDTH, NO_MODULE_ACCENT } from './cardShell';

export interface CategoryCardGridProps {
  cards: readonly CategoryCardModel[];
  /**
   * The module whose accent tints these cards.
   *
   * THE ID, NOT THE HEX — deliberately. Taking a colour would let a
   * page pass its own literal, which is exactly what `Reading.tsx`
   * already does with its `SEPIA` copy and what this pattern must not
   * spread. Resolving here means one hue per module is enforced by the
   * type rather than by everyone remembering.
   */
  moduleId: string;
  /** Receives the card's `key`, never its index — a list that changes
   *  length between render and tap would drill the wrong category. */
  onDrill: (key: string) => void;
  /** Opens progress detail for a card. Omit where the module has none;
   *  the button then renders inert rather than wired to nothing. */
  onProgressDetail?: (key: string) => void;
  /**
   * Offer the reader the sort control.
   *
   * SET ON A MODULE HOME, not on a page that happens to draw cards.
   * `ShapesAndPatternsSection` draws exactly one — this section's — so
   * there is no order to choose; production's cards are two kinds in
   * one list, half of them carrying no standing to sort by, and it is
   * not one of the five named. Both render exactly what they rendered
   * before.
   */
  sortable?: boolean;
  /**
   * Draw the cards under headings.
   *
   * PASSED BY HARMONIC FLUENCY ONLY (14 Sep 2026, walked in
   * `hf-home-groups-prototype.html`). Omitted, the grid renders exactly
   * what it rendered before: one grid, no headings.
   *
   * THE HEADINGS ALWAYS STAY. A sort reorders the cards inside each group
   * and never across groups, and "In order" is each group's own `cardKeys`
   * order. A card no group names still renders, after the groups, rather
   * than silently vanishing from the page.
   */
  groups?: readonly CardGroup[];
  now: number;
}

/**
 * THE REMEMBERED ORDER IS READ ONLY WHERE IT IS OFFERED.
 *
 * A hook cannot be conditional, but a component can — so the control
 * and its stored choice live in a component of their own, and a page
 * that does not offer sorting reads no preference and touches no
 * database. Held in one of these two rather than asked of five pages:
 * the choice is the grid's, and plumbing it through every module home
 * is five chances to forget one.
 *
 * ONE OF THESE PER PAGE IS THE STANDING ASSUMPTION. Two would each hold
 * their own copy of the axis-view map and each write the whole of it,
 * so the later write would drop the other's key. No page renders two,
 * and none that renders one also calls `useAxisViews` itself — the two
 * that do (`HarmonicFluencyCategory`, `ReadingSkill`) are category
 * pages, not module homes.
 */
export default function CategoryCardGrid(props: CategoryCardGridProps) {
  return props.sortable === true ? <SortableCardGrid {...props} /> : <Cards {...props} />;
}

function SortableCardGrid(props: CategoryCardGridProps) {
  const { viewFor, setView, loaded } = useAxisViews();
  const accentHex = moduleMetaById(props.moduleId)?.accentHex ?? NO_MODULE_ACCENT;
  // Until the stored value has landed, the declared order — which is
  // also the default, so the common case never moves.
  const order: CardSortId = loaded ? resolveCardSort(viewFor(CARD_SORT_FIELD)) : 'declared';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end gap-1.5 flex-wrap">
        <span className="text-[11px] text-neutral-500 uppercase tracking-wide">
          {CARD_SORT_LABEL}:
        </span>
        {CARD_SORT_ORDERS.map(o => {
          const on = o.id === order;
          return (
            <button
              key={o.id}
              type="button"
              data-testid={`card-sort-${o.id}`}
              aria-pressed={on}
              onClick={() => setView(CARD_SORT_FIELD, o.id)}
              /* THE PRESSED TINT IS AN INLINE STYLE, not a class built
                 from the accent. Tailwind scans source as text, so a
                 token assembled from a constant is never the class it
                 looks like and paints nothing. Same reason
                 `AxisViewToggle` does it this way. */
              className={`px-2 py-1 rounded-md text-[11px] border ${
                on ? 'text-white border-transparent'
                  : 'border-neutral-200 dark:border-neutral-700 text-neutral-500'
              }`}
              style={on ? { backgroundColor: accentHex } : undefined}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {/* THE SAME COMPONENT INSTANCE ACROSS A REORDER, so which cards
          are open survives one. */}
      <Cards {...props} order={order} />
    </div>
  );
}

function Cards({
  cards, moduleId, onDrill, onProgressDetail, groups, now, order = 'declared',
}: CategoryCardGridProps & { order?: CardSortId }) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const accentHex = moduleMetaById(moduleId)?.accentHex ?? NO_MODULE_ACCENT;

  const grid = (list: readonly CategoryCardModel[]) => (
    /* THE GRID OWNS THE SIZE, and `cardShell` owns the grid — a page
       cannot set its own. Reading's cards came out smaller than ear
       training's and both differed from harmonic fluency's, because the
       size was never here: reading wrapped this in `max-w-2xl mx-auto
       px-4`, the other two let the shell's width through. Three pages,
       three widths, one component that never knew. */
    <CardGrid>
      {list.map(card => (
        <CategoryCard
          key={card.key}
          card={card}
          accentHex={accentHex}
          expanded={expanded.has(card.key)}
          onToggle={() => setExpanded(prev => {
            const next = new Set(prev);
            if (!next.delete(card.key)) next.add(card.key);
            return next;
          })}
          onDrill={() => onDrill(card.key)}
          {...(onProgressDetail !== undefined
            ? { onProgressDetail: () => onProgressDetail(card.key) }
            : {})}
          now={now}
        />
      ))}
    </CardGrid>
  );

  if (groups === undefined) return grid(sortCards(cards, order));

  return (
    <div>
      {groupedCards(cards, groups, order).map(({ group, cards: list }) => (
        <section
          key={group?.key ?? '__ungrouped'}
          data-testid="card-group"
          data-group-key={group?.key}
        >
          {group !== null && (
            /* Title, then the group's card total in mono, a hairline
               under. The total is the sum of the cards' own counts, which
               the adapter derives from the catalog. */
            <div
              className="flex items-baseline gap-2.5 mt-5 mb-2 pb-1.5 border-b border-neutral-200 dark:border-neutral-700"
              data-testid="card-group-heading"
            >
              <h3 className="text-[15px] font-semibold">{group.title}</h3>
              <span
                className="font-mono text-xs text-neutral-500"
                data-testid="card-group-count"
              >
                {groupCardTotal(list).toLocaleString('en-US')} cards
              </span>
            </div>
          )}
          {grid(list)}
        </section>
      ))}
    </div>
  );
}
