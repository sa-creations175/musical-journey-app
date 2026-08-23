import { useCallback, useEffect, useState } from 'react';
import { logPracticeSession } from './logPractice';
import {
  bankOpenGap,
  clearSongTimer,
  elapsedMinutes,
  elapsedMs,
  readSongTimer,
  resolvedGap,
  startedRecord,
  writeSongTimer,
  type SongTimerRecord,
} from './songTimer';

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
   * Stop and LOG. Writes one songPracticeLog row for the timer's own
   * song — not necessarily the song on screen, which is what makes
   * the swap honest.
   *
   * Returns the minutes written, or 0 when there was nothing worth
   * writing. Nothing is written before this is called: while running,
   * the only persisted state is the localStorage record.
   */
  stopAndLog: (context?: PracticeContext) => Promise<number>;
  /** Log whatever is running, then start fresh on this song. */
  swapToThisSong: () => Promise<number>;
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
  ): Promise<number> => {
    const current = readSongTimer();
    if (current === null) return 0;
    const at = Date.now();
    const minutes = elapsedMinutes(current, at);
    persist(null);
    if (minutes <= 0) return 0;
    try {
      await logPracticeSession({
        songId: current.songId,
        durationMin: minutes,
        // Section and key when the surface knew them — a run from a
        // matrix cell does. This is the thing practice work has never
        // had: somewhere to land other than a song-level total.
        ...(context?.sectionIds?.length ? { sectionIds: context.sectionIds } : {}),
        ...(context?.keys?.length ? { keys: context.keys } : {}),
        // No RATING, ever, from here. Practice is not graded — the
        // rating step in the panel asks how it went, and a timer
        // stopped without one records the time honestly rather than
        // inventing a middling score.
        timestamp: at,
      });
    } catch (err) {
      // The row failed but the timer is already cleared, so the
      // minutes are gone either way. Surfacing a half-state the user
      // cannot act on is worse than losing one duration.
      console.warn('[repertoire] song timer log failed', err);
      return 0;
    }
    return minutes;
  }, [persist]);

  const swapToThisSong = useCallback(async (): Promise<number> => {
    const minutes = await stopAndLog();
    start();
    return minutes;
  }, [stopAndLog, start]);

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
    stopAndLog,
    swapToThisSong,
    discard,
    pendingGapMs: record?.pendingGapMs ?? 0,
    resolvePendingGap,
    bankOpenSilence,
  };
}
