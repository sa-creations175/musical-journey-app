/**
 * Prep-flow Phase 4 — count-in overlay.
 *
 * Mounts after the user taps Ready on a keyboard block. Drives the
 * metronome's one-shot `countIn` (count clicks + GO chime), shows the
 * big descending numeral pulsing on each beat, and renders "GO" in the
 * session accent on the final beat. On GO the visual holds for one beat
 * interval, then `onComplete` fires (the caller launches the drill).
 *
 * The whole screen is the bypass target: a tap clears the remaining
 * ticks and fires GO immediately.
 */
import { useEffect, useRef, useState } from 'react';
import {
  metronome,
  buildCountInSchedule,
  type TimeSig,
} from '../../lib/metronome';

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
  const [isGo, setIsGo] = useState(false);

  // Stable refs so the mount effect runs exactly once.
  const cancelRef = useRef<(() => void) | null>(null);
  const completeRef = useRef(onComplete);
  const seqRef = useRef(0);

  // Keep the latest onComplete reachable from the (once-only) mount
  // effect — the parent re-renders each second as the session timer
  // ticks, so the GO handler must call the current closure, not the
  // one captured at mount.
  useEffect(() => {
    completeRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    const intervalMs = buildCountInSchedule(timeSig, bpm).intervalMs;
    let holdTimer: number | null = null;

    cancelRef.current = metronome.countIn(timeSig, bpm, {
      onTick: display => {
        seqRef.current += 1;
        setTick({ display, seq: seqRef.current });
      },
      onGo: () => {
        setIsGo(true);
        // Hold the "GO" frame for one beat, then launch the drill.
        holdTimer = window.setTimeout(() => completeRef.current(), intervalMs);
      },
    });

    return () => {
      // Unmount mid-count (block change, discard) — kill pending ticks.
      cancelRef.current?.();
      cancelRef.current = null;
      if (holdTimer !== null) window.clearTimeout(holdTimer);
    };
    // Count-in config is fixed for this overlay instance; the caller
    // remounts (new key) for a fresh count-in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tap anywhere to skip straight to GO.
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
      ) : (
        <div
          // Re-key per tick so the pop animation restarts each beat.
          key={tick?.seq ?? 'pending'}
          className="count-pulse font-mono font-semibold leading-none text-neutral-100"
          style={{ fontSize: 'min(45vw, 20rem)' }}
        >
          {tick?.display ?? ''}
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
