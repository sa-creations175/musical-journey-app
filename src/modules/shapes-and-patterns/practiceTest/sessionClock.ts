/**
 * The session clock. It starts when you enter the cell and it does not
 * stop until you leave.
 *
 * =====================================================================
 * IT NEVER PAUSES, AND THAT IS THE WHOLE POINT OF IT.
 *
 * Not between drills, not while the setup screen is open, not while you
 * are sitting on a rating screen deciding. A drill clock counts down
 * inside this one; when it reaches zero this one carries on.
 *
 * The reason is that the two clocks measure different things. A drill
 * clock measures a drill. This measures TIME AT THE KEYBOARD, and the
 * minute spent choosing the next tempo is time at the keyboard as
 * surely as the minute spent playing. A clock that stopped for the
 * bits between would report less practice than happened, and would do
 * it silently.
 *
 * The prototype paused it. That was a bug in the prototype rather than
 * a decision, and it was fixed there before this was written.
 * =====================================================================
 */

import { useEffect, useRef, useState } from 'react';

/**
 * Whole seconds the session has run for.
 *
 * =====================================================================
 * SOME SESSIONS OUTLIVE THE COMPONENT SHOWING THEM.
 *
 * The `startedAt` ref below is the right answer for a surface whose
 * session begins when the panel opens: a drill session has no
 * existence before that and none after it closes, so a ref is exactly
 * as durable as the thing it measures.
 *
 * A SONG SESSION IS NOT LIKE THAT. Its clock is a persisted record
 * (`mja.songTimer.v1`) that survives navigation, reload and a paused
 * afternoon, and whose `startedAt` may be hours older than this
 * component. Counting from mount would show a session that had
 * restarted while the record said otherwise — and the record is the
 * one that gets logged.
 *
 * So a surface with a durable clock passes a reader, and this counts
 * what the reader says rather than what it remembers. The ref is not
 * consulted at all in that case; there is nothing for it to be right
 * about.
 * =====================================================================
 *
 * @param readElapsedMs Where the elapsed actually lives, for a surface
 *   that stores it. Null or omitted for one that does not.
 */
export function useSessionClock(
  running: boolean,
  readElapsedMs?: (() => number) | null,
): number {
  const [seconds, setSeconds] = useState(0);
  /**
   * The wall-clock moment the session began.
   *
   * COUNTED FROM A TIMESTAMP, NOT BY ADDING ONE PER TICK. A counter
   * incremented on an interval drifts — the browser throttles timers in
   * background tabs, and every skipped tick would be a second of
   * practice the reader did and the app forgot. Reading the difference
   * from a fixed start means a throttled tab catches up the moment it
   * is looked at again.
   */
  const startedAt = useRef<number | null>(null);

  // Held in a ref so a surface that supplies a reader does not have to
  // supply the SAME function instance every render to avoid restarting
  // the interval.
  const reader = useRef(readElapsedMs ?? null);
  reader.current = readElapsedMs ?? null;

  useEffect(() => {
    if (!running) return;
    if (startedAt.current === null) startedAt.current = Date.now();
    const tick = () => {
      const external = reader.current;
      if (external !== null) {
        setSeconds(Math.floor(external() / 1000));
        return;
      }
      if (startedAt.current === null) return;
      setSeconds(Math.floor((Date.now() - startedAt.current) / 1000));
    };
    // Once immediately: a durable clock already has a value, and
    // showing 00:00 for a quarter second would be a session that
    // appeared to restart.
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [running]);

  return seconds;
}

/** `mm:ss`, and `h:mm:ss` once there is an hour to show. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
