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
 * IDEMPOTENT BY DATA, TWO DEVICES, EITHER ORDER. The machinery and the
 * reasoning are `cardRowMove`'s; nothing about them is restated here.
 * =====================================================================
 */
import { FLASHCARDS } from './catalog';
import {
  moveCardRows, movedTotal, NOTHING_MOVED, type MovedRows,
} from './cardRowMove';

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

/** One old card whose rows stay where they are, and why. */
export interface Unpaired { from: string; reason: string }

export interface FoldInReport extends MovedRows {
  unpaired: Unpaired[];
}

/**
 * Old id → new id, derived from the live deck and asserted card by
 * card.
 *
 * A card is paired only where EXACTLY ONE live card asks its question
 * and gives its answer. Zero means the generator has changed its
 * wording and the claim "this is the same card" is no longer provable;
 * two would mean the question is ambiguous, and a coin toss between two
 * cards is the wrong-mapping failure with extra steps. Either way the
 * rows stay put and it is said out loud.
 */
export function slashCMapping(): {
  moves: Array<{ from: string; to: string }>;
  unpaired: Unpaired[];
} {
  const live = new Set(FLASHCARDS.map(c => c.id));
  const moves: Array<{ from: string; to: string }> = [];
  const unpaired: Unpaired[] = [];
  for (const old of FOLDED_C_CARDS) {
    // A DELETED CARD THAT CAME BACK IS NOT RETIRED. Filtering on the
    // live deck rather than trusting the list means a restored card
    // keeps its own rows instead of donating them to a twin.
    if (live.has(old.id)) continue;
    const matches = FLASHCARDS.filter(
      c => c.question === old.question && c.correctAnswer === old.correctAnswer,
    );
    if (matches.length === 1) {
      moves.push({ from: old.id, to: matches[0].id });
      continue;
    }
    unpaired.push({
      from: old.id,
      reason: matches.length === 0
        ? `nothing in the deck asks "${old.question}" and answers `
          + `${old.correctAnswer}`
        : `${matches.length} cards ask it — ${matches.map(m => m.id).join(', ')}`,
    });
  }
  return { moves, unpaired };
}

export async function foldInSlashCCards(): Promise<FoldInReport> {
  const { moves, unpaired } = slashCMapping();
  const map = new Map(moves.map(m => [m.from, m.to]));
  if (map.size === 0) return { ...NOTHING_MOVED, unpaired };
  return { ...await moveCardRows(map), unpaired };
}

/**
 * The console line, or null where there is nothing to say.
 *
 * A CARD WITH NO PAIR IS ALWAYS SAID, even on a run that moved nothing,
 * because it is the one outcome nobody would otherwise see.
 */
export function describeSlashCFoldIn(r: FoldInReport): string | null {
  if (movedTotal(r) === 0 && r.unpaired.length === 0) return null;
  const parts: string[] = [];
  if (movedTotal(r) > 0) {
    parts.push(
      `[hf] the three C slash cards: ${r.attempts} attempt(s), `
      + `${r.spacing} spacing row(s) repointed, ${r.spacingMerged} merged, `
      + `${r.annotations} annotation(s), ${r.diary} diary entr(ies) moved`,
    );
  }
  for (const u of r.unpaired) {
    parts.push(`[hf] ${u.from} keeps its rows where they are — ${u.reason}`);
  }
  return parts.join('\n');
}
