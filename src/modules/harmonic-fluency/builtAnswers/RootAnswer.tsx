/**
 * Name the key, by tapping its root.
 *
 * =====================================================================
 * FOUR KEY NAMES WERE A ONE-IN-FOUR GUESS AT A LETTER.
 *
 * "The relative minor of the key of A♭ major is _____" offered F minor
 * against three others. Going to the 6 of A♭ and finding F is the
 * skill; picking the option that looks likeliest is not.
 *
 * ONE TAP, on the letter row or on the board, either way. Tapping A♭ on
 * the keys is the same answer as tapping A and then ♭, which is what
 * makes the row and the board mirrors rather than two questions.
 *
 * =====================================================================
 * THE REVEAL LIGHTS THE WHOLE SCALE, BECAUSE THE CARD IS ABOUT A KEY.
 *
 * A single key lit would answer "which note"; the card asked which
 * KEY. So the natural minor lights on the relative-minor card and the
 * major on its twin, root in green, and the seven notes are the four
 * flats a reader can then count.
 *
 * NOTHING LIGHTS BEFORE SUBMIT except the note the finger landed on.
 * Lighting the scale of whatever has been tapped would hand back the
 * answer: a reader could try roots until seven familiar notes appeared.
 * =====================================================================
 */
import { useMemo, useState } from 'react';
import ChordPicker from '../../../components/ChordPicker';
import SharedPlayer from '../../../components/SharedPlayer';
import {
  type RootPick, pickFromPitchClass, rootLabel, rootPitchClass,
} from '../../../lib/builtAnswers/rootPick';
import { scaleMarks, singleMark } from '../../../lib/builtAnswers/marks';
import { scaleLine, type Direction } from '../../../lib/builtAnswers/scaleLine';
import { playScale, scaleBeats } from '../../../lib/builtAnswers/play';
import { usePlayerSettings } from '../../../lib/player/usePlayerSettings';
import type { Flashcard } from '../catalog';
import type { BuiltTarget } from './cardTargets';
import { gradeRoot, keySpelling } from './grade';
import { useColourMode } from './useColourMode';
import ColourToggle from './ColourToggle';

const BTN = 'rounded-md border px-3 py-1.5 text-xs font-medium transition-colors '
  + 'disabled:opacity-40 disabled:cursor-default';
const BTN_PRIMARY = `${BTN} border-neutral-900 bg-neutral-900 text-white `
  + 'dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900';
const BTN_PLAIN = `${BTN} border-black/10 dark:border-white/20 `
  + 'hover:bg-black/[0.04] dark:hover:bg-white/10';

const DIRECTIONS: ReadonlyArray<{ id: Direction; label: string }> = [
  { id: 'up', label: 'Up' },
  { id: 'down', label: 'Down' },
  { id: 'both', label: 'Up and down' },
];

export default function RootAnswer({
  card, target, answered, answer,
}: {
  card: Flashcard;
  target: Extract<BuiltTarget, { kind: 'root' }>;
  answered: boolean;
  answer: (choice: string) => void;
}) {
  const [pick, setPick] = useState<RootPick | null>(null);
  /** The key a finger landed on, so the tap lights where it landed
   *  rather than in some other octave. */
  const [tapped, setTapped] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [colour, setColour] = useColourMode();
  /** The shared panel's settings — one set of words for tempo, the
   *  lift, the loop and the colours on every screen that sounds. */
  const [settings, setSettings] = usePlayerSettings();
  const [direction, setDirection] = useState<Direction>('both');
  const [sounding, setSounding] = useState<number | null>(null);

  const marks = useMemo(() => {
    if (answered) {
      const scale = scaleMarks(target.pcs, target.rootPc, colour);
      if (sounding !== null) scale.set(sounding, { pressed: true });
      return scale;
    }
    // BEFORE SUBMIT, ONE KEY. The one the finger landed on, or the
    // lower instance of a pick made from the letter row.
    if (tapped !== null) return singleMark(tapped);
    return pick === null ? new Map() : singleMark(48 + rootPitchClass(pick));
  }, [answered, target.pcs, target.rootPc, colour, sounding, tapped, pick]);


  /**
   * The run, handed to the shared panel.
   *
   * IT RETURNS THE HANDLE RATHER THAN KEEPING IT. The panel owns the
   * transport now — one Hear it, one Pause that stops where it is, one
   * Resume that picks up from there — and it can only do that if it
   * holds what is sounding. `startAtBeat` is how far in Resume asks
   * for.
   */
  // THE KEY CARDS RUN TO THE OCTAVE AND BACK, which is what a
  // seven-note scale does; the pentatonic cards turn earlier.
  const line = scaleLine(target.pcs, target.rootPc, direction, { toOctave: true });

  const hear = (startAtBeat = 0) => playScale(line, {
    bpm: settings.bpm,
    octaveUp: settings.octaveUp,
    home: target.homePcs.map(pc => 48 + pc),
    dronePc: target.rootPc,
    onNote: i => setSounding(line[i] ?? null),
    ...(startAtBeat > 0 ? { startAtBeat } : {}),
  });

  const submit = () => {
    if (pick === null) {
      setMessage(`Choose ${target.minor ? 'a root' : 'a key'} first.`);
      return;
    }
    const grade = gradeRoot(target, rootPitchClass(pick));
    setMessage(null);
    answer(grade.correct ? card.correctAnswer : grade.built);
  };

  const mode = target.minor ? 'minor' : 'major';

  return (
    <div className="space-y-3" data-testid="root-answer">
      <ChordPicker
        marks={marks}
        keyboardLabel={`Tap the root of the key ${card.categoryName} asks for`}
        {...(answered ? {} : {
          onTapKey: (midi: number) => {
            setMessage(null);
            setTapped(midi);
            setPick(pickFromPitchClass(midi % 12, keySpelling(target.rootName)));
          },
          root: {
            pick,
            onPick: (p: RootPick | null) => {
              setPick(p);
              setTapped(null);
              setMessage(null);
            },
            label: target.minor ? 'Its root' : 'The key',
          },
        })}
      />

      {!answered && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div
              className={`font-mono text-lg ${pick === null ? 'text-neutral-400' : ''}`}
              data-testid="root-built"
            >
              {pick === null ? `choose a ${target.minor ? 'root' : 'key'}` : `${rootLabel(pick)} ${mode}`}
            </div>
            <button type="button" className={BTN_PRIMARY} data-testid="submit" onClick={submit}>
              Submit
            </button>
            <button
              type="button"
              className={BTN_PLAIN}
              onClick={() => { setPick(null); setTapped(null); setMessage(null); }}
            >
              Clear
            </button>
          </div>
          {message !== null && (
            <p className="text-xs text-needswork" data-testid="picker-message">{message}</p>
          )}
        </>
      )}

      {answered && (
        <>
          <ColourToggle value={colour} onChange={setColour} />
          <SharedPlayer
            chords={[]}
            settings={settings}
            onSettings={setSettings}
            board={false}
            play={({ startAtBeat }) => hear(startAtBeat)}
            totalBeats={scaleBeats(line.length)}
            caption={`${target.rootName} ${mode}`}
          >
            {/* NO STARTING POINTS ON A KEY CARD. A seven-note scale
                from another note is a mode, and the Modes family
                already plays those — the prototype's own note. */}
            <div className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
                Direction
              </div>
              <div className="flex flex-wrap gap-1.5" data-testid="direction-row">
                {DIRECTIONS.map(d => (
                  <button
                    key={d.id}
                    type="button"
                    aria-pressed={direction === d.id}
                    data-testid={`direction-${d.id}`}
                    onClick={() => setDirection(d.id)}
                    className={`${BTN} ${direction === d.id
                      ? 'border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900'
                      : 'border-black/10 dark:border-white/20'}`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
              {`The home chord of the key of ${target.rootName} ${mode}, then its `
                + 'scale to the octave and back, with the root held low underneath.'}
            </p>
          </SharedPlayer>
        </>
      )}
    </div>
  );
}
