/**
 * What a colour means on the phone dashboard.
 *
 * =====================================================================
 * THE APP'S OWN TIERS, WITH THE APP'S OWN NAMES.
 *
 * The desktop table speaks `Band` — four colours of its own, built for
 * a screen where a number sits beside every swatch. The phone speaks
 * `Tier`, which is what every other surface in the app already speaks:
 * the same seven states, the same colours, the same words. A reader who
 * has learned "fluent" on a module home should not have to learn a
 * second vocabulary for the same fact on a smaller screen.
 *
 * Nothing here invents a name. `TIER_LABEL` is the source for all of
 * them but one.
 * =====================================================================
 *
 * THE ONE EXCEPTION, and it is a real gap rather than a preference.
 * Under five attempts there is no grade — `computeTier` refuses to
 * produce one, which is the whole point of the threshold. The app calls
 * those two states `started` and `not started`, which describe what the
 * READER did. On a legend explaining colour, the question is what the
 * COLOUR claims, and the answer for both is: nothing yet. So they share
 * one entry, with both swatches, saying so.
 *
 * Two swatches on one row rather than two rows with one word each,
 * because a legend with two entries meaning the same thing invites the
 * reader to look for the difference.
 */
import { TIER_BAR_CLASS, TIER_LABEL, type Tier } from '../../../lib/tier';

export interface TierLegendEntry {
  /** One or two swatch classes. Two only for the ungraded pair. */
  swatches: string[];
  label: string;
  /** The tiers this entry accounts for, so a test can prove the legend
   *  covers every colour the screen can draw. */
  tiers: Tier[];
}

/** The approved wording for the state that has no grade yet. */
export const UNGRADED_LABEL = 'not enough yet to say';

/**
 * Worst first, which is the order the eye should travel on a screen
 * whose job is finding what needs work.
 */
const GRADED_ORDER: ReadonlyArray<Tier> = [
  'needsWork', 'developing', 'fluent', 'mastered', 'stale',
];

const UNGRADED_ORDER: ReadonlyArray<Tier> = ['started', 'untouched'];

export const TIER_LEGEND: ReadonlyArray<TierLegendEntry> = [
  {
    swatches: UNGRADED_ORDER.map(t => TIER_BAR_CLASS[t]),
    label: UNGRADED_LABEL,
    tiers: [...UNGRADED_ORDER],
  },
  ...GRADED_ORDER.map(tier => ({
    swatches: [TIER_BAR_CLASS[tier]],
    label: TIER_LABEL[tier],
    tiers: [tier],
  })),
];

/**
 * How a tier reads in a row's own text.
 *
 * The same words as the legend, so a row and the key above it cannot
 * name one colour two ways — and never a colour on its own: every row
 * carries its numbers as text beside this.
 */
export function tierWord(tier: Tier): string {
  return TIER_LEGEND.find(e => e.tiers.includes(tier))!.label;
}

// =====================================================================
// The card footer's own reading of the same colours
// =====================================================================

/**
 * =====================================================================
 * THE CARD FOOTER SPLITS THE UNGRADED PAIR. THE LEGEND ABOVE DOES NOT.
 *
 * This reverses, FOR THIS ONE SURFACE, the decision written at the top
 * of this file. Both readings are right, because the two surfaces are
 * answering different questions.
 *
 * THE LEGEND explains what a COLOUR claims. Under five attempts there
 * is no grade, so grey and pale blue both claim nothing yet, and one
 * entry with two swatches says exactly that.
 *
 * THE FOOTER counts what is ON THIS CARD, and every entry in it now
 * carries its own swatch so the footer doubles as the key for the strip
 * directly above it. Under that rule a single entry wearing two
 * different swatches reads as a rendering fault, not as a nuance — and
 * the two states genuinely are different facts: `untouched` is zero
 * attempts, `started` is real work that has not reached the line. A
 * strip showing two greys and one pale blue while the footer says
 * "3 not enough yet to say" is the footer failing to explain the
 * picture it sits under.
 *
 * NOTHING ELSE MOVES. `tierWord` and `TIER_LEGEND` are untouched, so
 * the skills list, the strip cell's own label and the cell popover all
 * read exactly what they read before.
 *
 * NO NEW WORDS. Every entry is named by `TIER_LABEL` — the app's own
 * six status words plus Stale — which is already what this footer
 * prints for every graded tier. Splitting the pair therefore adds
 * **Not Started** and **Started**, both of which the app already says
 * out loud everywhere else, rather than inventing a seventh and eighth
 * name for states that have them.
 * =====================================================================
 */
export interface FooterEntry {
  tier: Tier;
  /** The class the strip paints this tier with. Same source, so the
   *  square in the footer cannot drift from the squares above it. */
  swatch: string;
  label: string;
  count: number;
  /**
   * Whether any cell of this tier survives the active filter.
   *
   * Drives the dim, on the same rule the strip uses: a colour still
   * present among the matches stays at full strength. The COUNT never
   * moves — the footer counts the whole strip, because the strip keeps
   * its whole length.
   */
  matched: boolean;
}

/**
 * The footer's entries, in the order their colours first appear on the
 * strip — so the key reads left to right in step with the picture.
 *
 * A tier with no cell on this card produces no entry. A zero is the
 * absence of a thing, and printing it makes the line longer to say
 * nothing happened.
 */
export function footerEntries(
  cells: ReadonlyArray<{ tier: Tier; matched: boolean }>,
): FooterEntry[] {
  const out: FooterEntry[] = [];
  const byTier = new Map<Tier, FooterEntry>();
  for (const cell of cells) {
    const found = byTier.get(cell.tier);
    if (found === undefined) {
      const entry: FooterEntry = {
        tier: cell.tier,
        swatch: TIER_BAR_CLASS[cell.tier],
        label: TIER_LABEL[cell.tier],
        count: 1,
        matched: cell.matched,
      };
      byTier.set(cell.tier, entry);
      out.push(entry);
    } else {
      found.count += 1;
      found.matched = found.matched || cell.matched;
    }
  }
  return out;
}
