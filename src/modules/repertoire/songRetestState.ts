/**
 * What a song's stage badge has to add, if anything.
 *
 * =====================================================================
 * A RUNG IS A CLAIM, AND A CLAIM NEEDS RE-PROVING.
 *
 * "Comfortable" on its own reads as a settled fact. It is not: it was
 * earned on a date, and the spacing schedule decides when it has to be
 * shown again. So the badge carries the retest state rather than a
 * separate chip beside it — the fact and its currency are one thing,
 * and splitting them across two pills invites reading the rung without
 * reading whether it still stands.
 *
 *   held      nothing to add. The badge says the rung and stops.
 *   due       time to prove it again. The rung still holds.
 *   overdue   past grace, with how far past.
 *
 * LEARNING NEVER SHOWS ONE, and that is a rule about claims rather than
 * about keys. Nothing has been proven at the bottom rung, so nothing
 * can have decayed — a "due" on a song you have never got through once
 * would be asking for a retest of something that was never a test.
 *
 * DUE-SOON IS NOT A BADGE STATE. It means "not yet due", which is what
 * `held` already says here; the matrix shows `soon` per key, where the
 * reader is looking at the row they would act on. A badge that said
 * "due" a week early would make the word mean two different things.
 * =====================================================================
 *
 * SEPARATE FROM `songDueReading`, deliberately. That function answers
 * "is there re-proving available to keep what you have", and excludes
 * overdue BECAUSE the rung has already dropped — the dashboard pill it
 * feeds counts work worth doing. This one answers "what does the badge
 * say", where an already-dropped rung is the most important thing on
 * the card. Same evidence, two questions, and folding them into one
 * reading would have made the pill count songs it should not.
 *
 * Pure and synchronous: `nextDueAt` arrives in a map the caller already
 * loaded, because the caller computes this inside a `useMemo` during
 * render, where a Dexie read is a different kind of bug.
 */
import type { RepertoireStage, SongKey } from '../../lib/db';
import { daysPastGrace, keyDueState, type DueWindows } from './matrix/keySpacing';
import { isComfortableOrBetter } from './matrix/keyProgress';

export type SongRetestState =
  | { state: 'due' }
  /** Whole days past the end of grace, at least 1 — a badge saying
   *  "overdue 0d" would be describing the moment grace ended rather
   *  than a song that has been left. */
  | { state: 'overdue'; days: number };

/**
 * Null when the badge has nothing to add.
 *
 * Null rather than a `'held'` member: every caller renders NOTHING in
 * that case, and a state that always maps to no output is a branch
 * waiting to be rendered by mistake.
 */
export function songRetestState(
  stage: RepertoireStage,
  songKeys: ReadonlyArray<SongKey>,
  dueByKeyId: ReadonlyMap<string, number | null>,
  now: number,
  windows: DueWindows,
): SongRetestState | null {
  // Nothing proven, so nothing to have decayed. Checked at the SONG
  // grain rather than relying on the per-key gate below: a song can sit
  // at `learning` while carrying a key that once counted, and the badge
  // must not contradict the rung beside it.
  if (stage === 'learning') return null;

  let anyDue = false;
  let worstOverdue = 0;

  for (const key of songKeys) {
    // A key that never counted has no claim to re-prove. The same gate
    // `songDueReading` applies, and for the same reason.
    if (!isComfortableOrBetter(key.keyState)) continue;
    const nextDueAt = dueByKeyId.get(key.id) ?? null;
    switch (keyDueState(nextDueAt, now, windows)) {
      case 'overdue':
        worstOverdue = Math.max(worstOverdue, daysPastGrace(nextDueAt, now, windows));
        break;
      case 'due':
        anyDue = true;
        break;
      // 'due-soon' is not yet due, and `held` has nothing to say.
      default:
        break;
    }
  }

  // OVERDUE OUTRANKS DUE. They are different in kind — one is "do this
  // and keep it", the other is "this is already gone" — and a badge has
  // room for the more serious of two true statements.
  if (worstOverdue > 0) return { state: 'overdue', days: worstOverdue };
  if (anyDue) return { state: 'due' };
  return null;
}

/**
 * What the badge appends, or null.
 *
 * The words live here rather than in the card so the badge and any
 * future surface reading the same state cannot name it two ways.
 */
export function retestSuffix(retest: SongRetestState | null): string | null {
  if (retest === null) return null;
  return retest.state === 'due' ? 'due' : `overdue ${retest.days}d`;
}
