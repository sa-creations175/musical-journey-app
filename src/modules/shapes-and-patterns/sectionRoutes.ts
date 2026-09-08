/**
 * A sub-module's own page, and its address.
 *
 * ONE PLACE THAT KNOWS THE SHAPE OF THE URL. The nav writes these, the
 * cards link to them and the page parses them back; a slug written
 * three times is three chances for one of them to be wrong in a way
 * that only shows up as a redirect to the module home.
 *
 * The slug IS the section id — no second vocabulary. `SHAPES_SECTIONS`
 * is already kebab-case and already what every card, pref and
 * `?tab=` deep link is keyed by.
 */
import type { ShapesSectionId } from './homeCards';

export function shapesSectionPath(section: ShapesSectionId): string {
  return `/shapes-and-patterns/${section}`;
}

/**
 * Chord Movements & Passes, and one movement inside it.
 *
 * NOT A `ShapesSectionId`. The four sections are what `shapesCards`
 * computes coverage over and what `sectionTargets` reads; a movement
 * has no targets to be a fraction of, so it is a page under the module
 * rather than a fifth entry in that list. Same URL shape, different
 * kind of thing — which is why the two helpers sit together.
 */
export const MOVEMENTS_PATH = '/shapes-and-patterns/movements';

export function movementPath(id: string): string {
  return `${MOVEMENTS_PATH}/${id}`;
}

/**
 * What a card's Progress Detail button puts in `location.state` on its
 * way to the section page.
 *
 * A NAVIGATION, NOT A SCROLL, because the detail it wants is on another
 * page now. The flag rides along so the page it lands on knows to bring
 * its matrix into view rather than leaving the reader at the top.
 */
export const SCROLL_TO_DETAIL_STATE = { shapesScrollToDetail: true } as const;

export function wantsDetail(state: unknown): boolean {
  return (state as { shapesScrollToDetail?: boolean } | null)
    ?.shapesScrollToDetail === true;
}
