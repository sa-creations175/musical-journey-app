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

/**
 * How narrow a status tile may get.
 *
 * "Developing" is the longest single word any of the six statuses
 * contains, and a tile narrower than it either hyphenates — which is
 * what the voice-leading grid was doing to "Not Started" — or
 * overflows. Twelve keys across a phone gave each cell a twelfth of the
 * width, so the floor is the fix and the layout toggle is the relief.
 *
 * A WHOLE CLASS, WRITTEN OUT, NOT A VALUE TO INTERPOLATE. Tailwind
 * scans source as TEXT: `min-w-[${SOMETHING}]` is never the class
 * `min-w-[4.75rem]` to the scanner, so the rule is never emitted and
 * the floor silently does not exist. That is the same shape as the
 * Started fill that resolved to nothing, and it is why this is a class
 * and not a length.
 */
export const GRID_CELL_MIN = 'min-w-[4.75rem]';

export interface BandCellProps {
  verdict: BandVerdict;
  /** Ringed, because Progress Details below is telling THIS cell's
   *  story. The other two grids ring their picked cell the same way. */
  selected?: boolean;
  /** Set in the ACROSS layouts, where the key is not written down the
   *  side and the tile is the only place it can go. */
  keyLabel?: string;
  /** Full sentence for the tooltip and screen readers. The square's
   *  own word is only half of what a cell means — the caller knows
   *  which chord, which key. */
  title: string;
  onClick?: () => void;
}

export default function BandCell({
  verdict, title, selected = false, keyLabel, onClick,
}: BandCellProps) {
  // NO `border` IN THE BASE. A solid fill has no outline, and Not
  // Started brings its own dashed one — a shared border class would
  // draw a ring around every filled square.
  const base =
    'w-full min-h-[3.1rem] px-0.5 mx-0.5 my-0.5 rounded-md '
    + 'flex items-center justify-center text-center '
    + 'text-[10px] font-semibold leading-tight tracking-tight '
      // NO HYPHENATION, EVER. `hyphens-auto` on a ~56px square broke
    // "Not Started" into "Not Start-ed" in every cell of the
    // voice-leading grid — a status word split across a hyphen is a
    // different word. The cell is wide enough for the longest single
    // word instead, and a two-word status wraps at its space; `min-h`
    // leaves room for the second line so a two-line square is not
    // taller than a one-line one.
    + `${GRID_CELL_MIN} `
    + 'transition focus:outline-none focus:ring-2 focus:ring-fluent/50';

  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      {...(onClick ? { onClick, type: 'button' as const } : {})}
      /* A HANDLE, and only that. Every grid cell in the module answers
         to one name so a test can press one without knowing which grid
         drew it. */
      data-testid="band-cell"
      title={title}
      aria-label={title}
      className={[
        base,
        bandCellClasses(verdict),
        onClick ? 'hover:brightness-95' : '',
        selected ? 'ring-2 ring-fluent ring-offset-1' : '',
      ].join(' ')}
    >
      <span className="block">
        {keyLabel && (
          <span className="block font-mono font-normal opacity-70">{keyLabel}</span>
        )}
        {bandVerdictLabel(verdict)}
      </span>
    </Tag>
  );
}
