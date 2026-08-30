import { isCleanFeel, type Feel } from '../fluencyScale';

/**
 * Three in a row, and a bad run costs it — for every surface.
 *
 * =====================================================================
 * THE PANEL AND THE BAND RULE WERE COUNTING DIFFERENT THINGS.
 *
 * `banding.ts` has counted three-consecutive-Clean-with-a-reset since
 * the streak rule landed. The panel counted `countsTowardTest`, which
 * is `!belowTarget && !tooShort && feel !== null` — it never looked at
 * the feel's VALUE.
 *
 * So three at-target rated drills, one of them **Struggled**, made the
 * panel say "The Three Test Drills" were done. Then banding read the
 * same three reps, hit the Struggled one, reset, found no pass, and
 * capped the card at Developing. The screen announced a completed test
 * and the rule quietly refused it. Nothing in the data was wrong — the
 * done step reads the real verdict — but the user was told two
 * different stories and only one of them was true.
 *
 * This is the one count. The panel projects it live from the runs of
 * the current session; `banding.ts` reconstructs it afterwards from the
 * stored reps. Same rule, two readers, and no way for them to drift.
 *
 * =====================================================================
 * WHY THE RESET IS THE RULE EVERYWHERE, NOT A SONG PREFERENCE.
 *
 * A test used to be three and done, taking the FIRST three rather than
 * the best three. Fumble the first drill and it was already in your
 * result, the two after it could not rescue you, and there was no
 * fourth. On a song a bad run costs the streak and you go again.
 *
 * The second is what a person actually does: keep going until they get
 * it right. It is also the harder claim — three in a row proves it was
 * not luck, where three-with-a-fumble proves the fumble.
 * =====================================================================
 */

/** Runs in a row needed to pass. */
export const TEST_REPS = 3;

/** One run, reduced to what the streak cares about. */
export interface StreakRun {
  /**
   * Whether the run was fast enough to count.
   *
   * A run below the floor is INVISIBLE to the streak — it neither
   * advances nor resets it. A warm-up under tempo is a different
   * activity, not a failed demonstration, and treating it as a failure
   * would make practising inside a test session cost you the test.
   */
  counts: boolean;
  /** How it went, or null when it was not rated. */
  feel: Feel | null;
}

/**
 * The streak after these runs, capped at `TEST_REPS`.
 *
 * An UNRATED run resets, and that is deliberate rather than an
 * oversight about nulls: a test rep is a claim, and a run you declined
 * to judge is not one. It cannot advance a streak, and letting it pass
 * through untouched would mean three clean runs with an unrated one
 * between them read as three in a row.
 */
export function projectTestStreak(runs: ReadonlyArray<StreakRun>): number {
  let count = 0;
  for (const r of runs) {
    if (!r.counts) continue;
    if (r.feel !== null && isCleanFeel(r.feel)) {
      count = Math.min(count + 1, TEST_REPS);
    } else {
      count = 0;
    }
  }
  return count;
}

/** Whether these runs have passed a test. */
export function streakPassed(runs: ReadonlyArray<StreakRun>): boolean {
  return projectTestStreak(runs) >= TEST_REPS;
}

/**
 * Is this run fast enough to count?
 *
 * =====================================================================
 * ONE GATE, TWO FLOORS — AND THE FLOORS ARE NOT THE SAME NUMBER.
 *
 * `isAtTarget` (shapes) and `isInTempoRange` (songs) asked the same
 * question in two places, which is what made folding them look
 * mechanical. It is not, and the difference matters:
 *
 *   SONGS   floor is ten bpm below the song's tempo.
 *   SHAPES  floor is the target rate exactly, with no tolerance.
 *
 * And "ten below" does not transfer. A shapes rate is reps per minute
 * derived from bpm and a divisor, so ten below a rate of 240 at four
 * notes per beat is two and a half bpm — a different rule wearing the
 * same number.
 *
 * So what is shared is the QUESTION and the null handling; the floor
 * stays the caller's. Folding the tolerance too would have smuggled a
 * behaviour change into three live surfaces inside a commit about
 * something else.
 *
 * A run with no measurable rate does NOT count. A run at a tempo you
 * did not state cannot be verified at the target, and "clean at a
 * tempo you didn't say" is not an answer to "clean at tempo". A null
 * FLOOR is the opposite: no target to measure against, so everything
 * counts.
 * =====================================================================
 */
export function meetsFloor(value: number | null, floor: number | null): boolean {
  if (floor === null) return true;
  if (value === null) return false;
  return value >= floor;
}
