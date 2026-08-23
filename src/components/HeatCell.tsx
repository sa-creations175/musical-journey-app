import type { CSSProperties, ReactNode } from 'react';

/**
 * One square in a heat grid — the shared visual language, and nothing
 * else.
 *
 * ---------------------------------------------------------------
 * EXTRACTED FROM `HeatGrid`, DELIBERATELY NOT REUSING IT.
 *
 * `HeatGrid` is a data pipeline, not a presentational component: it
 * queries `drillSkills`, `drillTypes` and the S&P slice of
 * `spacingState`, builds `SkillDescriptor`s, owns two modals, and is
 * keyed on quality × key. Threading matrix data (section × key, from
 * entirely different tables) through that interface would mean
 * inverting every one of those, and the seam would leak.
 *
 * What the two grids genuinely share is how a cell LOOKS: one hue,
 * opacity carrying progress, a second multiplier carrying staleness,
 * corner dots for flags. That is this file. Two grids can now agree
 * on a visual language without either pretending to be the other.
 * ---------------------------------------------------------------
 *
 * TWO MULTIPLIED AXES, because they answer different questions and
 * both matter at once. `fill` is how far this cell has got; `alpha` is
 * how long ago. A cell that was finished and then abandoned has to
 * read differently from one that was never started, and differently
 * again from one finished yesterday — one axis cannot say that.
 */

export interface HeatCellProps {
  /** 0–1. How far this cell has got. */
  fill: number;
  /** 0–1. Freshness multiplier; stale cells desaturate. */
  alpha: number;
  /** Base hue as `r, g, b`. Defaults to the app's fluent green. */
  rgb?: string;
  /**
   * A threshold has been crossed — draw a border as well as the fill.
   *
   * Opacity alone reads as a gradient, and some states are not points
   * on one. "Three clean run-throughs in a row" is a different KIND of
   * fact from two, and a cell that merely looks slightly darker
   * undersells it.
   */
  bordered?: boolean;
  onClick?: () => void;
  title?: string;
  ariaLabel?: string;
  /** Corner flags, badges — anything drawn over the fill. */
  children?: ReactNode;
}

const DEFAULT_RGB = '29, 158, 117';

export default function HeatCell({
  fill, alpha, rgb = DEFAULT_RGB, bordered, onClick, title, ariaLabel, children,
}: HeatCellProps) {
  const opacity = clamp01(fill) * clamp01(alpha);
  const style: CSSProperties = { backgroundColor: `rgba(${rgb}, ${opacity})` };
  if (bordered) style.borderColor = `rgba(${rgb}, 0.9)`;

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      className={[
        'relative aspect-square w-full rounded-sm transition',
        'hover:ring-2 hover:ring-fluent/50 focus:outline-none focus:ring-2 focus:ring-fluent',
        bordered
          ? 'border-2'
          : 'border border-neutral-200/60 dark:border-neutral-800/60',
      ].join(' ')}
      style={style}
    >
      {children}
    </button>
  );
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}
