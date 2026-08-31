/**
 * In-session VOICE-LEADING runner — Level 3 auto-navigation.
 *
 * The voice-leading counterpart to InSessionDrillRunner and
 * ChordShapeDrillRunner. On GO, this walks the prep-screen per-item
 * breakdown and opens the session panel on each VL sub-cell in turn.
 *
 * ONE STOP PER SUB-CELL, no hand walk: voice leading is two-handed by
 * nature and is excluded from the hand dimension entirely.
 *
 * VL sub-cells run off the static catalog (no database rows), so the
 * list resolves synchronously, like the scales runner.
 */
import { useMemo } from 'react';
import { voiceLeadingSurface } from '../shapes-and-patterns/practiceTest/makeSurfaces';
import { formatDuration } from '../shapes-and-patterns/drillModel';
import { useSpelling } from '../../lib/spellingPref';
import InSessionPanelRunner, { type RunnerStop } from './InSessionPanelRunner';
import type { BreakdownItem } from './inSessionScaleRunner';
import { resolveVoiceLeadingRunnerItems } from './inSessionVoiceLeadingRunner';

interface Props {
  items: ReadonlyArray<BreakdownItem>;
  /** Module accent for the prep screen and count-in overlay. */
  accent: string;
  /** Fires when the walk finishes or nothing resolved — the caller
   *  moves the block to its rating phase. */
  onComplete: () => void;
}

export default function VoiceLeadingDrillRunner({ items, accent, onComplete }: Props) {
  const [spelling] = useSpelling();
  const itemsKey = items.map(i => i.itemRef).join('|');

  const stops = useMemo<RunnerStop[]>(
    () => resolveVoiceLeadingRunnerItems(items, spelling).map(item => ({
      key: item.itemRef,
      label: item.label,
      detail: [item.subLabel, formatDuration(item.seconds)]
        .filter((part): part is string => part !== null)
        .join(' · '),
      surface: voiceLeadingSurface({
        cellLabel: item.label,
        skillLabel: item.subLabel ?? '',
        itemRef: item.itemRef,
      }),
    })),
    // itemsKey captures the item identity; `items` is a fresh array
    // each render, so depending on it directly would rebuild every tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [itemsKey, spelling],
  );

  return (
    <InSessionPanelRunner stops={stops} accent={accent} onComplete={onComplete} />
  );
}
