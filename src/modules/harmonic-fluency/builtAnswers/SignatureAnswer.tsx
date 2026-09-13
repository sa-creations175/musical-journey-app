/**
 * Count the accidentals, and say which kind.
 *
 * =====================================================================
 * NO KEYBOARD, BECAUSE THE ANSWER IS A NUMBER.
 *
 * "The key of G major has _____ sharps" is answered by a count and a
 * direction, and a board would be a picture of something the question
 * does not ask about. So this is the one built answer with no picker:
 * a 0 to 6 count and a sharps-or-flats switch, which is the brief's
 * own description.
 *
 * NOTHING LIGHTS AND NOTHING SOUNDS BEFORE SUBMIT. The board would give
 * the answer away — a reader could count the black keys of whatever lit
 * up.
 *
 * =====================================================================
 * THE REVEAL IS A DECISION I MADE AND IT IS IN THE REPORT.
 *
 * The brief says what happens before Submit and stops; the prototype
 * draws the other key-signature shape (the one that answers with a
 * key) and is silent on this one. What is drawn here is the key's own
 * scale with its accidentals in it, which is the prototype's stated
 * rule for its sibling card, in its words: "the flats in it are the
 * black keys you can count". Say the word if the count card should
 * reveal nothing instead.
 *
 * ZERO HAS NO DIRECTION. "The key of C major has _____ sharps/flats"
 * answers 0, and a reader who taps 0 has answered it whichever way the
 * switch is sitting — `gradeSignature` says so.
 * =====================================================================
 */
import { useMemo, useState } from 'react';
import BuiltAnswerKeyboard from '../../../components/BuiltAnswerKeyboard';
import SharedPlayer from '../../../components/SharedPlayer';
import { scaleMarks } from '../../../lib/builtAnswers/marks';
import { directionOf, scaleLine } from '../../../lib/builtAnswers/scaleLine';
import { playScale, scaleBeats } from '../../../lib/builtAnswers/play';
import { usePlayerSettings } from '../../../lib/player/usePlayerSettings';
import type { Flashcard } from '../catalog';
import type { BuiltTarget } from './cardTargets';
import { gradeSignature } from './grade';
import { useColourMode } from './useColourMode';
import ColourToggle from './ColourToggle';

const BTN = 'rounded-md border px-3 py-1.5 text-xs font-medium transition-colors';
const BTN_PRIMARY = `${BTN} border-neutral-900 bg-neutral-900 text-white `
  + 'dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900';
const BTN_PLAIN = `${BTN} border-black/10 dark:border-white/20 `
  + 'hover:bg-black/[0.04] dark:hover:bg-white/10';
const ON = 'border-neutral-900 bg-neutral-900 text-white '
  + 'dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900';
const OFF = 'border-black/10 dark:border-white/20';

/** No key carries more than six of either — the seventh is the other
 *  spelling of the same key. */
const COUNTS = [0, 1, 2, 3, 4, 5, 6];

export default function SignatureAnswer({
  card, target, answered, answer,
}: {
  card: Flashcard;
  target: Extract<BuiltTarget, { kind: 'signature' }>;
  answered: boolean;
  answer: (choice: string) => void;
}) {
  const [count, setCount] = useState<number | null>(null);
  const [direction, setDirection] = useState<'sharps' | 'flats' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [colour, setColour] = useColourMode();
  /** The shared panel's settings — one set of words for tempo, the
   *  lift, the loop and the colours on every screen that sounds. */
  //
  // OPENS ON UP AND DOWN, which is what this card has always played.
  // Play as is at the end of its Settings since 13 Sep 2026.
  const [settings, setSettings] = usePlayerSettings({ playAs: 'upDown' });
  const [sounding, setSounding] = useState<number | null>(null);

  const marks = useMemo(() => {
    if (!answered) return new Map();
    const scale = scaleMarks(target.pcs, target.keyPc, colour);
    if (sounding !== null) scale.set(sounding, { pressed: true });
    return scale;
  }, [answered, target.pcs, target.keyPc, colour, sounding]);


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
    target.pcs, target.keyPc, directionOf(settings.playAs), { toOctave: true },
  );
  const together = settings.playAs === 'together';

  const hear = (startAtBeat = 0) => playScale(line, {
    bpm: settings.bpm,
    octaveUp: settings.octaveUp,
    home: target.homePcs.map(pc => 48 + pc),
    dronePc: target.keyPc,
    together,
    onNote: i => setSounding(line[i] ?? null),
    ...(startAtBeat > 0 ? { startAtBeat } : {}),
  });

  const submit = () => {
    if (count === null) {
      setMessage('Choose how many.');
      return;
    }
    // Zero needs no direction; anything else does.
    if (count > 0 && direction === null) {
      setMessage('Choose sharps or flats.');
      return;
    }
    const grade = gradeSignature(target, { count, direction });
    setMessage(null);
    answer(grade.correct ? card.correctAnswer : grade.built);
  };

  return (
    <div className="space-y-3" data-testid="signature-answer">
      {!answered && (
        <>
          <div className="space-y-1.5">
            <div className="text-[10px] uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
              How many
            </div>
            <div className="flex flex-wrap gap-1.5" data-testid="count-row">
              {COUNTS.map(n => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={count === n}
                  data-testid={`count-${n}`}
                  onClick={() => { setCount(n); setMessage(null); }}
                  className={`${BTN} font-mono ${count === n ? ON : OFF}`}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="text-[10px] uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
              Sharps or flats
            </div>
            <div className="flex flex-wrap gap-1.5" data-testid="direction-row">
              {([['sharps', 'Sharps'], ['flats', 'Flats']] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={direction === id}
                  data-testid={`direction-${id}`}
                  onClick={() => { setDirection(id); setMessage(null); }}
                  className={`${BTN} ${direction === id ? ON : OFF}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div
              className={`font-mono text-lg ${count === null ? 'text-neutral-400' : ''}`}
              data-testid="signature-built"
            >
              {count === null
                ? 'choose a count'
                : `${count}${count === 0 ? '' : ` ${direction ?? '…'}`}`}
            </div>
            <button type="button" className={BTN_PRIMARY} data-testid="submit" onClick={submit}>
              Submit
            </button>
            <button
              type="button"
              className={BTN_PLAIN}
              onClick={() => { setCount(null); setDirection(null); setMessage(null); }}
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
          <BuiltAnswerKeyboard
            marks={marks}
            label={`The scale of the key of ${target.keyName} major`}
          />
          <ColourToggle value={colour} onChange={setColour} />
          <SharedPlayer
            chords={[]}
            settings={settings}
            onSettings={setSettings}
            board={false}
            play={({ startAtBeat }) => hear(startAtBeat)}
            totalBeats={scaleBeats(line.length, together)}
            caption={`${target.keyName} major — ${target.count === 0
              ? 'no sharps and no flats'
              : `${target.count} ${target.count === 1
                ? target.direction.slice(0, -1) : target.direction}`}`}
          >
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
              {'The scale of the key, so the accidentals in it are the black '
                + 'keys you can count.'}
            </p>
          </SharedPlayer>
        </>
      )}
    </div>
  );
}
