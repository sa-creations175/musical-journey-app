// Safari / iOS compatibility notes — please preserve when modifying:
//   * Safari uses `webkitAudioContext` on older versions — we keep the
//     fallback so `new AudioContextClass()` works everywhere.
//   * Safari starts the AudioContext in `suspended` and refuses to produce
//     sound until `resume()` is called SYNCHRONOUSLY inside a user gesture
//     (click / tap / key). Callers must therefore invoke `ensureRunning()`
//     from within the user's event handler — not inside a timeout, promise
//     continuation, or passive listener.
//   * Even after resume, iOS Safari stays muted until a buffer source has
//     actually played within a user gesture. We play a 1-sample silent
//     buffer on the first unlock to satisfy that requirement.
//   * Safari's audio clock only advances once state === 'running'. If we
//     read `currentTime` while suspended and schedule oscillators at
//     `currentTime + N`, those times are already in the past by the time
//     the resume completes, and Safari silently drops them. Chrome is
//     lenient and plays them anyway, which is why the bug only showed up
//     in Safari. ensureRunning() therefore AWAITS the resume promise and
//     callers capture `currentTime` only AFTER it resolves.
//   * Because the resume initiation must happen inside the user gesture,
//     ensureRunning() calls `context.resume()` synchronously as the first
//     step of its body. The `await` that follows only suspends the
//     continuation — the gesture attribution is already set.

import type { PlaybackHandle } from './musicalPlayback';

export type Instrument = 'piano' | 'rhodes' | 'strings' | 'voice' | 'organ';

let ctx: AudioContext | null = null;
let activeInstrument: Instrument = 'piano';
let unlocked = false;

export function getAudioContext(): AudioContext {
  if (!ctx) {
    const AudioContextClass = window.AudioContext
      || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) throw new Error('Web Audio API not supported');
    ctx = new AudioContextClass();
  }
  return ctx;
}

// Safari requires awaiting resume() before scheduling oscillators — call
// this from inside a user gesture and `await` before using currentTime.
export async function ensureRunning(): Promise<AudioContext> {
  const context = getAudioContext();
  if (!unlocked) {
    try {
      const buffer = context.createBuffer(1, 1, context.sampleRate);
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      source.start();
      unlocked = true;
    } catch {
      // Leave unlocked=false; next call will retry.
    }
  }
  if (context.state !== 'running') {
    await context.resume();
  }
  return context;
}

export function setInstrument(instrument: Instrument) {
  activeInstrument = instrument;
}

export function getInstrument(): Instrument {
  return activeInstrument;
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function chordVolume(noteCount: number): number {
  return Math.max(0.12, 0.28 / Math.sqrt(Math.max(1, noteCount)));
}

type Voice = {
  stop: (time: number) => void;
};

/**
 * The stop handle every sequencer in this app returns.
 *
 * IMPORTED RATHER THAN RESTATED. `musicalPlayback.ts` defines it and
 * already imports from here; the import is type-only, so it is erased
 * and there is no runtime cycle. A second one-line interface with the
 * same shape is how two players come to disagree about what stopping
 * means.
 */
export type { PlaybackHandle };

function playPiano(freq: number, start: number, duration: number, context: AudioContext, volume: number): Voice {
  const master = context.createGain();
  master.gain.setValueAtTime(0, start);
  master.gain.linearRampToValueAtTime(volume, start + 0.008);
  master.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume * 0.3), start + duration * 0.6);
  master.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  master.connect(context.destination);

  const harmonics = [1, 2, 3, 4, 5, 6];
  const amps = [1, 0.45, 0.25, 0.14, 0.08, 0.05];
  const oscs: OscillatorNode[] = [];
  harmonics.forEach((h, i) => {
    const osc = context.createOscillator();
    osc.type = 'sine';
    const detune = (Math.random() - 0.5) * 2 * 0.1 * 100 * 0.01;
    osc.frequency.setValueAtTime(freq * h * (1 + detune / 1200), start);
    const g = context.createGain();
    g.gain.value = amps[i];
    osc.connect(g).connect(master);
    osc.start(start);
    oscs.push(osc);
  });

  const stop = (time: number) => {
    oscs.forEach(osc => osc.stop(time + 0.02));
  };
  stop(start + duration);
  return { stop };
}

function playRhodes(freq: number, start: number, duration: number, context: AudioContext, volume: number): Voice {
  const master = context.createGain();
  master.gain.setValueAtTime(0, start);
  master.gain.linearRampToValueAtTime(volume, start + 0.02);
  master.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume * 0.4), start + duration * 0.7);
  master.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  const tremolo = context.createOscillator();
  tremolo.frequency.value = 5.2;
  const tremGain = context.createGain();
  tremGain.gain.value = 0.15;
  tremolo.connect(tremGain);

  const tremAmp = context.createGain();
  tremAmp.gain.value = 1;
  tremGain.connect(tremAmp.gain);
  master.connect(tremAmp).connect(context.destination);

  const harmonics = [1, 2, 3, 4];
  const amps = [1, 0.3, 0.15, 0.08];
  const oscs: OscillatorNode[] = [];
  harmonics.forEach((h, i) => {
    const osc = context.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq * h, start);
    const g = context.createGain();
    g.gain.value = amps[i];
    osc.connect(g).connect(master);
    osc.start(start);
    oscs.push(osc);
  });
  tremolo.start(start);

  const stop = (time: number) => {
    oscs.forEach(osc => osc.stop(time + 0.02));
    tremolo.stop(time + 0.02);
  };
  stop(start + duration);
  return { stop };
}

function playStrings(freq: number, start: number, duration: number, context: AudioContext, volume: number): Voice {
  const master = context.createGain();
  master.gain.setValueAtTime(0, start);
  master.gain.linearRampToValueAtTime(volume, start + 0.35);
  master.gain.setValueAtTime(volume, start + Math.max(0.36, duration - 0.3));
  master.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  const lp = context.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 3200;
  master.connect(lp).connect(context.destination);

  const harmonics = [1, 2, 3, 4, 5];
  const amps = [1, 0.6, 0.3, 0.18, 0.1];
  const oscs: OscillatorNode[] = [];
  harmonics.forEach((h, i) => {
    const osc = context.createOscillator();
    osc.type = 'sawtooth';
    const detune = (Math.random() - 0.5) * 8;
    osc.frequency.setValueAtTime(freq * h, start);
    osc.detune.setValueAtTime(detune, start);
    const g = context.createGain();
    g.gain.value = amps[i];
    osc.connect(g).connect(master);
    osc.start(start);
    oscs.push(osc);
  });

  const stop = (time: number) => {
    oscs.forEach(osc => osc.stop(time + 0.02));
  };
  stop(start + duration);
  return { stop };
}

function playVoice(freq: number, start: number, duration: number, context: AudioContext, volume: number): Voice {
  const master = context.createGain();
  master.gain.setValueAtTime(0, start);
  master.gain.linearRampToValueAtTime(volume, start + 0.12);
  master.gain.setValueAtTime(volume, start + Math.max(0.13, duration - 0.15));
  master.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  const formants = [
    { freq: 800, q: 8 },
    { freq: 1150, q: 8 },
    { freq: 2900, q: 8 },
  ];
  const filters = formants.map(f => {
    const bp = context.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f.freq;
    bp.Q.value = f.q;
    bp.connect(context.destination);
    return bp;
  });

  const vibrato = context.createOscillator();
  vibrato.frequency.value = 5.5;
  const vibGain = context.createGain();
  vibGain.gain.value = 4;
  vibrato.connect(vibGain);

  const harmonics = [1, 2, 3];
  const amps = [1, 0.5, 0.25];
  const oscs: OscillatorNode[] = [];
  harmonics.forEach((h, i) => {
    const osc = context.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq * h, start);
    vibGain.connect(osc.frequency);
    const g = context.createGain();
    g.gain.value = amps[i];
    osc.connect(g);
    filters.forEach(f => g.connect(f));
    g.connect(master);
    osc.start(start);
    oscs.push(osc);
  });
  vibrato.start(start);

  const stop = (time: number) => {
    oscs.forEach(osc => osc.stop(time + 0.02));
    vibrato.stop(time + 0.02);
  };
  stop(start + duration);
  return { stop };
}

function playOrgan(freq: number, start: number, duration: number, context: AudioContext, volume: number): Voice {
  const master = context.createGain();
  master.gain.setValueAtTime(0, start);
  master.gain.linearRampToValueAtTime(volume, start + 0.005);
  master.gain.setValueAtTime(volume, start + Math.max(0.01, duration - 0.01));
  master.gain.linearRampToValueAtTime(0, start + duration);
  master.connect(context.destination);

  const harmonics = [1, 2, 3, 4, 6, 8];
  const amps = [1, 0.8, 0.5, 0.4, 0.25, 0.15];
  const oscs: OscillatorNode[] = [];
  harmonics.forEach((h, i) => {
    const osc = context.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq * h, start);
    const g = context.createGain();
    g.gain.value = amps[i];
    osc.connect(g).connect(master);
    osc.start(start);
    oscs.push(osc);
  });

  const stop = (time: number) => {
    oscs.forEach(osc => osc.stop(time + 0.02));
  };
  stop(start + duration);
  return { stop };
}

// Caller must supply a context that has already been resumed via
// ensureRunning(). No default: a suspended context would schedule notes
// in the past on Safari.
export function playNote(
  freq: number,
  startTime: number,
  duration: number,
  context: AudioContext,
  volume = 0.2,
): Voice {
  switch (activeInstrument) {
    case 'rhodes': return playRhodes(freq, startTime, duration, context, volume);
    case 'strings': return playStrings(freq, startTime, duration, context, volume);
    case 'voice': return playVoice(freq, startTime, duration, context, volume);
    case 'organ': return playOrgan(freq, startTime, duration, context, volume);
    case 'piano':
    default: return playPiano(freq, startTime, duration, context, volume);
  }
}

// Speed multiplier convention across all playback functions:
//   Multiplier M rescales time by 1/M (D → D/M, step → step/M, bpm → bpm*M).
//   M = 1.0 → unchanged. M = 0.5 → twice as slow. M = 2.0 → twice as fast.
//   Values are clamped to a conservative floor to avoid zero / negative
//   times if a caller passes in garbage.
function clampSpeed(m: number): number {
  return Math.max(0.1, m);
}

/**
 * How long `playInterval` will sound for, in ms.
 *
 * Derived from the same two numbers the player uses — the second note
 * starts at `dur * 0.95` and runs a full `dur` — so a change to the
 * playback shape cannot leave the measurement clock behind. The 0.05
 * scheduling lead-in is included because the reader waits through it
 * too.
 *
 * Exists because `playInterval` resolves once the notes are SCHEDULED,
 * not once they are heard: awaiting it tells a caller nothing about
 * when the question became answerable.
 */
export function intervalPlaybackMs(speedMultiplier = 1.0, noteDuration = 0.8): number {
  const dur = noteDuration / clampSpeed(speedMultiplier);
  return (0.05 + dur * 0.95 + dur) * 1000;
}

export async function playInterval(
  rootMidi: number,
  semitones: number,
  ascending: boolean,
  speedMultiplier = 1.0,
  noteDuration = 0.8,
) {
  const context = await ensureRunning();
  const dur = noteDuration / clampSpeed(speedMultiplier);
  const now = context.currentTime + 0.05;
  const first = ascending ? rootMidi : rootMidi + semitones;
  const second = ascending ? rootMidi + semitones : rootMidi;
  playNote(midiToFreq(first), now, dur, context, 0.25);
  playNote(midiToFreq(second), now + dur * 0.95, dur, context, 0.25);
}

export async function playChordBlocked(
  rootMidi: number,
  intervals: number[],
  speedMultiplier = 1.0,
  duration = 3.2,
) {
  const context = await ensureRunning();
  const dur = duration / clampSpeed(speedMultiplier);
  const now = context.currentTime + 0.05;
  const vol = chordVolume(intervals.length);
  intervals.forEach(iv => {
    playNote(midiToFreq(rootMidi + iv), now, dur, context, vol);
  });
}

export type BrokenChordDirection = 'asc' | 'desc' | 'both';

// Arpeggiated playback. A new note starts every `stepTime` seconds and
// each note sustains for `noteDuration` seconds; with the default values
// notes overlap and blend (noteDuration > stepTime). The speed multiplier
// scales both in lockstep so the blend ratio is preserved.
//
// Direction:
//   · 'asc'  → low → high
//   · 'desc' → high → low
//   · 'both' → ascending then descending, without re-striking the apex
//              (e.g. C-E-G-C then G-E-C for a C major triad)
/**
 * When a blocked chord becomes ANSWERABLE, in ms after the play call.
 *
 * =====================================================================
 * A SUSTAINED CHORD IS ANSWERABLE AT ITS ONSET, NOT WHEN IT STOPS.
 *
 * This used to return how long the chord SOUNDS for — one note's full
 * duration, 3.2s, doubled to 6.45s at the module's default half speed
 * — and chord recognition started its measurement clock there. Every
 * note of a blocked chord strikes at the same instant, so the whole
 * question is present in the first moment; the seconds that follow are
 * one chord ringing, and a reader who has already decided is not
 * waiting for anything. Starting the clock at the far end of that ring
 * meant every answer landed BEFORE the clock started, and
 * `heardElapsedFields`' floor recorded each one as zero. Twenty rows,
 * twenty zeros, and the module looked infinitely fast.
 *
 * So this is the scheduling lead-in and nothing else. The lead-in
 * stays because the reader really does wait through it.
 *
 * NOT THE SAME QUESTION AS "HOW LONG DOES IT SOUND". Nothing needs the
 * sound's length today, and reintroducing it under a name a
 * measurement might reach for is how this went wrong the first time.
 * If a UI ever needs the ring, give it its own name.
 * =====================================================================
 */
export function chordBlockedAnswerableMs(): number {
  // NO SPEED AND NO DURATION PARAMETER, deliberately. Both stretch the
  // ring and neither delays the answer, so a caller cannot pass
  // something that moves this clock — the previous signature took both
  // and that is exactly how the ring got into the measurement.
  return 0.05 * 1000;
}

/**
 * When a broken chord becomes ANSWERABLE, in ms after the play call.
 *
 * The LAST NOTE'S ONSET, not the end of its ring. A broken chord is
 * only fully heard once every note has struck, so unlike the blocked
 * case the reader genuinely waits through the sequence — but the final
 * note names its pitch the instant it sounds, and the two seconds it
 * then rings for add nothing to answer with. `both` plays the shape up
 * and back down without restriking the apex, which is why the strike
 * count is derived here rather than passed in.
 *
 * Broken chords become answerable much later than blocked ones at the
 * same speed, which is the whole reason `playStyle` goes on the row:
 * pooled without it, a reader who prefers broken looks slower at
 * everything.
 */
export function chordBrokenAnswerableMs(
  noteCount: number,
  speedMultiplier = 1.0,
  direction: BrokenChordDirection = 'asc',
  stepTime = 0.4,
): number {
  const m = clampSpeed(speedMultiplier);
  const steps = direction === 'both' ? noteCount * 2 - 1 : noteCount;
  return (0.05 + (steps - 1) * (stepTime / m)) * 1000;
}

export async function playChordBroken(
  rootMidi: number,
  intervals: number[],
  speedMultiplier = 1.0,
  direction: BrokenChordDirection = 'asc',
  stepTime = 0.4,
  noteDuration = 2.0,
) {
  const context = await ensureRunning();
  const m = clampSpeed(speedMultiplier);
  const step = stepTime / m;
  const dur = noteDuration / m;
  const now = context.currentTime + 0.05;
  const vol = chordVolume(intervals.length);
  const sortedAsc = [...intervals].sort((a, b) => a - b);
  let sequence: number[];
  if (direction === 'desc') {
    sequence = [...sortedAsc].reverse();
  } else if (direction === 'both') {
    // Play up then back down without double-striking the apex.
    sequence = [...sortedAsc, ...[...sortedAsc].reverse().slice(1)];
  } else {
    sequence = sortedAsc;
  }
  sequence.forEach((iv, idx) => {
    playNote(midiToFreq(rootMidi + iv), now + idx * step, dur, context, vol);
  });
}

// playBassNote is scheduled by the caller at an explicit absolute time,
// so it doesn't own a tempo itself. Sequencers that emit bass lines apply
// the speed multiplier to the spacing between notes they pass in.
export function playBassNote(midi: number, time: number, context: AudioContext, duration = 0.9) {
  playNote(midiToFreq(midi), time, duration, context, 0.32);
}

/**
 * One chord in a sequence: exact notes, its own length, and which hand
 * plays each note.
 *
 * `hands` is INDEX-ALIGNED with `intervals` and may be absent, in which
 * case every note is right-hand — the same reading `normalizeVoicing`
 * gives a legacy bare-number voicing.
 */
export type SeqChord = {
  intervals: number[];
  beats?: number;
  hands?: Array<'L' | 'R'>;
};

/** Which hand is louder, if either. */
export type BassBalance = 'forward' | 'even';

/**
 * How much of the chord's own volume each hand gets.
 *
 * =====================================================================
 * THE NUMBERS ARE THE PROTOTYPE'S, NORMALISED. Silas judged the hand
 * balance by ear on
 * `docs/chord-movement-playback-prototype_1.html`, which plays the
 * left hand at 0.5 and the right at 0.11 when bass is forward, and both
 * at 0.24 when it is even. Dividing through by the even value gives the
 * ratio he heard — 2.08 and 0.46 — and applying it to `chordVolume`
 * keeps the app's own polyphony scaling underneath.
 *
 * Reproducing the RATIO rather than the absolute gains is the point:
 * the prototype's are for a raw triangle oscillator and this plays
 * through the app's instruments. Its low-note lift (×1.15 below C3) is
 * deliberately not carried across — that compensates for the
 * prototype's synth, not for a hand.
 * =====================================================================
 */
const HAND_GAIN: Readonly<Record<BassBalance, Readonly<Record<'L' | 'R', number>>>> = {
  forward: { L: 2.08, R: 0.46 },
  even: { L: 1, R: 1 },
};

export interface SeqChordsOptions {
  speedMultiplier?: number;
  /** Fires as each chord starts, for a moving highlight. */
  onStep?: (index: number) => void;
  /**
   * How many times to play the whole sequence, or `'untilStopped'`.
   *
   * A COUNT IS SCHEDULED UP FRONT, the way `playModalVamp` does it.
   * `'untilStopped'` cannot be — nothing can schedule forever — so it
   * plays one pass and arms a timer to schedule the next, which is what
   * the prototype does and what makes Stop land immediately rather than
   * after the passes already queued.
   */
  loop?: number | 'untilStopped';
  bassBalance?: BassBalance;
}

/**
 * Play a sequence of exact voicings against a root.
 *
 * =====================================================================
 * IT RETURNS A HANDLE NOW, AND TAKES A LOOP AND THE HANDS.
 *
 * This function has existed since the ear-training work and had ZERO
 * callers — the clearest evidence available that nothing had yet needed
 * to play back what a person actually pressed. Chord Movements is the
 * first thing that does, and it needs three things the old shape could
 * not give: a way to stop what has been scheduled, a way to run
 * continuously, and a way to sound the left hand differently from the
 * right.
 *
 * CHANGED IN PLACE RATHER THAN WRAPPED, because with no callers there
 * is nothing to break and a wrapper would leave two functions that both
 * look like the one to use. The stop and loop shapes are copied from
 * `playModalVamp` and `playNoteSequence` rather than invented.
 * =====================================================================
 */
export async function playSeqChords(
  chords: SeqChord[],
  rootMidi: number,
  bpm: number,
  opts: SeqChordsOptions = {},
): Promise<PlaybackHandle> {
  const context = await ensureRunning();
  const effBpm = bpm * clampSpeed(opts.speedMultiplier ?? 1.0);
  const secPerBeat = 60 / effBpm;
  const gains = HAND_GAIN[opts.bassBalance ?? 'even'];
  const passBeats = chords.reduce((sum, c) => sum + (c.beats ?? 2), 0);
  const passSeconds = passBeats * secPerBeat;

  const voices: Voice[] = [];
  const timers: number[] = [];
  let stopped = false;

  /** One pass through the sequence, starting at an absolute time. */
  const schedulePass = (startAt: number) => {
    let cursor = startAt;
    chords.forEach((chord, idx) => {
      const beats = chord.beats ?? 2;
      const duration = secPerBeat * beats;
      const vol = chordVolume(chord.intervals.length);
      chord.intervals.forEach((iv, note) => {
        const hand = chord.hands?.[note] ?? 'R';
        voices.push(playNote(
          midiToFreq(rootMidi + iv), cursor, duration * 0.95, context, vol * gains[hand],
        ));
      });
      if (opts.onStep) {
        const fireAt = (cursor - context.currentTime) * 1000;
        const cb = opts.onStep;
        timers.push(window.setTimeout(() => cb(idx), Math.max(0, fireAt)));
      }
      cursor += duration;
    });
    return cursor;
  };

  const now = context.currentTime + 0.05;

  if (opts.loop === 'untilStopped') {
    // ARM THE NEXT PASS AS THIS ONE ENDS. Scheduling a large finite
    // number instead would make Stop silent but leave the notes already
    // queued in the audio graph — which is the bug the handle exists to
    // prevent.
    const armNext = (startAt: number) => {
      if (stopped) return;
      const end = schedulePass(startAt);
      timers.push(window.setTimeout(
        () => armNext(end),
        Math.max(0, (end - context.currentTime) * 1000),
      ));
    };
    armNext(now);
  } else {
    const passes = Math.max(1, Math.floor(opts.loop ?? 1));
    for (let i = 0; i < passes; i++) schedulePass(now + i * passSeconds);
  }

  return {
    stop: () => {
      stopped = true;
      const fadeAt = context.currentTime + 0.05;
      for (const v of voices) v.stop(fadeAt);
      for (const id of timers) window.clearTimeout(id);
    },
  };
}
