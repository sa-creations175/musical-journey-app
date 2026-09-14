/**
 * Cards under headings, for a module home that has groups.
 *
 * Harmonic Fluency's home only, since 14 Sep 2026 (walked in
 * `hf-home-groups-prototype.html`). The other homes pass no groups and
 * draw one grid, as before.
 *
 * THE HEADINGS ALWAYS STAY. A sort reorders the cards inside each group
 * and never across groups, and "In order" is each group's own order.
 */
import { sortCards, type CardSortId } from './cardSort';
import type { CategoryCardModel } from './model';

export interface CardGroup {
  key: string;
  title: string;
  /** The card keys in this group, in the group's declared order. */
  cardKeys: readonly string[];
}

export interface CardSection {
  /** `null` for cards no group names — drawn after the groups, without a
   *  heading, rather than silently dropped from the page. */
  group: CardGroup | null;
  cards: readonly CategoryCardModel[];
}

/**
 * Each group's cards, in the group's declared order, then sorted.
 * `sortCards` is stable, so "In order" is the group's own order and a
 * sort never moves a card out of its group.
 */
export function groupedCards(
  cards: readonly CategoryCardModel[],
  groups: readonly CardGroup[],
  order: CardSortId,
): CardSection[] {
  const byKey = new Map(cards.map(c => [c.key, c]));
  const named = new Set(groups.flatMap(g => g.cardKeys));
  const sections: CardSection[] = groups.map(group => ({
    group,
    cards: sortCards(group.cardKeys.flatMap(k => byKey.get(k) ?? []), order),
  }));
  const rest = cards.filter(c => !named.has(c.key));
  if (rest.length > 0) sections.push({ group: null, cards: sortCards(rest, order) });
  return sections;
}

/** A group's card total: the sum of its cards' own counts, which each
 *  module's adapter derives from its catalog. */
export function groupCardTotal(cards: readonly CategoryCardModel[]): number {
  return cards.reduce((n, c) => n + c.itemCount, 0);
}
