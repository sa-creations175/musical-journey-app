/**
 * What a card's own data is shaped like, as distinct from the family it
 * sits in.
 *
 * =====================================================================
 * SCALES & MODES IS ONE FAMILY SINCE 14 SEP 2026 (Silas; walked in
 * `hf-home-groups-prototype.html`). Pentatonic Scales folded into Mode
 * Identification: its cards carry `category: 'modes'` now, and the family
 * is one home card, one page, one goal target and one count.
 *
 * THE CARDS DID NOT CHANGE. A pentatonic card still has a root and a
 * shape, builds its answer on the keyboard and plays five notes over its
 * root; a mode card still has a key and a number and picks from four. So
 * every place that reads a card's coordinates asks this rather than the
 * family, and gets the same answer it got before the fold.
 *
 * READ OFF THE ID, AND THAT IS DELIBERATE HERE. Ids are stable handles
 * for stored history, so they cannot be renumbered, and every pentatonic
 * card has been `pent-` since commit 8. A goal set against the retired
 * `foundational` unit counts pentatonic cards the same way.
 * =====================================================================
 */
import type { FlashcardCategory } from './catalog';

/** The family's name (Silas, 14 Sep 2026). Here rather than in
 *  `CATEGORY_LABELS` so the generators, which `catalog.ts` imports, can
 *  write it without a cycle. */
export const SCALES_AND_MODES_CATEGORY_NAME = 'Scales & Modes';

/** Every pentatonic card, whichever family it is filed under. */
export function isPentatonicCard(card: { id: string }): boolean {
  return card.id.startsWith('pent-');
}

/**
 * The category a card belonged to before the fold: `pentatonic-scales`
 * for a pentatonic card, its own category otherwise.
 */
export function cardKind(card: { id: string; category: FlashcardCategory }): FlashcardCategory {
  return isPentatonicCard(card) ? 'pentatonic-scales' : card.category;
}

/**
 * Category ids that no longer have a family of their own, and the family
 * that holds their cards. A goal or a link stored against one resolves
 * here.
 */
export const RETIRED_CATEGORY_HOME: Readonly<Partial<Record<FlashcardCategory, FlashcardCategory>>> = {
  'pentatonic-scales': 'modes',
};
