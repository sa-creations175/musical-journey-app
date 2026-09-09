/**
 * Progression Vocabulary: eight named progressions, in thirteen keys.
 *
 * =====================================================================
 * WHAT MOVES.
 *
 * Fourteen cards pair. Eight are hand-written — the 1-5-6-4 in C, the
 * 2-5-1 in B♭, the 1-6-4-5 in G, the 6-4-1-5 in D, the gospel walk-up
 * in C, rhythm changes in B♭, the backdoor in F and the neo-soul cycle
 * in C — and each asks its own key's generated card word for word, so
 * the pairing is exact rather than inferred.
 *
 * The other six are the 1-5-6-4 top-ups from commit 6, `pr-1564-Db`
 * and its five neighbours. They said the same sentence the generator
 * says; only the id changes, because `pr-1564-Gb` could not tell F♯
 * major from G♭ major and `pr-prog-1-5-6-4-Gb` can.
 *
 * =====================================================================
 * NOTHING IS DELETED HERE.
 *
 * Every retired card has a successor, so no row goes to
 * `orphanedCardCleanup` and the authorisation list is untouched. The
 * twelve progression cards that were not regenerated are still in the
 * deck — see `RETIRED_PROGRESSION_IDS` for why each one stayed.
 * =====================================================================
 */
import { RETIRED_PROGRESSION_CARDS } from './catalog';
import { generateProgressionTopUps } from './catalogExpansions';
import {
  describeFoldIn, foldInByIdentity, identityMapping,
  type FoldInReport, type RetiredCard,
} from './foldInByIdentity';

/** Every progression card that has left the deck, as it was. */
export function retiredProgressionCards(): RetiredCard[] {
  return [
    ...RETIRED_PROGRESSION_CARDS,
    ...generateProgressionTopUps(),
  ].map(c => ({ id: c.id, question: c.question, correctAnswer: c.correctAnswer }));
}

/** Old id → new id, derived from the live deck and asserted card by
 *  card. See `foldInByIdentity` for what "the same card" means. */
export function progressionMapping() {
  return identityMapping(retiredProgressionCards());
}

export async function foldInProgressionCards(): Promise<FoldInReport> {
  return foldInByIdentity(retiredProgressionCards());
}

export function describeProgressionFoldIn(r: FoldInReport): string | null {
  return describeFoldIn('the regenerated progression family', r);
}
