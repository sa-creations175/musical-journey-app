/**
 * The standing facts about a page, in one thin row.
 *
 * =====================================================================
 * ONE SHELL, EVERY MODULE. THIS IS THE POINT OF THE FILE.
 *
 * Production grew its own tiles and Shapes & Patterns grew a card, and
 * the two looked like different products: one was a stack of tall boxes
 * in a monospace face nothing else in the app uses, the other a large
 * tinted card whose body was empty until something had been drilled.
 * A module written next month must reach for this rather than draw a
 * third.
 *
 * =====================================================================
 * WHY IT IS ONE LINE PER TILE.
 *
 * The value used to sit ABOVE its label, which is what made
 * Production's tiles about eighty pixels tall — a band of chrome above
 * the thing the page is actually for. Label first, value second, on one
 * baseline: the row costs about thirty pixels and the matrix stays
 * where the reader is looking.
 *
 * =====================================================================
 * IT MUST NOT BE MISTAKEN FOR PROGRESS DETAILS.
 *
 * That band is dark green, sits lower down, is about ONE CELL and comes
 * alive when you click one. This is standing, module-wide, and true
 * before you touch anything. So it is deliberately the lighter of the
 * two: a hairline border on the page's own background, no fill, no
 * heading. Weight is how a reader tells "context" from "answer".
 *
 * =====================================================================
 * BODY FONT, NEVER MONO. `tabular-nums` keeps figures aligned without
 * changing the face — a second typeface for four numbers is what made
 * one module read as a different app.
 * =====================================================================
 */
import type { ReactNode } from 'react';

export interface SummaryTile {
  /** Drawn in small caps. The fact's name, not a sentence. */
  label: string;
  /** The figure, bare. See `NO UNIT NOUN` in the shapes tile builder. */
  value: ReactNode;
  /**
   * An absence rather than a measurement — "never", "none yet".
   *
   * Drawn muted, so a page where nothing has happened LOOKS like one.
   * The tile still stands: a fact that disappears when it is zero makes
   * the row a different shape on every page.
   */
  muted?: boolean;
  /** Where the tile is also a door. Most are not. */
  onClick?: () => void;
  /** Distinguishes the tile in a test, and nothing else. */
  testId?: string;
}

/**
 * One line, about thirty pixels. Every class here is a whole literal —
 * a box assembled from a constant would be invisible to Tailwind's
 * scanner, emit no rule, and draw an unstyled row.
 *
 * EXPORTED so a sweep can prove nothing else draws one of these. A
 * hand-rolled copy in a fifth module would have to retype this, and
 * retyping it is what the sweep catches.
 */
export const TILE_BOX = 'inline-flex items-baseline gap-1.5 rounded-lg border '
  + 'border-black/[0.07] dark:border-white/10 px-2.5 py-1 leading-5';

export default function SummaryTiles({
  tiles,
}: {
  tiles: readonly SummaryTile[];
}) {
  if (tiles.length === 0) return null;
  return (
    <div
      className="flex flex-wrap items-center gap-2"
      data-testid="summary-tiles"
    >
      {tiles.map(tile => {
        const body = (
          <>
            <span className="text-[10px] uppercase tracking-wide text-neutral-500 shrink-0">
              {tile.label}
            </span>
            <span
              data-testid="summary-tile-value"
              className={`text-xs tabular-nums ${
                tile.muted
                  ? 'text-neutral-400'
                  : 'text-neutral-700 dark:text-neutral-200'
              }`}
            >
              {tile.value}
            </span>
          </>
        );
        const shared = {
          'data-testid': tile.testId ?? 'summary-tile',
          'data-label': tile.label,
          'data-muted': tile.muted ? 'true' : 'false',
        };
        return tile.onClick ? (
          <button
            key={tile.label}
            type="button"
            onClick={tile.onClick}
            className={`${TILE_BOX} text-left hover:border-neutral-300 dark:hover:border-neutral-600 transition-colors`}
            {...shared}
          >
            {body}
          </button>
        ) : (
          <div key={tile.label} className={TILE_BOX} {...shared}>
            {body}
          </div>
        );
      })}
    </div>
  );
}
