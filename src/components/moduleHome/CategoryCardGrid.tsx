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
  drillLabel?: string;
  now: number;
}

export default function CategoryCardGrid({
  cards, moduleId, onDrill, drillLabel, now,
}: CategoryCardGridProps) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const accentHex = moduleMetaById(moduleId)?.accentHex ?? NO_MODULE_ACCENT;

  return (
    <div className="grid gap-2 sm:grid-cols-2" data-testid="category-card-grid">
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
          {...(drillLabel !== undefined ? { drillLabel } : {})}
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
