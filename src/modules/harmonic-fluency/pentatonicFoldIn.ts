/**
 * The pentatonic family: the notes in every key, and the lick scale.
 *
 * =====================================================================
 * WHAT MOVES AND WHAT DOES NOT.
 *
 * Silas's ruling: pick the notes, per key, no formulas.
 *
 * THE NOTES CARDS MOVE. Twenty-five of them — twelve minor, twelve
 * major and the hand-written C minor one — ask exactly what the
 * regenerated set asks, so they pair on question and answer. Major
 * gains a thirteenth root: F♯ major pentatonic is F♯ G♯ A♯ C♯ D♯, clean,
 * and was missing only because the list stopped at twelve.
 *
 * THE FORMULA CARDS DO NOT. "What 5 notes make up the major pentatonic
 * scale?" answers 1, 2, 3, 5, 6 — a shape a reader can recite without
 * being able to play it in a single key. Nothing replaces them, so
 * nothing pairs with them.
 *
 * THE RELATIVE CARDS DO NOT EITHER. "A♭ major pentatonic and F minor
 * pentatonic share the same _____" answered "5 notes (identical pitch
 * set)": a fact about a definition. The card that replaces it asks
 * which minor pentatonic to play over a major key, which is the
 * question a player actually reaches for — a different question with a
 * different answer, so the pairing refuses it rather than guessing.
 *
 * Both sets are reported unpaired and their rows go the way the 6/♭7
 * cards' did.
 * =====================================================================
 */
import { RETIRED_PENTATONIC_FORMULA_CARDS, retiredPentatonicKeyCards } from './catalog';
import {
  describeFoldIn, foldInByIdentity, identityMapping,
  type FoldInReport, type RetiredCard,
} from './foldInByIdentity';

/** Every pentatonic card that has left the deck, as it was. */
export function retiredPentatonicCards(): RetiredCard[] {
  return [
    ...RETIRED_PENTATONIC_FORMULA_CARDS,
    ...retiredPentatonicKeyCards(),
  ].map(c => ({ id: c.id, question: c.question, correctAnswer: c.correctAnswer }));
}

/** Old id → new id, derived from the live deck and asserted card by
 *  card. See `foldInByIdentity` for what "the same card" means. */
export function pentatonicMapping() {
  return identityMapping(retiredPentatonicCards());
}

export async function foldInPentatonicCards(): Promise<FoldInReport> {
  return foldInByIdentity(retiredPentatonicCards());
}

export function describePentatonicFoldIn(r: FoldInReport): string | null {
  return describeFoldIn('the regenerated pentatonic family', r);
}
