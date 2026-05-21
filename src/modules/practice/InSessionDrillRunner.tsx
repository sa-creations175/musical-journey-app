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
import { useEffect, useMemo, useState } from 'react';
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
      onLogged={() => setIdx(i => i + 1)}
      onClose={onComplete}
    />
  );
}
