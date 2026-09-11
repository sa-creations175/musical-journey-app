/**
 * What the Full Progression card has in play, and what a session draws.
 *
 * =====================================================================
 * THE PROGRESSIONS LADDER IS RETIRED, AND THIS IS WHAT REPLACED IT.
 *
 * Chord progressions had four Tiers, and they were the last thing on
 * this module that still described the OLD catalog — eight entries, cut
 * to eight on 9 Sep 2026, with Tier 3 holding one progression and Tier 4
 * holding one. The card a reader actually opens is the Full Progression
 * card, which draws from the fourteen shared-list entries, and no Tier
 * ever contained one of them. So the ladder was gating a catalog the
 * screen no longer used. Silas retired it on 10 Sep 2026.
 *
 * A GENERATED SESSION NOW DRAWS WHAT THE CARD DRAWS: every shared-list
 * entry at every position, narrowed by the card's own "What is in play"
 * filter, spaced like flashcards. One pool, one filter — the session and
 * the card cannot come to disagree about what is in play, because they
 * read the same pref.
 *
 * THE GATE THAT STAYS is Chord Recognition's: you name the six triads by
 * ear before the app asks you to hear them move. Only the progressions
 * HALF of the old cross-submodule gate went.
 * =====================================================================
 */
import { handsFrom, type Hands } from '../../../lib/player/settings';
import { getPref } from '../../../lib/userPrefs';
import {
  LIST_RUNGS, SHARED_PROGRESSIONS, fullProgressionItemId, positionsOf,
  type ListRung,
} from './sharedList';

/** The pref the card's fold writes and a session reads. */
export const PREF_FULL_PROGRESSION_FILTER = 'fullProgressionInPlay';

/** What is in play, as the fold holds it. */
export interface InPlay {
  progressions: string[];
  positions: number[];
  rungs: ListRung[];
  hands: Hands[];
}

/** The widest possible position number on the list. */
export const ALL_POSITIONS = [1, 2, 3, 4];

export const EVERYTHING: InPlay = {
  progressions: SHARED_PROGRESSIONS.map(p => p.id),
  positions: ALL_POSITIONS,
  rungs: [...LIST_RUNGS],
  hands: ['rootless', 'root'],
};

/**
 * A stored filter, made safe to use.
 *
 * A LIST THAT NAMES NOTHING KNOWN FALLS BACK TO EVERYTHING rather than
 * to nothing: a pref written before an entry was renamed should leave a
 * reader with a card to answer, not an empty pool they cannot explain.
 */
export function sanitizeInPlay(raw: unknown): InPlay {
  const v = raw as Partial<InPlay> | null;
  const known = new Set(SHARED_PROGRESSIONS.map(p => p.id));
  const progressions = Array.isArray(v?.progressions)
    ? v!.progressions.filter(id => known.has(id)) : EVERYTHING.progressions;
  const positions = Array.isArray(v?.positions)
    ? v!.positions.filter(n => ALL_POSITIONS.includes(n)) : EVERYTHING.positions;
  const rungs = Array.isArray(v?.rungs)
    ? v!.rungs.filter(r => LIST_RUNGS.includes(r)) : EVERYTHING.rungs;
  // THE RETIRED VALUES READ AS THEIR SUCCESSORS, and are not dropped:
  // a filter saved with "One hand, root in the chord" is a filter for
  // Root in the right hand — `handsFrom`. Nothing is rewritten; the
  // next save writes the new names.
  const hands = Array.isArray(v?.hands)
    ? [...new Set((v!.hands as unknown[])
      .filter(h => h === 'both' || h === 'one' || h === 'rootless' || h === 'root')
      .map(handsFrom))]
    : EVERYTHING.hands;
  return { progressions, positions, rungs, hands };
}

/**
 * Every itemRef the filter allows.
 *
 * THE REF IS THE ENTRY AND THE POSITION, not the thickness — a reader's
 * history is per position exactly as the grid's is, and hearing
 * `major-251` from position 2 at Guide tones and at Full voicing is one
 * item heard twice. So the rungs in the filter narrow which CARDS get
 * dealt without multiplying the pool.
 */
export function fullProgressionItemRefs(inPlay: InPlay): string[] {
  const allowed = new Set(inPlay.progressions);
  const positions = new Set(inPlay.positions);
  const refs = new Set<string>();
  for (const entry of SHARED_PROGRESSIONS) {
    if (!allowed.has(entry.id)) continue;
    for (const rung of inPlay.rungs) {
      for (const position of positionsOf(entry, rung)) {
        if (!positions.has(position)) continue;
        refs.add(fullProgressionItemId(entry.id, position));
      }
    }
  }
  return [...refs];
}

/** What a generated practice session may serve from this module. */
export async function loadFullProgressionEligibleSet(): Promise<ReadonlySet<string>> {
  const inPlay = sanitizeInPlay(
    await getPref<unknown>(PREF_FULL_PROGRESSION_FILTER, EVERYTHING),
  );
  return new Set(fullProgressionItemRefs(inPlay));
}
