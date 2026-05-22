/**
 * In-session chord-shape drill runner — Level 3 auto-navigation.
 *
 * The chord-shape counterpart to InSessionDrillRunner (scales). On GO,
 * instead of dropping the user at the S&P matrix, this walks the
 * prep-screen per-item breakdown and opens DrillSessionModal for each
 * chord-shape cell in turn — pre-seeded with that item's allotted
 * seconds, in the modal's in-session mode (its own timer/session logic
 * stands down; the session banner owns the time).
 *
 * Between cells (Next / Previous), the same count-in plays before the
 * next drill starts. The FIRST cell skips it — the prep-screen Ready
 * tap already counted in.
 *
 * Chord-shape cells are DB rows (skill + drillType), so unlike the
 * scales runner the cell list is resolved asynchronously on mount.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import DrillSessionModal from '../shapes-and-patterns/DrillSessionModal';
import CountdownOverlay from './CountdownOverlay';
import { useSessionTimer } from '../../lib/sessionTimer/SessionTimerContext';
import { metronome } from '../../lib/metronome';
import type { BreakdownItem } from './inSessionScaleRunner';
import {
  resolveChordShapeRunnerItems,
  type ChordShapeRunnerItem,
} from './inSessionChordShapeRunner';

interface Props {
  items: ReadonlyArray<BreakdownItem>;
  /** Module accent for the between-cells count-in overlay. */
  accent: string;
  /** Fires when the last cell is logged/skipped or nothing resolved —
   *  the caller moves the block to its rating phase. */
  onComplete: () => void;
}

export default function ChordShapeDrillRunner({ items, accent, onComplete }: Props) {
  const { setInSessionDrillActive } = useSessionTimer();
  // null while resolving the DB-backed cells; an array (possibly empty)
  // once resolved.
  const [cells, setCells] = useState<ChordShapeRunnerItem[] | null>(null);
  const [idx, setIdx] = useState(0);
  // Bumped on Redo to force a remount for the SAME cell (resetting its
  // countdown) without advancing the index.
  const [redoCount, setRedoCount] = useState(0);
  // True while the between-cells count-in plays (after Next / Previous),
  // before the next drill modal mounts. First cell starts false — the
  // prep-screen Ready tap already counted in.
  const [counting, setCounting] = useState(false);
  // DrillSessionModal fires onLogged THEN onClose when a rep is logged,
  // but only onClose on cancel. Without this flag the trailing onClose
  // would end the runner after the first cell instead of advancing.
  const justLoggedRef = useRef(false);
  const itemsKey = useMemo(() => items.map(i => i.itemRef).join('|'), [items]);

  // While mounted the runner owns drill completion; tell the global
  // drill-end watcher to stand down so the block timer can't yank us to
  // rating mid-walk. Cleared on unmount.
  useEffect(() => {
    setInSessionDrillActive(true);
    return () => setInSessionDrillActive(false);
  }, [setInSessionDrillActive]);

  // Resolve the chord-shape cells (skill + drillType) once per item set.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const resolved = await resolveChordShapeRunnerItems(items);
      if (!cancelled) setCells(resolved);
    })();
    return () => { cancelled = true; };
    // itemsKey captures the item identity; `items` is a fresh array each
    // render so depending on it directly would re-run every tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey]);

  const current = cells ? cells[idx] : undefined;

  // Resolved but empty, or walked past the last cell → hand back to the
  // caller for rating. In an effect to avoid setState-during-render on
  // the parent.
  useEffect(() => {
    if (cells && !current) onComplete();
  }, [cells, current, onComplete]);

  if (!cells || !current) return null;

  // Move to another cell and play the count-in before it starts.
  const goToCell = (compute: (i: number) => number) => {
    setIdx(compute);
    setCounting(true);
  };

  // Between-cells count-in: same flow as the initial one (pre-pause +
  // count-in at the session's BPM/meter from the singleton, tap to skip).
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
    <DrillSessionModal
      // Remount per cell (and per Redo) so the modal's internal phase +
      // countdown reset and re-seed from this item's seconds.
      key={`${current.itemRef}:${redoCount}`}
      skill={current.skill}
      drillType={current.drillType}
      initialTargetSeconds={current.seconds}
      sessionTargetSeconds={current.seconds}
      onRedo={() => setRedoCount(c => c + 1)}
      canGoPrevious={idx > 0}
      canGoNext={idx < cells.length - 1}
      onPrevious={() => goToCell(i => Math.max(0, i - 1))}
      onLogged={() => {
        justLoggedRef.current = true;
        goToCell(i => i + 1);
      }}
      onClose={() => {
        // Close right after a log = the modal closing itself on save;
        // we're already advancing, so swallow it. A bare close = the
        // user skipped this cell ("Next"/"Finish"/cancel) → advance to
        // the next cell (past the last ends the runner via the effect).
        if (justLoggedRef.current) {
          justLoggedRef.current = false;
          return;
        }
        goToCell(i => i + 1);
      }}
    />
  );
}
