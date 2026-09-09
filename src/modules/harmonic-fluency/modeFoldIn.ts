/**
 * The mode family, regenerated — and every old card's practice with it.
 *
 * =====================================================================
 * THIRTY-SIX CARDS RETIRE AND NINETY-ONE ARRIVE.
 *
 * Ruling 42 makes Mode Identification every key by every mode. It was
 * three modes in eleven keys, plus three hand-written C cards asking
 * the same question in the twelfth. Thirty-three generated ids and
 * three hand-written ones are gone; each of the thirty-six has a card
 * in the new grid asking the identical question with the identical
 * answer, and its rows follow.
 *
 * =====================================================================
 * WHY EVERY ID CHANGED RATHER THAN ONLY THE TWO THAT HAD TO.
 *
 * Ruling 40 makes F♯ major and G♭ major two keys. The old ids were
 * minted from the identity vocabulary, where those are one — so
 * `mo-mode-of-F#-2` MEANS the G♭ card while SPELLING F♯.
 *
 * The obvious move is to give G♭ its own id and let F♯ take the one
 * that already reads F♯. That would mint `mo-mode-of-F#-2` for a
 * different question than it means today, and a retired id minted again
 * is the one thing a flag-free, run-it-twice migration cannot survive:
 * the first run moves the G♭ history off it, the reader drills the new
 * F♯ card, and the SECOND run moves that practice onto the G♭ card. No
 * comparison of ids can tell those two apart, because they are the same
 * id.
 *
 * So the family took an id shape that has never existed — `mo-mode-`
 * rather than `mo-mode-of-` — every old id retires for good, and
 * `reusedIds` asserts that none of them comes back.
 *
 * =====================================================================
 * THE OLD CARDS ARE RE-DERIVED, NOT LISTED.
 *
 * `retiredModeOfCards()` is the generator as it was, still exported and
 * no longer in the deck — the same arrangement `retiredCategoryMigration`
 * uses and for the same reason: a hand-written table of thirty-three
 * questions could only be trusted, where a generator can be compared.
 * The three hand-written C cards have no generator, so those three are
 * written out.
 *
 * The proof, the mover and the two-device reasoning are
 * `foldInByIdentity`'s and `cardRowMove`'s. Nothing is restated here.
 * =====================================================================
 */
import { retiredModeOfCards } from './catalogExpansions';
import {
  describeFoldIn, foldInByIdentity, identityMapping,
  type FoldInReport, type RetiredCard,
} from './foldInByIdentity';

/**
 * The three hand-written C cards, exactly as they were when they were
 * deleted. Only the question and the answer: those are the proof.
 */
export const RETIRED_C_MODE_CARDS: ReadonlyArray<RetiredCard> = [
  { id: 'mo-11', question: 'The mode of C major starting on A is _____', correctAnswer: 'A Aeolian' },
  { id: 'mo-12', question: 'The mode of C major starting on D is _____', correctAnswer: 'D Dorian' },
  { id: 'mo-13', question: 'The mode of C major starting on G is _____', correctAnswer: 'G Mixolydian' },
];

/** Every mode card that has left the deck, as it was. */
export function retiredModeCards(): RetiredCard[] {
  return [
    ...retiredModeOfCards().map(c => ({
      id: c.id, question: c.question, correctAnswer: c.correctAnswer,
    })),
    ...RETIRED_C_MODE_CARDS,
  ];
}

/** Old id → new id, derived from the live deck and asserted card by
 *  card. See `foldInByIdentity` for what "the same card" means. */
export function modeMapping() {
  return identityMapping(retiredModeCards());
}

export async function foldInModeCards(): Promise<FoldInReport> {
  return foldInByIdentity(retiredModeCards());
}

export function describeModeFoldIn(r: FoldInReport): string | null {
  return describeFoldIn('the regenerated mode family', r);
}
