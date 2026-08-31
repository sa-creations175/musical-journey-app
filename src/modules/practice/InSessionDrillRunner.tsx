/**
 * In-session SCALE runner — Level 3 auto-navigation (prep-flow).
 *
 * On GO, instead of dropping the user at the module home, this walks
 * the prep-screen per-item breakdown and opens the session panel on
 * each scale in turn. No matrix tapping, no re-configuring.
 *
 * THREE HANDS, THREE STOPS. A scale cell has always been drilled left,
 * then right, then both, each with its own timer and its own rating —
 * the pop-up walked them internally. A panel is a sitting on ONE thing,
 * so the hands are stops on the walk instead. Same three drills, same
 * three ratings, and the sequence is in one place.
 *
 * The walk itself — the prep screen, the count-in, Previous, and what
 * closing the panel means — lives in `InSessionPanelRunner`, shared
 * with the chord-shape and voice-leading runners.
 */
import { useMemo } from 'react';
import { scaleSurface } from '../shapes-and-patterns/practiceTest/makeSurfaces';
import { scaleCellLabel } from '../shapes-and-patterns/scaleSkills';
import { formatDuration } from '../shapes-and-patterns/drillModel';
import { useSpelling } from '../../lib/spellingPref';
import type { DrillHand } from '../../lib/db';
import InSessionPanelRunner, { type RunnerStop } from './InSessionPanelRunner';
import {
  resolveScaleRunnerItems,
  type BreakdownItem,
} from './inSessionScaleRunner';

interface Props {
  items: ReadonlyArray<BreakdownItem>;
  /** Module accent for the prep screen and count-in overlay. */
  accent: string;
  /** Fires when the last stop is done or the user walks off the end —
   *  the caller moves the block to its rating phase. */
  onComplete: () => void;
}

/** The order a cell has always been walked in. */
const HANDS: ReadonlyArray<DrillHand> = ['left', 'right', 'both'];

const HAND_LABEL: Readonly<Record<DrillHand, string>> = {
  left: 'Left Hand',
  right: 'Right Hand',
  both: 'Both Hands',
};

export default function InSessionDrillRunner({ items, accent, onComplete }: Props) {
  const [spelling] = useSpelling();
  const itemsKey = items.map(i => i.itemRef).join('|');

  const stops = useMemo<RunnerStop[]>(() => {
    const out: RunnerStop[] = [];
    for (const item of resolveScaleRunnerItems(items)) {
      const cellLabel = scaleCellLabel(item.cell, spelling);
      for (const hand of HANDS) {
        out.push({
          key: `${item.itemRef}:${hand}`,
          label: cellLabel,
          detail: `${HAND_LABEL[hand]} · ${formatDuration(item.seconds)}`,
          surface: scaleSurface({
            cellLabel,
            skillLabel: HAND_LABEL[hand],
            itemRef: item.itemRef,
            hand,
          }),
        });
      }
    }
    return out;
    // itemsKey captures the item identity; `items` is a fresh array
    // each render, so depending on it directly would rebuild every tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey, spelling]);

  return (
    <InSessionPanelRunner stops={stops} accent={accent} onComplete={onComplete} />
  );
}
