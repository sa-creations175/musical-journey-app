/**
 * The song practice timer's storage and time arithmetic.
 *
 * ---------------------------------------------------------------
 * WHY THIS IS NOT THE SESSION TIMER.
 *
 * `lib/sessionTimer` already exists and is not this. It models a
 * PLANNED session — an ordered list of blocks with target durations,
 * built by the session algorithm — and one is live app-wide at a
 * time. Four things stop it being reused here:
 *
 *   1. `startSession` REFUSES while a session is live (reducer.ts
 *      "Refuse to clobber an active session"), returning state
 *      unchanged. A song timer routed through it would silently do
 *      nothing during a practice session, which is the exact
 *      silent-failure shape this workstream keeps removing.
 *   2. Its unit is a block with `plannedSeconds`. A song stopwatch
 *      has no plan and no target.
 *   3. Ending a session writes `practiceSessions` / `practiceBlocks`
 *      / `songKeyEngagements`. This writes `songPracticeLog`.
 *   4. "Reset the session" would also mean "throw away song time".
 *
 * Repertoire was never a consumer of it either: no file under
 * modules/repertoire references sessionTimer, and no session code
 * writes songPracticeLog. A session can TARGET a song — a block with
 * moduleRef 'repertoire' logs songKeyEngagements on completion — but
 * it has never recorded practice minutes against one.
 *
 * BOTH RUN AT ONCE, DELIBERATELY, AND ARE NEVER SUMMED. Song minutes
 * sit INSIDE session minutes; adding them invents time that did not
 * happen. No aggregate does today — dashboard's `todayMinutes` and
 * goals' `dailyActivity` both read songPracticeLog without reading
 * practiceSessions, and weeklyAttempts reads practiceSessions only to
 * count days. The exposure is a future surface, which is why the two
 * are labelled to share no words on screen.
 * ---------------------------------------------------------------
 *
 * LOCALSTORAGE, NOT DEXIE, and the reason is replication. Every Dexie
 * table in `sync/tables.ts` pushes to Supabase; a running timer that
 * replicated would appear on a second device as a timer that device
 * cannot stop. `sync/watermark.ts` chose localStorage for exactly this
 * reason and says so. (`activeSessionDraft` is the counter-example —
 * a Dexie table deliberately absent from the sync list — but
 * localStorage is simpler here: a synchronous read at mount, with no
 * async race against the resume gate.)
 *
 * TIME IS DERIVED FROM TIMESTAMPS, NEVER ACCUMULATED BY TICKING. A
 * counter incremented on an interval loses everything the moment the
 * page unloads, and drifts whenever the tab is throttled in the
 * background. Storing `startedAt` and reading the clock means a
 * reload recovers the exact elapsed with no recovery logic at all.
 */

/** Bumped if the record shape changes; an unreadable version is
 *  discarded rather than migrated, because a timer is worth less than
 *  the risk of resurrecting one wrong. */
const STORAGE_KEY = 'mja.songTimer.v1';

export interface SongTimerRecord {
  songId: string;
  /**
   * When the CURRENT running segment began. Meaningless while
   * paused — `accumulatedMs` holds everything in that case.
   */
  startedAt: number;
  /** Completed segments, before the current one. */
  accumulatedMs: number;
  running: boolean;
  /**
   * When the app last saw activity.
   *
   * Persisted rather than held in memory for the same reason the
   * elapsed is derived from timestamps: a reload has to be able to
   * answer "how long was the gap?", and a tab closed at 14:00 and
   * reopened at 23:00 is the same question as walking away for forty
   * minutes, only with a bigger number. Keeping this in memory would
   * have forced a second, separate restore policy for a case that is
   * not actually different.
   *
   * Records written before this field existed are normalised on read
   * to `startedAt` — the honest floor, since nothing later is known.
   */
  lastActivityAt: number;
}

/**
 * Elapsed time for a record as of `now`.
 *
 * `now` is a parameter rather than a `Date.now()` call so callers can
 * pass a render-stable instant and tests need no fake clock. A
 * paused record ignores `now` entirely.
 */
export function elapsedMs(record: SongTimerRecord, now: number): number {
  if (!record.running) return Math.max(0, record.accumulatedMs);
  // A clock that moved backwards (NTP correction, manual change)
  // would otherwise subtract from accumulated time. Clamp the segment
  // at zero: the honest floor is "no time has passed since the start",
  // never "negative time".
  const segment = Math.max(0, now - record.startedAt);
  return Math.max(0, record.accumulatedMs) + segment;
}

/**
 * Whole minutes to log, rounding UP with a floor of 1.
 *
 * Matches DurationCapture, and for its reason: a 40-second pass at
 * one bar is still practice, and recording it as 0 would drop the row
 * entirely. Returns 0 only for a genuinely zero-length record, which
 * the caller should decline to log at all.
 */
export function elapsedMinutes(record: SongTimerRecord, now: number): number {
  const ms = elapsedMs(record, now);
  if (ms <= 0) return 0;
  return Math.max(1, Math.ceil(ms / 60_000));
}

export function startedRecord(songId: string, now: number): SongTimerRecord {
  return {
    songId, startedAt: now, accumulatedMs: 0, running: true, lastActivityAt: now,
  };
}

/**
 * How long the app has seen nothing. Drives the amber state and the
 * question asked on return.
 */
export function inactivityMs(record: SongTimerRecord, now: number): number {
  return Math.max(0, now - record.lastActivityAt);
}

/** Mark activity. Cheap and called often, so it returns the same
 *  object when nothing moved. */
export function withActivity(record: SongTimerRecord, now: number): SongTimerRecord {
  if (now <= record.lastActivityAt) return record;
  return { ...record, lastActivityAt: now };
}

/**
 * Settle an un-attributed stretch and start a fresh one.
 *
 * `keepFraction` is what the user said they were doing — 1 for "I was
 * locked in", 0 for "I was gone", and the coarse buckets between. The
 * discarded part is subtracted from the banked total; nothing is ever
 * dropped without an answer.
 *
 * Folding the live segment in and restarting it is what makes this
 * safe to call repeatedly: each gap is settled once and cannot be
 * counted, or discounted, twice.
 */
export function resolvedGap(
  record: SongTimerRecord,
  now: number,
  keepFraction: number,
): SongTimerRecord {
  const gap = inactivityMs(record, now);
  const clamped = Math.min(1, Math.max(0, keepFraction));
  const discarded = gap * (1 - clamped);
  const banked = Math.max(0, elapsedMs(record, now) - discarded);
  return {
    ...record,
    accumulatedMs: banked,
    startedAt: now,
    lastActivityAt: now,
  };
}

/** Fold the running segment into `accumulatedMs` and stop the clock.
 *  Idempotent: pausing a paused record changes nothing, rather than
 *  folding a stale `startedAt` in a second time. */
export function pausedRecord(record: SongTimerRecord, now: number): SongTimerRecord {
  if (!record.running) return record;
  return {
    ...record,
    accumulatedMs: elapsedMs(record, now),
    startedAt: now,
    running: false,
  };
}

/** Restart the clock without disturbing what is banked. Idempotent
 *  for the same reason as `pausedRecord`. */
export function resumedRecord(record: SongTimerRecord, now: number): SongTimerRecord {
  if (record.running) return record;
  return { ...record, startedAt: now, running: true };
}

// --- storage --------------------------------------------------------
//
// Every accessor swallows its own failures. localStorage throws in
// Safari private mode and when a quota is hit, and a practice timer
// is not worth taking a screen down for: a caller that gets null
// behaves as though no timer were running, which is the correct
// degraded state.

export function readSongTimer(): SongTimerRecord | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    // Normalise a record written before lastActivityAt existed rather
    // than rejecting it — discarding a running timer over a missing
    // field the user never knew about would be the upgrade eating
    // their work. startedAt is the honest floor: nothing later is
    // known to have happened.
    return typeof parsed.lastActivityAt === 'number'
        && Number.isFinite(parsed.lastActivityAt)
      ? parsed
      : { ...parsed, lastActivityAt: parsed.startedAt };
  } catch {
    return null;
  }
}

export function writeSongTimer(record: SongTimerRecord): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Nothing to do and nothing worth telling the user: the timer
    // still runs in memory for this page's lifetime.
  }
}

export function clearSongTimer(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // See writeSongTimer.
  }
}

/**
 * Validate a parsed value into a record, or reject it.
 *
 * Hand-written rather than trusted, because this data crosses a
 * process boundary: it was written by a possibly-older build, and a
 * user can edit it. A malformed record that type-assertions waved
 * through would produce NaN elapsed and a nonsense duration logged
 * against a real song.
 */
function isRecord(value: unknown): value is SongTimerRecord {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  // lastActivityAt is deliberately NOT required here — readSongTimer
  // fills it from startedAt. See the normalisation there.
  return typeof v.songId === 'string'
    && v.songId.length > 0
    && typeof v.startedAt === 'number'
    && Number.isFinite(v.startedAt)
    && typeof v.accumulatedMs === 'number'
    && Number.isFinite(v.accumulatedMs)
    && typeof v.running === 'boolean';
}
