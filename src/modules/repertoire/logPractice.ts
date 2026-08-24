import { db, type SongPracticeLog } from '../../lib/db';
import { recordEngagement } from '../../lib/spacingState';
import type { Feel } from '../../lib/fluencyScale';
import { normaliseActivities, type PracticeActivity } from '../../lib/practiceActivities';

/**
 * Write one practice session.
 *
 * ---------------------------------------------------------------
 * DURATION IS THE RECORD. EVERYTHING ELSE IS OPTIONAL.
 *
 * The failure this exists to fix: logging practice required deciding
 * tempo, cleanliness, feel and notes — per section, per key — at the
 * moment you least want to make decisions, so it didn't happen and the
 * matrix stayed empty on songs that had been worked hard.
 *
 * So the only required field is `durationMin`. A row with sections
 * unset ("40 minutes, couldn't tell you which") is a COMPLETE record,
 * not a degraded one — and it is one the per-cell model structurally
 * cannot hold, since every run-through needs exactly one section and
 * one key.
 *
 * `activities` joins the same rule rather than becoming the exception
 * to it. Naming what the sitting was is the thing this field exists
 * for, and it is still optional: a taxonomy choice at the end of a
 * practice session is the kind of bureaucracy that stops the logging
 * happening at all, which is the failure above, one field later.
 * ---------------------------------------------------------------
 */
export interface LogPracticeInput {
  songId: string;
  /** Whole minutes. The one required field. */
  durationMin: number;
  /** Empty means "the whole song, or I don't remember" — a real
   *  value, not a missing one. */
  sectionIds?: string[];
  /** Empty falls back to the song's own key at read time. */
  keys?: string[];
  /**
   * Omitted when the user didn't say.
   *
   * NOT defaulted. `PracticeLogModal` initialises its picker to 3, so
   * every session the user doesn't explicitly rate is recorded as
   * "comfortable" — a rating they never gave, which then feeds
   * spacing state and stage advancement. Leaving it absent is the
   * honest alternative, and it is why `recordEngagement` below is
   * conditional.
   */
  feelRating?: Feel;
  notes?: string;
  atTargetTempo?: boolean;
  /**
   * What kind of work it was. Empty or omitted means the user did not
   * say — a complete record, not a degraded one, on the same argument
   * as `sectionIds` above.
   *
   * Normalised on the way in: unknown slugs are dropped and the rest
   * are stored in the canonical order, so two sittings that ticked the
   * same things produce identical arrays.
   */
  activities?: ReadonlyArray<PracticeActivity | string>;
  /** Free text for `'other'`. Trimmed, and dropped when blank. */
  activityOther?: string;
  timestamp?: number;
}

/**
 * Persist the session and return its id, so run-throughs saved in the
 * same gesture can point at it.
 *
 * Deliberately does NOT touch `songCrossKeyProgress`. That table is
 * `@deprecated` in db.ts ("Do NOT route new writes here") and the
 * matrix's `songCells` already record section × key far better — a
 * cell state and a run-through history, versus an int and a manual
 * boolean. `PracticeLogModal` still writes it; adding a second writer
 * would be moving backwards from the retirement in step 4.
 */
export async function logPracticeSession(
  input: LogPracticeInput,
): Promise<string> {
  const now = input.timestamp ?? Date.now();
  const id = `plog-${crypto.randomUUID()}`;
  const activities = normaliseActivities(input.activities);
  const activityOther = (input.activityOther ?? '').trim();
  const notes = (input.notes ?? '').trim();

  const row: SongPracticeLog = {
    id,
    songId: input.songId,
    timestamp: now,
    durationMin: Math.max(1, Math.round(input.durationMin)),
    sectionIds: input.sectionIds ?? [],
    keys: input.keys ?? [],
    // OMITTED when the user didn't rate it. Writing a neutral 3 would
    // be inventing the very judgement the fast path exists to let them
    // skip, and it would then feed stage advancement as though it were
    // real. Absent and "average" are different facts.
    ...(input.feelRating !== undefined ? { feelRating: input.feelRating } : {}),
    // Trimmed, and absent when that leaves nothing. A textarea the
    // user opened and thought better of holds a newline or a space,
    // and a row whose note is " " reads as a note in every list that
    // renders one.
    ...(notes !== '' ? { notes } : {}),
    ...(input.atTargetTempo !== undefined
      ? { atTargetTempo: input.atTargetTempo }
      : {}),
    // OMITTED, not `[]`, when nothing was ticked. An empty array is a
    // claim — "I answered, and the answer was none of these" — which
    // is not an answer the UI can produce and not one the user gave.
    // Absent says the honest thing: nobody said. It also keeps a row
    // written today indistinguishable from one written before the
    // field existed, which is correct, because those are the same
    // fact.
    ...(activities.length > 0 ? { activities } : {}),
    // Only alongside 'other', and only when it says something. Free
    // text without the slug would be an activity no picker can show,
    // and 'other' with a blank line is a real answer — "something
    // else, and I did not say what" — so the slug does not require
    // the text.
    ...(activityOther !== '' && activities.includes('other')
      ? { activityOther }
      : {}),
  };

  await db.songPracticeLog.add(row);

  // ---------------------------------------------------------------
  // THE NEXT PRACTICE RETIRES THE "EARNED JUST NOW" NOTICE.
  //
  // Not a clock. A fixed window would have an arbitrary number
  // deciding when the news stops being news, and would expire while
  // you were away from the instrument — which is exactly when you
  // would want to come back and see it. The thing that supersedes
  // "look what you just did" is doing the next thing: at that point
  // the page is about the work in front of you again.
  //
  // Guarded so a song with nothing to clear takes no write, and
  // outside any transaction for the same reason the engagement call
  // below is — this must not be able to roll back the practice log.
  // ---------------------------------------------------------------
  try {
    const song = await db.songs.get(input.songId);
    if (song?.stageEarned !== undefined) {
      await db.songs.update(input.songId, { stageEarned: undefined, updatedAt: now });
    }
  } catch (err) {
    console.warn('[repertoire] clearing stageEarned failed', err);
  }

  // ONLY when the user actually rated the session. Repertoire is
  // `integration` memory, which accepts a `rating` signal and nothing
  // else (a `recency` signal throws — see assertSignalMatchesMemoryType),
  // so an unrated session has no honest signal to send. Skipping is
  // better than inventing one: a fabricated "comfortable" would feed
  // both the spacing curve and stage advancement.
  //
  // Outside any transaction by design, mirroring PracticeLogModal: a
  // spacingState failure must not roll back the practice log.
  //
  // ---------------------------------------------------------------
  // AND THIS CANNOT MOVE A KEY'S RETEST CLOCK. `itemRef` is the SONG,
  // and the clock lives on a different row: `songKey:<songKeyId>`,
  // written only by `recordKeyProving` when a whole-song test is
  // passed or failed, and read by `dueByKeyId` → `keyDueState` → the
  // rung that holds or drops. Two namespaces, one engine; practice
  // cannot reach the key rows and does not try to.
  //
  // That separation matters more from step 3d-6 than it did before it.
  // Until the rating step existed, the timer path passed no
  // `feelRating`, so this branch never ran from a timed sitting and
  // the question never came up. Now it runs on every rated session —
  // and it must stay unable to buy or cost a key the time that only
  // three clean run-throughs can. `proveKey.ts`'s header states the
  // rule from the other side: a single run cannot earn time, so it
  // must not cost time either. Asserted, not assumed — see
  // `practiceDoesNotMoveRetestClock` in the tests, which checks the
  // itemRef namespace rather than any screen.
  // ---------------------------------------------------------------
  if (input.feelRating !== undefined) {
    try {
      await recordEngagement({
        itemRef: input.songId,
        moduleRef: 'repertoire',
        signal: { kind: 'rating', rating: feelToRating(input.feelRating) },
        timestamp: now,
      });
    } catch (err) {
      console.warn('[repertoire] practice engagement failed', err);
    }
  }

  return id;
}

/**
 * Collapse a feel onto the three-value vocabulary spacingState
 * consumes. Matches PracticeLogModal's mapping exactly — with the
 * fifth step gone, "in flow" is the top of the scale and so maps to
 * flying; holding flying back for a level that no longer exists would
 * leave the top grade permanently unreachable.
 */
export function feelToRating(feel: Feel): 'flying' | 'cruising' | 'crawling' {
  if (feel >= 4) return 'flying';
  if (feel >= 3) return 'cruising';
  return 'crawling';
}
