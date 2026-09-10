/**
 * Sounding a built answer.
 *
 * =====================================================================
 * IT GOES THROUGH THE ENGINE, AND THE ENGINE NEEDED NOTHING ADDED.
 *
 * `playSeqChords` already plays exact voicings at a tempo, reports each
 * chord as it starts so the keyboard can light with the sound, sounds
 * the left hand louder than the right, and hands back a stop. That is
 * the whole of what this build needs from a sequencer, and it is what
 * Chord Movements already uses — so there is no second engine here,
 * only a translation from a voicing into the shape it takes.
 *
 * ABSOLUTE MIDI, AGAINST A ROOT OF ZERO. `playSeqChords` adds each
 * interval to a root; passing 0 and the actual notes is the same
 * arithmetic and keeps voice leading readable, because a voicing IS a
 * set of notes and expressing it as offsets from a root would mean
 * choosing which root.
 *
 * NOTHING AUTOPLAYS, ANYWHERE. Every function here is called from a tap
 * and from nowhere else. That is Silas's rule of 9 Sep and it is the
 * one thing about this file that must not be relaxed for convenience.
 * =====================================================================
 */
import { playSeqChords, type SeqChord } from '../audio';
import { playBlocked, type PlaybackHandle } from '../musicalPlayback';
import type { VoicedChord } from './voiceLeading';
import { raise } from './marks';

/** The tempo the panel opens at. */
export const DEFAULT_BPM = 72;

/** Two beats a chord, which is the prototype's `beat()*2`. */
const CHORD_BEATS = 2;

/** How loud the drone sits under a scale — quieter than the notes over
 *  it, the same reasoning `playCardSound`'s pedal gives. */
const DRONE_VELOCITY = 0.14;

/** One voicing as a step: bass in the left hand, the rest in the
 *  right, so the engine's own hand balance lifts the bass. */
function step(chord: VoicedChord, octaveUp: boolean, beats = CHORD_BEATS): SeqChord {
  const hand = raise(chord.hand, octaveUp);
  const intervals = chord.bass === null ? hand : [chord.bass, ...hand];
  const hands: Array<'L' | 'R'> = chord.bass === null
    ? hand.map(() => 'R')
    : ['L', ...hand.map((): 'R' => 'R')];
  return { intervals, beats, hands };
}

/**
 * A single low tonic, to orient.
 *
 * SILAS RULED THIS ON 9 SEP: the home CHORD in front of a progression
 * was confusing, and one low note is not. Doubled at the octave and
 * quiet, which is what the prototype plays.
 */
function tonicStep(keyPc: number): SeqChord {
  return {
    intervals: [36 + keyPc, 48 + keyPc],
    beats: CHORD_BEATS,
    hands: ['L', 'L'],
  };
}

export interface SequenceOptions {
  bpm: number;
  octaveUp?: boolean;
  /** The key to sound a low tonic in front of the chords. Omit for no
   *  orientation at all. */
  orientPc?: number;
  /** Fires as each chord starts — index into `chords`, or -1 for the
   *  orienting tonic. */
  onStep?: (index: number) => void;
}

/** A progression, or a slash chord in its context. */
export async function playChords(
  chords: ReadonlyArray<VoicedChord>,
  opts: SequenceOptions,
): Promise<PlaybackHandle> {
  const steps = chords.map(c => step(c, opts.octaveUp === true));
  const withTonic = opts.orientPc === undefined
    ? steps
    : [tonicStep(opts.orientPc), ...steps];
  const offset = opts.orientPc === undefined ? 0 : 1;
  return playSeqChords(withTonic, 0, opts.bpm, {
    bassBalance: 'forward',
    ...(opts.onStep ? { onStep: (i: number) => opts.onStep!(i - offset) } : {}),
  });
}

/** One chord, on its own. */
export async function playOneChord(
  chord: VoicedChord,
  opts: { bpm: number; octaveUp?: boolean },
): Promise<PlaybackHandle> {
  return playSeqChords(
    [step(chord, opts.octaveUp === true, CHORD_BEATS * 1.5)],
    0,
    opts.bpm,
    { bassBalance: 'forward' },
  );
}

/**
 * A scale: the home chord, then the notes with the key held under them.
 *
 * THE DRONE IS THE KEY'S ROOT AND NOT THE SCALE'S. On the lick card
 * that is A♭ under F minor pentatonic — the prototype says so in terms,
 * "the scale sitting on the key, never the root of the scale", because
 * what the card teaches is which scale fits over which key.
 */
export async function playScale(
  line: ReadonlyArray<number>,
  opts: {
    bpm: number;
    octaveUp?: boolean;
    /** The home chord of the key, as absolute MIDI. */
    home: ReadonlyArray<number>;
    /** The note held underneath, as absolute MIDI. */
    dronePc: number;
    onNote?: (index: number) => void;
  },
): Promise<PlaybackHandle> {
  const handles: PlaybackHandle[] = [];
  const notes = raise(line, opts.octaveUp === true);
  // Half a beat a note, so a five-note scale and its octave fill the
  // bar the home chord was held for.
  const steps: SeqChord[] = [
    { intervals: [...opts.home], beats: CHORD_BEATS, hands: opts.home.map(() => 'R') },
    ...notes.map((m): SeqChord => ({ intervals: [m], beats: 0.5, hands: ['R'] })),
  ];
  handles.push(await playBlocked(
    36 + opts.dronePc,
    [0],
    CHORD_BEATS + notes.length * 0.5,
    opts.bpm,
    { velocity: DRONE_VELOCITY },
  ));
  handles.push(await playSeqChords(steps, 0, opts.bpm, {
    ...(opts.onNote ? { onStep: (i: number) => opts.onNote!(i - 1) } : {}),
  }));
  return { stop: () => handles.forEach(h => h.stop()) };
}
