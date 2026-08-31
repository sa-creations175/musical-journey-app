/**
 * In-session CHORD-SHAPE runner — Level 3 auto-navigation.
 *
 * The chord-shape counterpart to InSessionDrillRunner. On GO, this
 * walks the prep-screen per-item breakdown and opens the session panel
 * on each chord-shape cell in turn.
 *
 * THREE HANDS, THREE STOPS — the same as scales, and for the same
 * reason: the pop-up walked left, right and both inside itself, and a
 * panel is a sitting on one thing. The style is NOT a dimension of the
 * walk: blocked and broken are two ways to play one drill, and the
 * panel asks which.
 *
 * Chord-shape cells are database rows (a skill plus a drill type), so
 * unlike scales the list is resolved asynchronously.
 */
import { useEffect, useState } from 'react';
import { chordShapeSurface } from '../shapes-and-patterns/practiceTest/makeSurfaces';
import { formatDuration } from '../shapes-and-patterns/drillModel';
import type { DrillHand } from '../../lib/db';
import InSessionPanelRunner, { type RunnerStop } from './InSessionPanelRunner';
import type { BreakdownItem } from './inSessionScaleRunner';
import { resolveChordShapeRunnerItems } from './inSessionChordShapeRunner';

interface Props {
  items: ReadonlyArray<BreakdownItem>;
  /** Module accent for the prep screen and count-in overlay. */
  accent: string;
  /** Fires when the walk finishes or nothing resolved — the caller
   *  moves the block to its rating phase. */
  onComplete: () => void;
}

/** The order a cell has always been walked in. */
const HANDS: ReadonlyArray<DrillHand> = ['left', 'right', 'both'];

const HAND_LABEL: Readonly<Record<DrillHand, string>> = {
  left: 'Left Hand',
  right: 'Right Hand',
  both: 'Both Hands',
};

export default function ChordShapeDrillRunner({ items, accent, onComplete }: Props) {
  const itemsKey = items.map(i => i.itemRef).join('|');

  /**
   * Null while resolving; an array once resolved, possibly empty. The
   * walk waits on null and ends on an empty array — a chord-shape cell
   * is database rows, so "not yet" and "nothing here" are genuinely
   * different states here and not on the other two runners.
   */
  const [stops, setStops] = useState<RunnerStop[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const resolved = await buildStops(items);
      if (!cancelled) setStops(resolved);
    })();
    return () => { cancelled = true; };
    // itemsKey captures the item identity; `items` is a fresh array
    // each render, so depending on it directly would re-resolve every
    // tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey]);

  return (
    <InSessionPanelRunner stops={stops} accent={accent} onComplete={onComplete} />
  );
}

/** Every chord shape in the breakdown, hand by hand. */
async function buildStops(
  items: ReadonlyArray<BreakdownItem>,
): Promise<RunnerStop[]> {
  const out: RunnerStop[] = [];
  for (const item of await resolveChordShapeRunnerItems(items)) {
    const cellLabel = item.skill.label ?? item.itemRef;
    for (const hand of HANDS) {
      out.push({
        key: `${item.itemRef}:${hand}`,
        label: cellLabel,
        detail: `${item.drillType.name} · ${HAND_LABEL[hand]} · ${formatDuration(item.seconds)}`,
        surface: chordShapeSurface({
          cellLabel,
          skillLabel: `${item.drillType.name} · ${HAND_LABEL[hand]}`,
          skill: item.skill,
          drillType: item.drillType,
          hand,
        }),
      });
    }
  }
  return out;
}
