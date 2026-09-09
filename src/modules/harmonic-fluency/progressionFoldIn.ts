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
import { generateIiViCards, generateProgressionTopUps } from './catalogExpansions';
import {
  describeFoldIn, foldInByIdentity, identityMapping,
  type FoldInReport, type RetiredCard, type RuledByAnswer,
} from './foldInByIdentity';

/**
 * Functional Harmony's ii-V-I cards, ruled onto the 2-5-1.
 *
 * =====================================================================
 * THE ONLY PAIRING IN THE DECK THAT IS NOT MADE ON THE QUESTION.
 *
 * "The ii-V-I cadence in B♭ major is _____" and "The 2-5-1 in B♭ major
 * is _____" are one card in two sentences — ruling 26 said as much when
 * it put both families' chips on one row, and Silas ruled that the card
 * itself should live once. No text comparison can see that.
 *
 * So each of the eleven is named here, one line each, and the exception
 * they are granted is narrow: the QUESTION may differ, the ANSWER may
 * not, and exactly one live card must give that answer. The
 * destination is still derived from the deck — see `RuledByAnswer`,
 * which is where the reasoning lives.
 *
 * ELEVEN, NOT TWELVE. `fh-3` asks the ii-V-I in C and is hand-written
 * rather than generated; it is not on Silas's list and is not touched.
 * It is in the report.
 * =====================================================================
 */
const RULED_ONTO_THE_2_5_1: ReadonlyArray<RuledByAnswer> =
  generateIiViCards().map(c => ({
    from: c.id,
    why: 'the ii-V-I cadence and the 2-5-1 are one progression asked in '
      + 'two sentences (ruling 26); the answer is the same three chords',
  }));

/**
 * The backdoor's question was rewritten, so its hand-written card can
 * no longer pair on text.
 *
 * `pr-7` asked "The backdoor progression I-IV-bVII-I in F major is
 * _____" and the generated card now asks "The 1 4 ♭7 1 (backdoor) in F
 * major is _____" — numbers lead, names follow. Same card, same four
 * chords, one sentence rewritten, so it takes the same ruled route as
 * the cadences rather than the identity rule being loosened for
 * everyone. F - B♭ - E♭ - F is given by exactly one live card.
 */
const RULED_BY_REWORDING: ReadonlyArray<RuledByAnswer> = [
  {
    from: 'pr-7',
    why: 'the backdoor question reads numbers-first now; the four chords '
      + 'are unchanged',
  },
];

const RULED: ReadonlyArray<RuledByAnswer> = [
  ...RULED_ONTO_THE_2_5_1, ...RULED_BY_REWORDING,
];

/** Every progression card that has left the deck, as it was. */
export function retiredProgressionCards(): RetiredCard[] {
  return [
    ...RETIRED_PROGRESSION_CARDS,
    ...generateProgressionTopUps(),
    ...generateIiViCards(),
  ].map(c => ({ id: c.id, question: c.question, correctAnswer: c.correctAnswer }));
}

/** Old id → new id, derived from the live deck and asserted card by
 *  card. See `foldInByIdentity` for what "the same card" means. */
export function progressionMapping() {
  return identityMapping(
    retiredProgressionCards(), undefined, RULED,
  );
}

export async function foldInProgressionCards(): Promise<FoldInReport> {
  return foldInByIdentity(retiredProgressionCards(), RULED);
}

export function describeProgressionFoldIn(r: FoldInReport): string | null {
  return describeFoldIn('the regenerated progression family', r);
}
