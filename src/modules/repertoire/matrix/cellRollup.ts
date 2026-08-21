import {
  db,
  type SongCell,
  type SongCellRunThrough,
  type SongKey,
  type SongKeyRunThrough,
  type SongKeyState,
  type SongRunThroughRating,
} from '../../../lib/db';
import { decayStateAfterEngagement } from './solidDecay';

/**
 * Cell-state machine helpers for the cell interaction modal.
 *
 * Pure functions encode the state-transition rules from
 * SONG_PROGRESSION_DESIGN_3.md "Rollup logic":
 *
 *   - Cell: empty → learning on first attempt; learning →
 *     comfortable only when markComfortable AND projected
 *     consecutiveCleanCount ≥ 3
 *   - Key:  not_started / learning / comfortable / solid derived
 *     from the cells of that key + whether the whole-song test
 *     has passed (test ships in step 5; step 4 always passes
 *     wholeSongTestPassedAt = null)
 *
 * The side-effecting `saveAttemptsAndRollup` wraps cell update +
 * run-through inserts + key-state update in a single Dexie
 * transaction so the matrix UI never sees a half state.
 */

/** Local-only draft type for in-modal attempt state. Each draft
 *  becomes one songCellRunThroughs row on save; the local id is
 *  for React keying and isn't persisted. */
export interface AttemptDraft {
  id: string;
  /** Null when the user didn't give one. The schema has always
   *  allowed `tempoBpm: number | null`; requiring it in the UI was
   *  the friction, not the data model. A null tempo simply cannot be
   *  gate-relevant — see isInTempoRange. */
  bpm: number | null;
  wasClean: boolean;
}

/**
 * Project the consecutiveCleanCount that will result from applying
 * the given attempts to a cell with the given starting count. Used
 * by the modal to drive the "X more clean runs needed" hint and the
 * Mark comfortable button's enable state in real time, before any
 * persistence happens.
 *
 * BPM gate: when `performanceTempo` is set, attempts at or above
 * (performanceTempo - 10) are gate-relevant. Below-floor attempts
 * are still logged honestly (run-throughs still persist with their
 * wasClean flag) but they neither advance nor reset the gate count
 * — they're a different practice activity (slower warm-up), not a
 * test of the comfortable threshold. Playing above performance
 * tempo demonstrates mastery and always counts; only the lower
 * bound excludes attempts.
 *
 * When `performanceTempo` is null (song.tempo unset), the gate is
 * effectively off — every attempt counts. Setting a performance
 * tempo activates the gate retroactively for any future attempts.
 *
 * Cap at 3 because that's the gate threshold; tracking past 3 has
 * no effect on the cell-state transition.
 */
export function projectConsecutiveCleanCount(
  startingCount: number,
  attempts: ReadonlyArray<AttemptDraft>,
  performanceTempo: number | null,
): number {
  let count = startingCount;
  for (const a of attempts) {
    if (!isInTempoRange(a.bpm, performanceTempo)) {
      // Below floor — gate-irrelevant. Don't advance, don't reset.
      continue;
    }
    if (a.wasClean) count = Math.min(count + 1, 3);
    else count = 0;
  }
  return count;
}

/** True when the attempt's BPM is at or above (performanceTempo -
 *  10), OR when no performance tempo is set (in which case the gate
 *  is off entirely). One-sided: there's no upper bound — playing
 *  above performance tempo demonstrates mastery and is never
 *  penalized. */
export function isInTempoRange(
  bpm: number | null,
  performanceTempo: number | null,
): boolean {
  // No target to measure against — every run-through counts.
  if (performanceTempo == null) return true;
  // A run-through logged without a tempo cannot be VERIFIED at the
  // performance target, so it does not advance the gate. It is still
  // recorded honestly, exactly like a below-floor attempt: the gate
  // asks "clean at tempo", and "clean at a tempo you didn't say" is
  // not an answer to it. Counting it would let the comfortable
  // threshold be reached on unverified runs.
  if (bpm == null) return false;
  return bpm >= performanceTempo - 10;
}

/**
 * Derive the key-level state from a key's cells. Invoked after any
 * cell update so the parent songKeys row can advance (or stay) in
 * lockstep with its cells.
 *
 * Defensive on `cells.length < expectedSectionCount` (treats missing
 * cells as not-started) — shouldn't happen post-3b/c since sections
 * + cells co-create, but covers data-corruption edge cases.
 */
export function computeKeyStateFromCells(
  cells: ReadonlyArray<SongCell>,
  expectedSectionCount: number,
  wholeSongTestPassedAt: number | null,
): SongKeyState {
  if (expectedSectionCount === 0) return 'not_started';

  const anyTouched = cells.some(
    c => c.cellState === 'learning' || c.cellState === 'comfortable',
  );

  if (cells.length < expectedSectionCount) {
    // Missing cells — at least one section has no cell row. Treat
    // missing as not-started for rollup purposes.
    return anyTouched ? 'learning' : 'not_started';
  }

  const allComfortable = cells.every(c => c.cellState === 'comfortable');
  if (allComfortable && wholeSongTestPassedAt !== null) return 'solid';
  if (allComfortable) return 'comfortable';

  return anyTouched ? 'learning' : 'not_started';
}

/**
 * Apply a sequence of attempts to a cell, returning the updated
 * cell record + the songCellRunThroughs rows ready to bulkPut.
 *
 * State-transition logic:
 *   - cellState 'empty' → 'learning' on first logged attempt
 *     (notes-only saves do NOT trigger this transition — engagement
 *     requires at least one run-through)
 *   - cellState '*' → 'comfortable' only when markComfortable is
 *     true AND projected count ≥ 3 AND cell isn't already
 *     comfortable. This is the explicit user gate; the spec's
 *     "automatic" rollup is interpreted as "the Mark comfortable
 *     button activates at gate, the user clicks it to advance."
 *
 * lastRunAt + lastRunWasClean only update when there's at least
 * one attempt; notes-only saves preserve the prior values.
 *
 * `rating` is the session-level Flying / Cruising / Crawling feel —
 * stamped onto every run-through row from this save (it describes
 * the session, not the individual attempt) when non-null. A null
 * rating leaves the field off the rows entirely, reading as
 * pre-rating / unrated data downstream.
 */
export function applyAttemptsToCell(
  cell: SongCell,
  attempts: ReadonlyArray<AttemptDraft>,
  notes: string | null,
  rating: SongRunThroughRating | null,
  markComfortable: boolean,
  performanceTempo: number | null,
  now: number,
  /** The songPracticeLog session these run-throughs happened inside,
   *  when one is being logged at the same time. Null when the user
   *  logged run-throughs without timing anything — both are ordinary
   *  cases, neither is degraded. */
  practiceLogId: string | null = null,
): { updatedCell: SongCell; runThroughRows: SongCellRunThrough[] } {
  const projectedCount = projectConsecutiveCleanCount(
    cell.consecutiveCleanCount,
    attempts,
    performanceTempo,
  );

  // Run-throughs in user-logged order. Timestamps spaced by +i ms
  // so sortBy('createdAt') reproduces the order even when several
  // attempts land in the same wall-clock millisecond of save.
  const runThroughRows: SongCellRunThrough[] = attempts.map((a, i) => ({
    id: `runthrough-${Math.random().toString(36).slice(2, 8)}-${(now + i).toString(36)}`,
    cellId: cell.id,
    songId: cell.songId,
    sectionId: cell.sectionId,
    songKeyId: cell.songKeyId,
    wasClean: a.wasClean,
    tempoBpm: a.bpm == null ? null : Math.max(1, Math.floor(a.bpm)),
    notes: null, // per-attempt notes not surfaced in step 4; cell-level notes only
    ...(rating ? { rating } : {}),
    ...(practiceLogId ? { practiceLogId } : {}),
    createdAt: now + i,
  }));

  // Cell-state transition.
  let nextState = cell.cellState;
  let nextComfortableAt = cell.comfortableAt;
  if (markComfortable && projectedCount >= 3 && cell.cellState !== 'comfortable') {
    nextState = 'comfortable';
    nextComfortableAt = now;
  } else if (cell.cellState === 'empty' && attempts.length > 0) {
    nextState = 'learning';
  }

  const lastAttempt = attempts.length > 0 ? attempts[attempts.length - 1] : null;

  const updatedCell: SongCell = {
    ...cell,
    cellState: nextState,
    comfortableAt: nextComfortableAt,
    consecutiveCleanCount: projectedCount,
    lastRunAt: lastAttempt ? now + (attempts.length - 1) : cell.lastRunAt,
    lastRunWasClean: lastAttempt ? lastAttempt.wasClean : cell.lastRunWasClean,
    notes,
    lastEngagedAt: now,
    updatedAt: now,
  };

  return { updatedCell, runThroughRows };
}

/**
 * Persist the cell update + run-through inserts + parent key
 * rollup in a single Dexie transaction. All three writes commit
 * together or none does — the matrix UI never sees a half state
 * where run-throughs persisted but the cell hasn't advanced.
 *
 * Caller is responsible for passing the full sibling-cell set for
 * the songKey so the rollup can compute keyState honestly. The
 * cell being updated is included in `siblingCells`; this function
 * substitutes the updated version before computing keyState.
 */
export async function saveAttemptsAndRollup(args: {
  cell: SongCell;
  songKey: SongKey;
  siblingCells: ReadonlyArray<SongCell>;
  attempts: ReadonlyArray<AttemptDraft>;
  notes: string | null;
  /** Session-level feel on the shared four-step scale. Null when the
   *  user didn't pick one — the run-through rows then carry no
   *  rating, exactly like pre-v22 data. */
  rating: SongRunThroughRating | null;
  markComfortable: boolean;
  performanceTempo: number | null;
  expectedSectionCount: number;
  now: number;
  /** Links these run-throughs to the timed session they happened
   *  inside. Optional: run-throughs logged on their own carry null. */
  practiceLogId?: string | null;
}): Promise<void> {
  const { updatedCell, runThroughRows } = applyAttemptsToCell(
    args.cell,
    args.attempts,
    args.notes,
    args.rating,
    args.markComfortable,
    args.performanceTempo,
    args.now,
    args.practiceLogId ?? null,
  );

  const updatedSiblings = args.siblingCells.map(c =>
    c.id === updatedCell.id ? updatedCell : c,
  );
  const newKeyState = computeKeyStateFromCells(
    updatedSiblings,
    args.expectedSectionCount,
    args.songKey.wholeSongTestPassedAt,
  );

  // Decay snapshot writeback. Cell engagement is non-pass, so honor
  // lapsed stickiness — only a passed retest clears 'lapsed'. Other
  // decay states reset to 'solid' on engagement (clock resets).
  const newDecayState = decayStateAfterEngagement(
    args.songKey.solidDecayState,
    newKeyState,
  );
  const newIsRetestRecommended = newDecayState === 'lapsed';

  const updatedSongKey: SongKey = {
    ...args.songKey,
    keyState: newKeyState,
    solidDecayState: newDecayState,
    isRetestRecommended: newIsRetestRecommended,
    lastDecayCheckAt: args.now,
    lastEngagedAt: args.now,
    updatedAt: args.now,
  };

  await db.transaction(
    'rw',
    [db.songCells, db.songCellRunThroughs, db.songKeys],
    async () => {
      if (runThroughRows.length > 0) {
        await db.songCellRunThroughs.bulkPut(runThroughRows);
      }
      await db.songCells.put(updatedCell);
      await db.songKeys.put(updatedSongKey);
    },
  );
}

// =====================================================================
// Whole-song test helpers
// =====================================================================
//
// Symmetric to the cell-level rollup but at the key level. The user
// logs full-song run-throughs in the test modal; 3 consecutive clean
// at-or-above-floor runs unlocks the comfortable → solid transition.
// Same below-floor exclusion rule as cells (warm-up runs neither
// advance nor reset the gate; above-tempo always counts).
//
// Streak storage: there's no consecutiveCleanCount field on songKeys
// — the canonical streak is derived from the most recent
// songKeyRunThroughs row (its consecutiveCleanCount column is the
// post-attempt value). Empty log → streak 0.

export interface KeyAttemptDraft {
  id: string;
  bpm: number;
  wasClean: boolean;
}

/**
 * Project the streak that will result from running the given attempts
 * through this modal session. Caps at 3 (gate threshold). Always
 * starts from 0 — sessions are discrete, the whole-song test is a
 * fresh demonstration each time, no cross-session carry-over. The
 * cell-level projection is reused (math is identical) but the
 * key-flavoured wrapper hard-codes 0 to make the discrete-session
 * contract explicit.
 */
export function projectKeyConsecutiveCleanCount(
  attempts: ReadonlyArray<KeyAttemptDraft>,
  performanceTempo: number | null,
): number {
  return projectConsecutiveCleanCount(0, attempts, performanceTempo);
}

/**
 * Apply attempts to a key, producing the run-through rows ready to
 * insert + the resulting streak count.
 *
 * Per-row `consecutiveCleanCount` is the streak value AFTER that
 * specific attempt within THIS session. Sessions are discrete: each
 * modal-open starts at 0, so the streak never carries across saves.
 * This differs from the cell-level rollup (where consecutiveCleanCount
 * persists on the cell row) — the whole-song test is a discrete
 * demonstration, not ongoing practice. Below-floor attempts log
 * honestly with the unchanged streak value (no advance, no reset).
 */
export function applyAttemptsToKey(
  songKey: SongKey,
  attempts: ReadonlyArray<KeyAttemptDraft>,
  performanceTempo: number | null,
  isRetest: boolean,
  now: number,
  kind: 'test' | 'single' = 'test',
): { runThroughRows: SongKeyRunThrough[]; finalCount: number } {
  let count = 0;
  const rows: SongKeyRunThrough[] = attempts.map((a, i) => {
    if (isInTempoRange(a.bpm, performanceTempo)) {
      if (a.wasClean) count = Math.min(count + 1, 3);
      else count = 0;
    }
    return {
      id: `keyrun-${Math.random().toString(36).slice(2, 8)}-${(now + i).toString(36)}`,
      songKeyId: songKey.id,
      songId: songKey.songId,
      wasClean: a.wasClean,
      consecutiveCleanCount: count,
      tempoBpm: Math.max(1, Math.floor(a.bpm)),
      notes: null,
      isRetest,
      kind,
      createdAt: now + i,
    };
  });
  return { runThroughRows: rows, finalCount: count };
}

/**
 * Persist the run-through inserts + (when markSolid) the songKeys
 * promotion in a single Dexie transaction.
 *
 * Mark-solid semantics mirror Mark-comfortable for cells: caller
 * passes `markSolid` true only when projected count ≥ 3 AND the
 * user clicked the explicit button. We re-validate that here as a
 * defensive belt — a stale projection from the modal shouldn't be
 * able to flip a key to solid against the rules.
 *
 * keyState recompute: when the key isn't yet solid and the test
 * passes, we set wholeSongTestPassedAt + solidAt and recompute
 * keyState from the current cells (which should yield 'solid' when
 * all cells are comfortable + test now passed).
 */
/**
 * Log ONE whole-song run-through in a key, at any key state.
 *
 * ---------------------------------------------------------------
 * THE GAP THIS FILLS
 *
 * `saveKeyAttemptsAndRollup` is reached only through the whole-song
 * test modal, and that modal opens only when every section's cell in
 * the key is already comfortable (or the key is solid and lapsed).
 * So there was no way to record "I played the song through in Ab
 * once" without first doing the full depth work in Ab — which is a
 * different activity, and not the one being claimed.
 *
 * That mattered because Cross-key → Internalized asks for exactly
 * that: the four quadrant keys held, plus ONE clean at-tempo run in
 * each of the remaining eight. Depth in four, breadth across twelve.
 * Without this the breadth half was unwritable, so the rule could
 * never have fired.
 * ---------------------------------------------------------------
 *
 * IT CANNOT PROMOTE ANYTHING, and it is worth being exact about why,
 * because the obvious answer is the wrong one.
 *
 * `markSolid: false` below is the BELT. It is not what actually holds
 * today: `saveKeyAttemptsAndRollup` promotes only when
 * `markSolid && finalCount >= 3`, and this function submits exactly
 * ONE attempt, so `finalCount` cannot exceed 1 whatever markSolid
 * says. Flipping markSolid to true here changes no behaviour at all —
 * verified by reversal, where it left every test green.
 *
 * The BRACES, and the real mechanism, is the one-attempt shape plus
 * the discrete-session semantics of `applyAttemptsToKey`: the streak
 * restarts at 0 on every call, so ten separate clean singles produce
 * ten rows each carrying a count of 1 and never a 2. Both halves are
 * pinned separately in the tests, because a single test covering
 * "singles never promote" passes for the wrong reason and would keep
 * passing if someone widened this to take a list.
 *
 * The gate stays what it is: three consecutive clean runs in one
 * sitting, through the test modal. A hundred scattered passes do not
 * add up to a graduation, because the claim the gate makes is about
 * consistency on demand and scattered passes are not that.
 *
 * It DOES count as engagement — `lastEngagedAt` moves and the decay
 * clock resets, exactly as a cell save does. Playing the song through
 * is engagement by any reading, and withholding that would let a key
 * drift to lapsed while being played.
 */
export async function logSingleKeyRun(args: {
  songKey: SongKey;
  attempt: KeyAttemptDraft;
  performanceTempo: number | null;
  siblingCells: ReadonlyArray<SongCell>;
  expectedSectionCount: number;
  now: number;
}): Promise<void> {
  await saveKeyAttemptsAndRollup({
    songKey: args.songKey,
    attempts: [args.attempt],
    // Belt, not braces — see the header. Redundant while this
    // function submits one attempt, and load-bearing the moment
    // anyone widens it to take a list. Kept, and not exposed as a
    // parameter, so widening cannot silently open the gate.
    markSolid: false,
    performanceTempo: args.performanceTempo,
    // A retest is a prompted re-demonstration after a lapse, which is
    // a test-session concept. A single run is not one.
    isRetest: false,
    siblingCells: args.siblingCells,
    expectedSectionCount: args.expectedSectionCount,
    now: args.now,
    kind: 'single',
  });
}

export async function saveKeyAttemptsAndRollup(args: {
  songKey: SongKey;
  attempts: ReadonlyArray<KeyAttemptDraft>;
  markSolid: boolean;
  performanceTempo: number | null;
  isRetest: boolean;
  siblingCells: ReadonlyArray<SongCell>;
  expectedSectionCount: number;
  now: number;
  /** Defaults to 'test' — the whole-song test modal is this
   *  function's original and primary caller. `logSingleKeyRun` passes
   *  'single'. */
  kind?: 'test' | 'single';
}): Promise<void> {
  const { runThroughRows, finalCount } = applyAttemptsToKey(
    args.songKey,
    args.attempts,
    args.performanceTempo,
    args.isRetest,
    args.now,
    args.kind ?? 'test',
  );

  // "Pass" semantics: the gate has been met AND the user opted in.
  // Two flavors collapse to the same write logic — initial promotion
  // (key wasn't solid) and retest pass (key was solid, possibly
  // lapsed). In both cases wholeSongTestPassedAt + solidAt update
  // and decay flags clear.
  const passedGate = args.markSolid && finalCount >= 3;

  let updatedSongKey: SongKey = {
    ...args.songKey,
    lastEngagedAt: args.now,
    lastDecayCheckAt: args.now,
    updatedAt: args.now,
  };

  if (passedGate) {
    const nextKeyState = computeKeyStateFromCells(
      args.siblingCells,
      args.expectedSectionCount,
      args.now, // wholeSongTestPassedAt is being set right now
    );
    updatedSongKey = {
      ...updatedSongKey,
      wholeSongTestPassedAt: args.now,
      // solidAt is the timestamp at which keyState FIRST became
      // 'solid'. Preserve prior solidAt across retests — a retest
      // refreshes the demonstration but doesn't reset "when did this
      // key originally graduate." Falsy → set now (initial promotion).
      solidAt: args.songKey.solidAt ?? args.now,
      keyState: nextKeyState,
      // Pass clears all decay flags. If the key was lapsed before,
      // it's now freshly re-demonstrated. If it was just-promoted,
      // these are no-ops (already null/false).
      solidDecayState: nextKeyState === 'solid' ? 'solid' : null,
      isRetestRecommended: false,
    };
  } else {
    // Non-pass test save — same engagement-decay logic as a cell
    // save. Lapsed sticks; other states reset to 'solid' on the
    // clock-reset that lastEngagedAt = now produces.
    const newDecayState = decayStateAfterEngagement(
      args.songKey.solidDecayState,
      args.songKey.keyState,
    );
    updatedSongKey = {
      ...updatedSongKey,
      solidDecayState: newDecayState,
      isRetestRecommended: newDecayState === 'lapsed',
    };
  }

  await db.transaction(
    'rw',
    [db.songKeyRunThroughs, db.songKeys],
    async () => {
      if (runThroughRows.length > 0) {
        await db.songKeyRunThroughs.bulkPut(runThroughRows);
      }
      await db.songKeys.put(updatedSongKey);
    },
  );
}
