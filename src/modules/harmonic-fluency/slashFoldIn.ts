/**
 * The slash-chord family, regenerated for thirteen keys — and every
 * old card's practice with it.
 *
 * =====================================================================
 * EIGHTY-FOUR CARDS RETIRE AND NINETY-ONE ARRIVE.
 *
 * The generator ran over the twelve identity keys. Ruling 40 makes F♯
 * major and G♭ major two keys, and ruling 39 says every family covers
 * every actual key, so it runs over thirteen.
 *
 * =====================================================================
 * WHY EVERY ID CHANGED RATHER THAN ONLY THE SEVEN THAT HAD TO.
 *
 * The mode family's reason, unchanged. The old ids were minted from the
 * identity vocabulary, where F♯ and G♭ are one key — so `sc-1-3-F#`
 * MEANS the G♭ card while SPELLING F♯. Letting F♯ take that id would
 * mint a retired id again, and no flag-free, run-it-twice migration can
 * survive that: the second run would move the new card's practice onto
 * the old card's destination.
 *
 * So the family took a prefix that has never existed — `sc-slash-` —
 * which also cannot collide with the hand-written prose cards `sc-1` to
 * `sc-16`. Every old id retires for good and `reusedIds` asserts it.
 *
 * The old generator is re-derived rather than listed, the proof and the
 * mover are `foldInByIdentity`'s and `cardRowMove`'s, and none of that
 * is restated here.
 * =====================================================================
 */
import { retiredSlashCards } from './catalogExpansions';
import {
  describeFoldIn, foldInByIdentity, identityMapping,
  type FoldInReport, type RetiredCard,
} from './foldInByIdentity';

/** Every slash card that has left the deck, as it was. */
export function retiredSlashCardRecords(): RetiredCard[] {
  return retiredSlashCards().map(c => ({
    id: c.id, question: c.question, correctAnswer: c.correctAnswer,
  }));
}

/** Old id → new id, derived from the live deck and asserted card by
 *  card. See `foldInByIdentity` for what "the same card" means. */
export function slashMapping() {
  return identityMapping(retiredSlashCardRecords());
}

export async function foldInSlashCards(): Promise<FoldInReport> {
  return foldInByIdentity(retiredSlashCardRecords());
}

export function describeSlashFoldIn(r: FoldInReport): string | null {
  return describeFoldIn('the regenerated slash-chord family', r);
}
