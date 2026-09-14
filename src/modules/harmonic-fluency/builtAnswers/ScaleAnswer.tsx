/**
 * Tap the five notes.
 *
 * =====================================================================
 * NO LETTER ROW: THE KEYBOARD IS THE ANSWER.
 *
 * "In the key of E♭ major pentatonic, the notes are _____" offered four
 * lists of five notes, and a reader could pick the one that started on
 * the right letter. Finding the five on a keyboard is the thing the
 * card is for, so the board is the only surface — which is the
 * prototype's own note on this card.
 *
 * Tap a key to choose it, tap it again to remove it. Octave does not
 * matter: E♭ in either octave counts once, because a pentatonic is five
 * notes and not five notes in one register.
 *
 * =====================================================================
 * ONE SURFACE, TWO CARD WORDINGS.
 *
 * The notes card asks which five. The lick card asks which minor
 * pentatonic fits over a major key — so the ROOT is the answer, the
 * first tap is the claim, and it shows in green while the rest show
 * blue. Right notes from the wrong first tap is told apart from five
 * wrong notes, because they are different mistakes.
 *
 * =====================================================================
 * THE DRONE HOLDS THE KEY, NEVER THE SCALE'S OWN ROOT.
 *
 * On the lick card that is A♭ under F minor pentatonic. The prototype
 * says it in terms — "the scale sitting on the key, never the root of
 * the scale" — because what the card teaches is which scale fits over
 * which key, and a drone on F would teach that F minor pentatonic is
 * its own key.
 * =====================================================================
 */
import { useMemo, useState } from 'react';
import BuiltAnswerKeyboard from '../../../components/BuiltAnswerKeyboard';
import SharedPlayer from '../../../components/SharedPlayer';
import { scaleMarks, tapMarks } from '../../../lib/builtAnswers/marks';
import { directionOf, scaleLine } from '../../../lib/builtAnswers/scaleLine';
import { playScale, scaleBeats } from '../../../lib/builtAnswers/play';
import { usePlayerSettings } from '../../../lib/player/usePlayerSettings';
import type { Flashcard } from '../catalog';
import type { BuiltTarget } from './cardTargets';
import { gradeScale, spellInKey } from './grade';
import { useColourMode } from './useColourMode';
import ColourToggle from './ColourToggle';

const BTN = 'rounded-md border px-3 py-1.5 text-xs font-medium transition-colors '
  + 'disabled:opacity-40 disabled:cursor-default';
const BTN_PRIMARY = `${BTN} border-neutral-900 bg-neutral-900 text-white `
  + 'dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900';
const BTN_PLAIN = `${BTN} border-black/10 dark:border-white/20 `
  + 'hover:bg-black/[0.04] dark:hover:bg-white/10';

export default function ScaleAnswer({
  card, target, answered, answer,
}: {
  card: Flashcard;
  target: Extract<BuiltTarget, { kind: 'scale' }>;
  answered: boolean;
  answer: (choice: string) => void;
}) {
  /** In the order they were tapped: the lick card needs the first. */
  const [taps, setTaps] = useState<number[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [colour, setColour] = useColourMode();
  /** The shared panel's settings — one set of words for tempo, the
   *  lift, the loop and the colours on every screen that sounds.
   *
   *  OPENS ON UP AND DOWN, which is what this card played when its row
   *  was Direction. Play as took that row's place on 13 Sep 2026 and
   *  the card sounds the same until the reader changes it. */
  const [settings, setSettings] = usePlayerSettings({ playAs: 'upDown' });
  const [start, setStart] = useState<number | null>(null);
  /** Which note is sounding, so the board follows the run. */
  const [sounding, setSounding] = useState<number | null>(null);

  const marks = useMemo(() => {
    if (answered) {
      // THE WHOLE SCALE LIGHTS ON REVEAL, because the card is about the
      // scale rather than about five keys.
      const scale = scaleMarks(target.pcs, target.rootPc, colour);
      if (sounding !== null) scale.set(sounding, { pressed: true });
      return scale;
    }
    return tapMarks(taps, { rootPc: target.rootFirst ? taps[0] ?? null : null });
  }, [answered, target.pcs, target.rootPc, target.rootFirst, colour, taps, sounding]);


  /**
   * The run, handed to the shared panel.
   *
   * IT RETURNS THE HANDLE RATHER THAN KEEPING IT. The panel owns the
   * transport now — one Hear it, one Pause that stops where it is, one
   * Resume that picks up from there — and it can only do that if it
   * holds what is sounding. `startAtBeat` is how far in Resume asks
   * for.
   */
  const line = scaleLine(
    target.pcs, start ?? target.rootPc, directionOf(settings.playAs), { toOctave: false },
  );
  const together = settings.playAs === 'together';

  const hear = (startAtBeat = 0) => playScale(line, {
    bpm: settings.bpm,
    octaveUp: settings.octaveUp,
    home: target.homePcs.map(pc => 48 + pc),
    dronePc: target.dronePc,
    together,
    onNote: i => setSounding(line[i] ?? null),
    ...(startAtBeat > 0 ? { startAtBeat } : {}),
  });

  const submit = () => {
    if (taps.length !== target.pcs.length) {
      setMessage(
        `${target.rootFirst ? 'Tap five notes, root first.' : 'Choose five notes.'}`
        + ` You have ${taps.length}.`,
      );
      return;
    }
    const grade = gradeScale(target, taps);
    setMessage(null);
    setStart(target.rootPc);
    answer(grade.correct ? card.correctAnswer : grade.built);
  };

  const built = taps.length === 0
    ? (target.rootFirst ? 'tap the root first' : 'nothing yet')
    : taps.map(pc => spellInKey(pc, target.rootName)).join(' ');

  return (
    <div className="space-y-3" data-testid="scale-answer">
      <div className="text-[10px] uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
        {target.rootFirst ? 'Tap the five notes, root first' : 'Tap the five notes'}
      </div>

      <BuiltAnswerKeyboard
        marks={marks}
        label="Tap the notes of the pentatonic."
        {...(answered ? {} : {
          onTap: (midi: number) => {
            const pc = midi % 12;
            setMessage(null);
            setTaps(prev => (prev.includes(pc)
              ? prev.filter(p => p !== pc)
              : [...prev, pc]));
          },
        })}
      />

      {!answered && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div
              className={`font-mono text-lg ${taps.length === 0 ? 'text-neutral-400' : ''}`}
              data-testid="scale-built"
            >
              {built}
            </div>
            <button type="button" className={BTN_PRIMARY} data-testid="submit" onClick={submit}>
              Submit
            </button>
            <button
              type="button"
              className={BTN_PLAIN}
              onClick={() => { setTaps([]); setMessage(null); }}
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
            totalBeats={scaleBeats(line.length, together)}
            caption={target.pcs.map(pc => spellInKey(pc, target.rootName)).join(' ')}
          >
            {/* STARTING POINTS ARE THE PENTATONIC CARDS' OWN. Those are
                the hand shapes Shapes & Patterns drills; a seven-note
                scale from another note is a mode, and the Modes family
                already plays those. */}
            <div className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
                Starting point
              </div>
              <div className="flex flex-wrap gap-1.5" data-testid="start-row">
                {target.pcs.map(pc => (
                  <button
                    key={pc}
                    type="button"
                    aria-pressed={(start ?? target.rootPc) === pc}
                    data-testid={`start-${pc}`}
                    onClick={() => setStart(pc)}
                    className={`${BTN} ${(start ?? target.rootPc) === pc
                      ? 'border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900'
                      : 'border-black/10 dark:border-white/20'}`}
                  >
                    {spellInKey(pc, target.rootName)}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
              {`The home chord of the key, then the scale with ${
                spellInKey(target.dronePc, target.rootName)} held low underneath.`}
            </p>
          </SharedPlayer>
        </>
      )}
    </div>
  );
}
