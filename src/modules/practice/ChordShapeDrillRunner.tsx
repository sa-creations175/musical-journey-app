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
 * Between cells (Next / Previous), a brief prep screen names the next
 * cell + its drill time; Ready then plays the count-in before the drill
 * starts (BPM/meter carry over from the block prep screen). The FIRST
 * cell skips both — the block prep screen + its count-in handled it.
 *
 * Chord-shape cells are DB rows (skill + drillType), so unlike the
 * scales runner the cell list is resolved asynchronously on mount.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import DrillSessionModal from '../shapes-and-patterns/DrillSessionModal';
import { formatDuration } from '../shapes-and-patterns/drillModel';
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
  // True while the between-cells PREP screen is up (after Next /
  // Previous): the user sees the next cell + its drill time and taps
  // Ready, which kicks off the count-in. First cell starts false — the
  // block prep screen already handled it.
  const [betweenPrep, setBetweenPrep] = useState(false);
  // True while the between-cells count-in plays (after Ready), before
  // the next drill modal mounts.
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

  // Move to another cell → show its prep screen (Ready → count-in).
  const goToCell = (compute: (i: number) => number) => {
    setIdx(compute);
    setBetweenPrep(true);
  };

  // Between-cells prep: name the next cell + its allotted time and wait
  // for Ready before the count-in. BPM/meter carry over from the block
  // prep screen, so there are no controls here — just "what's coming".
  if (betweenPrep) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-neutral-950/90 backdrop-blur-sm select-none p-6 text-center">
        <div className="space-y-2">
          <div className="text-[11px] uppercase tracking-[0.3em] text-neutral-400">
            up next
          </div>
          <div
            className="text-2xl sm:text-3xl font-semibold"
            style={{ color: accent }}
          >
            {current.skill.label}
          </div>
          <div className="text-sm text-neutral-400">
            {current.drillType.name} · {formatDuration(current.seconds)}
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setBetweenPrep(false);
            setCounting(true);
          }}
          className="px-8 py-3 rounded-md bg-fluent text-white text-sm font-medium hover:opacity-90"
        >
          Ready
        </button>
      </div>
    );
  }

  // Between-cells count-in: same flow as the initial one (pre-pause +
  // count-in at the session's BPM/meter from the singleton, tap to skip).
  if (counting) {
    return (
      <CountdownOverlay
        key={`countin-${idx}`}
        timeSig={metronome.state.timeSig}
        bpm={metronome.state.bpm}
        // All count-ins use the all-kicks pattern uniformly (kick·kick·
        // kick·GO) — matches the block prep screen (98d492c).
        allKick
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
