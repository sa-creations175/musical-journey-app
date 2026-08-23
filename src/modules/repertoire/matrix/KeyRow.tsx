import type { SongCell, SongKey, SongMatrixSection } from '../../../lib/db';
import { spellKey, type Spelling } from '../../../lib/spelling';
import HeatCell from '../../../components/HeatCell';
import { cellHeat } from './cellHeat';
import { keyDueState, type DueWindows, type KeyDueState } from './keySpacing';
import { isKeyRowEngaged } from './songLevelState';

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
  isOriginal: boolean;
  now: number;
  /** When this key is next due to be proven, or null. */
  nextDueAt?: number | null;
  dueWindows?: DueWindows;
  onCellTap?: (cellId: string) => void;
  onRunTest?: (songKeyId: string) => void;
  onLogRun?: (songKeyId: string) => void;
}

/** Shared by the header row so columns line up. */
export const KEY_LABEL_WIDTH = 'w-[4.5rem]';
export const ACTIONS_WIDTH = 'w-[5.5rem]';

export default function KeyRow({
  keyName, spelling, songKey, sections, cellsBySectionId, isOriginal,
  now, nextDueAt = null, dueWindows, onCellTap, onRunTest, onLogRun,
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
        'flex items-stretch border-b border-neutral-200 dark:border-neutral-800 last:border-b-0',
        engaged ? '' : 'bg-neutral-50/40 dark:bg-neutral-900/40',
      ].join(' ')}
    >
      <div
        className={[
          KEY_LABEL_WIDTH,
          'shrink-0 px-2 py-1 flex flex-col justify-center border-l-2',
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
            <span className="text-[8px] uppercase tracking-wide text-[#E88943]" title="due to be proven again">
              due
            </span>
          )}
          {due === 'due-soon' && (
            <span className="text-[8px] uppercase tracking-wide text-neutral-400" title="due soon">
              soon
            </span>
          )}
        </span>
      </div>

      <div className="flex-1 flex items-stretch gap-px py-px">
        {sections.map(section => {
          const cell = cellsBySectionId.get(section.id) ?? null;
          const heat = cellHeat(cell, now);
          return (
            <div key={section.id} className="flex-1 min-w-[36px]">
              <HeatCell
                fill={heat.fill}
                alpha={heat.alpha}
                bordered={heat.bordered}
                onClick={cell && onCellTap ? () => onCellTap(cell.id) : undefined}
                title={`${section.name} · ${spellKey(keyName, spelling)} — ${describeCell(cell)}`}
                ariaLabel={`${section.name} in ${spellKey(keyName, spelling)}: ${describeCell(cell)}`}
              />
            </div>
          );
        })}
      </div>

      <div className={[ACTIONS_WIDTH, 'shrink-0 flex items-center justify-end gap-1 pr-1.5'].join(' ')}>
        {showActions && onLogRun && (
          <button
            type="button"
            onClick={() => onLogRun(songKey.id)}
            title="Record one run-through of the whole song in this key. Does not unlock Solid."
            className="px-1 text-[9px] uppercase tracking-wide font-medium text-neutral-400 hover:text-fluent"
          >
            run
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
              'px-1.5 py-0.5 text-[9px] uppercase tracking-wide font-medium rounded',
              isRetest
                ? 'bg-needswork text-white hover:opacity-90'
                : keyState === 'comfortable'
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'text-neutral-400 hover:text-fluent',
            ].join(' ')}
          >
            {isRetest ? 'retest' : 'test'}
          </button>
        )}
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

/** What a cell's colour means, in words, for the tooltip and for
 *  assistive tech — the fill ramp is invisible to both. */
function describeCell(cell: SongCell | null): string {
  if (cell === null || cell.cellState === 'empty') return 'not started';
  if (cell.cellState === 'comfortable') return 'comfortable';
  if (cell.consecutiveCleanCount >= 1) {
    return `${cell.consecutiveCleanCount} of 3 clean runs in a row`;
  }
  return 'in progress';
}
