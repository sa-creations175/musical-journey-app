import { Fragment } from 'react';

interface Props {
  startingDegree: number;       // 1-7 (main octave)
  destinationDegree?: number;   // resolved degree in main octave (may be same as start)
  /** When "up" the path runs rightward from startingDegree; "down" runs leftward. */
  direction?: 'up' | 'down';
  /** Number of interval steps (distance = 1 means a 2nd, 6 means a 7th). */
  distance?: number;
  answered: boolean;
  correct?: boolean;
  /** Secondary labels keyed by scale degree (1-7). Always visible. */
  degreeLabels?: Partial<Record<number, string>>;
  /** Secondary labels that only reveal after the user submits. Merged
      over `degreeLabels` at reveal time (so callers can show the tonic
      name only once the answer is locked in). */
  degreeLabelsAfterAnswer?: Partial<Record<number, string>>;
}

// Interval-name lookup indexed by stepsFromStart + 1.
//   steps=1 → 2nd, steps=2 → 3rd, …
const INTERVAL_NAMES = ['', '', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];

// Linear scale-degree strip. Replaces the circular compass for
// categories that involve directional stepwise counting (scale degree
// math, named notes across keys, reverse key pivots). The path ALWAYS
// runs in the direction the question states — "up" goes right, "down"
// goes left — even when the compass would have taken the shorter way.
export default function LinearScaleStrip({
  startingDegree,
  destinationDegree,
  direction,
  distance,
  answered,
  correct,
  degreeLabels,
  degreeLabelsAfterAnswer,
}: Props) {
  // Path endpoints on a signed linear axis where 1..7 is the main
  // octave, positions >7 are the next octave, positions ≤0 are the
  // previous octave.
  const startPos = startingDegree;
  const endPos = destinationDegree !== undefined && distance === undefined
    ? destinationDegree
    : direction && distance !== undefined
      ? startPos + (direction === 'up' ? distance : -distance)
      : (destinationDegree ?? startPos);
  const effectiveDirection: 'up' | 'down' =
    direction ?? (endPos >= startPos ? 'up' : 'down');

  // Always show the full main octave at minimum, extending only as far
  // as the path needs.
  const leftmost = Math.min(startPos, endPos, 1);
  const rightmost = Math.max(startPos, endPos, 7);
  const pathMin = Math.min(startPos, endPos);
  const pathMax = Math.max(startPos, endPos);
  const pathIsNull = startPos === endPos;

  const slots: Array<{ position: number; degree: number; octave: number }> = [];
  for (let p = leftmost; p <= rightmost; p++) {
    slots.push({ position: p, ...positionToDegree(p) });
  }

  return (
    <div className="overflow-x-auto max-w-full py-1">
      <div className="inline-flex items-start justify-start gap-0 px-2">
        {slots.map((slot, i) => {
          const next = slots[i + 1];
          const onPath = !pathIsNull && slot.position >= pathMin && slot.position < pathMax;
          const intervalLabel = onPath && answered
            ? (effectiveDirection === 'up'
              ? INTERVAL_NAMES[slot.position - startPos + 2]
              : INTERVAL_NAMES[startPos - slot.position + 1])
            : null;
          return (
            <Fragment key={slot.position}>
              <Slot
                slot={slot}
                isStart={slot.position === startPos}
                isDest={answered && !pathIsNull && slot.position === endPos}
                correct={!!correct}
                labels={degreeLabels}
                labelsAfterAnswer={answered ? degreeLabelsAfterAnswer : undefined}
              />
              {next && (
                <Connector
                  onPath={onPath}
                  direction={effectiveDirection}
                  intervalLabel={intervalLabel ?? undefined}
                />
              )}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

// --- Slot ------------------------------------------------------------

interface SlotInfo {
  position: number;
  degree: number;
  octave: number;
}

function Slot({
  slot,
  isStart,
  isDest,
  correct,
  labels,
  labelsAfterAnswer,
}: {
  slot: SlotInfo;
  isStart: boolean;
  isDest: boolean;
  correct: boolean;
  labels?: Partial<Record<number, string>>;
  labelsAfterAnswer?: Partial<Record<number, string>>;
}) {
  const faded = slot.octave !== 0;
  const revealLabel = labelsAfterAnswer?.[slot.degree];
  const persistentLabel = labels?.[slot.degree];
  const label = revealLabel ?? persistentLabel;

  let circle =
    'border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300';
  let labelColor = 'text-neutral-500';
  if (isDest) {
    circle = correct
      ? 'border-fluent bg-fluent/10 text-fluent'
      : 'border-needswork bg-needswork/10 text-needswork';
    labelColor = correct ? 'text-fluent' : 'text-needswork';
  } else if (isStart) {
    circle = 'border-info bg-info/10 text-info';
    labelColor = 'text-info';
  }

  return (
    <div className={`flex flex-col items-center w-9 shrink-0 ${faded ? 'opacity-40' : ''}`}>
      <div
        className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-mono tabular-nums ${circle}`}
      >
        {slot.degree}
      </div>
      <div className={`text-[10px] mt-1 font-mono min-h-[14px] ${labelColor}`}>
        {label ?? ''}
      </div>
    </div>
  );
}

// --- Connector -------------------------------------------------------

function Connector({
  onPath,
  direction,
  intervalLabel,
}: {
  onPath: boolean;
  direction: 'up' | 'down';
  intervalLabel?: string;
}) {
  return (
    <div className="flex flex-col items-center w-7 shrink-0">
      <div className="h-8 flex items-center justify-center">
        {onPath ? (
          <span
            className={`text-sm ${direction === 'up' ? 'text-fluent' : 'text-fluent'}`}
            aria-hidden
          >
            {direction === 'up' ? '→' : '←'}
          </span>
        ) : (
          <span className="w-2 h-px bg-neutral-300 dark:bg-neutral-700" aria-hidden />
        )}
      </div>
      <div className="text-[9px] mt-1 font-mono min-h-[14px] text-neutral-500">
        {intervalLabel ?? ''}
      </div>
    </div>
  );
}

// --- Position math ---------------------------------------------------

/**
 * Map a linear position to { degree (1-7), octave } where:
 *   1..7  = main octave (0)
 *   >7    = next octave (+1)
 *   ≤0    = previous octave (-1), with 0 → degree 7, -1 → 6, etc.
 */
function positionToDegree(pos: number): { degree: number; octave: number } {
  if (pos >= 1 && pos <= 7) return { degree: pos, octave: 0 };
  if (pos > 7) return { degree: ((pos - 1) % 7) + 1, octave: 1 };
  const adjusted = pos - 1;
  const degree = ((adjusted % 7) + 7) % 7 + 1;
  return { degree, octave: -1 };
}
