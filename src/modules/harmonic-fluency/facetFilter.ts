/**
 * Scoping practice below the level of a category.
 *
 * =====================================================================
 * THE FINEST CONTROL WAS THE WHOLE CATEGORY.
 *
 * You could light any set of the fifteen and drill them. You could not
 * say "just the tritones", "just in E♭", or "just the diatonic ones" —
 * and the tritone case is the one that showed why: the deck holds
 * tritone cards in five categories and there was no way to gather them,
 * because nothing said which cards were about a tritone.
 *
 * Now something does. A filter is a facet and a set of values, read out
 * of the URL, applied on top of whatever the chip row already lit.
 *
 * =====================================================================
 * IT NARROWS; IT NEVER WIDENS.
 *
 * The chip row decides which categories are in play and this decides
 * which of their cards are. A card with no facets at all is therefore
 * excluded by any filter — not because it failed a test, but because it
 * never made the claim the filter is asking about. That is the honest
 * reading: a prose card about how a chord feels is not "a tritone card
 * we could not prove", it is not a tritone card.
 *
 * =====================================================================
 * ONE FACET, ONE SET, AND SEVERAL FACETS AT ONCE.
 *
 * Within a facet the values are alternatives — "in E♭ or in A♭".
 * Between facets they narrow — "in E♭ AND a ♭6". That is the reading
 * every filter row in this app already has, and it is the one a reader
 * expects from two controls that are visibly separate.
 *
 * NO STORED SHAPE. The whole filter lives in the query string, exactly
 * as `?also=` does. Nothing is written to a row, so nothing has to be
 * migrated and a stale link is just a link.
 * =====================================================================
 */
import type { Flashcard } from './catalog';
import { FACET_VALUES, type FacetName } from './facets';

/** A facet, and the values a card may have for it to pass. */
export type FacetFilter = Readonly<Partial<Record<FacetName, readonly string[]>>>;

/**
 * The query-string prefix a facet's values arrive under.
 *
 * ONE PARAMETER PER FACET — `?f.key=Eb,Ab&f.degree=b6` — rather than
 * one parameter holding an encoded structure. Two reasons: a sharp is a
 * fragment marker, so anything hand-rolled has to escape it and one day
 * will not; and a reader looking at the address bar can see what is
 * filtered without decoding anything.
 */
export const FACET_PARAM_PREFIX = 'f.';

/** Whether a facet name is one the deck actually declares. */
export function isFacetName(value: string): value is FacetName {
  return Object.prototype.hasOwnProperty.call(FACET_VALUES, value);
}

/**
 * Read the filter out of a query string.
 *
 * ANYTHING UNRECOGNISED IS DROPPED, not treated as an empty filter. A
 * link carrying a facet this build no longer has should narrow by the
 * facets it still understands rather than silently drilling everything
 * — and an empty value list is the same as not asking, so it goes too.
 */
export function readFacetFilter(params: URLSearchParams): FacetFilter {
  const out: Record<string, string[]> = {};
  for (const [rawKey, rawValue] of params.entries()) {
    if (!rawKey.startsWith(FACET_PARAM_PREFIX)) continue;
    const name = rawKey.slice(FACET_PARAM_PREFIX.length);
    if (!isFacetName(name)) continue;
    const values = rawValue.split(',').map(v => v.trim()).filter(v => v !== '');
    if (values.length > 0) out[name] = values;
  }
  return out as FacetFilter;
}

/**
 * Write one facet's values into a query string, leaving every other
 * parameter alone.
 *
 * An empty set REMOVES the parameter rather than writing an empty one,
 * so "filtered by nothing" and "not filtered" are the same URL. Two
 * spellings of one state is how a back button starts surprising people.
 */
export function withFacetValues(
  params: URLSearchParams,
  name: FacetName,
  values: readonly string[],
): URLSearchParams {
  const next = new URLSearchParams(params);
  const key = `${FACET_PARAM_PREFIX}${name}`;
  if (values.length === 0) next.delete(key);
  else next.set(key, values.join(','));
  return next;
}

/** Whether anything is being filtered at all. */
export function isFiltering(filter: FacetFilter): boolean {
  return Object.values(filter).some(v => v !== undefined && v.length > 0);
}

/**
 * Whether one card survives the filter.
 *
 * A card with NO facets fails any active filter — see the header. With
 * no filter active every card passes, which is what makes this safe to
 * apply unconditionally.
 */
export function cardMatchesFacets(card: Flashcard, filter: FacetFilter): boolean {
  const entries = Object.entries(filter) as Array<[FacetName, readonly string[]]>;
  const active = entries.filter(([, values]) => values.length > 0);
  if (active.length === 0) return true;
  const facets = card.facets;
  if (facets === undefined) return false;
  return active.every(([name, values]) => {
    const value = facets[name];
    return value !== undefined && values.includes(String(value));
  });
}

/** The cards that survive. */
export function filterByFacets(
  cards: readonly Flashcard[],
  filter: FacetFilter,
): Flashcard[] {
  if (!isFiltering(filter)) return [...cards];
  return cards.filter(card => cardMatchesFacets(card, filter));
}

/**
 * The values a facet actually takes among a set of cards.
 *
 * WHAT THE CONTROL OFFERS, so it can never offer a value that would
 * return nothing. The declared vocabulary is what a facet MAY hold; this
 * is what it does hold in the pool the reader is looking at, and a
 * control built from the first would show a reader twelve keys on a
 * category that only asks about three.
 */
export function availableValues(
  cards: readonly Flashcard[],
  name: FacetName,
): string[] {
  const seen = new Set<string>();
  for (const card of cards) {
    const value = card.facets?.[name];
    if (value !== undefined) seen.add(String(value));
  }
  const declared = FACET_VALUES[name].map(String);
  const known = declared.filter(v => seen.has(v));
  // A value the deck produces that the vocabulary does not declare
  // would be a bug the facet test catches; offering it anyway means the
  // control still works while that is being fixed.
  const undeclared = [...seen].filter(v => !declared.includes(v)).sort();
  return [...known, ...undeclared];
}

/**
 * Which facets are worth offering over a set of cards.
 *
 * A facet only one card carries, or one where every card gives the same
 * answer, is a control that cannot change what is on screen. The chip
 * row is already filtered this way — `AxisViewToggle` renders nothing
 * for an axis with one ordering — and this is the same call.
 */
export function offerableFacets(cards: readonly Flashcard[]): FacetName[] {
  return (Object.keys(FACET_VALUES) as FacetName[])
    .filter(name => availableValues(cards, name).length > 1);
}
