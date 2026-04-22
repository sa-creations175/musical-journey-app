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

export type SeqChord = { intervals: number[]; beats?: number };

export async function playSeqChords(
  chords: SeqChord[],
  rootMidi: number,
  bpm: number,
  speedMultiplier = 1.0,
  onStep?: (index: number) => void,
) {
  const context = await ensureRunning();
  const effBpm = bpm * clampSpeed(speedMultiplier);
  const now = context.currentTime + 0.05;
  const secPerBeat = 60 / effBpm;
  let cursor = now;
  chords.forEach((chord, idx) => {
    const beats = chord.beats ?? 2;
    const duration = secPerBeat * beats;
    const vol = chordVolume(chord.intervals.length);
    chord.intervals.forEach(iv => {
      playNote(midiToFreq(rootMidi + iv), cursor, duration * 0.95, context, vol);
    });
    if (onStep) {
      const fireAt = cursor - now;
      setTimeout(() => onStep(idx), Math.max(0, fireAt * 1000));
    }
    cursor += duration;
  });
}
