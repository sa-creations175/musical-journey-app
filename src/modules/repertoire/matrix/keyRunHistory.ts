import type { SongKeyRunThrough } from '../../../lib/db';

/**
 * Past whole-song run-throughs for one key, grouped into sittings.
 *
 * ---------------------------------------------------------------
 * A WINDOW, NOT A COUNT.
 *
 * The question this answers is "is this going better lately", and a
 * fixed number of attempts cannot answer it: the last twelve runs
 * might span a day or six months and the list would look identical
 * either way. Thirty days is the same span whatever the data does, so
 * an empty window is itself the answer — you have not played this key
 * in a month.
 * ---------------------------------------------------------------
 *
 * GROUPED BY SITTING, because that is the unit the gate is defined
 * in. Three clean runs in a row on one afternoon and three clean runs
 * across three weeks are the same six characters in a flat list and
 * completely different claims — which is the entire reason the test
 * demands consecutive.
 */

export const HISTORY_WINDOW_DAYS = 30;

/**
 * Gap that separates one sitting from the next.
 *
 * Rows written by a single save are stamped `now + i`, so they land
 * milliseconds apart — a minute is enormously more than needed to
 * hold one sitting together, and far less than any plausible gap
 * between two. The threshold is deliberately nowhere near either
 * boundary rather than tuned to one.
 */
export const SITTING_GAP_MS = 60_000;

/** Sittings rendered before the list says it stopped. */
export const MAX_SITTINGS_SHOWN = 20;

export interface SittingSummary {
  /** Timestamp of the first run in the sitting. */
  startedAt: number;
  /** Absent `kind` reads as 'test' — see the field on
   *  SongKeyRunThrough. */
  kind: 'test' | 'single';
  runs: Array<{ wasClean: boolean; tempoBpm: number | null }>;
  /** Longest consecutive-clean run reached, read off the stored
   *  per-row counts rather than recomputed — those rows already carry
   *  the streak as it stood after each attempt, and recomputing here
   *  would need the performance tempo as it was AT THE TIME, which is
   *  not recorded. A tempo changed since would silently rewrite
   *  history. */
  bestStreak: number;
  /** The sitting met the gate. Only a test session can. */
  passed: boolean;
}

export interface KeyRunHistory {
  /** Newest first, capped at MAX_SITTINGS_SHOWN. */
  sittings: SittingSummary[];
  /** Sittings in the window, before the cap. */
  totalSittings: number;
  /** Individual runs in the window, before the cap. */
  totalRuns: number;
  /** True when the cap dropped something. Surfaced rather than
   *  silently truncating: a list that stops without saying so reads
   *  as the whole record. */
  capped: boolean;
}

export function summariseKeyRunHistory(
  rows: ReadonlyArray<SongKeyRunThrough>,
  now: number,
): KeyRunHistory {
  const cutoff = now - HISTORY_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const inWindow = rows
    .filter(r => r.createdAt >= cutoff)
    .sort((a, b) => a.createdAt - b.createdAt);

  const sittings: SittingSummary[] = [];
  let openKind: 'test' | 'single' | null = null;
  let lastStamp = 0;

  for (const row of inWindow) {
    const kind: 'test' | 'single' = row.kind === 'single' ? 'single' : 'test';
    const open = sittings[sittings.length - 1];
    // A new sitting starts on a real time gap OR on a change of kind.
    // Kind matters because logging a single run and then opening the
    // test seconds later are two events, and merging them would show a
    // streak that was never demonstrated in one go.
    const continues =
      open !== undefined
      && openKind === kind
      && row.createdAt - lastStamp <= SITTING_GAP_MS;

    if (continues) {
      open.runs.push({ wasClean: row.wasClean, tempoBpm: row.tempoBpm });
      open.bestStreak = Math.max(open.bestStreak, row.consecutiveCleanCount);
    } else {
      sittings.push({
        startedAt: row.createdAt,
        kind,
        runs: [{ wasClean: row.wasClean, tempoBpm: row.tempoBpm }],
        bestStreak: row.consecutiveCleanCount,
        // A single run is one row and can never carry a streak of
        // three, so in practice only a test session passes. Written as
        // the streak check rather than a kind check because the gate is
        // about what was demonstrated, not which modal it happened in.
        passed: row.consecutiveCleanCount >= 3,
      });
      openKind = kind;
    }
    const current = sittings[sittings.length - 1];
    current.passed = current.bestStreak >= 3;
    lastStamp = row.createdAt;
  }

  const newestFirst = sittings.reverse();
  return {
    sittings: newestFirst.slice(0, MAX_SITTINGS_SHOWN),
    totalSittings: newestFirst.length,
    totalRuns: inWindow.length,
    capped: newestFirst.length > MAX_SITTINGS_SHOWN,
  };
}
