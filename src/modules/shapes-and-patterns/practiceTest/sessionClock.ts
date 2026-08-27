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

/** Whole seconds since the clock started. */
export function useSessionClock(running: boolean): number {
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

  useEffect(() => {
    if (!running) return;
    if (startedAt.current === null) startedAt.current = Date.now();
    const id = window.setInterval(() => {
      if (startedAt.current === null) return;
      setSeconds(Math.floor((Date.now() - startedAt.current) / 1000));
    }, 250);
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
