import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { type AttemptRecord } from '../../../lib/db';
import { addAttempt } from '../../../lib/practiceWrites';
import { ensureRunning, midiToFreq, playNote } from '../../../lib/audio';
import { updateDailySummary } from '../../../lib/dailySummaries';
import { getPref } from '../../../lib/userPrefs';
import { defaultSpeed, speedPrefKey } from '../../../lib/goalConfig';
import SpeedControl from '../../../components/SpeedControl';
import AnswerVerdict from '../../../components/AnswerVerdict';
import { PROGRESSIONS, type Progression } from './catalog';
import {
  KEYS,
  chordAtDegree,
  keyToRootMidi,
  numeralOffset,
  parseSlashChord,
  playProgression,
  playTonicDrone,
  type PlaybackHandle,
  type ProgressionStep,
} from './progressionTheory';

const MODULE_ID = 'chord-progressions';

// Curated pool for Key Detection v1: every tier-1/2/3 progression is
// recognisable enough that hum-to-find-home lands. Tiers 4+ include
// modulations and extended harmonies that mask the tonal centre —
// those join the pool in later iterations (see ROADMAP).
const CURATED_POOL: Progression[] = PROGRESSIONS.filter(p => p.tier <= 3);

// Decoy pool: IV, V, and vi are the three degrees most commonly
// mistaken for tonic by new ears, so we always surface all three in the
// multiple-choice round.
const DECOY_DEGREES = [4, 5, 6] as const;

const NOTE_NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTE_NAMES_FLAT  = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
function noteNameForKey(midi: number, key: string): string {
  // Match the user's selected key's accidental style so displays stay
  // consistent (F major → Bb not A#).
  const preferFlats = /b$/.test(key) || key === 'F';
  const pc = ((midi % 12) + 12) % 12;
  return (preferFlats ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP)[pc];
}

function buildSteps(prog: Progression, rootMidi: number): ProgressionStep[] {
  return prog.numerals.map((numeral, i) => {
    const parsed = parseSlashChord(numeral);
    const chordRootMidi = rootMidi + numeralOffset(parsed.chord);
    const isSlash = parsed.bassOffset !== undefined;
    const bassMidi = isSlash
      ? (rootMidi + parsed.bassOffset!) - 12
      : chordRootMidi - 12;
    return {
      rootMidi: chordRootMidi,
      bassMidi,
      isSlash,
      quality: prog.chordQualities[i] ?? 'major',
      beats: prog.durationPattern[i] ?? 1,
    };
  });
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type RunState = 'idle' | 'playing' | 'answering' | 'reveal';

interface Round {
  progression: Progression;
  key: string;
  options: { note: string; midi: number; isCorrect: boolean }[];
}

interface Props {
  attempts: AttemptRecord[];
}

export default function KeyDetectionTab({ attempts }: Props) {
  void attempts; // reserved for future scope/history UI
  const [runState, setRunState] = useState<RunState>('idle');
  const [round, setRound] = useState<Round | null>(null);
  const [selectedNote, setSelectedNote] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const playbackRef = useRef<PlaybackHandle | null>(null);
  const droneRef = useRef<PlaybackHandle | null>(null);
  const endTimerRef = useRef<number | null>(null);

  const speedFallback = defaultSpeed(MODULE_ID);
  const speed = useLiveQuery(
    async () => getPref<number>(speedPrefKey(MODULE_ID), speedFallback),
    [],
  ) ?? speedFallback;
  const speedRef = useRef(speed); speedRef.current = speed;

  // Remember whether the user has ever practised here — drives a subtle
  // "first run" hint alongside the play button.
  const hasEverPractised = useMemo(
    () => attempts.some(a => a.itemId.startsWith('key-detection:')),
    [attempts],
  );

  const stopAll = () => {
    playbackRef.current?.stop();
    playbackRef.current = null;
    droneRef.current?.stop();
    droneRef.current = null;
    if (endTimerRef.current !== null) {
      window.clearTimeout(endTimerRef.current);
      endTimerRef.current = null;
    }
  };

  useEffect(() => () => stopAll(), []);

  const buildRound = (): Round => {
    const prog = CURATED_POOL[Math.floor(Math.random() * CURATED_POOL.length)];
    const key = KEYS[Math.floor(Math.random() * KEYS.length)];
    const tonicMidi = keyToRootMidi(key);
    const tonicNote = noteNameForKey(tonicMidi, key);
    const decoys = DECOY_DEGREES.map(d => {
      const chord = chordAtDegree(key, d);
      return { note: noteNameForKey(chord.rootMidi, key), midi: chord.rootMidi };
    });
    const options = shuffle([
      { note: tonicNote, midi: tonicMidi, isCorrect: true },
      ...decoys.map(d => ({ ...d, isCorrect: false })),
    ]);
    return { progression: prog, key, options };
  };

  const startRound = async () => {
    stopAll();
    const r = buildRound();
    setRound(r);
    setSelectedNote(null);
    setSubmitted(false);
    setRunState('playing');

    const rootMidi = keyToRootMidi(r.key);
    const steps = buildSteps(r.progression, rootMidi);
    const handle = await playProgression(
      steps,
      90, // steady pulse so tonal gravity is easy to feel
      'seventh',
      'bass-chords',
      speedRef.current,
      3, // auto-loop 3 times
      'none', // no priming tonic — discovering the tonic IS the task
      rootMidi,
      r.progression.requiresDominant ?? false,
    );
    playbackRef.current = handle;

    // Advance to answering once the three loops finish. Scheduled via
    // the same timing used by ChordProgressionsQuiz.
    const m = Math.max(0.1, speedRef.current);
    const totalBeats = r.progression.durationPattern.reduce((s, b) => s + b, 0) * 3;
    const totalMs = ((totalBeats * 60) / (90 * m)) * 1000 + 300;
    endTimerRef.current = window.setTimeout(() => {
      playbackRef.current = null;
      endTimerRef.current = null;
      setRunState('answering');
    }, totalMs);
  };

  const replayProgression = async () => {
    if (!round) return;
    stopAll();
    const rootMidi = keyToRootMidi(round.key);
    const steps = buildSteps(round.progression, rootMidi);
    const handle = await playProgression(
      steps, 90, 'seventh', 'bass-chords', speedRef.current, 1, 'none',
      rootMidi, round.progression.requiresDominant ?? false,
    );
    playbackRef.current = handle;
  };

  const playOption = async (midi: number) => {
    const context = await ensureRunning();
    const now = context.currentTime + 0.02;
    playNote(midiToFreq(midi), now, 1.6, context, 0.3);
  };

  const submitAnswer = async () => {
    if (!round || selectedNote === null || submitted) return;
    const option = round.options.find(o => o.note === selectedNote);
    if (!option) return;
    const correct = option.isCorrect;
    setSubmitted(true);

    await addAttempt({
      moduleId: MODULE_ID,
      itemId: `key-detection:${round.key}`,
      correct,
      timestamp: Date.now(),
    });
    await updateDailySummary(MODULE_ID);

    setRunState('reveal');

    // "Aha" drone feedback: the progression replays once with the
    // correct tonic sustained underneath so the tonal anchor is
    // impossible to miss.
    stopAll();
    const rootMidi = keyToRootMidi(round.key);
    const steps = buildSteps(round.progression, rootMidi);
    const m = Math.max(0.1, speedRef.current);
    const totalBeats = round.progression.durationPattern.reduce((s, b) => s + b, 0);
    const droneSecs = (totalBeats * 60) / (90 * m) + 0.6;
    droneRef.current = await playTonicDrone(rootMidi, droneSecs, { volume: 0.18 });
    const handle = await playProgression(
      steps, 90, 'seventh', 'bass-chords', speedRef.current, 1, 'none',
      rootMidi, round.progression.requiresDominant ?? false,
    );
    playbackRef.current = handle;
  };

  const nextRound = () => {
    stopAll();
    setRunState('idle');
    setRound(null);
    setSelectedNote(null);
    setSubmitted(false);
  };

  const wasCorrect = submitted && round?.options.find(o => o.note === selectedNote)?.isCorrect;

  return (
    <section className="rounded-2xl border border-black/[0.07] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.07)] backdrop-blur p-3 sm:p-5 space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base sm:text-lg font-medium tracking-tight">key detection</h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            a progression plays three times — hum to find home, then pick the tonic.
          </p>
        </div>
      </div>

      <p className="text-[11px] text-neutral-500 text-center">
        all key detection progressions — {CURATED_POOL.length} curated from tiers 1–3
      </p>

      <div className="flex justify-center">
        <SpeedControl moduleId={MODULE_ID} />
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        {runState === 'idle' && (
          <button
            onClick={startRound}
            className="w-full py-3.5 rounded-xl bg-fluent text-white text-base font-semibold shadow-sm hover:opacity-90"
          >
            play progression
          </button>
        )}
        {runState === 'playing' && (
          <button
            onClick={() => { stopAll(); setRunState('answering'); }}
            className="px-4 py-2 rounded-lg border border-needswork text-needswork text-sm font-medium hover:bg-needswork/10"
          >
            stop
          </button>
        )}
        {(runState === 'answering' || runState === 'reveal') && (
          <button
            onClick={replayProgression}
            className="px-4 py-2 rounded-lg border border-fluent text-fluent text-sm font-medium hover:bg-fluent/10"
          >
            replay progression
          </button>
        )}
        {runState === 'reveal' && (
          <button
            onClick={nextRound}
            className="px-4 py-2 rounded-lg bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 text-sm font-medium hover:opacity-90"
          >
            next progression →
          </button>
        )}
      </div>

      {runState === 'idle' && !hasEverPractised && (
        <p className="text-xs text-neutral-500 text-center italic">
          first time here? hum a low note as the progression loops; when it feels like "home," that's your tonic.
        </p>
      )}
      {runState === 'playing' && (
        <p className="text-xs text-neutral-500 text-center italic">
          listen across all three loops — let the tonal centre settle in your ear.
        </p>
      )}

      {(runState === 'answering' || runState === 'reveal') && round && (
        <div className="space-y-3">
          <p className="text-xs text-neutral-500 text-center">
            which note is the tonal centre? tap each option to hear it, then submit.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {round.options.map(opt => {
              const chosen = selectedNote === opt.note;
              const reveal = submitted;
              let classes = 'border-neutral-200 dark:border-neutral-700 hover:border-fluent hover:text-fluent';
              if (reveal) {
                if (opt.isCorrect) classes = 'border-fluent bg-fluent/10 text-fluent';
                else if (chosen) classes = 'border-needswork bg-needswork/10 text-needswork';
                else classes = 'border-neutral-200 dark:border-neutral-700 opacity-50';
              } else if (chosen) {
                classes = 'border-info bg-info/10 text-info';
              }
              return (
                <div
                  key={opt.note}
                  className={`rounded-lg border p-3 flex flex-col items-center gap-2 transition ${classes}`}
                >
                  <button
                    onClick={() => playOption(opt.midi)}
                    aria-label={`play ${opt.note}`}
                    className="text-neutral-500 hover:text-fluent text-xs underline"
                  >
                    ▶ play
                  </button>
                  <button
                    onClick={() => { if (!submitted) setSelectedNote(opt.note); }}
                    disabled={submitted}
                    className="font-medium text-lg disabled:cursor-default"
                  >
                    {opt.note}
                  </button>
                </div>
              );
            })}
          </div>
          {!submitted && (
            <div className="flex justify-center">
              <button
                onClick={submitAnswer}
                disabled={selectedNote === null}
                className={`px-4 py-2 rounded-lg text-sm font-medium ${
                  selectedNote !== null
                    ? 'bg-fluent text-white hover:opacity-90'
                    : 'bg-neutral-200 dark:bg-neutral-800 text-neutral-400 cursor-not-allowed'
                }`}
              >
                submit
              </button>
            </div>
          )}
        </div>
      )}

      {runState === 'reveal' && round && (
        <div className="rounded-lg border border-black/[0.07] p-4 space-y-2 text-sm">
          <div className="text-center space-y-1">
            <AnswerVerdict state={wasCorrect ? 'correct' : 'incorrect'} />
            <span>
              the tonal centre is{' '}
              <span className="font-medium text-fluent">
                {noteNameForKey(keyToRootMidi(round.key), round.key)}
              </span>
            </span>
          </div>
          <p className="text-xs text-neutral-500">
            hear the drone playing underneath? that's the pitch every chord leans back toward — the gravity
            well the progression resolves into. "{round.progression.name}" in the key of {round.key}.
          </p>
          <Link
            to="/harmonic-fluency"
            className="inline-block text-xs text-fluent hover:underline"
          >
            practice functional harmony cards → harmonic fluency
          </Link>
        </div>
      )}
    </section>
  );
}
