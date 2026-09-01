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
 * one, so the type this renders is the one that can say so.
 *
 * Not Started is the only square with no fill at all — a dashed outline,
 * because an empty square with a solid border reads as a colour that
 * failed to load.
 */
import { bandVerdictLabel, type BandVerdict } from '../../lib/spacing/banding';
import { statusColour } from '../../lib/spacing/statusColour';
import { statusKeyForVerdict } from '../../lib/spacing/verdictColour';

/**
 * Fill and word, per verdict — from the one source.
 *
 * =====================================================================
 * IT FILLED AT 15% WITH A COLOURED WORD, AND IT WAS BARELY VISIBLE.
 *
 * The song matrix filled the same four bands SOLID with white text, so
 * one status word had two weights depending on which screen you were
 * on: the matrix shouted and these three grids whispered. The walked
 * scales prototype fills solid too.
 *
 * Solid, from `statusColour`, which every other surface now reads.
 * Started gets the palette's light blue rather than the grey it used to
 * take — grey was this grid's own invention and made the same word read
 * blue on a song page and grey here.
 * =====================================================================
 */
export function bandCellClasses(verdict: BandVerdict): string {
  return statusColour(statusKeyForVerdict(verdict)).fill;
}

/**
 * The left gutter every grid in this module reserves for its row
 * labels.
 *
 * =====================================================================
 * ONE WIDTH, SO EVERY TILE STARTS AT THE SAME X.
 *
 * The scales grid put the key names in a content-sized table column, so
 * the gutter was as wide as whatever happened to be in it — and a two
 * character name with a flat sign is wider than a one character one, so
 * the tiles beside them sat at different distances and the left edge of
 * the grid wobbled. The voice-leading grid asked for
 * `minmax(160px, 200px)`, which is a forty-pixel range for the same
 * reason. The chord grid sized to its longest quality name.
 *
 * So three grids had three answers and none of them was stable. This
 * is the one answer: a fixed width, wide enough for the longest row
 * label any of them carries, with the label aligned inside it rather
 * than deciding it. The three pages line up with each other as well as
 * within themselves.
 *
 * A REM, NOT A CLASS, because two of the three set it through
 * `gridTemplateColumns` and one through a `<th>` — one value spelled
 * two ways is where they drift back apart.
 * =====================================================================
 */
export const GRID_GUTTER = '10rem';

export interface BandCellProps {
  verdict: BandVerdict;
  /** Ringed, because Progress Details below is telling THIS cell's
   *  story. The other two grids ring their picked cell the same way. */
  selected?: boolean;
  /** Full sentence for the tooltip and screen readers. The square's
   *  own word is only half of what a cell means — the caller knows
   *  which chord, which key. */
  title: string;
  onClick?: () => void;
}

export default function BandCell({
  verdict, title, selected = false, onClick,
}: BandCellProps) {
  // NO `border` IN THE BASE. A solid fill has no outline, and Not
  // Started brings its own dashed one — a shared border class would
  // draw a ring around every filled square.
  const base =
    'w-full min-h-[3.1rem] px-0.5 mx-0.5 my-0.5 rounded-md '
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
      className={[
        base,
        bandCellClasses(verdict),
        onClick ? 'hover:brightness-95' : '',
        selected ? 'ring-2 ring-fluent ring-offset-1' : '',
      ].join(' ')}
    >
      {bandVerdictLabel(verdict)}
    </Tag>
  );
}
