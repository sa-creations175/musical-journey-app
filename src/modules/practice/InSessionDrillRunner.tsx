/**
 * In-session drill runner — Level 3 auto-navigation (prep-flow).
 *
 * On GO, instead of dropping the user at the module home, this walks
 * the prep-screen per-item breakdown and opens the exact drill cell
 * for each item in turn — pre-seeded with that item's allotted seconds
 * and the prep-screen metronome (the modal auto-starts the persisted
 * BPM/style). No matrix tapping, no re-configuring.
 *
 * Scales-only for now (ScalesDrillModal is self-contained). Chord-
 * shapes follow once DrillSessionModal is decoupled from owning the
 * session timer; until then those blocks route to the module home.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import ScalesDrillModal from '../shapes-and-patterns/ScalesDrillModal';
import {
  resolveScaleRunnerItems,
  type BreakdownItem,
} from './inSessionScaleRunner';

interface Props {
  items: ReadonlyArray<BreakdownItem>;
  /** Fires when the last item is logged or the user dismisses the
   *  drill — the caller moves the block to its rating phase. */
  onComplete: () => void;
}

export default function InSessionDrillRunner({ items, onComplete }: Props) {
  const cells = useMemo(() => resolveScaleRunnerItems(items), [items]);
  const [idx, setIdx] = useState(0);
  const current = cells[idx];

  // ScalesDrillModal fires onLogged THEN onClose when a rep is logged,
  // but only onClose on cancel. Without this flag the trailing onClose
  // would end the whole runner after the first cell instead of letting
  // it advance. Set on log, consumed by the very next onClose.
  const justLoggedRef = useRef(false);

  // Walked past the last cell (or nothing resolved) → hand back to the
  // caller for rating. Done in an effect, not render, to avoid a
  // setState-during-render on the parent.
  useEffect(() => {
    if (!current) onComplete();
  }, [current, onComplete]);

  if (!current) return null;

  return (
    <ScalesDrillModal
      // Remount per cell so the modal's internal phase + countdown
      // reset and re-seed from this item's seconds.
      key={current.itemRef}
      cell={current.cell}
      initialTargetSeconds={current.seconds}
      onLogged={() => {
        justLoggedRef.current = true;
        setIdx(i => i + 1);
      }}
      onClose={() => {
        // A close right after a log = the modal closing itself on save;
        // we're advancing, so swallow it. A bare close = the user
        // cancelled → finish the block (to rating).
        if (justLoggedRef.current) {
          justLoggedRef.current = false;
          return;
        }
        onComplete();
      }}
    />
  );
}
