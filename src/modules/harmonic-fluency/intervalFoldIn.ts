/**
 * The interval family, regenerated — and every old card's practice
 * with it.
 *
 * =====================================================================
 * TWENTY-FIVE CARDS RETIRE AND ONE HUNDRED AND FIFTY ARRIVE.
 *
 * Ruling 43 makes Interval Identification every note by every distance.
 * It was twenty hand-picked pairs and five top-ups filling the start
 * notes those twenty never used — a family whose grid had twenty-five
 * cells filled out of a hundred and fifty-six.
 *
 * =====================================================================
 * THE POSITIONAL IDS ARE THE REASON THIS COULD NOT BE AN EXTENSION.
 *
 * `iv-1` numbers by index into a hand-written array, which is the exact
 * shape `generatedCardPairing` was written to catch: insert a pair in
 * the middle and every id after it addresses a different question, with
 * nothing on screen to say so. And the top-ups' `iv-Db-5` names a
 * scale DEGREE where the new grid names a SEMITONE COUNT, so `iv-Db-5`
 * would mean two different distances depending on when it was minted.
 *
 * Both are retired for good and the grid mints `iv-{from}-up-{span}`,
 * a shape that has never existed. A retired id minted again is the one
 * thing a flag-free, run-it-twice migration cannot survive;
 * `reusedIds` asserts that none comes back.
 *
 * =====================================================================
 * THE OLD CARDS ARE RE-DERIVED, NOT LISTED. Both generators are still
 * exported and out of the deck — the arrangement
 * `retiredCategoryMigration` established, and for its reason: a
 * hand-written table of twenty-five questions could only be trusted.
 *
 * The proof, the mover and the two-device reasoning are
 * `foldInByIdentity`'s and `cardRowMove`'s. Nothing is restated here.
 *
 * ONE THING THE PROOF HAD TO ABSORB: the twenty wrote ASCII note names
 * into their question text — "from F to Bb" — where the grid writes the
 * glyph. `foldInByIdentity` folds accidentals before comparing, which
 * `retiredCategoryMigration` argues for at length and which cannot
 * merge two different names.
 * =====================================================================
 */
import { retiredIntervalPairCards } from './catalog';
import { generateIntervalTopUps } from './catalogExpansions';
import {
  describeFoldIn, foldInByIdentity, identityMapping,
  type FoldInReport, type RetiredCard,
} from './foldInByIdentity';

/** Every interval card that has left the deck, as it was. */
export function retiredIntervalCards(): RetiredCard[] {
  return [...retiredIntervalPairCards(), ...generateIntervalTopUps()].map(c => ({
    id: c.id, question: c.question, correctAnswer: c.correctAnswer,
  }));
}

/** Old id → new id, derived from the live deck and asserted card by
 *  card. See `foldInByIdentity` for what "the same card" means. */
export function intervalMapping() {
  return identityMapping(retiredIntervalCards());
}

export async function foldInIntervalCards(): Promise<FoldInReport> {
  return foldInByIdentity(retiredIntervalCards());
}

export function describeIntervalFoldIn(r: FoldInReport): string | null {
  return describeFoldIn('the regenerated interval family', r);
}
