/**
 * In-session drill runner — Level 3 auto-navigation (prep-flow).
 *
 * On GO, instead of dropping the user at the module home, this walks
 * the prep-screen per-item breakdown and opens the exact drill cell
 * for each item in turn — pre-seeded with that item's allotted seconds
 * and the prep-screen metronome (the modal auto-starts the persisted
 * BPM/style). No matrix tapping, no re-configuring.
 *
 * Between scales (Next / Previous), the same count-in plays before the
 * next drill starts — a 2s pre-pause then the count-in at the session's
 * BPM/meter. The FIRST scale skips it: the prep-screen Ready tap already
 * counted in.
 *
 * Scales runner (mounts the self-contained ScalesDrillModal). The
 * chord-shape counterpart is ChordShapeDrillRunner, which mounts
 * DrillSessionModal in its in-session mode.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import ScalesDrillModal from '../shapes-and-patterns/ScalesDrillModal';
import CountdownOverlay from './CountdownOverlay';
import { useSessionTimer } from '../../lib/sessionTimer/SessionTimerContext';
import { metronome } from '../../lib/metronome';
import {
  resolveScaleRunnerItems,
  type BreakdownItem,
} from './inSessionScaleRunner';

interface Props {
  items: ReadonlyArray<BreakdownItem>;
  /** Module accent for the between-scales count-in overlay. */
  accent: string;
  /** Fires when the last item is logged or the user dismisses the
   *  drill — the caller moves the block to its rating phase. */
  onComplete: () => void;
}

export default function InSessionDrillRunner({ items, accent, onComplete }: Props) {
  const { setInSessionDrillActive } = useSessionTimer();
  const cells = useMemo(() => resolveScaleRunnerItems(items), [items]);
  const [idx, setIdx] = useState(0);
  // Bumped on Redo to force the modal to remount for the SAME cell
  // (resetting its setup/countdown), without advancing the index.
  const [redoCount, setRedoCount] = useState(0);
  // True while the between-scales count-in plays (after Next / Previous),
  // before the next drill modal mounts. The first cell starts false — the
  // prep-screen Ready tap already counted in.
  const [counting, setCounting] = useState(false);
  const current = cells[idx];

  // While the runner is mounted it owns drill completion; tell the
  // global drill-end watcher to stand down so the block timer can't
  // yank us to rating mid-walk. Cleared on unmount (complete / cancel /
  // block change). Stays set through the count-in (runner stays mounted).
  useEffect(() => {
    setInSessionDrillActive(true);
    return () => setInSessionDrillActive(false);
  }, [setInSessionDrillActive]);

  // ScalesDrillModal fires onLogged THEN onClose when a rep is logged,
  // but only onClose on cancel. Without this flag the trailing onClose
  // would end the whole runner after the first cell instead of letting
  // it advance. Set on log, consumed by the very next onClose.
  const justLoggedRef = useRef(false);

  // Move to another scale and play the count-in before it starts.
  const goToCell = (compute: (i: number) => number) => {
    setIdx(compute);
    setCounting(true);
  };

  // Walked past the last cell (or nothing resolved) → hand back to the
  // caller for rating. Done in an effect, not render, to avoid a
  // setState-during-render on the parent.
  useEffect(() => {
    if (!current) onComplete();
  }, [current, onComplete]);

  if (!current) return null;

  // Between-scales count-in: same flow as the initial one (2s pre-pause,
  // count-in at the session's BPM/meter carried in the singleton, tap to
  // skip). On GO the drill modal mounts and auto-starts the metronome.
  if (counting) {
    return (
      <CountdownOverlay
        key={`countin-${idx}`}
        timeSig={metronome.state.timeSig}
        bpm={metronome.state.bpm}
        accent={accent}
        onComplete={() => setCounting(false)}
      />
    );
  }

  return (
    <ScalesDrillModal
      // Remount per cell (and per Redo of the same cell) so the modal's
      // internal phase + countdown reset and re-seed from this item's
      // seconds.
      key={`${current.itemRef}:${redoCount}`}
      cell={current.cell}
      initialTargetSeconds={current.seconds}
      sessionTargetSeconds={current.seconds}
      // Redo restarts the SAME scale immediately — no count-in (it isn't a
      // move "between scales").
      onRedo={() => setRedoCount(c => c + 1)}
      // Prev/next walk the sequence without cycling through the rest.
      // Disabled at the ends. Stepping triggers the between-scales
      // count-in, then remounts the modal for the new cell.
      canGoPrevious={idx > 0}
      canGoNext={idx < cells.length - 1}
      onPrevious={() => goToCell(i => Math.max(0, i - 1))}
      onLogged={() => {
        justLoggedRef.current = true;
        goToCell(i => i + 1);
      }}
      onClose={() => {
        // A close right after a log = the modal closing itself on save;
        // we're already advancing, so swallow it. A bare close = the
        // user cancelled this item ("don't log") → SKIP it and move to
        // the next cell (not end the whole runner). Advancing past the
        // last cell ends the runner via the effect above.
        if (justLoggedRef.current) {
          justLoggedRef.current = false;
          return;
        }
        goToCell(i => i + 1);
      }}
    />
  );
}
