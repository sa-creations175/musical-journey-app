/**
 * What the staged progression suggests you practise next.
 *
 * ─── A suggestion, and it has to read like one ───────────────────────
 *
 * This replaces a LOCK. Until 21 August 2026 the quiz filtered its
 * candidate pool through the staged-introduction gate, so free
 * practice played three of the thirty seeded chords and the three tabs
 * above foundational produced silence. The gate belongs to generated
 * sessions and now stays there; what is left of it here is advice.
 *
 * That history is why the wording carries a clause you would otherwise
 * cut. "Nothing is locked" is not reassurance for its own sake - this
 * exact tab strip WAS silently locked for three months, so the app owes
 * the statement out loud rather than leaving it to be discovered.
 *
 * ─── Two rules about what it may say ─────────────────────────────────
 *
 * IT NAMES SOMETHING YOU CAN DO. A suggestion that reports a state
 * without an action is a status line wearing a suggestion's label. The
 * headline is the instruction; the count is support for it.
 *
 * IT DEFINES "CLEARED" AND IT DEFINES "PASSED". Ten attempts at 80% is
 * not inferable from the word, and neither is the fact that an answer
 * given with a listening aid does not count toward it — an undefined
 * threshold on a screen is the thing the legibility layer exists to
 * remove, and an undefined word the app has just invented is worse.
 * The numbers are interpolated from the constants the unlock walk
 * actually gates on, so the sentence cannot describe a rule the code
 * no longer follows.
 *
 * ─── And what it may NOT say ─────────────────────────────────────────
 *
 * IT GOES QUIET PAST TIER 2, and the reason changed on 21 Aug 2026.
 *
 * It used to be that tier 3 could not be finished at all - nine of its
 * seventeen items were undrillable - so naming it would have pointed
 * at work that cannot be done. That is fixed: tier 3 is fifteen
 * playable items and the ladder now runs to 5.
 *
 * What stops it here now is SHAPE, not reachability. Tier 3 is
 * inversions, which are not a tab: they live under Foundational
 * Triads and Seventh Chords with the gear turned on. The fire rule
 * below asks "is this tab ahead of what the ladder wants", and a step
 * with no tab has no position in that comparison. Skipping it to reach
 * tiers 4 and 5 would mean recommending extensions while the ladder
 * actually wants inversions, which is worse than saying nothing.
 *
 * Extending it to name the inversions - and through them tiers 4 and
 * 5 - means a suggestion that points at a SETTING rather than a tab,
 * and a fire rule that can order a step that has no tab. That is a
 * design question rather than plumbing, and it is in the build queue.
 */
import {
  UNLOCK_MIN_ACCURACY,
  UNLOCK_MIN_ATTEMPTS,
  tierProgress,
  type ItemStats,
} from './tierUnlock';
import { itemsToClear } from '../../../lib/ratingRules';
import type { ChordRecognitionTier } from './chordRecognitionTiers';

/** The scope tabs, as the quiz's `TierFilter` names them. */
export type SuggestionTab = 'all' | 'foundational' | 'seventh' | 'dominant' | 'extensions';

/**
 * Where each tab sits in the PROGRESSION, which is not the order the
 * tabs are drawn in.
 *
 * Dominant Variations is third in the strip and last in the ladder;
 * Extensions & Colors is fourth in the strip and fourth in the ladder.
 * The comparison below is "am I ahead of what is suggested", so it has
 * to walk the ladder rather than the strip - reading the strip would
 * call Extensions ahead of Dominant, which is backwards.
 */
export const PROGRESSION_TIER_BY_TAB:
Readonly<Record<Exclude<SuggestionTab, 'all'>, ChordRecognitionTier>> = {
  foundational: 1,
  seventh: 2,
  extensions: 4,
  dominant: 5,
};

/** Tiers a suggestion may name: the two with a tab of their own AND a
 *  full set of reachable items. */
const SUGGESTABLE: ReadonlyArray<{
  tier: ChordRecognitionTier;
  tab: Exclude<SuggestionTab, 'all'>;
  /** The tier, named. The sentence is built from it — see `headlineFor`
   *  — so one wording serves whichever tier is lowest-uncleared. */
  name: string;
  why: string;
}> = [
  {
    tier: 1,
    tab: 'foundational',
    name: 'foundational triads',
    why: 'A seventh is a triad with a note added, so the triads make these '
      + 'easier to hear.',
  },
  {
    tier: 2,
    tab: 'seventh',
    name: 'seventh chords',
    why: 'Extensions and dominant variations are seventh chords with more on '
      + 'top, so the sevenths make these easier to hear.',
  },
];

/**
 * The instruction, built from the tier's name.
 *
 * ONE SENTENCE, NOT ONE PER TIER. The rule names whichever tier is
 * lowest-uncleared, so a per-tier headline would have to read correctly
 * in a position it was not written for — "The seventh chords next."
 * says "next" about a tier being named as the thing to do first.
 */
function headlineFor(name: string): string {
  return `Get solid on the ${name} first.`;
}

export interface ProgressionSuggestion {
  /** The tab the player should open. */
  tab: Exclude<SuggestionTab, 'all'>;
  cleared: number;
  total: number;
  /** The instruction. A sentence, not a fragment. */
  headline: string;
  /** Where they are, with the threshold spelled out. */
  progress: string;
  /** Why this order, in musical terms rather than procedural ones. */
  why: string;
  /** The clause that keeps this a suggestion. */
  disclaimer: string;
}

/**
 * What to suggest, given where the player is and what tab they are on.
 *
 * Null when there is nothing to say, which is most of the time:
 *
 *   · on `all` - drilling everything is not skipping anything
 *   · on the suggested tab - they are already doing it
 *   · on a tab BEHIND it - going back to review is not a mistake
 *   · past tier 2 - see the file header
 *
 * So it fires only when the player has jumped AHEAD of the ladder,
 * which is the one case where the ladder has something to add.
 */
export function progressionSuggestionFor(
  tabs: SuggestionTab | ReadonlyArray<SuggestionTab>,
  statsByItem: ReadonlyMap<string, ItemStats>,
): ProgressionSuggestion | null {
  // Multi-select: the ladder compares against the HIGHEST tier in the
  // pool, because that is how far ahead the reader has reached.
  const list = Array.isArray(tabs) ? tabs : [tabs];
  const tiers = list
    .filter((t): t is Exclude<SuggestionTab, 'all'> => t !== 'all')
    .map(t => PROGRESSION_TIER_BY_TAB[t]);
  if (tiers.length === 0) return null;
  const here = Math.max(...tiers);

  for (const step of SUGGESTABLE) {
    const { cleared, total } = tierProgress(step.tier, statsByItem);
    // IT GOES QUIET WHEN THE TIER OPENS, not when every item in it has
    // cleared. Those were the same thing until 10 Sep 2026; a tier now
    // opens at eighty per cent of its items, and a suggestion still
    // firing on the last uncleared chord would be pointing at a wall
    // that is no longer there.
    if (cleared >= itemsToClear(total)) continue;
    // =================================================================
    // WHETHER THE PREREQUISITE TIER IS ITSELF SELECTED DOES NOT MATTER.
    //
    // Selecting sevenths with triads uncleared fires this. Selecting
    // triads AND sevenths with triads still uncleared fires it too —
    // the ask is "get solid at triads", and having them in the pool is
    // not the same as being solid at them. A naive "stay quiet if it is
    // selected" would lose exactly the case a reader is most likely to
    // be in, having widened the pool rather than narrowed it.
    //
    // It goes quiet only when the lower tiers are actually cleared,
    // which the `continue` above handles.
    // =================================================================
    if (here <= step.tier) return null;
    return {
      tab: step.tab,
      cleared,
      total,
      headline: headlineFor(step.name),
      // ===============================================================
      // SILAS'S OWN SENTENCE, 10 Sep 2026, and it replaces one that was
      // half true.
      //
      // It read "80% correct", and correct is not the bar: an attempt
      // only counts toward a tier if no listening aid was taken, so a
      // reader could be at 80% correct and watch the tier stay shut.
      // "Passed" is the word, and the clause after it says what a pass
      // is — because a word the app has just invented needs defining
      // where it is first used.
      //
      // THE NUMBERS ARE INTERPOLATED, not typed, so the Settings page
      // moving them moves this sentence in the same edit.
      // ===============================================================
      progress: `You've cleared ${cleared} of ${total}; a chord clears at `
        + `${UNLOCK_MIN_ATTEMPTS} attempts with `
        + `${Math.round(UNLOCK_MIN_ACCURACY * 100)}% passed. `
        + 'A pass is a right answer with no listening aid used.',
      why: step.why,
      disclaimer: 'Nothing is locked — every tab plays whatever you pick.',
    };
  }
  return null;
}

/** The label the suggestion opens with. Kept beside the sentences it
 *  introduces so the two cannot drift. */
export const SUGGESTION_PREFIX = 'Suggestion — ';
