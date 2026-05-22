/**
 * Prep-flow Phase 4 — count-in overlay.
 *
 * Mounts after the user taps Ready on a keyboard block. Holds a brief
 * "breath" (COUNTDOWN_PRE_PAUSE_MS) — a deliberate get-set beat, not
 * just a clash resolver — then drives the metronome's one-shot
 * `countIn` (count clicks + GO chime), showing the big descending
 * numeral pulsing on each beat and "GO" in the session accent on the
 * final beat. On GO the visual holds for one beat interval, then
 * `onComplete` fires (the caller launches the drill, which auto-starts
 * the running metronome).
 *
 * The whole screen is the bypass target: a tap skips straight to GO —
 * during the pre-pause as well as the count itself.
 */
import { useEffect, useRef, useState } from 'react';
import {
  metronome,
  buildCountInSchedule,
  type TimeSig,
} from '../../lib/metronome';
import { playGoChime } from '../../lib/chimes';

/** Deliberate breath between the Ready tap and the count-in. Applies
 *  always, whether or not the metronome was previewing. */
export const COUNTDOWN_PRE_PAUSE_MS = 2000;

interface Props {
  timeSig: TimeSig;
  bpm: number;
  /** Module accent hex — colours the GO state. */
  accent: string;
  /** Fired once the count-in (or bypass) reaches GO and the one-beat
   *  hold elapses. The caller starts the drill here. */
  onComplete: () => void;
}

export default function CountdownOverlay({ timeSig, bpm, accent, onComplete }: Props) {
  // null until the first tick; { display } during the count; go=true on GO.
  const [tick, setTick] = useState<{ display: number; seq: number } | null>(null);
  const [counting, setCounting] = useState(false); // false during the pre-pause
  const [isGo, setIsGo] = useState(false);

  // `cancelRef` holds whatever "skip to GO" action is valid right now:
  // a pause-phase skip until the count-in starts, then countIn's own
  // cancel. Other refs keep the once-only mount effect honest.
  const cancelRef = useRef<(() => void) | null>(null);
  const completeRef = useRef(onComplete);
  const seqRef = useRef(0);
  const wentGoRef = useRef(false);
  const tornDownRef = useRef(false);

  // Keep the latest onComplete reachable from the (once-only) mount
  // effect — the parent re-renders each second as the session timer
  // ticks, so the GO handler must call the current closure.
  useEffect(() => {
    completeRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    const intervalMs = buildCountInSchedule(timeSig, bpm).intervalMs;
    let holdTimer: number | null = null;

    const launchAfterHold = () => {
      // Hold the GO frame for one beat, then hand off to the drill.
      holdTimer = window.setTimeout(() => {
        if (!tornDownRef.current) completeRef.current();
      }, intervalMs);
    };

    const pauseTimer = window.setTimeout(() => {
      if (tornDownRef.current) return;
      setCounting(true);
      // countIn plays the count clicks + GO chime and replaces the
      // bypass action with its own cancel (which fires the GO chime).
      cancelRef.current = metronome.countIn(timeSig, bpm, {
        onTick: display => {
          if (tornDownRef.current) return;
          seqRef.current += 1;
          setTick({ display, seq: seqRef.current });
        },
        onGo: () => {
          if (wentGoRef.current || tornDownRef.current) return;
          wentGoRef.current = true;
          setIsGo(true);
          launchAfterHold();
        },
      });
    }, COUNTDOWN_PRE_PAUSE_MS);

    // Bypass while still in the pre-pause (count-in not started yet):
    // cancel the pause and jump straight to GO, playing the chime here
    // since countIn never ran.
    cancelRef.current = () => {
      window.clearTimeout(pauseTimer);
      if (wentGoRef.current || tornDownRef.current) return;
      wentGoRef.current = true;
      void playGoChime(metronome.state.volume);
      setCounting(true);
      setIsGo(true);
      launchAfterHold();
    };

    return () => {
      tornDownRef.current = true;
      window.clearTimeout(pauseTimer);
      if (holdTimer !== null) window.clearTimeout(holdTimer);
      // No GO on teardown — only the explicit count/bypass paths launch.
      // Any in-flight count-in click timers no-op via tornDownRef.
    };
    // Count-in config is fixed for this overlay instance; the caller
    // remounts (new key) for a fresh count-in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tap anywhere to skip straight to GO (works during the pause too).
  const handleBypass = () => {
    if (isGo) return;
    cancelRef.current?.();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="skip count-in"
      onClick={handleBypass}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') handleBypass();
      }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-neutral-950/90 backdrop-blur-sm select-none cursor-pointer"
    >
      {isGo ? (
        <div
          className="count-pulse font-mono font-bold leading-none"
          style={{ color: accent, fontSize: 'min(40vw, 18rem)' }}
        >
          GO
        </div>
      ) : counting && tick ? (
        <div
          // Re-key per tick so the pop animation restarts each beat.
          key={tick.seq}
          className="count-pulse font-mono font-semibold leading-none text-neutral-100"
          style={{ fontSize: 'min(45vw, 20rem)' }}
        >
          {tick.display}
        </div>
      ) : (
        <div className="text-base uppercase tracking-[0.3em] text-neutral-400 animate-pulse">
          Get ready…
        </div>
      )}

      {!isGo && (
        <div className="absolute bottom-16 text-sm uppercase tracking-widest text-neutral-400">
          Tap to skip
        </div>
      )}
    </div>
  );
}
