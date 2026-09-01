/**
 * What a filter does to a card, and it is not what it does to a row.
 *
 * =====================================================================
 * ON THE TREE A FILTER REMOVES ROWS. ON A CARD IT DIMS SQUARES.
 *
 * The strip's contract is one square per category, never sampled and
 * never capped, so the SHAPE of the module is legible — strong at the
 * start and empty at the end looks like that. Take squares out and what
 * is left is a picture of a subset wearing the shape of the whole,
 * which is the one thing the strip must never be.
 *
 * So a filter emphasises instead: matches stay at full strength,
 * everything else drops back, and the strip keeps its length, its order
 * and its meaning. A dimmed square is STILL A SQUARE — still tappable,
 * still counted in the footer, still part of the shape.
 *
 * =====================================================================
 * THE MODULE PILLS ARE NOT PART OF THIS, AND CANNOT BE.
 *
 * Every square on one card belongs to the same module, so "module is
 * ear training" is true of all of them or none — as a per-square
 * predicate it would either dim nothing or dim everything, and under
 * the `any` switch it would make every square match and dissolve the
 * dimming entirely.
 *
 * The pills do on cards what they do everywhere: they pick which
 * modules are shown. Which is to say they pick the CARDS. So they are
 * lifted out of the spec before it is asked about a square, and applied
 * to the list of cards instead.
 * =====================================================================
 */
import type { FilterSpec } from '../read/query';
import { activeFilterCount } from '../read/urlState';

/**
 * The filter as a square is asked it — everything except the module
 * pills. See the header.
 */
export function squareFilter(filter: FilterSpec): FilterSpec {
  const { modules: _modules, ...rest } = filter;
  return rest;
}

/**
 * Whether anything is dimming right now.
 *
 * Counted through `activeFilterCount`, the same function the controls'
 * own badge counts with, so the badge and the dim cannot disagree about
 * whether a filter is on.
 */
export function squareFilterActive(filter: FilterSpec): boolean {
  return activeFilterCount(squareFilter(filter)) > 0;
}

/**
 * Which modules a card list may contain.
 *
 * Absent or empty means every module, which is what an untouched pill
 * row should mean.
 */
export function moduleIsShown(filter: FilterSpec, moduleId: string): boolean {
  const wanted = filter.modules;
  if (wanted === undefined || wanted.length === 0) return true;
  return wanted.includes(moduleId);
}

/**
 * UNAPPROVED COPY. Drafted for this build and never ruled on — listed
 * in the report. It appears only while a filter is dimming something,
 * under the footer it explains.
 *
 * ONE TEMPLATE, NOT TWO. "1 of 15 categories match" is the grammatical
 * cost of not inventing a second string for the singular; flagged in
 * the report rather than solved by writing one nobody approved.
 */
export function matchLine(matched: number, total: number): string {
  return `${matched} of ${total} categories match`;
}

/**
 * How far back a non-matching square drops.
 *
 * A WHOLE LITERAL CLASS, and pinned as one by a test. Tailwind scans
 * source text, so an opacity assembled from a number would be invisible
 * to the scanner, emit no rule, and dim nothing at all — the filter
 * would look as though it had simply failed.
 *
 * Far enough back that the matches read as the subject of the strip;
 * not so far that the shape stops being visible, because the shape is
 * what the reader came for and the filter is a question asked OF it.
 */
export const DIMMED_CLASS = 'opacity-[0.18]';
