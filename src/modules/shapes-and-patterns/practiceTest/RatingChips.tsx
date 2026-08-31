import { FEEL_CARD_OPTIONS } from '../drillModel';
import type { Feel } from '../../../lib/fluencyScale';
import { feelColour } from '../../../lib/spacing/statusColour';

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

/** Just the swatch's fill, from the one source — so a chip and the
 *  grid square it will produce cannot be two colours. */
const SWATCH: Record<Feel, string> = {
  1: feelColour(1).swatch,
  2: feelColour(2).swatch,
  3: feelColour(3).swatch,
  4: feelColour(4).swatch,
};

interface Props {
  onRate: (feel: Feel) => void;
  /**
   * Present but not yet answerable.
   *
   * =====================================================================
   * SHOWN INERT RATHER THAN HIDDEN, because the question is not absent
   * — it is next. A rating box that appeared only once the run ended
   * would be a control arriving out of nowhere at the moment you were
   * least expecting to read something new.
   *
   * Rating is not how a run ends. One tap should not mean both "I
   * finished" and "here is how it went", so the chips stay dark until
   * the run has been ended on purpose.
   * =====================================================================
   */
  disabled?: boolean;
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
  onRate, order = 'best-first', dense = false, disabled = false,
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
          disabled={disabled}
          className={[
            'inline-flex items-center gap-1.5 rounded-md border font-medium',
            dense ? 'px-2 py-1 text-xs' : 'px-2.5 py-1.5 text-sm',
            disabled
              // Grey, not merely faded: the colour is what makes a chip
              // look answerable, so it is the colour that goes.
              ? 'border-neutral-200 dark:border-neutral-700 text-neutral-400 cursor-not-allowed'
              : opt.inactiveClass,
          ].join(' ')}
        >
          <span
            aria-hidden
            className={[
              'w-2 h-2 rounded-sm flex-none',
              disabled ? 'bg-neutral-300 dark:bg-neutral-600' : SWATCH[opt.value],
            ].join(' ')}
          />
          {opt.label}
        </button>
      ))}
    </div>
  );
}
