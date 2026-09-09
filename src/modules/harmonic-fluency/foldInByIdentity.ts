/**
 * A card folds into another card that asks the same thing.
 *
 * =====================================================================
 * THE PROOF, WHICH IS THE PART THAT CAN BE WRONG SILENTLY.
 *
 * `cardRowMove` moves the rows. What it cannot do — and says so — is
 * decide WHICH card a row belongs to. A mapping with one bad line
 * attaches a history to a question the reader never answered, and
 * nothing on screen looks broken: the card simply reads more practised
 * than it is and is scheduled accordingly. There is no test that can
 * catch a wrong mapping after the fact.
 *
 * So the mapping is never written down. A retired card is paired with a
 * live one only where the QUESTION and the ANSWER are the same string,
 * and only where EXACTLY ONE live card matches. Zero means the wording
 * moved and the claim "this is the same card" is no longer provable;
 * two means the question is ambiguous, and a coin toss between two
 * cards is the wrong-mapping failure with extra steps. Either way the
 * rows stay where they are and it is said out loud.
 *
 * =====================================================================
 * ACCIDENTALS ARE FOLDED BEFORE COMPARING, AND ONLY ACCIDENTALS.
 *
 * `retiredCategoryMigration` argues this at length and it is imported
 * rather than restated: `lib/spelling.ts` says ASCII `b` and `#` are
 * the identity and ♭ and ♯ are the display of the same letter, so two
 * spellings of one name are one name. It is needed because older
 * generators wrote ASCII into question text where newer ones write the
 * glyph — "F to Bb" and "F to B♭" — and comparing raw bytes would
 * orphan a card's history over a typographic difference nobody made on
 * purpose.
 *
 * IT CANNOT CAUSE A WRONG PAIRING: no two DIFFERENT note or key names
 * fold onto one string under it, so nothing that was distinguishable
 * stops being so. F♯ and G♭ stay two different questions, which is the
 * whole point of the thirteenth key.
 *
 * =====================================================================
 * ONE MOVER, ONE PROOF, THREE CALLERS.
 *
 * The slash C cards, the mode family and the interval family all fold
 * in the same way and differ only in WHAT retired. Writing the proof
 * three times would be three chances for one copy to relax it.
 *
 * IDEMPOTENT BY DATA, TWO DEVICES, EITHER ORDER — `cardRowMove`'s, not
 * restated here. What this file adds is one rule that makes that
 * safety reachable: A RETIRED ID MAY NEVER BE MINTED AGAIN. If a
 * generator re-used a retired id for a different card, a second run
 * would move the NEW card's practice onto the old card's destination,
 * and no flag-free migration can tell the two apart. `noReusedIds`
 * asserts it and every caller's test runs it.
 * =====================================================================
 */
import { FLASHCARDS, type Flashcard } from './catalog';
import { toAsciiAccidentals } from '../../lib/spelling';
import {
  moveCardRows, movedTotal, NOTHING_MOVED, type MovedRows,
} from './cardRowMove';

/** A card that has left the deck, as it was when it left. */
export interface RetiredCard {
  id: string;
  question: string;
  correctAnswer: string;
}

/** One retired card whose rows stay where they are, and why. */
export interface Unpaired { from: string; reason: string }

export interface FoldInReport extends MovedRows {
  unpaired: Unpaired[];
}

/** Two strings that differ only in how an accidental is written are
 *  one string. See the header. */
function same(a: string, b: string): boolean {
  return toAsciiAccidentals(a) === toAsciiAccidentals(b);
}

/**
 * Old id → new id, derived from the live deck and asserted card by
 * card.
 */
export function identityMapping(
  retired: ReadonlyArray<RetiredCard>,
  live: ReadonlyArray<Flashcard> = FLASHCARDS,
): { moves: Array<{ from: string; to: string }>; unpaired: Unpaired[] } {
  const liveIds = new Set(live.map(c => c.id));
  const moves: Array<{ from: string; to: string }> = [];
  const unpaired: Unpaired[] = [];
  for (const old of retired) {
    // A RETIRED CARD THAT CAME BACK IS NOT RETIRED. Filtering on the
    // live deck rather than trusting the list means a restored card
    // keeps its own rows instead of donating them to a twin — and it is
    // the second guard against the id-reuse hazard the header names.
    if (liveIds.has(old.id)) continue;
    const matches = live.filter(
      c => same(c.question, old.question)
        && same(c.correctAnswer, old.correctAnswer),
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

/**
 * Whether any retired id has been minted again by the live deck.
 *
 * THE ONE THING THAT WOULD MAKE A FLAG-FREE MIGRATION UNSAFE, so it is
 * a function a test can call rather than a rule in a comment. Returns
 * the offending ids; an empty array is the safe state.
 */
export function reusedIds(
  retired: ReadonlyArray<RetiredCard>,
  live: ReadonlyArray<Flashcard> = FLASHCARDS,
): string[] {
  const liveIds = new Set(live.map(c => c.id));
  return retired.filter(r => liveIds.has(r.id)).map(r => r.id);
}

export async function foldInByIdentity(
  retired: ReadonlyArray<RetiredCard>,
): Promise<FoldInReport> {
  const { moves, unpaired } = identityMapping(retired);
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
export function describeFoldIn(what: string, r: FoldInReport): string | null {
  if (movedTotal(r) === 0 && r.unpaired.length === 0) return null;
  const parts: string[] = [];
  if (movedTotal(r) > 0) {
    parts.push(
      `[hf] ${what}: ${r.attempts} attempt(s), `
      + `${r.spacing} spacing row(s) repointed, ${r.spacingMerged} merged, `
      + `${r.annotations} annotation(s), ${r.diary} diary entr(ies) moved`,
    );
  }
  for (const u of r.unpaired) {
    parts.push(`[hf] ${u.from} keeps its rows where they are — ${u.reason}`);
  }
  return parts.join('\n');
}
