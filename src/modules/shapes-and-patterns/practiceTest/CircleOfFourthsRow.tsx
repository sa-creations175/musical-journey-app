/**
 * The twelve chords of a Circle of 4ths drill, lit as the drill goes.
 *
 * =====================================================================
 * THE ONE THING A CIRCLE DRILL SHOWS THAT A KEY DRILL DOES NOT.
 *
 * Silas's decision of 14 Sep 2026, and the walked prototype
 * (`circle-of-fourths-drill.html`): the shape goes C F B♭ E♭ A♭ D♭ G♭
 * B E A D G, one key every Rate interval, starting on C and looping
 * until End Drill. All twelve sit in one row, the current one lit and
 * the passed ones tinted; the current chord's notes are on a line
 * below, and the lap is counted in the small line. No starting-key
 * picker and no big single key: both were ruled out.
 *
 * ON THE CLICK. With the metronome sounding, the count moves on the
 * beat the metronome plays (`metronome.onBeat`), so the lit chord and
 * the click cannot drift apart. A practice drill may run with the
 * metronome off; then the same count runs from a timer at the tempo the
 * metronome is set to, which is what the Rate is measured against.
 * =====================================================================
 */
import { useEffect, useState } from 'react';
import type { InversionState } from '../../../lib/db';
import { metronome } from '../../../lib/metronome';
import { useMetronomeState } from '../../../lib/useMetronome';
import { spellKey, spellNote } from '../../../lib/spelling';
import { useSpelling } from '../../../lib/spellingPref';
import {
  CHORD_QUALITY_BY_ID, KEYS, KEYS_CIRCLE_OF_FOURTHS, QUALITY_INTERVALS,
} from '../catalog';
import { circlePosition } from './circlePosition';

/**
 * The shape's notes above its root, lowest first.
 *
 * ROTATED, AS THE CELL PLAYER ROTATES THEM. All inversions fluid has no
 * one shape to write, so it shows root position.
 */
function shapeIntervals(
  intervals: readonly number[], state: InversionState | null,
): number[] {
  const at = state === 'inv1' ? 1 : state === 'inv2' ? 2 : state === 'inv3' ? 3 : 0;
  const n = Math.min(at, intervals.length - 1);
  return [...intervals.slice(n), ...intervals.slice(0, n).map(t => t + 12)];
}

export default function CircleOfFourthsRow({
  quality, inversionState, smallLine, per,
}: {
  quality: string;
  inversionState: InversionState | null;
  /** The shape and the hand, as the panel's header names them. */
  smallLine: string;
  /** Beats to a key: the Rate the drill was started at. */
  per: number;
}) {
  const [spelling] = useSpelling();
  const { playing, bpm } = useMetronomeState();
  const [beats, setBeats] = useState(0);

  useEffect(() => {
    if (playing) return metronome.onBeat(() => setBeats(b => b + 1));
    const id = window.setInterval(() => setBeats(b => b + 1), 60000 / Math.max(1, bpm));
    return () => window.clearInterval(id);
  }, [playing, bpm]);

  const suffix = CHORD_QUALITY_BY_ID.get(quality)?.suffix ?? '';
  const { index, lap } = circlePosition(beats, per);
  const current = KEYS_CIRCLE_OF_FOURTHS[index];
  const rootPc = KEYS.indexOf(current);
  const name = (keyName: string) => `${spellKey(keyName, spelling)}${suffix}`;
  const notes = shapeIntervals(QUALITY_INTERVALS[quality] ?? [], inversionState)
    .map(t => spellNote(rootPc + t, spelling))
    .join(' ')
    // ALL INVERSIONS FLUID SHOWS ROOT POSITION AND SAYS SO (Silas, 14 Sep
    // 2026): "Cm7 · C E♭ G B♭ (any inversion)".
    + (inversionState === 'fluid' ? ' (any inversion)' : '');

  return (
    <div
      className="space-y-2 rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-2.5"
      data-testid="circle-of-fourths-row"
    >
      {/* SILAS'S WORDS, 14 Sep 2026: one line above the twelve, and
          nothing else from the prototype. */}
      <p className="text-xs text-neutral-700 dark:text-neutral-200" data-testid="circle-note">
        Drill chord shapes around the Circle of 4ths. This exercise counts toward the Circle of 4ths cell in the matrix.
      </p>
      <div className="text-xs text-neutral-500" data-testid="circle-small-line">
        {`${smallLine} · lap ${lap}`}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {KEYS_CIRCLE_OF_FOURTHS.map((keyName, i) => (
          <span
            key={keyName}
            data-testid="circle-chord"
            aria-current={i === index ? 'step' : undefined}
            className={`px-2 py-1 rounded-md border text-sm font-semibold ${
              i === index
                ? 'bg-fluent text-white border-fluent'
                : i < index
                  ? 'bg-fluent/10 text-fluent border-fluent/30'
                  : 'border-neutral-200 dark:border-neutral-700 text-neutral-500'}`}
          >
            {name(keyName)}
          </span>
        ))}
      </div>
      <div className="font-mono text-sm" data-testid="circle-notes">
        {`${name(current)} · ${notes}`}
      </div>
    </div>
  );
}
