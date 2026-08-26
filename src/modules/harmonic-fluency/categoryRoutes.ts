/**
 * A category's own page, and its address.
 *
 * ONE PLACE THAT KNOWS THE SHAPE OF THE URL. The nav writes these, the
 * cards link to them and the page parses them back, so a slug written
 * three times is three chances for one of them to be wrong in a way
 * that only shows up as a redirect to the module home.
 *
 * The slug IS the category id — no second vocabulary. `CATEGORY_ORDER`
 * is already kebab-case and already the thing every catalog entry, ref
 * and grid is keyed by.
 */
import { CATEGORY_ORDER, type FlashcardCategory } from './catalog';

export function isCategory(value: string): value is FlashcardCategory {
  return (CATEGORY_ORDER as readonly string[]).includes(value);
}

export function categoryPath(category: FlashcardCategory): string {
  return `/harmonic-fluency/${category}`;
}
