import { FEEL_CARD_OPTIONS } from '../drillModel';
import type { Feel } from '../../../lib/fluencyScale';

/**
 * The four ratings, drawn once for the whole app.
 *
 * =====================================================================
 * THERE WERE TWO RENDERINGS OF THE SAME FOUR WORDS.
 *
 * The panel drew full-width stacked cards from `FEEL_CARD_OPTIONS`,
 * each with a hint underneath. The strip drew small chips from
 * `FEEL_OPTIONS`. Same act, same four answers, two components — so a
 * run rated in the panel and the same run rated in the strip looked
 * like two different questions, and either could have drifted from the
 * other without anything failing.
 *
 * `tempo-source-prototype_7.html` has one `ratingChips()` used by both
 * views (lines 631 and 797). This is it.
 *
 * =====================================================================
 * THE HINT LINE WENT WITH THE CARDS, AND THAT IS INTENDED.
 *
 * "breakdowns, not flowing" under Struggled was doing work when the
 * control was a column of tall cards with room to spare. Four chips in
 * a row have no such room, and the four words have been the app's
 * vocabulary long enough to carry themselves. A hint that only fits in
 * one of the two places it is needed is a hint that has to be dropped
 * or duplicated.
 *
 * =====================================================================
 * THE SWATCH IS THE BAND'S COLOUR, not decoration. Each rating maps to
 * a rung — Struggled to Needs Work, In flow to Mastered — and the chip
 * carries the colour that rung has everywhere else in the app, so the
 * ramp reads the same on a chip as it does on a grid.
 *
 * Taken from `FEEL_CARD_OPTIONS`, which already holds it: one table
 * of the four ratings and their colours, so a fifth rating or a
 * recoloured ramp is one edit.
 * =====================================================================
 */

/** Just the swatch's fill, pulled off the card config's border class so
 *  there is no second table of the same four colours. */
const SWATCH: Record<Feel, string> = {
  1: 'bg-needswork',
  2: 'bg-developing',
  3: 'bg-fluent',
  4: 'bg-mastered',
};

interface Props {
  onRate: (feel: Feel) => void;
  /**
   * Best first, or worst first.
   *
   * The panel's rating has always read best-first and the block wrap-up
   * worst-first; both are deliberate and neither is this component's
   * call. It takes the order rather than choosing one, so a caller that
   * had a reason keeps it.
   */
  order?: 'best-first' | 'worst-first';
  /** Tighter, for a strip that has a whole session on one row. */
  dense?: boolean;
}

export default function RatingChips({
  onRate, order = 'best-first', dense = false,
}: Props) {
  const options = order === 'best-first'
    ? [...FEEL_CARD_OPTIONS].reverse()
    : FEEL_CARD_OPTIONS;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onRate(opt.value)}
          className={[
            'inline-flex items-center gap-1.5 rounded-md border font-medium',
            dense ? 'px-2 py-1 text-xs' : 'px-2.5 py-1.5 text-sm',
            opt.inactiveClass,
          ].join(' ')}
        >
          <span
            aria-hidden
            className={`w-2 h-2 rounded-sm flex-none ${SWATCH[opt.value]}`}
          />
          {opt.label}
        </button>
      ))}
    </div>
  );
}
