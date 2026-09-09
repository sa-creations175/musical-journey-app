/**
 * Three hand-written C slash cards fold into the generator.
 *
 * =====================================================================
 * THEY WERE A SECOND IMPLEMENTATION OF A GENERATOR THAT ALREADY
 * EXISTED.
 *
 * `generateSlashCards` builds a slash card for a shape in a key. It
 * skipped C for three shapes, because `catalog.ts` held a hand-written
 * card for each — asking the identical question, with the identical
 * answer, in the identical words. Three consequences, all real:
 *
 *   · the hand-written cards carry no `axis`, so the Slash Chord filter
 *     row could not see them — asking for 1/3 gave eleven keys;
 *   · they had no `axis`, so ruling 33 gave them no SOUND, while the
 *     other eleven keys of the same shape play;
 *   · their explanations said the chord-tone reading in their own,
 *     longer words, so C read differently from every other key.
 *
 * Ruling 37 deletes them and lets the generator cover C.
 *
 * =====================================================================
 * THE PROOF IS THE QUESTION AND THE ANSWER, CHARACTER FOR CHARACTER.
 *
 * `retiredCategoryMigration` states the failure this guards against: a
 * mapping with one bad line attaches a history to a question that was
 * never answered, and nothing looks broken — the card simply reads more
 * practised than it is and is scheduled accordingly. There the
 * questions were differently worded on purpose, so it compared what the
 * questions were ABOUT. Here they are the same string, so it compares
 * the string.
 *
 * WHAT THE OLD CARDS SAID IS RECORDED BELOW, and it is the only place
 * that survives now they are out of the catalog. It is evidence, not
 * configuration: the pairing is re-derived from the live deck on every
 * run and a card that no longer matches EXACTLY ONE live card keeps its
 * rows where they are and is reported.
 *
 * =====================================================================
 * THE PROOF AND THE MOVER ARE BOTH SHARED. `foldInByIdentity` holds
 * the question-and-answer comparison and the "exactly one" rule;
 * `cardRowMove` holds the four tables and the two-device reasoning.
 * Two more families fold in the same way, and a proof written three
 * times is three chances for one copy to relax it. What is left here is
 * the RECORD of what these three cards said.
 * =====================================================================
 */
import {
  describeFoldIn, foldInByIdentity, identityMapping, type FoldInReport,
} from './foldInByIdentity';

/**
 * The three cards, exactly as they were when they were deleted.
 *
 * Only the question and the answer: those are the proof. The
 * explanations are in the commit that removed them and in the report —
 * two of the three carried a sentence the generated card does not, and
 * that is Silas's to add back or not.
 */
export const FOLDED_C_CARDS: ReadonlyArray<{
  id: string; question: string; correctAnswer: string;
}> = [
  { id: 'sc-8', question: 'What is 1/3 in C major?', correctAnswer: 'C/E' },
  { id: 'sc-9', question: 'What is 5/7 in C major?', correctAnswer: 'G/B' },
  { id: 'sc-10', question: 'What is 4/5 in C major?', correctAnswer: 'F/G' },
];

/** Old id → new id, derived from the live deck and asserted card by
 *  card. See `foldInByIdentity` for what "the same card" means. */
export function slashCMapping() {
  return identityMapping(FOLDED_C_CARDS);
}

export async function foldInSlashCCards(): Promise<FoldInReport> {
  return foldInByIdentity(FOLDED_C_CARDS);
}

export function describeSlashCFoldIn(r: FoldInReport): string | null {
  return describeFoldIn('the three C slash cards', r);
}
