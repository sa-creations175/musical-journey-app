import { useCallback, useEffect, useState } from 'react';
import { logPracticeSession } from './logPractice';
import {
  bankOpenGap,
  clearSongTimer,
  elapsedMinutes,
  elapsedMs,
  pausedRecord,
  readSongTimer,
  resolvedGap,
  resumedRecord,
  startedRecord,
  writeSongTimer,
  type SongTimerRecord,
} from './songTimer';
import type { Feel } from '../../lib/fluencyScale';
import type { PracticeActivity } from '../../lib/practiceActivities';

/**
 * React binding for the song practice timer.
 *
 * ---------------------------------------------------------------
 * ONE TIMER, WHATEVER SONG YOU ARE LOOKING AT.
 *
 * The hook returns the stored record REGARDLESS of which song it
 * belongs to, and reports `isThisSong` separately. That is what lets
 * song B's page say "a timer is running on song A" instead of
 * pretending nothing is running — the silent no-op that
 * `sessionTimer.startSession` performs and that this deliberately
 * does not repeat.
 * ---------------------------------------------------------------
 *
 * State is mirrored from localStorage rather than owned here, so two
 * tabs of the app cannot disagree: a `storage` event from another tab
 * re-reads, and the derived elapsed comes from timestamps either way.
 */

const TICK_MS = 1000;

/** The one shape for "the stop produced no row", so the two fields
 *  cannot disagree about it at four different return sites. */
const NOTHING_WRITTEN = { minutes: 0, practiceLogId: null } as const;

/**
 * What the run was ON, when the surface knows.
 *
 * A run started from a matrix cell knows its section and its key; one
 * started from a bare timer knows neither, and "40 minutes, couldn't
 * tell you which sections" stays a complete record rather than a
 * degraded one. So this is optional at the type level, not defaulted
 * to the song's first section.
 */
export interface PracticeContext {
  sectionIds?: string[];
  keys?: string[];
  /**
   * What the sitting was, and how it went — the rating step's answers.
   *
   * Optional at the type level for the same reason section and key
   * are: a stop that never passed through the rating step (the swap
   * prompt logs the song being left) has no answers to carry, and
   * inventing them would be worse than the time going unlabelled.
   */
  activities?: ReadonlyArray<PracticeActivity>;
  activityOther?: string;
  feelRating?: Feel;
}

/**
 * What a stop wrote.
 *
 * `practiceLogId` exists because a run-through logged inside a timed
 * sitting should point at it — `songCellRunThroughs.practiceLogId` is
 * that link, and a null there means "logged on its own", which would
 * be false for every attempt made during a test. The caller cannot
 * recover the id any other way: the row is written inside `stopAndLog`
 * and has a generated id.
 *
 * Null when nothing was written — a zero-length timer, or a write that
 * failed. `minutes` is 0 in the same cases, so the two agree.
 */
export interface PracticeWriteResult {
  minutes: number;
  practiceLogId: string | null;
}

export interface SongTimerApi {
  /** The stored timer, for any song. Null when none is running. */
  record: SongTimerRecord | null;
  /** True when a timer exists AND belongs to the song passed in. */
  isThisSong: boolean;
  /** Live elapsed for `record`, ticking. 0 when there is none. */
  elapsedMs: number;
  /** Start on this song. Only valid when nothing else is running —
   *  the caller offers the swap otherwise. */
  start: () => void;
  /**
   * Stop the clock WITHOUT logging, keeping everything banked.
   *
   * ---------------------------------------------------------------
   * WHAT SITS BETWEEN THE TIMER AND THE WRITE.
   *
   * The rating step asks three questions after the work has stopped,
   * and neither of the two obvious shapes survives contact:
   *
   *   · leave it running while you answer — the minutes inflate by
   *     however long you spent choosing, and the answer to "how did
   *     it go" costs you time on the record;
   *   · write on Done and update the row afterwards — two writes for
   *     one sitting, and a row that exists in an unrated state that
   *     nothing intended.
   *
   * So Done pauses and Save writes. The paused record stays in
   * localStorage, so closing the tab mid-rating loses the ANSWERS and
   * not the minutes — the timer is still there, paused, when you come
   * back. Backing out resumes it.
   * ---------------------------------------------------------------
   */
  pause: () => void;
  /** Restart a paused clock without disturbing what is banked. What
   *  backing out of the rating step calls. */
  resume: () => void;
  /** True when a timer exists, belongs to this song, and is stopped
   *  but unlogged — i.e. the rating step is what it is waiting on. */
  isPaused: boolean;
  /**
   * Stop and LOG. Writes one songPracticeLog row for the timer's own
   * song — not necessarily the song on screen, which is what makes
   * the swap honest.
   *
   * Returns the minutes written and the row's id, or zero and null
   * when there was nothing worth writing. Nothing is written before
   * this is called: while running, the only persisted state is the
   * localStorage record.
   */
  stopAndLog: (context?: PracticeContext) => Promise<PracticeWriteResult>;
  /** Log whatever is running, then start fresh on this song. */
  swapToThisSong: () => Promise<PracticeWriteResult>;
  /** Throw the timer away without logging. For a record whose song no
   *  longer exists. */
  discard: () => void;
  /** Un-attributed time awaiting an answer, in ms. 0 when there is
   *  nothing to ask about. */
  pendingGapMs: number;
  /** Answer the banked stretch. `keepFraction` is 1 for "I was locked
   *  in" through 0 for "I was gone". */
  resolvePendingGap: (keepFraction: number) => void;
  /** Fold a silence that is still open into the banked total so it can
   *  be asked about. Called before stopping. */
  bankOpenSilence: (amberThresholdMs: number | null) => number;
}

export function useSongTimer(songId: string): SongTimerApi {
  const [record, setRecord] = useState<SongTimerRecord | null>(() => readSongTimer());
  const [now, setNow] = useState(() => Date.now());

  // Tick only while something is running. A paused or absent timer
  // needs no re-render, and an interval that runs regardless is a
  // wake-up every second for a screen showing a static number.
  useEffect(() => {
    if (!record?.running) return;
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, [record?.running]);

  // Another tab started, stopped or swapped the timer. Without this
  // the two tabs would show different numbers for one timer and each
  // would be able to log it.
  useEffect(() => {
    const onStorage = () => setRecord(readSongTimer());
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const persist = useCallback((next: SongTimerRecord | null) => {
    if (next === null) clearSongTimer();
    else writeSongTimer(next);
    setRecord(next);
  }, []);

  const start = useCallback(() => {
    const at = Date.now();
    persist(startedRecord(songId, at));
    setNow(at);
  }, [persist, songId]);

  /**
   * Fold the running segment in, log it against ITS OWN song, clear.
   *
   * The stopped record's `songId` is used rather than the hook's,
   * deliberately: when this runs as part of a swap, the minutes
   * belong to the song being left, and attributing them to the song
   * being opened would silently move practice between songs.
   */
  const stopAndLog = useCallback(async (
    context?: PracticeContext,
  ): Promise<PracticeWriteResult> => {
    const current = readSongTimer();
    if (current === null) return NOTHING_WRITTEN;
    const at = Date.now();
    const minutes = elapsedMinutes(current, at);
    persist(null);
    if (minutes <= 0) return NOTHING_WRITTEN;
    try {
      const practiceLogId = await logPracticeSession({
        songId: current.songId,
        durationMin: minutes,
        // Section and key when the surface knew them — a run from a
        // matrix cell does. This is the thing practice work has never
        // had: somewhere to land other than a song-level total.
        ...(context?.sectionIds?.length ? { sectionIds: context.sectionIds } : {}),
        ...(context?.keys?.length ? { keys: context.keys } : {}),
        // What the work was, when the rating step asked and the user
        // answered. Absent otherwise — a swap logs the song being
        // left without ever showing that step, and it has nothing to
        // say on its behalf.
        ...(context?.activities?.length ? { activities: context.activities } : {}),
        ...(context?.activityOther ? { activityOther: context.activityOther } : {}),
        // A RATING ONLY WHEN ONE WAS GIVEN, and never invented here.
        // The rating step asks how it went and may be answered or
        // skipped; a timer stopped without one records the time
        // honestly rather than a middling score nobody chose. That is
        // also what keeps `recordEngagement` off — see logPractice.
        ...(context?.feelRating !== undefined
          ? { feelRating: context.feelRating }
          : {}),
        timestamp: at,
      });
      return { minutes, practiceLogId };
    } catch (err) {
      // The row failed but the timer is already cleared, so the
      // minutes are gone either way. Surfacing a half-state the user
      // cannot act on is worse than losing one duration.
      console.warn('[repertoire] song timer log failed', err);
      return NOTHING_WRITTEN;
    }
  }, [persist]);

  const swapToThisSong = useCallback(async (): Promise<PracticeWriteResult> => {
    const written = await stopAndLog();
    start();
    return written;
  }, [stopAndLog, start]);

  const pause = useCallback(() => {
    const current = readSongTimer();
    if (current === null) return;
    persist(pausedRecord(current, Date.now()));
  }, [persist]);

  const resume = useCallback(() => {
    const current = readSongTimer();
    if (current === null) return;
    const at = Date.now();
    // `lastActivityAt` moves with the resume. Time spent in the
    // rating step is not silence at the keyboard — the user was in
    // the app answering questions — so it must not bank as a gap the
    // moment they go back to playing.
    persist({ ...resumedRecord(current, at), lastActivityAt: at });
    setNow(at);
  }, [persist]);

  const discard = useCallback(() => persist(null), [persist]);

  const resolvePendingGap = useCallback((keepFraction: number) => {
    const current = readSongTimer();
    if (current === null || !(current.pendingGapMs && current.pendingGapMs > 0)) return;
    persist(resolvedGap(current, Date.now(), keepFraction, current.pendingGapMs));
  }, [persist]);

  /**
   * Bank an open silence and report what is now pending.
   *
   * Returns the total rather than a boolean so the caller can decide
   * whether there is anything worth asking about, without re-reading
   * storage and racing its own write.
   */
  const bankOpenSilence = useCallback((amberThresholdMs: number | null): number => {
    const current = readSongTimer();
    if (current === null) return 0;
    const next = bankOpenGap(current, Date.now(), amberThresholdMs);
    if (next !== current) persist(next);
    return next.pendingGapMs ?? 0;
  }, [persist]);

  return {
    record,
    isThisSong: record !== null && record.songId === songId,
    elapsedMs: record === null ? 0 : elapsedMs(record, now),
    start,
    pause,
    resume,
    isPaused: record !== null && record.songId === songId && !record.running,
    stopAndLog,
    swapToThisSong,
    discard,
    pendingGapMs: record?.pendingGapMs ?? 0,
    resolvePendingGap,
    bankOpenSilence,
  };
}
