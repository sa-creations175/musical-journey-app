/**
 * When a key is due to be proven again, and what state that puts it in.
 *
 * ---------------------------------------------------------------
 * THIS FILE IS THE READ HALF ONLY.
 *
 * It turns a due date into one of four states. It does not decide
 * WHEN the next due date is — that is SM-2, in `lib/spacingState`,
 * driven by what the user actually demonstrated. Keeping the two
 * apart means the states can be reasoned about, and tested, without
 * an opinion about scheduling anywhere near them.
 * ---------------------------------------------------------------
 *
 * WHAT THIS REPLACES. `solidDecay.ts` asks a flat question: has it
 * been 14 days, has it been 30. Every key on every song, forever, no
 * matter how many times it has been proven. A song proven five times
 * came due exactly as often as one that scraped through once, which
 * is the opposite of what spacing is for — and the app already had
 * an engine that does this properly and drills every other module
 * with it.
 *
 * ONLY THE FOUR DEPTH KEYS EVER REACH THESE STATES. The breadth half
 * of Cross-key → Internalized reads `songKeyRunThroughs` — event rows
 * with a `createdAt` and no expiry. A clean run is a thing that
 * happened and it stays happened. Only `isHeld`, which consults a
 * clock, can lapse.
 */

/**
 * Held  — proven recently enough that the claim stands.
 * Due soon — inside the warning window, so the work can be done
 *            before it bites rather than after.
 * Due   — time to prove it again. Still counts.
 * Overdue — past due AND past grace. This is the one that drops a
 *           rung; everything above it is a warning, not a loss.
 */
export type KeyDueState = 'held' | 'due-soon' | 'due' | 'overdue';

export interface DueWindows {
  /** Days before `nextDueAt` that a key starts warning. */
  dueSoonDays: number;
  /** Days after `nextDueAt` before the rung actually drops. */
  graceDays: number;
}

export const DUE_SOON_DEFAULT_DAYS = 7;
export const GRACE_DEFAULT_DAYS = 7;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Which state a key is in.
 *
 * `nextDueAt === null` means the key has never been proven, so there
 * is nothing to be overdue on. It reads as `held` — a key that has
 * not earned a due date cannot lose a rung it never counted toward,
 * and `isComfortableOrBetter` is what gates whether it counts at all.
 * Returning `overdue` here would demote a song for never having
 * started.
 */
export function keyDueState(
  nextDueAt: number | null,
  now: number,
  windows: DueWindows,
): KeyDueState {
  if (nextDueAt === null) return 'held';

  const graceEnds = nextDueAt + windows.graceDays * MS_PER_DAY;
  if (now > graceEnds) return 'overdue';
  if (now >= nextDueAt) return 'due';

  const warnFrom = nextDueAt - windows.dueSoonDays * MS_PER_DAY;
  if (now >= warnFrom) return 'due-soon';
  return 'held';
}

/**
 * Whether this state still counts toward a rung.
 *
 * Everything except `overdue`. Due and due-soon are warnings — the
 * whole point of showing them is that the rung has NOT dropped yet
 * and there is time to act. A state that both warns and demotes gives
 * the user nothing to do with the warning.
 */
export function stateHoldsRung(state: KeyDueState): boolean {
  return state !== 'overdue';
}

/** Whole days until due — negative once past it. Null when never
 *  proven, which is not the same as "due in 0 days". */
export function daysUntilDue(nextDueAt: number | null, now: number): number | null {
  if (nextDueAt === null) return null;
  return Math.ceil((nextDueAt - now) / MS_PER_DAY);
}

/** Whole days past the end of grace. 0 or less while the rung still
 *  holds — used to show a drop approaching rather than only on
 *  arrival. */
export function daysPastGrace(
  nextDueAt: number | null,
  now: number,
  windows: DueWindows,
): number {
  if (nextDueAt === null) return 0;
  const graceEnds = nextDueAt + windows.graceDays * MS_PER_DAY;
  return Math.max(0, Math.floor((now - graceEnds) / MS_PER_DAY));
}

export const KEY_DUE_STATE_LABEL: Record<KeyDueState, string> = {
  'held': 'held',
  'due-soon': 'due soon',
  'due': 'due',
  'overdue': 'overdue',
};
