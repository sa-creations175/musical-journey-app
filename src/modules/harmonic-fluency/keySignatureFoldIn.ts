/**
 * The key-signature family, regenerated for thirteen keys — and every
 * old card's practice with it.
 *
 * =====================================================================
 * TWENTY-NINE RETIRE, TWENTY-SEVEN FOLD IN, TWO DO NOT.
 *
 * Three generated sets replace what was a mixture of hand-written cards
 * and a partial generator: the count in every key, the relative pair in
 * both directions in every key, and a count-to-key card per mode. The
 * hand-written cards asked the same questions in twelve keys unevenly —
 * fifteen relative-minor cards one way, twelve the other, in
 * overlapping key sets — and each pairs with the generated card that
 * asks it.
 *
 * `ks-19` AND `ks-20` PAIR WITH NOTHING, AND THAT IS THE RULING RATHER
 * THAN A GAP. "A key with 3 flats is most likely E♭ major or C minor"
 * answers with two keys at once and then tells the reader to look at
 * the final chord to tell which. That is two facts and a
 * disambiguation rule in one option string, and there is nothing in it
 * to get right or wrong. Two cards replace it, one per mode, and
 * neither asks that question or gives that answer — so the pairing
 * reports them rather than guessing, and their rows are cleaned up the
 * way the 6/♭7 cards' were.
 *
 * The old cards are re-derived rather than listed, and the proof, the
 * mover and the two-device reasoning are `foldInByIdentity`'s and
 * `cardRowMove`'s.
 * =====================================================================
 */
import { RETIRED_KEY_SIG_CARDS } from './catalog';
import { generateRelativeMinorTopUps } from './catalogExpansions';
import {
  describeFoldIn, foldInByIdentity, identityMapping,
  type FoldInReport, type RetiredCard,
} from './foldInByIdentity';

/** Every key-signature card that has left the deck, as it was. */
export function retiredKeySignatureCards(): RetiredCard[] {
  return [...RETIRED_KEY_SIG_CARDS, ...generateRelativeMinorTopUps()].map(c => ({
    id: c.id, question: c.question, correctAnswer: c.correctAnswer,
  }));
}

/** Old id → new id, derived from the live deck and asserted card by
 *  card. See `foldInByIdentity` for what "the same card" means. */
export function keySignatureMapping() {
  return identityMapping(retiredKeySignatureCards());
}

export async function foldInKeySignatureCards(): Promise<FoldInReport> {
  return foldInByIdentity(retiredKeySignatureCards());
}

export function describeKeySignatureFoldIn(r: FoldInReport): string | null {
  return describeFoldIn('the regenerated key-signature family', r);
}
