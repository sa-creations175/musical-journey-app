import type { SongCell, SongKey, SongMatrixSection } from '../../../lib/db';
import { spellKey, type Spelling } from '../../../lib/spelling';
import MatrixCell, { bandWordFor } from './MatrixCell';
import { cellVerdict } from './cellBands';
import { NOT_STARTED } from '../../../lib/spacing/banding';
import { keyDueState, type DueWindows, type KeyDueState } from './keySpacing';
import { isKeyRowEngaged } from './songLevelState';
import type { CellBands } from './cellBands';

/**
 * One key: its name, its section cells, and its two actions — on ONE
 * row.
 *
 * ---------------------------------------------------------------
 * IT USED TO TAKE TWO, AND THE WRONG ONE HAD THE WEIGHT.
 *
 * A row of small squares under the section headers, then a
 * full-width strip carrying the state badge, the section count, the
 * last-engaged date, "+ log a run" and "Test song". So the part that
 * looked like a grid was three dashes, and everything with visual
 * weight was the strip beneath it. Twelve keys read as a LIST of
 * keys with grids attached, not as a grid.
 *
 * The cells now carry the weight and the strip is gone. The two
 * actions are per-KEY, so they sit on the key's row rather than
 * inside the panel a CELL opens — burying a key-level action behind
 * a cell-level tap would make you pick an arbitrary section to reach
 * something that has nothing to do with sections.
 *
 * Roughly half the height, and the thing that looks like a grid is
 * now the thing that is one.
 * ---------------------------------------------------------------
 */

interface Props {
  keyName: string;
  spelling: Spelling;
  /** Null when no songKeys row exists for this key. */
  songKey: SongKey | null;
  sections: ReadonlyArray<SongMatrixSection>;
  cellsBySectionId: ReadonlyMap<string, SongCell>;
  /** Bands for this row's cells. Not on the cell — see cellBands.ts. */
  bands: CellBands;
  isOriginal: boolean;
  now: number;
  /** When this key is next due to be proven, or null. */
  nextDueAt?: number | null;
  dueWindows?: DueWindows;
  onCellTap?: (cellId: string) => void;
  onRunTest?: (songKeyId: string) => void;
  onLogRun?: (songKeyId: string) => void;
  /** Whether a clean run on THIS key advances anything. Defaults to
   *  false: a caller that has not worked out the answer gets no
   *  button, rather than a button that may do nothing. */
  runCounts?: boolean;
}

/**
 * Column template, shared with the header row so the cells line up
 * under their section names.
 *
 * ---------------------------------------------------------------
 * CELLS ARE CAPPED, AND THE SPACE GOES TO THE RIGHT.
 *
 * They used to be `flex-1` with a 36px floor and no ceiling, so three
 * sections across a wide card gave three cells ~400px wide — and
 * because a cell is square, that made the ROW 400px tall. Twelve of
 * those is a page.
 *
 * The floor was for tapping; there was never a target. `minmax(42px,
 * 56px)` is what the S&P grid uses, and the trailing `1fr` is what
 * absorbs the slack — so a song with three sections gets a narrow
 * grid with white space beside it rather than three enormous squares.
 * A row must not get taller because a song has FEWER sections.
 * ---------------------------------------------------------------
 */
export function gridTemplate(sectionCount: number): string {
  // WIDER THAN THE HEAT GRID WAS, because the cell now carries a
  // WORD. `minmax(42px, 56px)` fitted a square of colour and nothing
  // else; "Not Started" needs room. The trailing `1fr` still absorbs
  // the slack, and now carries the row's gate line.
  return `4.5rem repeat(${sectionCount}, minmax(5.5rem, 7rem)) auto minmax(0, 1fr)`;
}

export default function KeyRow({
  keyName, spelling, songKey, sections, cellsBySectionId, bands, isOriginal,
  now, nextDueAt = null, dueWindows, onCellTap, onRunTest, onLogRun,
  runCounts = false,
}: Props) {
  const engaged = isKeyRowEngaged(songKey);
  const keyState = songKey?.keyState ?? 'not_started';

  // THE LAPSE LIVES HERE, NOT ON A CELL. `isHeld` reads a per-key due
  // date; there is no per-cell equivalent, and inventing one would
  // create a second decay rule competing with the stage rules'.
  const due: KeyDueState | null = dueWindows
    ? keyDueState(nextDueAt, now, dueWindows)
    : null;

  const isRetest = due === 'overdue';
  const showActions = songKey !== null;

  return (
    <div
      className={[
        'grid items-stretch border-b border-neutral-200 dark:border-neutral-800 last:border-b-0',
        engaged ? '' : 'bg-neutral-50/40 dark:bg-neutral-900/40',
      ].join(' ')}
      style={{ gridTemplateColumns: gridTemplate(sections.length) }}
    >
      <div
        className={[
          'px-2 py-1 flex flex-col justify-center border-l-2',
          KEY_BORDER_BY_STATE[keyState] ?? KEY_BORDER_BY_STATE.not_started,
        ].join(' ')}
      >
        <span className="font-mono text-xs font-medium text-neutral-800 dark:text-neutral-100 leading-none">
          {spellKey(keyName, spelling)}
        </span>
        <span className="flex items-center gap-1 leading-none mt-0.5 min-h-[0.7rem]">
          {isOriginal && (
            <span className="text-[8px] uppercase tracking-wide text-neutral-400">orig</span>
          )}
          {due === 'overdue' && (
            <span className="text-[8px] uppercase tracking-wide text-needswork" title="overdue — this key no longer counts toward a rung">
              overdue
            </span>
          )}
          {due === 'due' && (
            <span className="text-[8px] uppercase tracking-wide text-[#E88943]" title="Due to Be Proven Again">
              due
            </span>
          )}
          {due === 'due-soon' && (
            <span className="text-[8px] uppercase tracking-wide text-neutral-400" title="Due Soon">
              soon
            </span>
          )}
        </span>
      </div>

      {sections.map(section => {
        const cell = cellsBySectionId.get(section.id) ?? null;
        const verdict = cell ? cellVerdict(bands, cell.id) : NOT_STARTED;
        const word = bandWordFor(verdict);
        return (
          <div key={section.id} className="p-px">
              <MatrixCell
                verdict={verdict}
                onClick={cell && onCellTap ? () => onCellTap(cell.id) : undefined}
                title={`${section.name} · the key of ${spellKey(keyName, spelling)} — ${word}`}
                ariaLabel={`${section.name} in ${spellKey(keyName, spelling)}: ${word}`}
              />
          </div>
        );
      })}

      <div className="flex items-center justify-end gap-1 px-1.5">
        {/* ---------------------------------------------------------------
            ONLY WHERE IT COUNTS.

            `runCounts` is decided by `keysWhereRunCounts`, which reads
            the same `breadthStatus` the criterion reads — so this
            button appears on exactly the keys the panel is still
            asking for, and on no others. Before Cross-key it appears
            nowhere, because a single run advances nothing there.

            The label says the whole job: one clean pass, at tempo.
            The full rule belongs in the modal that opens, which has
            room to state it; a button is not the place for it.
            --------------------------------------------------------------- */}
        {showActions && onLogRun && runCounts && (
          <button
            type="button"
            onClick={() => onLogRun(songKey.id)}
            title="Log one clean run-through of the whole song in this key, at or above your performance tempo. This is the last key-by-key requirement for Internalized status."
            className="px-1 text-[9px] whitespace-nowrap tracking-wide font-medium text-neutral-400 hover:text-fluent"
          >
            Run at Tempo · 1 Clean Pass
          </button>
        )}
        {showActions && onRunTest && (
          <button
            type="button"
            onClick={() => onRunTest(songKey.id)}
            title={isRetest
              ? 'This key is overdue. Three clean run-throughs in a row, in one sitting, restores it.'
              : 'Play the whole song in this key: three clean run-throughs in a row, in one sitting.'}
            className={[
              'px-1.5 py-0.5 text-[9px] whitespace-nowrap tracking-wide font-medium rounded',
              isRetest
                ? 'bg-needswork text-white hover:opacity-90'
                : keyState === 'comfortable'
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'text-neutral-400 hover:text-fluent',
            ].join(' ')}
          >
            {/* Named by what it is, with the shape of the work beside
                it. "test" alone was a word you had to already know. */}
            {isRetest ? 'test again · 3 clean in a row' : 'test · 3 clean in a row'}
          </button>
        )}
      </div>

      {/* THE ROW IS THE WHOLE SONG IN THIS KEY, and this is what would
          finish it. The columns beside it are its sections — a section
          on its own is the smaller claim, so the row is what names
          Comfortable status.

          It rides the template's trailing slack column, so it costs no
          layout: a song with three sections has the room, and one with
          eight does not have to find it. */}
      <div className="flex items-center px-2 min-w-0">
        <span className="text-[10px] leading-tight text-neutral-500 dark:text-neutral-400 truncate">
          Prove <b className="font-bold text-neutral-700 dark:text-neutral-200">Comfortable</b> status by 3 clean tests in a row.
        </span>
      </div>
    </div>
  );
}

const KEY_BORDER_BY_STATE: Record<string, string> = {
  solid:        'border-l-blue-500',
  comfortable:  'border-l-teal-500',
  learning:     'border-l-emerald-500',
  not_started:  'border-l-neutral-200 dark:border-l-neutral-800',
};


