/**
 * Harmonic fluency's adapter: fifteen categories → fifteen cards.
 *
 * ORDER COMES FROM `CATEGORY_ORDER`, which is the list that generates
 * the content. Nothing here sorts.
 *
 * COUNTS COME FROM THE CATALOG WALK, not from a written number. A
 * hand-maintained fifteen-entry table would be wrong the first time a
 * generator added a card, and silently.
 */
import type { AttemptRecord } from '../../lib/db';
import { categoryCardStats, type CategoryCardModel } from '../../components/moduleHome/model';
import {
  CATEGORY_LABELS, CATEGORY_ORDER, FLASHCARDS, type FlashcardCategory,
} from './catalog';

export const HF_MODULE_ID = 'harmonic-fluency';

/** Card ids for this module ARE the category ids, so a card's key can
 *  be handed straight to `?category=` without a lookup table. */
export function isHarmonicFluencyCardKey(key: string): key is FlashcardCategory {
  return (CATEGORY_ORDER as readonly string[]).includes(key);
}

export function harmonicFluencyCards(
  attempts: readonly AttemptRecord[],
  intervals: ReadonlyMap<string, number>,
  now: number,
): CategoryCardModel[] {
  const idsByCategory = new Map<FlashcardCategory, Set<string>>();
  for (const card of FLASHCARDS) {
    const set = idsByCategory.get(card.category) ?? new Set<string>();
    set.add(card.id);
    idsByCategory.set(card.category, set);
  }

  const mine = attempts.filter(a => a.moduleId === HF_MODULE_ID);

  return CATEGORY_ORDER.map(category => {
    const ids = idsByCategory.get(category) ?? new Set<string>();
    return {
      key: category,
      label: CATEGORY_LABELS[category],
      itemCount: ids.size,
      // The one line lands when the copy exists — see the report on
      // where descriptions should live. Null renders nothing.
      description: null,
      ...categoryCardStats(mine.filter(a => ids.has(a.itemId)), intervals, now),
    };
  });
}
