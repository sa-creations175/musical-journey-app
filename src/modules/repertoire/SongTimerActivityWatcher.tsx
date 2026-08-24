import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { readSongTimer, withActivity, writeSongTimer } from './songTimer';
import { getAmberMinutes } from './songTimerPrefs';

/**
 * Marks app activity while a song timer is running.
 *
 * Mounted at the app level, not on the song page: the timer keeps
 * running wherever you navigate, so "app activity" has to mean
 * activity anywhere. A watcher scoped to the song page would call
 * every minute spent in another module a gap.
 *
 * ---------------------------------------------------------------
 * WHAT COUNTS, AND THE ASYMMETRY THAT DECIDES IT.
 *
 * A MISSED activity signal costs an amber number the user glances
 * past. A FALSE activity signal costs a silently wrong record — no
 * amber, so no question, so a stretch they were absent for is logged
 * as focused practice. Those are not symmetrical, so anything
 * ambiguous does NOT count.
 *
 * COUNTS:
 *   pointerdown  — a tap or click. Someone did something.
 *   keydown      — same.
 *   scroll       — you do not scroll by accident, and scrolling a
 *                  lead sheet while playing is exactly the "I am
 *                  here" signal that matters on a phone. Throttled,
 *                  because it fires continuously.
 *   route change — you navigated.
 *
 * DOES NOT COUNT — and please do not add them:
 *   mousemove    — the classic idle-detector signal and the worst fit
 *                  here. A nudged desk, a sleeve, a laptop sitting
 *                  beside the keyboard being played. It fails in the
 *                  one direction that loses data silently.
 *   focus regain — `visibilitychange` to visible is the moment the
 *                  user RETURNS, not a moment they were present.
 *                  Counting it would erase the gap on the way back
 *                  in, exactly when it should be shown. It triggers
 *                  the check; it never clears it.
 * ---------------------------------------------------------------
 */

/** Scroll fires continuously; one write a second is plenty for a
 *  threshold measured in minutes. */
const SCROLL_THROTTLE_MS = 1000;

export default function SongTimerActivityWatcher() {
  const location = useLocation();
  const lastScrollPing = useRef(0);
  // Read once and held in a ref so the listeners never re-bind, and so
  // the ping stays synchronous — an await inside a pointerdown handler
  // would let a second event through before the first had written.
  const thresholdMs = useRef<number | null>(null);
  /**
   * Whether the threshold above is a real answer yet.
   *
   * ---------------------------------------------------------------
   * NULL IS AN ANSWER HERE, NOT AN ABSENCE, WHICH IS WHY THIS EXISTS.
   *
   * `thresholdMs` starts null, and null MEANS "never bank" — the
   * user's own setting. So an unloaded threshold and a deliberate
   * "never" were indistinguishable, and during the load a ping would
   * take the `!banks` branch of `withActivity`: `lastActivityAt` moves
   * to now and the gap it was measuring vanishes into the total as
   * focused practice. Silent, and in the one direction that loses
   * data — the exact failure the banking exists to prevent.
   *
   * The window is not theoretical. Reload the page mid-practice after
   * a break and the first tap can easily land before a Dexie read
   * resolves, erasing the whole break.
   *
   * So a ping before the answer arrives does NOTHING rather than
   * guessing in either direction. Guessing "never" erases the gap;
   * guessing the default banks one a "never" user then has to dismiss.
   * Doing nothing leaves `lastActivityAt` where it is, and the first
   * ping after the load measures the same gap correctly. Nothing is
   * counted and nothing is discarded in the meantime.
   * ---------------------------------------------------------------
   */
  const loaded = useRef(false);
  const [, setLoaded] = useState(false);

  useEffect(() => {
    let live = true;
    getAmberMinutes()
      .then(min => {
        if (!live) return;
        thresholdMs.current = min === null ? null : min * 60_000;
        loaded.current = true;
        setLoaded(true);
      })
      // Swallowed. This read fails for reasons that have nothing to do
      // with the timer — Dexie closed under it, Safari private mode,
      // the page going away mid-flight — and an uncaught one becomes
      // an unhandled rejection at the app level, where this is mounted
      // for the whole session. `loaded` stays false, so the watcher
      // goes quiet rather than guessing: the same choice as above, for
      // the same reason.
      .catch(err => {
        console.warn('[repertoire] amber threshold read failed', err);
      });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    const ping = () => {
      // Before the threshold is known, do nothing at all — see the
      // note on `loaded`. Moving `lastActivityAt` here would erase the
      // gap it was measuring.
      if (!loaded.current) return;
      const record = readSongTimer();
      // No timer, or a paused one, has no gap to measure. Writing on
      // every tap regardless would be a localStorage write per click
      // for the whole app, forever.
      if (record === null || !record.running) return;
      const now = Date.now();
      const next = withActivity(record, now, thresholdMs.current);
      if (next !== record) writeSongTimer(next);
    };

    const onScroll = () => {
      const now = Date.now();
      if (now - lastScrollPing.current < SCROLL_THROTTLE_MS) return;
      lastScrollPing.current = now;
      ping();
    };

    window.addEventListener('pointerdown', ping, { passive: true });
    window.addEventListener('keydown', ping);
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    return () => {
      window.removeEventListener('pointerdown', ping);
      window.removeEventListener('keydown', ping);
      window.removeEventListener('scroll', onScroll, { capture: true });
    };
  }, []);

  // Navigation is activity. Keyed on pathname + search so a filter
  // change counts too, and deliberately not on `location.key`, which
  // also changes on a replace the user did not perform.
  useEffect(() => {
    if (!loaded.current) return;   // same reason as `ping`
    const record = readSongTimer();
    if (record === null || !record.running) return;
    writeSongTimer(withActivity(record, Date.now(), thresholdMs.current));
  }, [location.pathname, location.search]);

  return null;
}
