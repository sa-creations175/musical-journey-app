/**
 * How long an answer took — recorded, and not yet read by anything.
 *
 * =====================================================================
 * SILENT MEASUREMENT. THE BOUNDARY COMES LATER, FROM REAL HISTORY.
 *
 * A fast/slow split needs a threshold, and a threshold invented before
 * there is data is a guess wearing a number. Reading has been recording
 * `elapsedMs` for months without anything branching on it, for exactly
 * this reason; this extends the same posture to the other five modules.
 *
 * Nothing here changes a schedule, and nothing displays a time. Adding
 * either would put speed pressure into drills that have never had it,
 * which changes the thing being measured.
 * =====================================================================
 */

/**
 * Above this, the measurement is discarded rather than clamped.
 *
 * =====================================================================
 * OMITTED, NOT CLAMPED, AND THAT IS THE WHOLE DECISION.
 *
 * A card left open while its reader makes tea is not a slow answer, it
 * is not an answer at all. Clamping such a row to five minutes still
 * files a "slow" vote from a datapoint nobody trusts; omitting the
 * field says "unmeasured", which is true. `elapsedMs` is optional, so
 * absence is already representable and every reader must already
 * handle it — the missing case costs nothing to express.
 *
 * FIVE MINUTES, NOT NINETY SECONDS. A four-chord progression the
 * reader replays three times can legitimately take a couple of
 * minutes, and a ceiling tight enough to catch tea-making would throw
 * away real answers in the ear modules.
 *
 * DECIDED AND RECORDED HERE SO IT IS NOT LOST: when the grading
 * eventually lands, an attempt with no `elapsedMs` grades as SLOW, not
 * fast. Growing an interval on evidence we do not have is the failure
 * this ceiling exists to prevent, and the ceiling would create it if
 * the missing case defaulted the other way.
 * =====================================================================
 */
export const WALK_AWAY_CEILING_MS = 5 * 60 * 1000;

/**
 * The `elapsedMs` fragment for an attempt, spread onto the record.
 *
 * Returns an empty object above the ceiling, so the field is ABSENT
 * rather than undefined — `Object.hasOwn` can tell those apart and
 * `toHaveProperty(x, undefined)` cannot, and only absence survives a
 * round trip through JSON to Postgres unchanged.
 *
 * `startedAt` is when the question became ANSWERABLE, never when the
 * component mounted. In the ear modules the audio plays first, and a
 * clock started at mount folds the playback duration into every
 * measurement — a fixed offset that makes every progression look slow
 * for a reason that has nothing to do with the reader.
 */
export function elapsedFields(
  startedAt: number | null,
  now: number,
): { elapsedMs?: number } {
  if (startedAt === null) return {};
  const elapsed = now - startedAt;
  // A negative reading means the clock was restarted after the answer
  // — a bug, not a fast answer, and one worth not recording either.
  if (elapsed < 0 || elapsed > WALK_AWAY_CEILING_MS) return {};
  return { elapsedMs: elapsed };
}

/** The `timedOut` fragment, present only when the countdown expired. */
export function timedOutFields(timedOut: boolean): { timedOut?: boolean } {
  return timedOut ? { timedOut: true } : {};
}
