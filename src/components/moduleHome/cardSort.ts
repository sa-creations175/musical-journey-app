/**
 * What order the cards on a module home are in, and where each order
 * comes from.
 *
 * =====================================================================
 * A SORT IS DISPLAY ONLY, AND THAT IS WHAT MAKES IT ALLOWED HERE.
 *
 * `CategoryCardGrid`'s standing rule is that the grid never sorts: it
 * renders `cards` in the order the adapter gave it, and that order
 * comes from a list that already exists — `CATEGORY_ORDER`, the reading
 * skills, the sub-module list. The rule exists because a per-screen
 * sort dressed as derivation changes silently when a generator is
 * reordered.
 *
 * This does not breach it. The declared order is still the default and
 * still the answer when nothing is pressed; what is added is a control
 * the READER holds, whose every ordering is a rearrangement of the same
 * cards. Nothing appears, nothing disappears — the same property that
 * lets an axis view be a toggle rather than a filter.
 *
 * =====================================================================
 * THE LADDER IS READ, NOT RESTATED.
 *
 * `TIER_ORDER` in `lib/tier.ts` is the app's one statement of what the
 * rungs are and which way they run. Sorting by status reads it. A local
 * rank table here — the shape the roll-up bug took, two Lowests wearing
 * different names — would be a second idea of the ladder that agrees
 * until the day one of them moves.
 *
 * =====================================================================
 * THE CARDS THAT CARRY NO RUNG.
 *
 * Shapes & Patterns records a duration and a self-rating, never
 * right/wrong, so its cards have no tier and show none: what stands in
 * its place on the card is **Fluent+ of the section's targets**. That
 * fraction is the section's own standing and it is what "by status"
 * ranks those cards by. It is NOT mapped onto the ladder — a
 * proportion is not a rung, and pretending it is would be the second
 * idea this file exists to avoid.
 *
 * The two kinds never mix on one module home: harmonic fluency, ear
 * training and reading are tiered throughout, Shapes & Patterns is not.
 * Production is the one page whose cards are mixed — half declared
 * lessons, one vocabulary card with real attempts — and it is not
 * offered this control.
 *
 * =====================================================================
 * BOTH ORDERS PUT WHAT NEEDS ATTENTION FIRST.
 *
 * The lowest rung leads, and the longest since practised leads, so the
 * two controls answer the same question from two directions rather than
 * one meaning "best first" and the other "worst first". A card never
 * practised at all leads the second order: never is longer ago than any
 * number of days.
 *
 * TIES KEEP THE DECLARED ORDER, because the sort is stable and the list
 * arrives in it. Four cards all at Not Started do not shuffle.
 * =====================================================================
 */
import { TIER_ORDER } from '../../lib/tier';
import type { CategoryCardModel } from './model';

export type CardSortId = 'declared' | 'status' | 'last-practiced';

/**
 * The field this choice is remembered under.
 *
 * IT RIDES `useAxisViews`, the store the axis toggles and the grid
 * orientation already ride — one remembered-display-choice mechanism,
 * loaded once, with no second stored shape to keep in step. The name
 * cannot collide with an axis field, which is a `SkillRecord` key, nor
 * with the `grid-orientation:` / `grid-layout:` prefixes.
 *
 * ONE KEY FOR EVERY MODULE HOME, not one per module. Which way up a
 * grid reads is a fact about that grid's shape and is keyed per
 * category; how you like a page of cards ordered is a fact about how
 * you read cards, and the cards are the same object on all of them —
 * so it is answered once, like "show me keys in fourths".
 */
export const CARD_SORT_FIELD = 'card-sort';

/**
 * UNAPPROVED COPY, all four strings. Drafted for this build and never
 * ruled on — listed in the report so Silas can rule. No approved words
 * for a module-home sort exist in `docs/WHOLE_SONG_TEST_COPY.md` or
 * `docs/TEMPO_SOURCE_SPEC.md` §10.
 */
export const CARD_SORT_LABEL = 'Sort';

export const CARD_SORT_ORDERS: ReadonlyArray<{ id: CardSortId; label: string }> = [
  // The declared order leads, and is the default: nothing moves for a
  // reader who never touches the control.
  { id: 'declared',       label: 'In order' },
  { id: 'status',         label: 'By status' },
  { id: 'last-practiced', label: 'By last practiced' },
];

/**
 * The order to draw, given what was remembered.
 *
 * The stored value is only ever a HINT — the same rule `resolveView`
 * follows. A remembered id that no longer exists falls back to the
 * declared order rather than leaving the page unable to render.
 */
export function resolveCardSort(viewId: string | null): CardSortId {
  return CARD_SORT_ORDERS.some(o => o.id === viewId)
    ? (viewId as CardSortId)
    : 'declared';
}

/**
 * How far along a card stands, for a card that shows a tier.
 *
 * `TIER_ORDER` is best first and this order is worst first, so the rank
 * is its index counted from the other end. Read from the list rather
 * than reversed by hand, so a tier inserted into the ladder lands here
 * with it.
 */
function tierRank(tier: (typeof TIER_ORDER)[number]): number {
  return TIER_ORDER.length - 1 - TIER_ORDER.indexOf(tier);
}

/** The Fluent+ share a card without a tier shows in place of one.
 *  Zero where there is nothing to divide — a card with no targets has
 *  had nothing done to it. */
function fluentPlusShare(card: CategoryCardModel): number {
  if (card.fluentPlus === undefined || card.itemCount <= 0) return 0;
  return card.fluentPlus / card.itemCount;
}

function byStatus(a: CategoryCardModel, b: CategoryCardModel): number {
  if (a.accuracy !== null && b.accuracy !== null) {
    return tierRank(a.accuracy.tier) - tierRank(b.accuracy.tier);
  }
  if (a.accuracy === null && b.accuracy === null) {
    return fluentPlusShare(a) - fluentPlusShare(b);
  }
  // MIXED, which no module home offering this control has. Ranked
  // rather than left to chance so the order is at least stable, and
  // deliberately not by mapping one onto the other.
  return a.accuracy !== null ? -1 : 1;
}

/** Longest ago first. Never practised is longer ago than any number of
 *  days, so it leads. */
function byLastPracticed(a: CategoryCardModel, b: CategoryCardModel): number {
  const ra = a.lastPracticedDaysAgo ?? Number.POSITIVE_INFINITY;
  const rb = b.lastPracticedDaysAgo ?? Number.POSITIVE_INFINITY;
  return rb - ra;
}

/**
 * The cards, in the order asked for.
 *
 * Returns the list untouched for the declared order — not a copy in the
 * same order, the list itself, so nothing about the default path
 * depends on this function having been called.
 */
export function sortCards(
  cards: readonly CategoryCardModel[],
  order: CardSortId,
): readonly CategoryCardModel[] {
  if (order === 'declared') return cards;
  const compare = order === 'status' ? byStatus : byLastPracticed;
  // `sort` is stable, so cards that compare equal stay in the order
  // the adapter handed over.
  return [...cards].sort(compare);
}
