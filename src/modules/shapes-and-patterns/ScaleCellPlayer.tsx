/**
 * Hear the scale cell you are about to drill.
 *
 * =====================================================================
 * A REFERENCE, LIKE `CellPlayer`, AND FOR THE SAME REASON.
 *
 * No attempt, no spacing row, no rating. And the same shared panel, so
 * tempo, the octave lift, the loop, the colours and the instrument mean
 * on this grid what they mean everywhere else.
 *
 * =====================================================================
 * THE SCALE PLAYER, NOT THE CHORD ONE: ROOT DRONE, UP AND BACK.
 *
 * `playScale` holds the KEY's root underneath and runs the notes over
 * it. That is the shape the pentatonic cards already use on the built
 * answers, and it is the one this grid drills — a scale played without
 * its key underneath is a set of notes rather than a scale.
 *
 * A SEVEN-NOTE SCALE RUNS TO ITS OCTAVE AND TURNS THERE; A PENTATONIC
 * TURNS AT ITS TOP NOTE. `scaleLine` decides that and says why; this
 * only says which kind of scale it has.
 *
 * UP AND BACK IS WHERE IT OPENS, and Play as (at the end of Settings
 * since 13 Sep 2026) changes it: Up, Down, or every note at once.
 *
 * =====================================================================
 * THE STARTING POINT IS THE CELL'S, NOT THE KEY'S.
 *
 * `scale:minor-pentatonic:b3:C` is the C minor pentatonic run FROM ITS
 * ♭3 — one of the three shapes this grid drills — and hearing it from
 * the root would be hearing a different cell.
 * =====================================================================
 */
import { useMemo, useState } from 'react';
import SharedPlayer from '../../components/SharedPlayer';
import { usePlayerSettings } from '../../lib/player/usePlayerSettings';
import { playScale, scaleBeats } from '../../lib/builtAnswers/play';
import { directionOf, scaleLine } from '../../lib/builtAnswers/scaleLine';
import { scaleMarks } from '../../lib/builtAnswers/marks';
import BuiltAnswerKeyboard from '../../components/BuiltAnswerKeyboard';
import { spellNote } from '../../lib/spelling';
import { useSpelling } from '../../lib/spellingPref';
import { KEYS } from './catalog';
import { scaleCellLabel, type ScaleCell } from './scaleSkills';

/**
 * The notes of each kind, as semitones above the key's root.
 *
 * FOUR KINDS, WHICH IS WHAT THE GRID DRILLS. The pentatonics are the
 * five-note shapes; the natural minor is written from the MAJOR key's
 * root, because that is how the grid names its cells — a C natural
 * minor cell is the key of C, not the key of E♭.
 */
const SCALE_PCS: Readonly<Record<string, ReadonlyArray<number>>> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  'major-pentatonic': [0, 2, 4, 7, 9],
  'natural-minor': [0, 2, 3, 5, 7, 8, 10],
  'minor-pentatonic': [0, 3, 5, 7, 10],
};

/** Where a starting point sits above the key's root. */
const START_SEMIS: Readonly<Record<string, number>> = {
  '1': 0, '5': 7, '6': 9, b3: 3, b7: 10,
};

/** Which kinds turn at the octave rather than at their top note. */
const TO_OCTAVE: ReadonlyArray<string> = ['major', 'natural-minor'];

export default function ScaleCellPlayer({ cell }: { cell: ScaleCell }) {
  const [spelling] = useSpelling();
  const [settings, setSettings] = usePlayerSettings({ playAs: 'upDown' });
  const [sounding, setSounding] = useState<number | null>(null);

  const keyPc = KEYS.indexOf(cell.keyName as never);
  const pcs = SCALE_PCS[cell.kind];
  const startPc = useMemo(
    () => (keyPc + (START_SEMIS[cell.startingPoint ?? '1'] ?? 0)) % 12,
    [cell.startingPoint, keyPc],
  );

  const line = useMemo(() => (pcs === undefined || keyPc < 0
    ? []
    : scaleLine(
      pcs.map(p => (keyPc + p) % 12),
      startPc,
      directionOf(settings.playAs),
      { toOctave: TO_OCTAVE.includes(cell.kind) },
    )), [pcs, keyPc, startPc, cell.kind, settings.playAs]);

  const marks = useMemo(() => (pcs === undefined || keyPc < 0
    ? new Map()
    : (() => {
      const m = scaleMarks(pcs.map(p => (keyPc + p) % 12), keyPc, settings.colours);
      if (sounding !== null) m.set(sounding, { pressed: true });
      return m;
    })()), [pcs, keyPc, settings.colours, sounding]);

  if (pcs === undefined || keyPc < 0 || line.length === 0) return null;

  const together = settings.playAs === 'together';

  const hear = (startAtBeat = 0) => playScale(line, {
    bpm: settings.bpm,
    octaveUp: settings.octaveUp,
    // THE HOME CHORD OF THE KEY, then the scale over its root held low.
    home: [0, 4, 7].map(t => 48 + ((keyPc + t) % 12)),
    dronePc: keyPc,
    together,
    onNote: i => setSounding(line[i] ?? null),
    ...(startAtBeat > 0 ? { startAtBeat } : {}),
  });

  return (
    <div className="space-y-2" data-testid="scale-cell-player">
      <p className="text-sm font-medium" data-testid="scale-cell-player-title">
        {scaleCellLabel(cell, spelling)}
      </p>
      <SharedPlayer
        chords={[]}
        settings={settings}
        onSettings={setSettings}
        board={<BuiltAnswerKeyboard marks={marks} label="The scale of this cell" />}
        caption={line.slice(0, pcs.length)
          .map(m => spellNote(((m % 12) + 12) % 12, spelling)).join(' ')}
        play={({ startAtBeat }) => hear(startAtBeat)}
        totalBeats={scaleBeats(line.length, together)}
      >
        <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
          A reference, not a quiz — nothing here is rated. The home chord of the
          key, then the scale from this cell&apos;s own starting point with the
          key held low underneath.
        </p>
      </SharedPlayer>
    </div>
  );
}
