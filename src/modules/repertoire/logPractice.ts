import { db, type SongPracticeLog } from '../../lib/db';
import { recordEngagement } from '../../lib/spacingState';
import type { Feel } from '../../lib/fluencyScale';

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
    ...(input.notes ? { notes: input.notes } : {}),
    ...(input.atTargetTempo !== undefined
      ? { atTargetTempo: input.atTargetTempo }
      : {}),
  };

  await db.songPracticeLog.add(row);

  // ONLY when the user actually rated the session. Repertoire is
  // `integration` memory, which accepts a `rating` signal and nothing
  // else (a `recency` signal throws — see assertSignalMatchesMemoryType),
  // so an unrated session has no honest signal to send. Skipping is
  // better than inventing one: a fabricated "comfortable" would feed
  // both the spacing curve and stage advancement.
  //
  // Outside any transaction by design, mirroring PracticeLogModal: a
  // spacingState failure must not roll back the practice log.
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
