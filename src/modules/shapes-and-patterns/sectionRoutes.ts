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

/**
 * Chord Movements & Passes, and one movement inside it.
 *
 * IT IS THE `voice-leading` SECTION'S ADDRESS (ruling 19) — the same
 * page, the same card, the same stored rows, under the word Silas
 * actually uses for it. One movement gets its own page beneath.
 */
export const MOVEMENTS_PATH = '/shapes-and-patterns/movements';

export function shapesSectionPath(section: ShapesSectionId): string {
  // THE VOICE-LEADING SECTION **IS** CHORD MOVEMENTS & PASSES (ruling
  // 19), so its address is the movements one — not a page under it.
  // The exception belongs HERE because this file is the one place that
  // knows the shape of the URL; a caller that special-cased it would be
  // the second place, and the old address would go on being written
  // somewhere.
  if (section === 'voice-leading') return MOVEMENTS_PATH;
  return `/shapes-and-patterns/${section}`;
}

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
