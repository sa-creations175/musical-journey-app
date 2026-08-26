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
