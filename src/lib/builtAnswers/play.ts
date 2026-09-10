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
import {
  DEFAULT_BPM as PANEL_BPM, type PlayerSettings,
} from '../player/settings';
import { chordStep, type PlayerChord } from '../player/voices';

/**
 * The tempo the panel opens at.
 *
 * RE-EXPORTED FROM `player/settings`, WHICH IS NOW WHERE IT LIVES. It
 * was 72 here and 50 in the shared player's prototype, and two defaults
 * for one number is exactly what the panel exists to stop. Fifty is the
 * one Silas signed off.
 */
export const DEFAULT_BPM = PANEL_BPM;

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

/**
 * A whole progression, as the shared panel plays it.
 *
 * =====================================================================
 * THE SAME ENGINE, HANDED THE PANEL'S SETTINGS INSTEAD OF TWO OF THEM.
 *
 * `playChords` below takes a bpm and an octave flag because that is all
 * the Built Answers panel had. This takes the whole settings object, so
 * "bass only", "one hand", the loop count and the resume point arrive
 * the same way on every surface rather than as four more arguments per
 * caller. It is the same `playSeqChords` underneath — there is one
 * sequencer in this app and this does not add another.
 *
 * THE TONIC LEAD-IN IS ONE LOW NOTE AND IT IS NOT REPEATED. It orients
 * the ear at the top and a loop that sounded it every pass would turn
 * an orientation into part of the music. So it is played once and the
 * loop covers the chords.
 * =====================================================================
 */
export async function playPanel(
  chords: ReadonlyArray<PlayerChord>,
  settings: PlayerSettings,
  opts: {
    /** The key to sound a low tonic in front. Omit for none — a single
     *  quiz chord never gets one. */
    orientPc?: number;
    /** Fires as each chord starts; -1 for the orienting tonic. */
    onStep?: (index: number) => void;
    /** Where to pick up, in beats from the top. Resume's whole trick. */
    startAtBeat?: number;
    /** Beats per chord. Two, unless a surface says otherwise. */
    beats?: number;
    /**
     * Override the settings' loop.
     *
     * A quiz plays once on arrival whatever the panel is set to; the
     * modes drill loops a passage a chosen number of times. So this
     * takes any count the engine takes rather than only the four the
     * panel's Loop row offers.
     */
    loop?: number | 'untilStopped';
  } = {},
): Promise<PlaybackHandle> {
  const beats = opts.beats ?? CHORD_BEATS;
  const steps = chords.map(c => chordStep(c, settings, beats));
  const lead = opts.orientPc === undefined ? [] : [tonicStep(opts.orientPc)];
  const offset = lead.length;
  return playSeqChords([...lead, ...steps], 0, settings.bpm, {
    bassBalance: 'forward',
    loop: opts.loop ?? settings.loop,
    ...(opts.startAtBeat === undefined ? {} : { startAtBeat: opts.startAtBeat }),
    ...(opts.onStep
      ? { onStep: (i: number) => opts.onStep!(i - offset) }
      : {}),
  });
}

/** How many beats a scale runs for — the home chord, then half a beat
 *  a note. What Pause measures a scale card against. */
export function scaleBeats(noteCount: number): number {
  return CHORD_BEATS + noteCount * 0.5;
}

/** How many beats a panel sequence runs for, so Pause can say where it
 *  got to and Resume can be told. */
export function panelBeats(
  chords: number | ReadonlyArray<PlayerChord>,
  opts: { orientPc?: number; beats?: number } = {},
): number {
  const each = opts.beats ?? CHORD_BEATS;
  const lead = opts.orientPc === undefined ? 0 : each;
  // A LIST SUMS ITS OWN LENGTHS; a bare count multiplies. The second is
  // what a pass needs, where every chord is the same length, and the
  // first is what a recorded movement needs, where they are not.
  if (typeof chords === 'number') return lead + chords * each;
  return lead + chords.reduce((n, c) => n + (c.beats ?? each), 0);
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
    /** Where to pick up, in beats from the top — the panel's Resume. */
    startAtBeat?: number;
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
  // THE DRONE IS SHORTENED BY WHAT WAS SKIPPED, not restarted at full
  // length: resuming three beats in should leave three beats of key
  // under the rest of the run, not a drone outlasting the scale.
  const skip = Math.max(0, opts.startAtBeat ?? 0);
  const runBeats = Math.max(0.5, CHORD_BEATS + notes.length * 0.5 - skip);
  handles.push(await playBlocked(
    36 + opts.dronePc,
    [0],
    runBeats,
    opts.bpm,
    { velocity: DRONE_VELOCITY },
  ));
  handles.push(await playSeqChords(steps, 0, opts.bpm, {
    ...(skip > 0 ? { startAtBeat: skip } : {}),
    ...(opts.onNote ? { onStep: (i: number) => opts.onNote!(i - 1) } : {}),
  }));
  return { stop: () => handles.forEach(h => h.stop()) };
}
