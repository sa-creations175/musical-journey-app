import { useEffect, useRef, useState } from 'react';

/**
 * How long you practised — a timer you start, or a number you tap
 * afterwards when you forgot to.
 *
 * ---------------------------------------------------------------
 * THE FAST PATH IS THE POINT
 *
 * Duration is the one thing worth capturing when you don't want to
 * elaborate, and it was the one thing the matrix could not record: the
 * cell modal demanded a tempo and a clean/not-clean verdict before it
 * would accept anything. So a song could be worked hard for weeks and
 * still read as untouched.
 *
 * Both routes exist because both failures happen: you forget to start
 * a timer, and you forget to log at all. One preset tap is a complete
 * answer.
 * ---------------------------------------------------------------
 *
 * Reports minutes upward and stores nothing itself — the surface that
 * owns the save decides what a duration means. Extracted rather than
 * inlined because the merged logging surface needs exactly this, and
 * two copies of a timer would drift.
 */

const PRESETS = [5, 10, 15, 20, 30, 45, 60] as const;

interface Props {
  /** Current value in whole minutes; 0 means nothing captured yet. */
  minutes: number;
  onChange: (minutes: number) => void;
}

export default function DurationCapture({ minutes, onChange }: Props) {
  const [running, setRunning] = useState(false);
  const [secs, setSecs] = useState(0);
  const startedAt = useRef<number | null>(null);
  const accumulated = useRef(0);

  useEffect(() => {
    if (!running) return;
    const h = window.setInterval(() => {
      const now = Date.now();
      setSecs(accumulated.current + Math.floor((now - (startedAt.current ?? now)) / 1000));
    }, 500);
    return () => window.clearInterval(h);
  }, [running]);

  const start = () => {
    if (running) return;
    startedAt.current = Date.now();
    setRunning(true);
  };

  const stop = () => {
    if (!running) return;
    const now = Date.now();
    accumulated.current += Math.floor((now - (startedAt.current ?? now)) / 1000);
    startedAt.current = null;
    setSecs(accumulated.current);
    setRunning(false);
    // Round UP to the minute. A 40-second pass at one bar is still
    // practice, and recording it as 0 would drop the row entirely —
    // the surface treats 0 as "nothing captured".
    onChange(Math.max(1, Math.ceil(accumulated.current / 60)));
  };

  const reset = () => {
    accumulated.current = 0;
    startedAt.current = null;
    setSecs(0);
    setRunning(false);
    onChange(0);
  };

  const mm = Math.floor(secs / 60).toString().padStart(2, '0');
  const ss = (secs % 60).toString().padStart(2, '0');
  const timerTouched = secs > 0 || running;

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-neutral-700 dark:text-neutral-200">
        How long?
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={running ? stop : start}
          className={`px-3 py-1.5 rounded-md border text-sm font-medium ${
            running
              ? 'bg-needswork text-white border-needswork'
              : 'border-fluent text-fluent hover:bg-fluent/10'
          }`}
        >
          {running ? '■ stop' : '▶ start timer'}
        </button>
        {timerTouched && (
          <>
            <span className="font-mono tabular-nums text-lg">{mm}:{ss}</span>
            <button
              type="button"
              onClick={reset}
              className="text-[11px] text-neutral-500 hover:text-needswork underline-offset-2 hover:underline"
            >
              reset
            </button>
          </>
        )}
      </div>

      {/* Presets stay available while the timer runs — forgetting to
          start it is the common case, and hiding the manual route
          behind "stop first" would put a step in front of the fast
          path. Picking one takes over; the timer is abandoned, not
          merged, because summing a half-remembered number with a
          partial timer would be guessing. */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {PRESETS.map(p => (
          <button
            key={p}
            type="button"
            onClick={() => {
              if (running) setRunning(false);
              onChange(minutes === p ? 0 : p);
            }}
            aria-pressed={minutes === p}
            className={`px-2.5 py-1 rounded-md border text-xs font-medium ${
              minutes === p
                ? 'bg-fluent text-white border-fluent'
                : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-fluent hover:text-fluent'
            }`}
          >
            {p}m
          </button>
        ))}
      </div>

      {minutes > 0 && (
        <p className="text-[11px] text-neutral-500">
          logging <span className="font-mono tabular-nums">{minutes}</span> minute
          {minutes === 1 ? '' : 's'} — everything below is optional.
        </p>
      )}
    </div>
  );
}
