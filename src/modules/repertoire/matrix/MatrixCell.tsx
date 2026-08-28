import type { BandVerdict } from '../../../lib/spacing/banding';
import { TIER_LABEL } from '../../../lib/tier';

/**
 * One section in one key, drawn as a filled tile with its band word
 * inside it.
 *
 * =====================================================================
 * THIS REPLACES THE HEAT RAMP, and the reason is not aesthetic.
 *
 * `cellHeat` ramped on `consecutiveCleanCount` — how far along a
 * three-clean-runs streak a cell had got. That gate is retired, the
 * field it read is deleted in 4d, and a band is a STEP rather than a
 * DISTANCE. There is nothing left to ramp on: a cell is Fluent or it
 * is Developing, and there is no two-thirds-of-the-way-to-Fluent.
 *
 * A ramp with nothing to measure would still have painted something,
 * which is the failure mode worth avoiding — an opacity that looks
 * like progress but tracks nothing.
 *
 * COLOUR AND WORD TOGETHER, which is the option Silas chose over a
 * colour-only tile with a legend. Twelve rows deep, a legend is a
 * lookup on every glance; the word in the tile is not.
 * =====================================================================
 *
 * The colours are the app's existing band tokens — `needswork`,
 * `developing`, `fluent`, `mastered` from the Tailwind theme, the same
 * four every other module paints a band with. A band means the same
 * thing everywhere, so it cannot take a local colour.
 *
 * Not Started and Started have no band and therefore no band colour. A
 * dashed empty tile says "nothing here yet" without borrowing a colour
 * that would imply a verdict.
 */

interface Props {
  verdict: BandVerdict;
  title: string;
  ariaLabel: string;
  onClick?: () => void;
}

/** The band's fill, or null when there is no band to paint. */
function fillClassFor(verdict: BandVerdict): string | null {
  if (verdict.kind !== 'band') return null;
  switch (verdict.band) {
    case 'needs-work': return 'bg-needswork';
    case 'developing': return 'bg-developing';
    case 'fluent':     return 'bg-fluent';
    case 'mastered':   return 'bg-mastered';
  }
}

/** The word in the tile. The app's own vocabulary, from `TIER_LABEL` —
 *  the same six words the progress surfaces already use, so a band
 *  reads identically wherever it appears. */
export function bandWordFor(verdict: BandVerdict): string {
  switch (verdict.kind) {
    case 'not-started': return TIER_LABEL.untouched;
    case 'started':     return TIER_LABEL.started;
    case 'band':
      switch (verdict.band) {
        case 'needs-work': return TIER_LABEL.needsWork;
        case 'developing': return TIER_LABEL.developing;
        case 'fluent':     return TIER_LABEL.fluent;
        case 'mastered':   return TIER_LABEL.mastered;
      }
  }
}

export default function MatrixCell({ verdict, title, ariaLabel, onClick }: Props) {
  const fill = fillClassFor(verdict);
  const word = bandWordFor(verdict);
  const Tag = onClick ? 'button' : 'div';

  return (
    <Tag
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      title={title}
      aria-label={ariaLabel}
      data-testid="matrix-cell"
      data-band={verdict.kind === 'band' ? verdict.band : verdict.kind}
      className={
        'relative w-full h-9 rounded-md flex items-center justify-center '
        + 'text-[10px] font-bold tracking-tight leading-none text-center px-1 '
        + (onClick ? 'cursor-pointer hover:ring-1 hover:ring-neutral-400 ' : '')
        + 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-fluent '
        + (fill !== null
          // White on every band fill. The four tokens are dark enough
          // for it and one text colour keeps the row scanning as one
          // thing rather than four.
          ? `${fill} text-white`
          // No band, no colour. Dashed says "not filled in" the way an
          // empty form field does.
          : 'border border-dashed border-neutral-300 dark:border-neutral-600 '
            + 'text-neutral-400 dark:text-neutral-500')
      }
    >
      {word}
    </Tag>
  );
}
