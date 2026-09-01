/**
 * Every S&P grid is the same grid: a second axis against the twelve
 * keys. This draws it, and offers the three ways to turn it.
 *
 * =====================================================================
 * ONE IMPLEMENTATION, NOT THREE COPIES.
 *
 * Scales laid its keys down the left and its scale kinds across the
 * top, and offered a control to flip that. Chord shapes laid its
 * qualities down the left and its keys across, and offered nothing.
 * Voice leading did the same as chord shapes, and its cells came out so
 * narrow that "Not Started" hyphenated in every one of them.
 *
 * Three grids, one shape — rows × keys — and only one of them could be
 * turned. So the turning lives here and all three read it.
 *
 * =====================================================================
 * ALL THREE LAYOUTS MEAN SOMETHING ON ALL THREE GRIDS, so none is
 * dropped. A layout is which axis runs down the side; every grid has
 * both axes and both are worth reading down. What differs is only how
 * many columns each produces, and that is what the reader is choosing
 * between.
 *
 * KEYS DOWN THE LEFT IS THE DEFAULT EVERYWHERE. Twelve keys across
 * gives each cell a twelfth of the width, which is where the
 * hyphenation came from; the other axis is two to twelve columns and
 * the words fit.
 * =====================================================================
 */
import type { ReactNode } from 'react';
import { spellKey, type Spelling } from '../../lib/spelling';
import { GRID_GUTTER } from './BandCell';

/** Which axis runs down the side. */
export type Layout = 'keysdown' | 'wrap66' | 'across12';

export const DEFAULT_LAYOUT: Layout = 'keysdown';

/** The control's three options, in the order it draws them. Approved
 *  copy, from the scales page. */
export const LAYOUTS: ReadonlyArray<[Layout, string]> = [
  ['keysdown', 'Keys down the left'],
  ['wrap66', '6 + 6 across'],
  ['across12', '12 across'],
];

/** One row of the grid's second axis — a scale kind, a chord quality,
 *  a voice-leading sub-dimension. */
export interface KeyedGridRow {
  rowKey: string;
  label: string;
  /** A second line under the label, where the name alone was not
   *  enough. Voice leading's Extended Voicings is the one that has
   *  one. */
  hint?: string;
}

interface Props {
  rows: ReadonlyArray<KeyedGridRow>;
  keys: readonly string[];
  layout: Layout;
  spelling: Spelling;
  /**
   * One tile.
   *
   * `showKeyLabel` is true in the ACROSS layouts, where the key is not
   * written down the side and the tile is the only place it can go.
   * Returning null leaves the slot empty — a row that has no cell in
   * some key, which the pentatonic rows do not but a future axis might.
   */
  renderCell: (
    rowKey: string, keyName: string, showKeyLabel: boolean,
  ) => ReactNode;
}

export default function KeyedGrid({
  rows, keys, layout, spelling, renderCell,
}: Props) {
  if (layout === 'keysdown') {
    return (
      <div className="overflow-x-auto">
        <table className="border-collapse text-[11px]">
          <thead>
            <tr>
              {/* THE GUTTER, PINNED. Both this and the body's key cell
                  carry the width, so the column cannot be sized by
                  whichever key name happens to be longest. */}
              <th
                className="p-1"
                style={{ width: GRID_GUTTER }}
                data-testid="grid-gutter"
              />
              {rows.map(r => (
                <th
                  key={r.rowKey}
                  className="p-1 font-medium text-left text-neutral-500 align-bottom"
                >
                  <span className="block">{r.label}</span>
                  {r.hint && (
                    <span className="block text-[10px] font-normal text-neutral-400">
                      {r.hint}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {keys.map(key => (
              <tr key={key}>
                {/* LEFT-JUSTIFIED IN A FIXED GUTTER. Right-aligning
                    them made a one-character key start further right
                    than a two-character one, so the column's own left
                    edge wobbled down the page. Every name begins at the
                    same x now; the gap to the tile varies instead,
                    which is the accidental's business and not a
                    misalignment. */}
                <th
                  className="p-1 pl-0 font-mono font-normal text-neutral-500 text-left"
                  style={{ width: GRID_GUTTER }}
                  data-testid="grid-gutter"
                >
                  {spellKey(key, spelling)}
                </th>
                {rows.map(r => (
                  <td key={r.rowKey} className="p-0.5">
                    {renderCell(r.rowKey, key, false)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // ACROSS: the keys run left to right. `wrap66` breaks them into two
  // rows of six so twelve columns fit a narrow screen; `across12`
  // keeps all twelve on one line.
  const chunks = layout === 'wrap66'
    ? [keys.slice(0, 6), keys.slice(6)]
    : [keys];

  return (
    <div className="space-y-2 overflow-x-auto">
      {rows.map(r => (
        <div key={r.rowKey} className="space-y-1">
          <div className="text-[11px] font-medium text-neutral-500">
            {r.label}
            {r.hint && (
              <span className="ml-1.5 font-normal text-neutral-400">{r.hint}</span>
            )}
          </div>
          {chunks.map((chunk, ci) => (
            <div key={ci} className="flex gap-1 flex-wrap">
              {chunk.map(key => (
                <span key={key} className="contents">
                  {renderCell(r.rowKey, key, true)}
                </span>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * The three ways to turn a grid, drawn once.
 *
 * A CONTROL THAT DOES NOTHING IS WORSE THAN NO CONTROL — that is what
 * the Furthest toggle was before it was fixed — so this is only ever
 * rendered where all three options change what is on screen, which is
 * everywhere it is rendered.
 */
export function LayoutToggle({ layout, onChange }: {
  layout: Layout;
  onChange: (next: Layout) => void;
}) {
  return (
    <>
      <span className="uppercase tracking-wider font-semibold text-neutral-400">
        Keys
      </span>
      {LAYOUTS.map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          aria-pressed={layout === id}
          data-testid="layout-toggle"
          className={[
            'px-2 py-1 rounded-md border',
            layout === id
              ? 'bg-fluent text-white border-fluent font-semibold'
              : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-fluent',
          ].join(' ')}
        >
          {label}
        </button>
      ))}
    </>
  );
}
