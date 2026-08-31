/**
 * How recently you touched it, as a LENGTH.
 *
 * =====================================================================
 * IT WAS A COLOURED DOT, AND THE COLOURS WERE STATUSES.
 *
 * The song card painted freshness green, amber, orange or red — three
 * of them borrowed straight from the status palette. So an amber dot
 * sat beside amber cells meaning something else entirely, and a red dot
 * said "warning" about nothing worse than a fortnight since you last
 * played something.
 *
 * `bands.ts` has always said freshness "does not change a band, does
 * not change a colour, and does not feed the schedule". This is that
 * sentence drawn: `FRESHNESS_LADDER`'s six rungs as a bar, in ONE
 * NEUTRAL — full width today, one sixth beyond four weeks.
 *
 * =====================================================================
 * ONE NEUTRAL, AND NOT A RAMP OF THEM.
 *
 * The length already carries the whole reading. Darkening a stale bar
 * would add a second encoding of the fact the width states, and the
 * darker end of a neutral ramp is where "this is bad" starts being
 * implied again — which is the thing the colours were doing wrong.
 * =====================================================================
 */
const SIXTHS = 6;

export interface FreshnessBarProps {
  /**
   * How full, out of six — from `freshnessSixthsFor`.
   *
   * THE AGE IS COMPUTED BY THE CALLER, not here. A component that read
   * the clock during render would give an unstable answer on a re-paint
   * for no reason, and the list already derives every other
   * time-dependent value a card shows — the "last practised" label
   * beside this bar among them.
   */
  sixths: number;
  /** The whole sentence for the tooltip and screen readers. A bar with
   *  no words is a bar nobody can ask about; the caller knows how to
   *  say when this was. */
  title: string;
  className?: string;
}

export default function FreshnessBar({
  sixths, title, className = '',
}: FreshnessBarProps) {
  const filled = Math.max(1, Math.min(SIXTHS, Math.round(sixths)));
  return (
    <span
      // A `title` and an `aria-label` rather than text: the bar says
      // one thing and the words for it already exist on the card.
      title={title}
      aria-label={title}
      data-testid="freshness-bar"
      data-sixths={filled}
      className={`inline-block h-1 w-6 rounded-full overflow-hidden align-middle
        bg-neutral-200 dark:bg-neutral-700 ${className}`}
    >
      <span
        aria-hidden
        className="block h-full rounded-full bg-neutral-500 dark:bg-neutral-400"
        style={{ width: `${(filled / SIXTHS) * 100}%` }}
      />
    </span>
  );
}
