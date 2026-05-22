/**
 * Prep-flow Phase 4 — count-in overlay.
 *
 * Mounts after the user taps Ready on a keyboard block. Holds a brief
 * "breath" (COUNTDOWN_PRE_PAUSE_MS) — a deliberate get-set beat, not
 * just a clash resolver — then drives the metronome's one-shot
 * `countIn` (count clicks + GO chime).
 *
 * Two coexisting visuals track the count:
 *   · a large numeral — the current beat position (1, 2, 3… "play" on
 *     the final beat), weighted by metric accent;
 *   · a beat row — one circle per beat in the current bar, sized by
 *     metric accent, lit as the count passes through it. Two-bar
 *     count-ins reset the row for bar 2 (with a subtle "1 of 2" hint).
 *
 * On "play" the visual holds for one beat interval, then `onComplete`
 * fires (the caller launches the drill, which auto-starts the running
 * metronome). The whole screen is the bypass target: a tap skips
 * straight to "play" — during the pre-pause as well as the count.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  metronome,
  buildCountInSchedule,
  type TimeSig,
  type AccentLevel,
} from '../../lib/metronome';
import { playGoChime } from '../../lib/chimes';

/** Deliberate breath between the Ready tap and the count-in. Applies
 *  always, whether or not the metronome was previewing. */
export const COUNTDOWN_PRE_PAUSE_MS = 2000;

interface Props {
  timeSig: TimeSig;
  bpm: number;
  /** Module accent hex — colours strong beats + the "play" state. */
  accent: string;
  /** Fired once the count-in (or bypass) reaches "play" and the one-beat
   *  hold elapses. The caller starts the drill here. */
  onComplete: () => void;
}

interface CurrentBeat {
  position: number;
  bar: number;
  accent: AccentLevel;
  isGo: boolean;
  /** Bumped per fire so the pulse animation restarts. */
  seq: number;
}

export default function CountdownOverlay({ timeSig, bpm, accent, onComplete }: Props) {
  const schedule = useMemo(() => buildCountInSchedule(timeSig, bpm), [timeSig, bpm]);
  // null during the pre-pause; tracks the currently-fired beat after.
  const [current, setCurrent] = useState<CurrentBeat | null>(null);

  const cancelRef = useRef<(() => void) | null>(null);
  const completeRef = useRef(onComplete);
  const seqRef = useRef(0);
  const wentGoRef = useRef(false);
  const tornDownRef = useRef(false);

  // Keep the latest onComplete reachable from the (once-only) mount
  // effect — the parent re-renders each second as the session timer ticks.
  useEffect(() => {
    completeRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    const intervalMs = schedule.intervalMs;
    const goBeat = schedule.beats[schedule.beats.length - 1];
    let holdTimer: number | null = null;

    const launchAfterHold = () => {
      holdTimer = window.setTimeout(() => {
        if (!tornDownRef.current) completeRef.current();
      }, intervalMs);
    };

    const reachGo = () => {
      seqRef.current += 1;
      setCurrent({
        position: goBeat.position,
        bar: goBeat.bar,
        accent: goBeat.accent,
        isGo: true,
        seq: seqRef.current,
      });
      launchAfterHold();
    };

    const pauseTimer = window.setTimeout(() => {
      if (tornDownRef.current) return;
      cancelRef.current = metronome.countIn(timeSig, bpm, {
        onTick: (position, bar, acc) => {
          if (tornDownRef.current) return;
          seqRef.current += 1;
          setCurrent({ position, bar, accent: acc, isGo: false, seq: seqRef.current });
        },
        onGo: () => {
          if (wentGoRef.current || tornDownRef.current) return;
          wentGoRef.current = true;
          reachGo();
        },
      });
    }, COUNTDOWN_PRE_PAUSE_MS);

    // Bypass while still in the pre-pause (count-in not started yet):
    // cancel the pause and jump straight to "play", playing the chime
    // here since countIn never ran. Once countIn starts it overwrites
    // this with its own cancel (which fires the GO chime).
    cancelRef.current = () => {
      window.clearTimeout(pauseTimer);
      if (wentGoRef.current || tornDownRef.current) return;
      wentGoRef.current = true;
      void playGoChime(metronome.state.volume);
      reachGo();
    };

    return () => {
      tornDownRef.current = true;
      window.clearTimeout(pauseTimer);
      if (holdTimer !== null) window.clearTimeout(holdTimer);
    };
    // Count-in config is fixed for this overlay instance; the caller
    // remounts (new key) for a fresh count-in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule]);

  const isGo = current?.isGo ?? false;
  const handleBypass = () => {
    if (isGo) return;
    cancelRef.current?.();
  };

  // Beat row for the current bar (bar 1 during the pre-pause).
  const currentBar = current?.bar ?? 1;
  const barBeats = schedule.beats.filter(b => b.bar === currentBar);

  const numeralText = isGo ? 'play' : current ? String(current.position) : null;
  const numeralAccent: AccentLevel | 'play' = isGo ? 'play' : (current?.accent ?? 'weak');

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="skip count-in"
      onClick={handleBypass}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') handleBypass();
      }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-neutral-950/90 backdrop-blur-sm select-none cursor-pointer"
    >
      {/* Large numeral / "play" / pre-pause hint. */}
      {numeralText ? (
        <div
          key={current?.seq ?? 'go'}
          className="count-pulse font-mono leading-none"
          style={numeralStyle(accent, numeralAccent)}
        >
          {numeralText}
        </div>
      ) : (
        <div className="text-base uppercase tracking-[0.3em] text-neutral-400 animate-pulse">
          Get ready…
        </div>
      )}

      {/* Beat row — one circle per beat in the current bar. */}
      <div className="flex flex-col items-center gap-2">
        {schedule.totalBars > 1 && (
          <div className="text-[10px] uppercase tracking-[0.25em] text-neutral-500">
            bar {currentBar} of {schedule.totalBars}
          </div>
        )}
        <div className="flex items-center justify-center gap-2.5">
          {barBeats.map(b => {
            const isCurrent = !!current && b.position === current.position;
            const isPast = !!current && b.position < current.position;
            return (
              <div
                key={isCurrent ? `cur-${current!.seq}` : `b-${b.position}`}
                className={circleClasses(b.accent, b.isGo, isCurrent, isPast)}
                style={
                  isCurrent || (b.isGo && !isPast)
                    ? { backgroundColor: isCurrent ? accent : 'transparent', borderColor: accent, color: isCurrent ? '#fff' : accent }
                    : undefined
                }
              >
                {b.isGo ? '▶' : b.position}
              </div>
            );
          })}
        </div>
      </div>

      {!isGo && (
        <div className="absolute bottom-16 text-sm uppercase tracking-widest text-neutral-400">
          Tap to skip
        </div>
      )}
    </div>
  );
}

// Numeral colour/weight by metric accent. Strong + "play" wear the full
// module accent; medium and weak step down in opacity + weight.
function numeralStyle(accent: string, level: AccentLevel | 'play'): React.CSSProperties {
  switch (level) {
    case 'play':
      return { color: accent, opacity: 1, fontWeight: 700, fontSize: 'min(28vw, 12rem)' };
    case 'strong':
      return { color: accent, opacity: 1, fontWeight: 700, fontSize: 'min(42vw, 18rem)' };
    case 'medium':
      return { color: accent, opacity: 0.78, fontWeight: 600, fontSize: 'min(42vw, 18rem)' };
    case 'weak':
      return { color: accent, opacity: 0.5, fontWeight: 500, fontSize: 'min(42vw, 18rem)' };
  }
}

// Beat-row circle: base size by metric accent (strong largest), with
// current / past / future state. The "play" circle stays prominent.
function circleClasses(
  accent: AccentLevel,
  isGo: boolean,
  isCurrent: boolean,
  isPast: boolean,
): string {
  const size = isGo
    ? 'w-9 h-9 text-sm font-bold'
    : accent === 'strong'
      ? 'w-9 h-9 text-base font-bold'
      : accent === 'medium'
        ? 'w-7 h-7 text-sm font-semibold'
        : 'w-5 h-5 text-xs font-medium';

  const base = 'inline-flex items-center justify-center rounded-full border-2 font-mono transition-all';

  if (isCurrent) {
    // Colours come from inline style (module accent); pulse via re-key.
    return `${base} ${size} count-pulse`;
  }
  if (isGo) {
    // Future "play" circle — outlined in accent so it reads as the goal.
    return `${base} ${size}`;
  }
  if (isPast) {
    return `${base} ${size} border-neutral-700 text-neutral-600 opacity-40`;
  }
  return `${base} ${size} border-neutral-600 text-neutral-400`;
}
