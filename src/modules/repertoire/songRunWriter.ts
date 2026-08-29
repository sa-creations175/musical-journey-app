import { db, type SongCell, type SongCellRunThrough, type SongKey } from '../../lib/db';
import {
  applyAttemptsToCell,
  applyAttemptsToKey,
  computeKeyStateFromCells,
  type AttemptDraft,
} from './matrix/cellRollup';
import { recordKeyProving } from './matrix/proveKey';
import { loadCellBands } from './matrix/cellBands';

/**
 * What a song run writes, everywhere it has to land.
 *
 * =====================================================================
 * THE SHELL'S WRITER WAS MISSING THREE THINGS `CellPanel` DOES.
 *
 * `songSurface.write()` records the band reps — the `songCell:` rating
 * and the `songKey:` clock — and stops there. `CellPanel`'s save goes
 * through `saveAttemptsAndRollup`, which also:
 *
 *   1. inserts a `songCellRunThroughs` row — the run log, with the
 *      tempo it was played at. Without it a run happened and left no
 *      trace anyone can read back.
 *   2. moves the cell's `lastRunAt` and `lastEngagedAt`.
 *   3. RECOMPUTES `keyState` FROM THE CELLS. This is the one that does
 *      not announce itself: `keyState` is a stored value derived from
 *      the cells' bands, and nothing else recomputes it. Swap the panel
 *      without carrying this and every key row freezes at whatever it
 *      said the day the swap landed — permanently, and silently,
 *      because a frozen value looks exactly like a correct one.
 *
 * So this exists, and the swap cannot happen without it.
 *
 * =====================================================================
 * IT REUSES THE ROLLUP RATHER THAN REIMPLEMENTING IT.
 *
 * `applyAttemptsToCell` and `computeKeyStateFromCells` are called here,
 * not copied. The rules they encode — what a run row looks like, what
 * `cellState` is pinned to and why, when a key is comfortable — are
 * decisions with long comments attached, and a second copy of them is
 * two answers to one question waiting to disagree.
 *
 * What differs is the SHAPE OF THE CALL, and only that. `CellPanel`
 * saves a batch of attempts when the modal closes; the shell rates each
 * run as it finishes. So this takes one run and passes a single-element
 * array. Same rules, one at a time.
 *
 * =====================================================================
 * NEVER TWO WRITERS OF `songCells`.
 *
 * When the shell takes over a surface, `CellPanel` stops writing for
 * it. Both writing would mean two `lastRunAt` values racing on one row,
 * and the loser is whichever transaction commits second — which is not
 * a rule, it is a coin toss.
 * =====================================================================
 */

export interface SongRunWrite {
  /** The cells this run covered. One for a section run; every section
   *  of the key for a whole-song run. */
  cellIds: readonly string[];
  /** The song-and-key row these cells belong to. */
  songKeyId: string;
  /** How the run went, and at what tempo. Null tempo is a run played
   *  with the metronome silent — a legitimate stored value. */
  attempt: AttemptDraft;
  /** The song's stated tempo, for the run row's gate relevance. */
  performanceTempo: number | null;
  /** How many sections the key is expected to have, so `keyState` can
   *  tell "not all comfortable" from "not all present". */
  expectedSectionCount: number;
  /** The timed sitting this run happened inside, when there is one. */
  practiceLogId?: string | null;
  now?: number;
}

/**
 * Write one run: its rows, its cells, and the key state they imply.
 *
 * ONE TRANSACTION over all three tables, for the reason
 * `saveAttemptsAndRollup` gives: the matrix must never see a state
 * where the run rows landed and the cells did not.
 *
 * THE BANDS ARE READ INSIDE, AFTER the caller has recorded the rating.
 * `keyState` is derived from bands, bands live in `spacingState`, and a
 * band read before the rating was written would compute the key from
 * the run before this one. The caller's ordering is load-bearing and is
 * stated on `songSurface.write`.
 */
export async function writeSongRun(args: SongRunWrite): Promise<void> {
  const now = args.now ?? Date.now();

  const cells = await db.songCells.bulkGet([...args.cellIds]);
  const present = cells.filter((c): c is SongCell => c !== undefined);
  if (present.length === 0) return;

  const songKey = await db.songKeys.get(args.songKeyId);
  if (songKey === undefined) return;

  // Every cell of the key, not just the covered ones: `keyState` is a
  // statement about the whole key, so it cannot be computed from a
  // subset. A whole-song run covers them all; a section run covers one
  // and still moves the key it belongs to.
  const siblings = await db.songCells
    .where('songKeyId').equals(args.songKeyId).toArray();

  const updatedCells: SongCell[] = [];
  const runRows: SongCellRunThrough[] = [];
  for (const cell of present) {
    const { updatedCell, runThroughRows } = applyAttemptsToCell(
      cell,
      [args.attempt],
      // THE NOTE IS NOT THE CELL'S. The shell's session note goes to
      // the practice log, where a note about a sitting belongs. Passing
      // the cell's own value through leaves it exactly as it was.
      cell.notes ?? null,
      null,
      false,
      args.performanceTempo,
      now,
      args.practiceLogId ?? null,
    );
    updatedCells.push(updatedCell);
    runRows.push(...runThroughRows);
  }

  const byId = new Map(updatedCells.map(c => [c.id, c]));
  const rolledSiblings = siblings.map(c => byId.get(c.id) ?? c);

  const bands = await loadCellBands(rolledSiblings.map(c => c.id));
  const nextKeyState = computeKeyStateFromCells(
    rolledSiblings,
    args.expectedSectionCount,
    songKey.wholeSongTestPassedAt,
    bands,
  );

  const updatedKey: SongKey = {
    ...songKey,
    keyState: nextKeyState,
    // Cleared on every touch, exactly as the cell path does it, so a
    // row still carrying a pre-retirement decay value is emptied the
    // next time anything happens to it.
    solidDecayState: null,
    isRetestRecommended: false,
    lastDecayCheckAt: now,
    lastEngagedAt: now,
    updatedAt: now,
  };

  await db.transaction(
    'rw',
    [db.songCells, db.songCellRunThroughs, db.songKeys],
    async () => {
      if (runRows.length > 0) await db.songCellRunThroughs.bulkAdd(runRows);
      await db.songCells.bulkPut(updatedCells);
      await db.songKeys.put(updatedKey);
    },
  );
}

/**
 * A run that covered the whole song, at the key level.
 *
 * =====================================================================
 * THE ROW IS THE WHOLE SONG IN ONE KEY. THE CELLS ARE ITS SECTIONS.
 *
 * `writeSongRun` above writes one `songCellRunThroughs` row per section
 * the run covered — three sections, three rows, each a statement about
 * that section. None of them says "and it was played start to finish".
 *
 * That claim is a `songKeyRunThroughs` row, and something reads it:
 * `stage.ts`'s Internalized criterion asks for every key to have been
 * run clean at tempo at least once, and it looks here. A whole-song run
 * that wrote only section rows would satisfy nothing.
 *
 * WRITTEN PER RUN, NOT PER PASS. The criterion is "run clean at tempo,
 * at least once" — a single good run counts toward it whether or not a
 * test was ever completed. Waiting for a pass would lose that.
 *
 * The streak comes IN rather than being recomputed: the session owns
 * it, and this writes one run at a time.
 */
export async function writeWholeSongRun(args: {
  songKeyId: string;
  attempt: AttemptDraft;
  performanceTempo: number | null;
  /** The streak before this run. See `applyAttemptsToKey`. */
  streakBefore: number;
  isRetest: boolean;
  now?: number;
}): Promise<number> {
  const now = args.now ?? Date.now();
  const songKey = await db.songKeys.get(args.songKeyId);
  if (songKey === undefined) return args.streakBefore;

  const { runThroughRows, finalCount } = applyAttemptsToKey(
    songKey,
    [{ id: args.attempt.id, bpm: args.attempt.bpm, feel: args.attempt.feel }],
    args.performanceTempo,
    args.isRetest,
    now,
    'test',
    args.streakBefore,
  );
  await db.songKeyRunThroughs.bulkAdd(runThroughRows);
  return finalCount;
}

/**
 * The whole-song test was passed.
 *
 * =====================================================================
 * TWO THINGS, AND ONLY THE FIRST IS OBVIOUS.
 *
 * `wholeSongTestPassedAt` is the durable fact. `stageCriteria` reads it
 * directly as the Learning → Comfortable criterion — the test stopped
 * writing a status in 831e38b, so this timestamp IS the record.
 *
 * The second is the retest clock, and it has not been moving.
 * `recordKeyProving` had NO production caller: `logPractice.ts` and
 * `stage.ts` both carry comments describing the whole-song test moving
 * this key's schedule, and anyone reading them would have believed it.
 * This is the caller.
 *
 * It writes a NON-SCORING engagement — see `recordKeyProving` for why a
 * pass must not cast a fourth vote on a key its three runs already
 * rated.
 * =====================================================================
 */
export async function writeWholeSongTestPass(args: {
  songKeyId: string;
  now?: number;
}): Promise<void> {
  const now = args.now ?? Date.now();
  const songKey = await db.songKeys.get(args.songKeyId);
  if (songKey === undefined) return;

  await db.songKeys.put({
    ...songKey,
    wholeSongTestPassedAt: now,
    // A pass clears a pending retest, whatever prompted it.
    isRetestRecommended: false,
    lastEngagedAt: now,
    updatedAt: now,
  });

  // Outside the write above, mirroring every other spacing call: a
  // scheduling failure must not roll back the test result just earned.
  await recordKeyProving({ songKeyId: args.songKeyId, passed: true, timestamp: now });
}
