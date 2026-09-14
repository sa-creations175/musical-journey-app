/**
 * The twelve keys of a Circle of 4ths drill, lit as the drill goes.
 *
 * =====================================================================
 * ONE ROW, TWO KINDS OF DRILL. Silas's decisions of 14 Sep 2026 (chord
 * shapes) and 13 Sep 2026 (Chord Movements & Passes), and the walked
 * prototype (`circle-of-fourths-drill.html`): the drill goes C F B♭ E♭ A♭
 * D♭ G♭ B E A D G, one key at a time, starting on C and looping until
 * End Drill. All twelve sit in one row, the current one lit and the
 * passed ones tinted; the line under them says what is played in the
 * current key, and the lap is counted in the small line. No starting-key
 * picker and no big single key: both were ruled out.
 *
 * WHAT MAY DIFFER BETWEEN THE TWO IS A WRITTEN LIST (`circleRowContent`):
 *   · the one line above the twelve, in Silas's words for each
 *   · what a tile says — a chord shape's tile is the chord ("Cm7"), a
 *     movement's is the key ("C")
 *   · the line under the twelve — a shape's notes ("Cm7 · C E♭ G B♭"),
 *     a movement's chords ("In F: Gm7 · C7 · Fmaj7")
 *   · how many beats a key lasts: one Rate interval for a shape, one
 *     Rate interval a chord for a movement
 * Everything else — the order, the lighting, the tint, the lap, the
 * beat — is this component's.
 *
 * ON THE CLICK. With the metronome sounding, the count moves on the
 * beat the metronome plays (`metronome.onBeat`), so the lit key and the
 * click cannot drift apart. A practice drill may run with the metronome
 * off; then the same count runs from a timer at the tempo the metronome
 * is set to, which is what the Rate is measured against.
 * =====================================================================
 */
import { useEffect, useState } from 'react';
import { metronome } from '../../../lib/metronome';
import { useMetronomeState } from '../../../lib/useMetronome';
import { useSpelling } from '../../../lib/spellingPref';
import { KEYS_CIRCLE_OF_FOURTHS } from '../catalog';
import { circlePosition } from './circlePosition';
import type { CircleRowContent } from './circleRowContent';

export default function CircleOfFourthsRow({
  note, tile, line, smallLine, per,
}: CircleRowContent & {
  /** The row and the hand, as the panel's header names them. */
  smallLine: string;
  /** Beats a key lasts. */
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

  const { index, lap } = circlePosition(beats, per);
  const current = KEYS_CIRCLE_OF_FOURTHS[index];

  return (
    <div
      className="space-y-2 rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-2.5"
      data-testid="circle-of-fourths-row"
    >
      <p className="text-xs text-neutral-700 dark:text-neutral-200" data-testid="circle-note">
        {note}
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
            {tile(keyName, spelling)}
          </span>
        ))}
      </div>
      <div className="font-mono text-sm" data-testid="circle-notes">
        {line(current, spelling)}
      </div>
    </div>
  );
}
