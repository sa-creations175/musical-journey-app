/**
 * A square, and the one word it says.
 *
 * =====================================================================
 * ONE WORD, NOT THREE STRIPS. The hands live in Progress Details.
 *
 * `ThreeBandCell` split every square into left / right / both, which
 * put the whole breakdown on the grid and left no room to name what the
 * square as a whole had reached. A square now answers one question —
 * where is this — and the detail below answers the other. That is what
 * makes these grids read the same way as every other module's.
 * =====================================================================
 *
 * IT TAKES A VERDICT, NOT A BAND. `Not Started` and `Started` are not
 * bands and `banding.ts` is explicit that neither may be treated as
 * one, so the type this renders is the one that can say so. They share
 * the neutral word colour for the same reason the chord panel's chip
 * does: neither is a score, and neither is a bad one.
 *
 * Not Started is the only square with no fill at all — a dashed outline,
 * because an empty square with a solid border reads as a colour that
 * failed to load.
 */
import { bandVerdictLabel, type BandVerdict } from '../../lib/spacing/banding';
import type { AccuracyBand } from '../../lib/spacing/bands';

/**
 * Fill, border and word, per band.
 *
 * The Tailwind status tokens, which is what every other S&P grid
 * already paints with. `bands.ts` carries its own `hex` per band and
 * the two sets do not agree; reconciling them is its own job and
 * deliberately not this one.
 */
const BAND_CLASS: Readonly<Record<AccuracyBand, string>> = {
  'needs-work': 'bg-needswork/15 border-needswork/45 text-needswork',
  'developing': 'bg-developing/15 border-developing/45 text-developing',
  'fluent':     'bg-fluent/15 border-fluent/45 text-fluent',
  'mastered':   'bg-mastered/15 border-mastered/45 text-mastered',
};

/** Engaged, not yet judged. A fill, so it reads as different from
 *  untouched, but no band colour — it has not earned one. */
const STARTED_CLASS =
  'bg-neutral-200/70 dark:bg-neutral-700/60 border-neutral-300 '
  + 'dark:border-neutral-600 text-neutral-600 dark:text-neutral-300';

const NOT_STARTED_CLASS =
  'border-dashed border-neutral-300 dark:border-neutral-700 '
  + 'text-neutral-400 dark:text-neutral-500';

/**
 * Fill, border and word colour for a verdict.
 *
 * Exported so a legend swatch is painted by the same lookup the square
 * is, rather than by a second copy that drifts the first time one of
 * them is retuned.
 */
export function bandCellClasses(verdict: BandVerdict): string {
  if (verdict.kind === 'band') return BAND_CLASS[verdict.band];
  return verdict.kind === 'started' ? STARTED_CLASS : NOT_STARTED_CLASS;
}

export interface BandCellProps {
  verdict: BandVerdict;
  /** Full sentence for the tooltip and screen readers. The square's
   *  own word is only half of what a cell means — the caller knows
   *  which chord, which key. */
  title: string;
  onClick?: () => void;
}

export default function BandCell({ verdict, title, onClick }: BandCellProps) {
  const base =
    'w-full min-h-[3.1rem] px-0.5 mx-0.5 my-0.5 rounded-md border '
    + 'flex items-center justify-center text-center '
    + 'text-[10px] font-semibold leading-tight tracking-tight '
    // A square is ~56px wide and "Developing" is one word wider than
    // that. It wraps rather than overflowing; `min-h` leaves room for
    // the second line so a two-line square is not taller than a
    // one-line one.
    + 'break-words hyphens-auto '
    + 'transition focus:outline-none focus:ring-2 focus:ring-fluent/50';

  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      {...(onClick ? { onClick, type: 'button' as const } : {})}
      title={title}
      aria-label={title}
      className={`${base} ${bandCellClasses(verdict)} ${onClick ? 'hover:brightness-95' : ''}`}
    >
      {bandVerdictLabel(verdict)}
    </Tag>
  );
}
