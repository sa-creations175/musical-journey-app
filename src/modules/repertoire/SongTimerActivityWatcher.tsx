import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { readSongTimer, withActivity, writeSongTimer } from './songTimer';

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

  useEffect(() => {
    const ping = () => {
      const record = readSongTimer();
      // No timer, or a paused one, has no gap to measure. Writing on
      // every tap regardless would be a localStorage write per click
      // for the whole app, forever.
      if (record === null || !record.running) return;
      const now = Date.now();
      const next = withActivity(record, now);
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
    const record = readSongTimer();
    if (record === null || !record.running) return;
    writeSongTimer(withActivity(record, Date.now()));
  }, [location.pathname, location.search]);

  return null;
}
