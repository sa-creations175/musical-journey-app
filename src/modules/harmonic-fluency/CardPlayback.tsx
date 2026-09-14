/**
 * The play control. One of them, on every family that has a sound
 * (ruling 33).
 *
 * =====================================================================
 * IT WAS TWO BUTTONS ON TWO FAMILIES AND IT IS ONE ON ALL OF THEM.
 *
 * `DegreePlayback` and the button inside `DegreeNoteReveal` did the
 * same job with different labels, different padding and two copies of
 * the pref read, the busy flag and the stop-on-unmount. Five more
 * families would have been five more copies. This is the one, and the
 * per-family part — what the card sounds like — lives in `cardAudio`,
 * where it is data rather than a component.
 *
 * WHAT IS ALLOWED TO DIFFER is written down in `cardAudio`'s header.
 * Of the four entries, only one touches this file: WHERE the control
 * sits. The degree-and-note card puts it under its keyboard, inside
 * that card's own row; everything else puts it under the explanation.
 * Hence `align`, and hence nothing else.
 *
 * =====================================================================
 * HEAR IT SAYS WHAT IT PLAYS (Silas, 13 Sep 2026; walked in
 * `hear-it-prototype.html`): "it doesn't tell you what you're hearing at
 * all. That's the gap."
 *
 *   · THE BARS. One chip per stretch of the sound, named before it
 *     plays: the chord large, the scale under it. The one playing is lit
 *     green, orange where it holds a note the key does not; the ones
 *     passed are dimmed. Words from `soundBars`, which reads the same
 *     data the sound is built from.
 *   · THE NOW LINE: what is sounding, "E7 · A melodic minor from E ·
 *     playing G♯ (not in C major)".
 *   · THE KEYBOARD, C2 to C7, scrolling sideways on a phone: the note
 *     played green (orange outside the key), the chord held under it and
 *     the pedal pale green.
 *   · THE CONTROLS: Hear it, Stop, Playback Speed, and "Chord under the
 *     run" where a card holds chords or a pedal under its run.
 *
 * Every light comes from the moment the players scheduled the sound at
 * (`playCardSound`'s events, on the audio clock), never a parallel
 * timer. Stop clears every light and every chip.
 *
 * =====================================================================
 * REVEAL-SIDE ONLY, AND THAT IS A RULE ABOUT SEQUENCE.
 *
 * Sounding the answer before it is given turns a written question into
 * an ear question — a different card, and one the deck already has in
 * Ear Training. The knowing comes first. Enforced by the caller, which
 * renders nothing until the card is answered; stated here because this
 * is where a future caller will look.
 *
 * =====================================================================
 * THE CONTEXT SETTING IS THE EAR-TRAINING ONE, READ NOT COPIED.
 *
 * Chord progressions already asks "prime me with the tonic first, or
 * don't" and stores the answer under `chordProgressionsTonicContext`. A
 * reader who has turned priming off there has said something about how
 * they want to practise, not something about chord progressions.
 * =====================================================================
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getPref, setPref } from '../../lib/userPrefs';
import type { PlaybackHandle, TonicContext } from '../../lib/musicalPlayback';
import type { BoardRange, KeyMark } from '../../lib/builtAnswers/board';
import { useSpelling } from '../../lib/spellingPref';
import SpeedControl from '../../components/SpeedControl';
import BuiltAnswerKeyboard from '../../components/BuiltAnswerKeyboard';
import type { Flashcard } from './catalog';
import { cardSound } from './cardAudio';
import { isOutside, soundBars } from './cardBars';
import { CARD_AUDIO_MODULE, playCardSound } from './playCardSound';

/** The pref chord progressions writes. One switch, every caller. */
const PREF_TONIC = 'chordProgressionsTonicContext';

/**
 * Where "Chord under the run" is remembered: the same preference store
 * Playback Speed is remembered in, so it travels the way speed does.
 */
export const PREF_CHORD_UNDER_RUN = 'harmonicFluencyChordUnderRun';

/** The label, on every family. Carried over from the degree-and-note
 *  card, which is the one that already had a written one. */
export const HEAR_IT_LABEL = 'Hear it';

/** C2 to C7: room for a held chord an octave down and the top of a run. */
const HEAR_IT_RANGE: BoardRange = { low: 36, high: 96 };

/** The app's own green and orange (`fluent`, `borrowed`), and a pale green. */
const PLAYED = '#1D9E75';
const OUTSIDE = '#F0722B';
const HELD = '#A7DCC6';

const BEFORE = "Press Hear it. The bar you're in lights up here and on the keys below.";
const AFTER = 'Done. Press Hear it to play it again.';
const STOPPED = 'Stopped.';

type Phase = 'idle' | 'playing' | 'done' | 'stopped';

interface Lights {
  orient: boolean;
  pedal: boolean;
  under: number | null;
  step: number | null;
  bar: number | null;
}

const DARK: Lights = { orient: false, pedal: false, under: null, step: null, bar: null };

export default function CardPlayback({
  card, align = 'start',
}: {
  card: Flashcard;
  /** The one thing allowed to differ here — see the header. */
  align?: 'start' | 'center';
}) {
  const [spelling] = useSpelling();
  const [context, setContext] = useState<TonicContext>('singleNote');
  const playing = useRef<PlaybackHandle | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [lights, setLights] = useState<Lights>(DARK);
  /** The shift the sound now playing was started with. */
  const [playedShift, setPlayedShift] = useState(0);
  const storedShift = useLiveQuery(
    async () => getPref<number>(PREF_CHORD_UNDER_RUN, 0),
    [],
  );
  const [chosenShift, setChosenShift] = useState<number | null>(null);
  const shift = chosenShift ?? storedShift ?? 0;

  useEffect(() => {
    let live = true;
    void getPref<TonicContext>(PREF_TONIC, 'singleNote')
      // Swallowed: a failed pref read means the default, and an
      // uncaught rejection here would surface as an app-level error
      // for a playback button.
      .then(value => { if (live) setContext(value); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  // Stop on unmount, so moving to the next card does not leave the
  // previous one's last chord hanging over it.
  useEffect(() => () => { playing.current?.stop(); }, []);

  const sound = cardSound(card);
  const bars = useMemo(
    () => (sound === null ? [] : soundBars(sound, context, spelling)),
    [sound, context, spelling],
  );
  // A card that has not said what it is about has no sound, and gets no
  // button rather than a button that does nothing.
  if (sound === null) return null;

  const holds = sound.under !== undefined || sound.pedal !== undefined;

  const stop = () => {
    playing.current?.stop();
    playing.current = null;
    setLights(DARK);
    setPhase('stopped');
  };

  const play = () => {
    playing.current?.stop();
    setBusy(true);
    setLights(DARK);
    setPhase('playing');
    setPlayedShift(shift);
    const orientBar = bars.findIndex(b => b.lane === 'orient');
    playCardSound(sound, context, {
      chordShift: shift,
      events: {
        onOrient: sounding => setLights(l => ({
          ...l, orient: sounding, bar: sounding && orientBar >= 0 ? orientBar : l.bar,
        })),
        onPedal: sounding => setLights(l => ({ ...l, pedal: sounding })),
        onUnder: index => setLights(l => ({ ...l, under: index })),
        onStep: index => setLights(l => {
          const bar = bars.findIndex(b => b.lane === 'steps' && index >= b.from && index < b.to);
          const note = sound.steps[index]?.semitones.length ? index : null;
          return { ...l, step: note, bar: bar >= 0 ? bar : l.bar };
        }),
        onDone: () => { setLights(DARK); setPhase('done'); },
      },
    })
      .then(handle => { playing.current = handle; })
      .catch(() => {})
      .finally(() => { setBusy(false); });
  };

  const chooseShift = (next: number) => {
    setChosenShift(next);
    void setPref(PREF_CHORD_UNDER_RUN, next).catch(() => {});
  };

  // THE KEYS THAT ARE SOUNDING, from the same steps the sound was built from.
  const marks = new Map<number, KeyMark>();
  const held = (m: number) => marks.set(m, { fill: HELD });
  const played = (m: number) => marks.set(m, { fill: isOutside(m, sound.keyPc) ? OUTSIDE : PLAYED });
  if (lights.pedal && sound.pedal !== undefined) held(sound.rootMidi + sound.pedal + playedShift);
  if (lights.under !== null) {
    sound.under?.[lights.under]?.semitones.forEach(s => held(sound.rootMidi + s + playedShift));
  }
  if (lights.orient && sound.orient !== null) sound.orient.forEach(s => played(sound.rootMidi + s));
  if (lights.step !== null) sound.steps[lights.step]?.semitones.forEach(s => played(sound.rootMidi + s));

  const bar = lights.bar === null ? null : bars[lights.bar];
  const nowLine = (() => {
    if (phase === 'idle') return <>{BEFORE}</>;
    if (phase === 'done') return <>{AFTER}</>;
    if (phase === 'stopped') return <>{STOPPED}</>;
    if (bar === undefined || bar === null) return null;
    const label = `${bar.name}${bar.detail ? ` · ${bar.detail.replace(', from ', ' from ')}` : ''}`;
    const notes = lights.orient && bar.lane === 'orient'
      ? sound.orient ?? []
      : lights.step === null ? [] : sound.steps[lights.step]?.semitones ?? [];
    if (notes.length === 0) return <>{label}</>;
    const name = bar.lane === 'orient' ? bar.noteNames[0] : bar.noteNames[(lights.step ?? 0) - bar.from] ?? '';
    const out = notes.some(s => isOutside(sound.rootMidi + s, sound.keyPc));
    return (
      <>
        {`${label} · playing `}
        <b className={out ? 'font-medium text-borrowed' : 'font-medium'}>{name}</b>
        {out && sound.keyName !== undefined ? ` (not in ${sound.keyName})` : ''}
      </>
    );
  })();

  return (
    <div className="mt-2 space-y-3" data-testid="card-playback">
      {/* THE BARS, named before they play. */}
      <div className="flex flex-wrap gap-2" data-testid="hear-bars">
        {bars.map((b, i) => {
          const on = phase === 'playing' && lights.bar === i;
          const done = phase === 'playing' && lights.bar !== null && i < lights.bar;
          return (
            <div
              key={`${b.lane}-${b.from}-${i}`}
              data-testid={`hear-bar-${i}`}
              data-state={on ? 'on' : done ? 'done' : 'idle'}
              data-outside={b.outside ? 'true' : 'false'}
              className={`flex-[1_1_9rem] rounded-lg border px-3 py-2 transition-colors ${
                on
                  ? b.outside ? 'border-borrowed bg-borrowed/10' : 'border-fluent bg-fluent/10'
                  : 'border-black/10 dark:border-white/15'} ${done ? 'opacity-55' : ''}`}
            >
              <div
                className={`font-mono text-base font-medium ${
                  b.outside ? 'text-borrowed' : on ? 'text-fluent' : ''}`}
              >
                {b.name}
              </div>
              {b.detail !== '' && (
                <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{b.detail}</div>
              )}
            </div>
          );
        })}
      </div>

      {/* THE NOW LINE. */}
      <div className="font-mono text-sm min-h-5" data-testid="hear-now">{nowLine}</div>

      {/* THE KEYBOARD, lit from the sound's own steps. */}
      <BuiltAnswerKeyboard marks={marks} label="What Hear it plays" range={HEAR_IT_RANGE} />

      {/* THE CONTROLS. */}
      <div
        className={`flex items-center gap-3 flex-wrap ${align === 'center' ? 'justify-center' : ''}`}
        data-testid="card-playback-controls"
      >
        <button
          type="button"
          data-testid="card-play"
          onClick={play}
          disabled={busy}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-black/10 dark:border-white/20 text-xs font-medium hover:bg-black/[0.04] dark:hover:bg-white/10 disabled:opacity-50 transition-colors"
        >
          <span aria-hidden className="text-sm leading-none">♪</span>
          {HEAR_IT_LABEL}
        </button>
        <button
          type="button"
          data-testid="card-stop"
          onClick={stop}
          className="inline-flex items-center h-8 px-3 rounded-md border border-black/10 dark:border-white/20 text-xs font-medium hover:bg-black/[0.04] dark:hover:bg-white/10 transition-colors"
        >
          Stop
        </button>
        <SpeedControl moduleId={CARD_AUDIO_MODULE} />
        {/* ONLY WHERE THERE IS A CHORD OR A PEDAL UNDER THE RUN TO MOVE. */}
        {holds && (
          <label className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
            Chord under the run
            <select
              data-testid="chord-under-run"
              value={String(shift)}
              onChange={e => chooseShift(Number(e.target.value))}
              className="rounded-md border border-black/10 dark:border-white/20 bg-transparent px-1.5 py-1 text-xs text-neutral-900 dark:text-neutral-100"
            >
              <option value="0">as the app plays it</option>
              <option value="-12">an octave lower</option>
            </select>
          </label>
        )}
      </div>
    </div>
  );
}
