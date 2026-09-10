/**
 * Build the slash chord: the chord on top, the note underneath.
 *
 * =====================================================================
 * TWO STEPS, TOP THEN BOTTOM, LIKE THE FRACTION IT IS WRITTEN AS.
 *
 * The top chord takes a letter and a quality, and quality starts on
 * MAJOR so the chord lights in the hand at once — a reader only touches
 * the quality row for the minor and seventh shapes. The bottom note's
 * own row appears once the top chord is set, because until then there
 * is nothing for a note to be underneath.
 *
 * THE LOW OCTAVE IS THE BASS. A tap below middle C sets the bottom note
 * and a tap above it sets the top chord's root, so the board itself
 * says which half of the fraction is being answered. That is the
 * prototype's rule and it is why the board is three octaves.
 *
 * =====================================================================
 * THE HAND SHAPE IS NOT GRADED. `grade.ts` says so: the question is
 * which chord over which note, and 1/3 is the 1 in first inversion
 * whichever way the right hand voices it. The row exists so a reader
 * hears the shape they would play.
 * =====================================================================
 */
import { useMemo, useState } from 'react';
import type { PlaybackHandle } from '../../../lib/musicalPlayback';
import ChordPicker from '../../../components/ChordPicker';
import PlayItPanel from '../../../components/PlayItPanel';
import {
  INVERSIONS, type RootPick, pickFromPitchClass, rootLabel, rootPitchClass,
} from '../../../lib/builtAnswers/rootPick';
import {
  QUALITIES, SLASH_QUALITY_IDS, type QualityId,
  handTones, inversionCount,
} from '../../../lib/builtAnswers/chordShapes';
import { voiceAround, voicingsOf } from '../../../lib/builtAnswers/voiceLeading';
import { chordMarks } from '../../../lib/builtAnswers/marks';
import { DEFAULT_BPM, playChords, playOneChord } from '../../../lib/builtAnswers/play';
import type { Flashcard } from '../catalog';
import type { BuiltTarget } from './cardTargets';
import { gradeSlash, keySpelling, spellInKey } from './grade';
import { contextsFor, stepBass, stepTones } from './slashContexts';

const BTN = 'rounded-md border px-3 py-1.5 text-xs font-medium transition-colors '
  + 'disabled:opacity-40 disabled:cursor-default';
const BTN_PRIMARY = `${BTN} border-neutral-900 bg-neutral-900 text-white `
  + 'dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900';
const BTN_PLAIN = `${BTN} border-black/10 dark:border-white/20 `
  + 'hover:bg-black/[0.04] dark:hover:bg-white/10';

/** Below this, a tap is the bottom note; at or above it, the chord. */
const BASS_OCTAVE_TOP = 48;

const SLASH_QUALITIES = QUALITIES.filter(q => SLASH_QUALITY_IDS.includes(q.id));

export default function SlashAnswer({
  card, target, answered, answer,
}: {
  card: Flashcard;
  target: Extract<BuiltTarget, { kind: 'slash' }>;
  answered: boolean;
  answer: (choice: string) => void;
}) {
  const spelling = keySpelling(target.keyName);
  const [pick, setPick] = useState<RootPick | null>(null);
  const [bassPick, setBassPick] = useState<RootPick | null>(null);
  // MAJOR UNLESS YOU CHANGE IT — the prototype's default, so the chord
  // lights as soon as a letter is tapped.
  const [quality, setQuality] = useState<QualityId | null>('');
  const [inversion, setInversion] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [bpm, setBpm] = useState(DEFAULT_BPM);
  const [octaveUp, setOctaveUp] = useState(false);
  const [playing, setPlaying] = useState<PlaybackHandle | null>(null);
  const [bassOnly, setBassOnly] = useState(false);
  const [contextId, setContextId] = useState<string | null>(null);

  const contexts = useMemo(
    () => contextsFor(target.shapeId, slashBassDegree(target.shapeId)),
    [target.shapeId],
  );
  const context = contexts.find(c => c.id === contextId)
    // Opens on the phrase rather than the chord alone, which is what
    // the shape is for; the chord alone stays available.
    ?? contexts[Math.min(1, contexts.length - 1)];

  /** The chord and the note, as the reader has them, or as the card
   *  wants them once it is answered. */
  const chordRootPc = answered
    ? target.chordRootPc
    : pick === null ? null : rootPitchClass(pick);
  const chordQuality = answered ? target.quality : quality;
  const bassPc = answered
    ? target.bassPc
    : bassPick === null ? null : rootPitchClass(bassPick);

  /** The right hand, placed in the middle of the board. */
  const hand = useMemo(() => {
    if (chordRootPc === null || chordQuality === null) return [];
    const pcs = handTones(chordQuality, 'one').map(t => (chordRootPc + t) % 12);
    return voicingsOf(pcs, inversion)[0] ?? [];
  }, [chordRootPc, chordQuality, inversion]);

  const voiced = chordRootPc === null
    ? null
    : { hand, bass: bassPc === null ? null : 36 + bassPc, rootPc: chordRootPc };
  const marks = chordMarks(voiced, { octaveUp });

  const stop = () => { playing?.stop(); setPlaying(null); };
  const start = (make: () => Promise<PlaybackHandle>) => {
    stop();
    void make().then(setPlaying).catch(() => {});
  };

  const hearChord = () => {
    if (voiced === null) return;
    start(() => playOneChord(voiced, { bpm, octaveUp }));
  };

  /**
   * The phrase, voiced around the reader's own hand.
   *
   * BASS ONLY IS A THICKNESS AND NOT A DIFFERENT PHRASE: the same
   * steps, with the hand left out, so a reader can hear the bass line
   * walk without the chords over it.
   */
  const hearContext = () => {
    if (voiced === null || bassPc === null) return;
    const tones = context.steps.map(s => stepTones(s, target.keyPc));
    const hands = voiceAround(tones, hand);
    const chords = context.steps.map((step, i) => ({
      hand: bassOnly ? [] : hands[i],
      bass: stepBass(step, target.keyPc),
      rootPc: tones[i]?.rootPc ?? target.chordRootPc,
    }));
    start(() => playChords(chords, {
      bpm, octaveUp, orientPc: target.keyPc,
    }));
  };

  const submit = () => {
    if (pick === null || quality === null) {
      setMessage('Choose the top chord: a letter and a quality.');
      return;
    }
    if (bassPick === null) {
      setMessage('Choose the bottom note.');
      return;
    }
    const grade = gradeSlash(target, {
      chord: { rootPc: rootPitchClass(pick), quality },
      bassPc: rootPitchClass(bassPick),
    });
    setMessage(null);
    answer(grade.correct ? card.correctAnswer : grade.built);
  };

  const ready = pick !== null && quality !== null;
  const triadOnly = chordQuality !== null ? inversionCount(chordQuality) : 4;

  return (
    <div className="space-y-3" data-testid="slash-answer">
      <div className="font-mono text-lg" data-testid="slash-built">
        {answered
          ? target.name
          : `${pick === null ? 'chord' : `${rootLabel(pick)}${quality ?? ''}`}`
            + `/${bassPc === null ? 'bass' : spellInKey(bassPc, target.keyName)}`}
      </div>

      <ChordPicker
        marks={marks}
        keyboardLabel={`Build ${card.categoryName}`}
        {...(answered ? {} : {
          onTapKey: (midi: number) => {
            setMessage(null);
            // THE BOARD SAYS WHICH HALF. Below middle C is the bass;
            // and a bottom note cannot be chosen before there is a
            // chord for it to sit under.
            if (midi < BASS_OCTAVE_TOP) {
              if (!ready) return;
              setBassPick(pickFromPitchClass(midi % 12, spelling));
              return;
            }
            setPick(pickFromPitchClass(midi % 12, spelling));
          },
          root: {
            pick,
            onPick: (p: RootPick | null) => { setPick(p); setMessage(null); },
            label: 'Top chord (the letter row, or tap a key in the upper octaves)',
          },
          quality: {
            label: 'Quality (major unless you change it)',
            options: SLASH_QUALITIES,
            value: quality,
            onChange: (q: QualityId | null) => { setQuality(q); setMessage(null); },
          },
          ...(ready ? {
            bass: {
              pick: bassPick,
              onPick: (p: RootPick | null) => { setBassPick(p); setMessage(null); },
              label: 'Bottom note (the letter row, or tap a key in the low octave)',
            },
          } : {}),
          inversion: {
            label: 'Hand shape',
            options: INVERSIONS,
            value: inversion,
            count: triadOnly,
            onChange: setInversion,
          },
        })}
      />

      {!answered && (
        <>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={BTN_PLAIN}
              data-testid="hear-chord"
              disabled={!ready}
              onClick={hearChord}
            >
              Hear chord
            </button>
            <button
              type="button"
              className={BTN_PLAIN}
              disabled={bassPick === null}
              onClick={() => setBassPick(null)}
            >
              Clear bottom note
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={BTN_PRIMARY} data-testid="submit" onClick={submit}>
              Submit
            </button>
            <button
              type="button"
              className={BTN_PLAIN}
              onClick={() => {
                setPick(null);
                setBassPick(null);
                setQuality('');
                setInversion(0);
                setMessage(null);
              }}
            >
              Start over
            </button>
          </div>
          {message !== null && (
            <p className="text-xs text-needswork" data-testid="picker-message">{message}</p>
          )}
        </>
      )}

      {answered && (
        <PlayItPanel
          bpm={bpm}
          onBpm={setBpm}
          octaveUp={octaveUp}
          onOctaveUp={setOctaveUp}
          onPlay={hearContext}
          onHearChord={hearChord}
          onStop={playing === null ? null : stop}
          names={target.name}
        >
          <div className="space-y-1.5">
            <div className="text-[10px] uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
              In context
            </div>
            <div className="flex flex-wrap gap-1.5" data-testid="context-row">
              {contexts.map(c => (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={c.id === context.id}
                  data-testid={`context-${c.id}`}
                  onClick={() => setContextId(c.id)}
                  className={`${BTN} ${c.id === context.id
                    ? 'border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900'
                    : 'border-black/10 dark:border-white/20'}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {([[false, 'Bass + chords'], [true, 'Bass only']] as const).map(([v, name]) => (
                <button
                  key={name}
                  type="button"
                  aria-pressed={bassOnly === v}
                  data-testid={`bass-only-${String(v)}`}
                  onClick={() => setBassOnly(v)}
                  className={`${BTN} ${bassOnly === v
                    ? 'border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900'
                    : 'border-black/10 dark:border-white/20'}`}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
            {'A single low tonic to orient, then the slash chord where it '
              + 'lives. The chords around it are voice-led to and from your '
              + 'hand shape.'}
          </p>
        </PlayItPanel>
      )}
    </div>
  );
}

/** The bass degree of a shape, read off its id — `5-7` is the 7. */
function slashBassDegree(shapeId: string): string {
  const parts = shapeId.split('-');
  return parts[parts.length - 1];
}
