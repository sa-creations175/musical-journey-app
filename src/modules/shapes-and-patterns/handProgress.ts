import type { DrillHand, DrillSession, SpacingState } from '../../lib/db';
import { bandVerdictForRow } from '../../lib/spacing/row';
import { NOT_STARTED, type BandVerdict } from '../../lib/spacing/banding';
import type { CellTarget } from './cellTargets';

/**
 * Everything Progress Details knows about one hand.
 *
 * =====================================================================
 * TWO SOURCES, AND THEY ANSWER DIFFERENT QUESTIONS.
 *
 * A spacing row says WHERE THE HAND STANDS — the band, from the reps.
 * Drill sessions say WHAT WAS DONE — how long, how often, how it felt,
 * and since the field that made this possible, whether the run was a
 * test.
 *
 * They are not two views of one thing and must not be reconciled: a run
 * that was never rated has a session row and no rep, and a rep written
 * by the in-session runner may have no drill row at all. Each question
 * is asked of the source that can answer it.
 *
 * =====================================================================
 * THE TEMPO AND THE SITTING ARE RECORDED NOW, AND STILL NEVER GUESSED.
 *
 * A drill row carries the hand, the length, the target, the rating, the
 * timestamp, the mode, the tempo it was played at and the sitting it
 * belonged to. Both of the last two arrive from the panel that watched
 * the run, at the moment it ended.
 *
 * ABSENT STAYS ABSENT. Every row written before those fields existed
 * has neither, and so does any run played in silence. The log omits
 * what a row does not carry rather than reaching for the metronome's
 * current setting or matching a sitting by timestamp — both are a guess
 * wearing a join, wrong the moment two runs land in the same second and
 * unfalsifiable once on screen.
 * =====================================================================
 */
export interface HandProgress {
  hand: DrillHand;
  /** Where this hand stands, from its reps. */
  verdict: BandVerdict;
  /** Seconds practised, and seconds tested. */
  practiceSeconds: number;
  testSeconds: number;
  /** When it was last touched at all, or null. */
  lastPracticedAt: number | null;
  /** Newest first, both logs. */
  practiceRuns: DrillSession[];
  testRuns: DrillSession[];
}

/**
 * Was this run a test?
 *
 * THE ONE READER SHAPE. `=== true`, never `!== false`: a row written
 * before the field existed has no value, and absent counts as practice.
 * Asking the other way round would put every legacy row in the test log.
 */
export function wasTestRun(session: DrillSession): boolean {
  return session.fromTest === true;
}

/** Newest first — a log is read from the top. */
function byNewest(a: DrillSession, b: DrillSession): number {
  return b.timestamp - a.timestamp;
}

/**
 * One hand's progress, from the rows that mention it.
 *
 * Sessions are matched on `skillId` AND `hand`. Both halves matter: a
 * scale's three hands share one `itemRef`, so matching on the ref alone
 * would give every hand the whole cell's history.
 */
export function handProgress(
  target: CellTarget,
  rows: ReadonlyArray<SpacingState>,
  sessions: ReadonlyArray<DrillSession>,
): HandProgress {
  const row = rows.find(
    r => r.itemRef === target.itemRef && r.hand === target.hand,
  );
  const mine = sessions
    .filter(s => s.skillId === target.itemRef && s.hand === target.hand)
    .sort(byNewest);

  const practiceRuns = mine.filter(s => !wasTestRun(s));
  const testRuns = mine.filter(wasTestRun);
  const secondsOf = (list: ReadonlyArray<DrillSession>) =>
    list.reduce((n, s) => n + (s.durationSeconds || 0), 0);

  return {
    hand: target.hand,
    verdict: row ? bandVerdictForRow(row) : NOT_STARTED,
    practiceSeconds: secondsOf(practiceRuns),
    testSeconds: secondsOf(testRuns),
    // The newest run of either kind. Sorted already, so it is the head.
    lastPracticedAt: mine.length > 0 ? mine[0].timestamp : null,
    practiceRuns,
    testRuns,
  };
}

/** The whole cell: one entry per hand, in the catalog's order. */
export function cellProgress(
  targets: ReadonlyArray<CellTarget>,
  rows: ReadonlyArray<SpacingState>,
  sessions: ReadonlyArray<DrillSession>,
): HandProgress[] {
  return targets.map(t => handProgress(t, rows, sessions));
}

/**
 * The cell's total time, over the hands STILL COUNTED.
 *
 * A hand taken out of the score is taken out of the total with it: the
 * number under a status has to be the time behind that status, or the
 * two disagree on one line.
 */
export function cellTime(
  hands: ReadonlyArray<HandProgress>,
): { practiceSeconds: number; testSeconds: number } {
  return {
    practiceSeconds: hands.reduce((n, h) => n + h.practiceSeconds, 0),
    testSeconds: hands.reduce((n, h) => n + h.testSeconds, 0),
  };
}

/**
 * How long each sitting held, by its id.
 *
 * =====================================================================
 * THE SITTING IS SHOWN AS ITS SIZE, which is what the signed-off grid
 * prototype draws beside each run: `session 25m`. An id means nothing
 * to a reader; how much drilling the sitting held says which one it was
 * and what it amounted to.
 *
 * SUMMED FROM THE ROWS THAT NAME IT, over every row passed in rather
 * than only the hand being read — a sitting is a sitting whatever it
 * touched. A row with no sitting recorded contributes to nothing and
 * gets no entry, so a legacy run has no session to show and shows none.
 *
 * IT IS THE DRILLED TIME, not the wall clock: the minutes between runs
 * are on no row here and are not invented.
 * =====================================================================
 */
export function sessionSecondsById(
  sessions: ReadonlyArray<DrillSession>,
): ReadonlyMap<string, number> {
  const totals = new Map<string, number>();
  for (const s of sessions) {
    if (s.sessionId === undefined) continue;
    totals.set(s.sessionId, (totals.get(s.sessionId) ?? 0) + (s.durationSeconds || 0));
  }
  return totals;
}

/** `1h 04m`, `12m`, `—` for nothing at all. */
export function formatDuration(seconds: number): string {
  if (seconds <= 0) return '—';
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
}

/** `4d ago`, `today`. Null has no answer and says so nowhere — the
 *  caller omits the line rather than printing a dash for it. */
export function formatAgo(at: number, now: number): string {
  const days = Math.floor((now - at) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}
