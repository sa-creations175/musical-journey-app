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
 * THE GRID NEVER SORTS. It renders `cards` in the order given, and the
 * adapter takes that order from the list that generated the content —
 * `CATEGORY_ORDER`, the reading skills, the sub-module list. An order
 * decided here would be a per-screen sort wearing derivation's clothes.
 */
import { useState } from 'react';
import CategoryCard from './CategoryCard';
import { moduleMetaById } from '../../lib/moduleMeta';
import type { CategoryCardModel } from './model';

/**
 * The narrowest a card may be before the grid drops a column.
 *
 * Declared here rather than at a call site because it is the ONE input
 * to how many columns appear — see the note in the render.
 */
export const CARD_MIN_WIDTH = '17rem';

/**
 * The column rule, derived from `CARD_MIN_WIDTH`.
 *
 * AN INLINE STYLE, NOT A TAILWIND CLASS, and deliberately: Tailwind
 * finds classes by scanning source text for complete strings, so an
 * interpolated `grid-cols-[...]` would compile to nothing and the grid
 * would silently fall back to one column. A style built from the
 * constant cannot drift from it.
 */
const CARD_COLUMNS = `repeat(auto-fill, minmax(${CARD_MIN_WIDTH}, 1fr))`;

/** One gap for every module home. */
const CARD_GAP = 'gap-3';

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
  now: number;
}

export default function CategoryCardGrid({
  cards, moduleId, onDrill, onProgressDetail, now,
}: CategoryCardGridProps) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const accentHex = moduleMetaById(moduleId)?.accentHex ?? NO_MODULE_ACCENT;

  return (
    /* =================================================================
       THE GRID OWNS THE SIZE. A PAGE CANNOT SET ITS OWN.

       Reading's cards came out smaller than ear training's and both
       differed from harmonic fluency's, because the size was never
       here: reading wrapped this in `max-w-2xl mx-auto px-4`, the other
       two let the shell's width through, and `sm:grid-cols-2` then cut
       whatever it was given into two. Three pages, three widths, one
       component that never knew.

       `CARD_MIN_WIDTH` is the one number, and the column COUNT falls
       out of it: `auto-fill` fits as many tracks of at least that width
       as the container allows. So a narrow shell gets one column and a
       wide one gets three, without a breakpoint guessing on behalf of a
       container it cannot measure — and every module home lands on the
       same card, because the card is what is specified.
       ================================================================= */
    <div
      className={`grid ${CARD_GAP}`}
      style={{ gridTemplateColumns: CARD_COLUMNS }}
      data-testid="category-card-grid"
    >
      {cards.map(card => (
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
    </div>
  );
}

/**
 * The tint for a module id `moduleMeta` does not know.
 *
 * A neutral grey rather than a guess at the module's colour: a wrong
 * accent looks deliberate and would ship, where an unmistakably
 * un-branded card is a visible "this module is not registered".
 */
export const NO_MODULE_ACCENT = '#6b7280';
