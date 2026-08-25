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

/**
 * The `elapsedMs` fragment for a drill whose question is HEARD.
 *
 * =====================================================================
 * THE CLOCK STARTS WHEN THE SOUND ENDS, AND ZERO IS A REAL ANSWER.
 *
 * `playInterval` and its siblings are `async` only because they await
 * the audio context — they resolve once the notes are SCHEDULED, not
 * once they are heard. So "await the play call, then start the clock"
 * still folds the whole playback duration into every measurement,
 * which is the fixed offset that would make every progression look
 * slow for a reason that has nothing to do with the reader.
 *
 * So callers pass the moment playback is scheduled to FINISH, computed
 * from the same durations the player uses.
 *
 * A READER WHO ANSWERS BEFORE THE SOUND ENDS RECORDS ZERO, not a
 * negative and not nothing. Recognising a chord from its first note is
 * the fastest answer there is; zero is a true lower bound on it.
 * Discarding it instead would throw away precisely the fastest answers
 * and bias the whole sample slow.
 *
 * THAT IS NOT THE CLAMP THE CEILING REFUSES. The ceiling's clamp would
 * invent "slow" for something never measured — a card abandoned on
 * screen. This floor reports "immediate" for something that genuinely
 * happened immediately. One fabricates evidence, the other rounds a
 * real observation to the nearest representable value.
 * =====================================================================
 */
export function heardElapsedFields(
  playbackEndsAt: number | null,
  now: number,
): { elapsedMs?: number } {
  if (playbackEndsAt === null) return {};
  const elapsed = Math.max(0, now - playbackEndsAt);
  if (elapsed > WALK_AWAY_CEILING_MS) return {};
  return { elapsedMs: elapsed };
}

/** The context fields four settings contribute, spread onto a record. */
export function contextFields(context: {
  playbackSpeed?: number;
  playStyle?: 'blocked' | 'broken';
  drillTab?: string;
}): Record<string, unknown> {
  return {
    ...(context.playbackSpeed !== undefined ? { playbackSpeed: context.playbackSpeed } : {}),
    ...(context.playStyle !== undefined ? { playStyle: context.playStyle } : {}),
    ...(context.drillTab !== undefined ? { drillTab: context.drillTab } : {}),
  };
}

/**
 * Everything a heard question contributes to its attempt row.
 *
 * =====================================================================
 * CAPTURED WHEN THE QUESTION IS ASKED, READ WHEN IT IS ANSWERED.
 *
 * The four settings that change how long an answer takes — speed,
 * blocked vs broken, and which tab of a multi-drill module — are all
 * controls the reader can move WHILE THINKING. Reading them at write
 * time records what the slider says after the fact, which is a
 * different measurement wearing the same field name, and wrong exactly
 * in the cases where the setting matters.
 *
 * So a module fills one of these when it presents the question and
 * hands it back untouched when the answer lands. One object, so a
 * caller cannot capture three of the four and read the fourth live.
 * =====================================================================
 */
export interface AskedContext {
  /** When the sound is scheduled to stop, epoch ms. */
  playbackEndsAt: number;
  playbackSpeed?: number;
  playStyle?: 'blocked' | 'broken';
  drillTab?: string;
}

/** The measurement and context fragment for a heard question. */
export function answerTimingFields(
  asked: AskedContext | null,
  answeredAt: number,
): Record<string, unknown> {
  if (asked === null) return {};
  return {
    ...heardElapsedFields(asked.playbackEndsAt, answeredAt),
    ...contextFields(asked),
  };
}
