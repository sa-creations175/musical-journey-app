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
import { CardGrid, NO_MODULE_ACCENT } from './cardShell';
import { moduleMetaById } from '../../lib/moduleMeta';
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
  now: number;
}

export default function CategoryCardGrid({
  cards, moduleId, onDrill, onProgressDetail, now,
}: CategoryCardGridProps) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const accentHex = moduleMetaById(moduleId)?.accentHex ?? NO_MODULE_ACCENT;

  return (
    /* THE GRID OWNS THE SIZE, and `cardShell` owns the grid — a page
       cannot set its own. Reading's cards came out smaller than ear
       training's and both differed from harmonic fluency's, because the
       size was never here: reading wrapped this in `max-w-2xl mx-auto
       px-4`, the other two let the shell's width through. Three pages,
       three widths, one component that never knew. */
    <CardGrid>
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
    </CardGrid>
  );
}
