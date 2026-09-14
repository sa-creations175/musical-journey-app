/**
 * Which cards reveal the maj7♯11 chord rows, and which root they open on.
 *
 * =====================================================================
 * THE SIGNATURE-CHORD CARD, AND THE LYDIAN CARD IN EVERY KEY.
 *
 * `mo-15` asks which chord says Lydian and names no key, so it opens on
 * the first root of each quadrant. `mo-3` asked which degree Lydian starts
 * on and opened on F; it retired on 14 Sep 2026 into the generated card
 * for the key of C, and on Silas's word the same day every generated
 * Lydian card carries the rows, opened on its own Lydian root: the mode
 * of the key of D♭ major starting on G♭ opens on G♭.
 *
 * READ OFF THE CARD'S OWN COORDINATES — the mode family's degree 4 and
 * the answer it names — never parsed out of an id.
 * =====================================================================
 */
import { pitchClassOf } from '../../lib/spelling';
import type { Flashcard } from './catalog';
import { QUADRANT_ROOTS } from './lydianChords';

/** The hand-written card, and the root it opens on (none: the first of
 *  each quadrant). */
export const LYDIAN_CHORD_CARDS: Readonly<Record<string, string | undefined>> = {
  'mo-15': undefined,
};

/**
 * The rows' opening for a card, or null when the card carries none.
 *
 * THE ROOT IS SPELLED AS THE ROWS SPELL IT. A generated card can name a
 * C♭ or an F♯ where the rows hold B or G♭; matched by pitch class, the
 * card opens the row that sounds its root.
 */
export function lydianRowsFor(card: Flashcard): { openWith?: string } | null {
  if (card.id in LYDIAN_CHORD_CARDS) {
    const openWith = LYDIAN_CHORD_CARDS[card.id];
    return openWith === undefined ? {} : { openWith };
  }
  const suffix = ' Lydian';
  if (card.category !== 'modes' || card.axis?.degree !== 4 || !card.correctAnswer.endsWith(suffix)) {
    return null;
  }
  const pc = pitchClassOf(card.correctAnswer.slice(0, -suffix.length));
  const root = pc === null ? undefined : QUADRANT_ROOTS.flat().find(r => pitchClassOf(r) === pc);
  return root === undefined ? {} : { openWith: root };
}
