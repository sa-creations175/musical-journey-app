// Global metronome — a lightweight Web Audio scheduler that runs
// continuously while the user has it on. Lives outside the React
// tree so drill timers can start/stop it without worrying about
// component lifecycles.
//
// Grooves are hand-rolled synthesised patterns (kick / snare / hat /
// ride) with per-groove velocity + subdivision tables. No external
// samples needed; audio is generated on the fly which keeps the
// module import cheap.

import { ensureRunning } from './audio';
import { playGoChime, scheduleGoChime, playCountKick, playCountClick } from './chimes';
import { getPref } from './userPrefs';

// userPrefs keys for the metronome's persisted settings. Exported so
// MetronomeControl (the writer) and the eager hydration below share one
// source of truth — divergent keys would silently break persistence.
export const PREF_BPM = 'metronomeBpm';
export const PREF_GROOVE = 'metronomeGroove';
export const PREF_TIME_SIG = 'metronomeTimeSig';
export const PREF_VOLUME = 'metronomeVolume';

export type GrooveId =
  // 4/4
  | 'click'
  | 'drum-basic'
  | 'gospel'
  | 'rnb-neosoul'
  | 'jazz-swing'
  | 'hip-hop'
  | 'shuffle'
  // 3/4
  | 'basic-3-4'
  | 'waltz'
  // 6/8
  | 'basic-6-8'
  | 'jig'
  // 12/8
  | 'basic-12-8'
  | 'blues-shuffle';

export const GROOVE_LABEL: Record<GrooveId, string> = {
  click:        'Simple click',
  'drum-basic': 'Basic drum beat',
  gospel:       'Gospel groove',
  'rnb-neosoul':'R&B / neo-soul',
  'jazz-swing': 'Jazz swing',
  'hip-hop':    'Hip-hop beat',
  shuffle:      'Shuffle feel',
  'basic-3-4':  'Basic 3/4',
  waltz:        'Waltz',
  'basic-6-8':  'Basic 6/8',
  jig:          'Jig',
  'basic-12-8': 'Basic 12/8',
  'blues-shuffle': 'Blues shuffle',
};

export type TimeSig = '4/4' | '3/4' | '6/8' | '12/8';

export const TIME_SIG_BEATS: Record<TimeSig, number> = {
  '4/4': 4,
  '3/4': 3,
  '6/8': 6,
  '12/8': 12,
};

/** Compound meters (eighth-denominated, beats grouped in 3s): BPM is the
 *  felt dotted-quarter and the counted/grid unit is the eighth. */
export function isCompoundMeter(ts: TimeSig): boolean {
  return ts === '6/8' || ts === '12/8';
}

/** Grooves available for each meter — the selector shows only these, and
 *  the first is the meter's default. A 4/4 groove is never offered in
 *  3/4 etc. */
export const GROOVES_BY_TIME_SIG: Record<TimeSig, readonly GrooveId[]> = {
  '4/4': ['click', 'drum-basic', 'gospel', 'rnb-neosoul', 'jazz-swing', 'hip-hop', 'shuffle'],
  '3/4': ['basic-3-4', 'waltz'],
  '6/8': ['basic-6-8', 'jig'],
  '12/8': ['basic-12-8', 'blues-shuffle'],
};

export function groovesForTimeSig(ts: TimeSig): readonly GrooveId[] {
  return GROOVES_BY_TIME_SIG[ts];
}

export function defaultGrooveForTimeSig(ts: TimeSig): GrooveId {
  return GROOVES_BY_TIME_SIG[ts][0];
}

// Time signatures offered by the prep-screen count-in picker. Same set as
// the metronome now supports.
export const COUNT_IN_TIME_SIGS: readonly TimeSig[] = ['4/4', '3/4', '6/8', '12/8'];

/** Coerce a free-form song / section time-signature string to a
 *  supported count-in TimeSig, falling back to 4/4 for anything not on
 *  the picker (blank, malformed, or e.g. 5/4 / 7/8 / 9/8). */
export function coerceCountInTimeSig(raw: string | undefined | null): TimeSig {
  const t = (raw ?? '').trim();
  return (COUNT_IN_TIME_SIGS as readonly string[]).includes(t)
    ? (t as TimeSig)
    : '4/4';
}

// --- Count-in schedule (prep-flow Phase 4) --------------------------
//
// A pure description of the 1-2-3-play lead-in for a given meter + BPM.
// Kept side-effect-free (no timers, no audio) so it's unit-testable; the
// metronome's `countIn` method turns it into scheduled clicks + a GO
// chime + visual callbacks.

/** Metric weight of a beat — drives the count-in voice (kick vs click)
 *  and the overlay's numeral + beat-row treatment. */
export type AccentLevel = 'strong' | 'medium' | 'weak';

/** Count-in voice per metric weight: strong + medium beats are the
 *  thumpy kick, weak beats the light click. (The final "play" beat is
 *  the GO chime instead — handled separately.) */
export type CountInVoice = 'kick' | 'click';
export function countInVoiceFor(accent: AccentLevel): CountInVoice {
  return accent === 'weak' ? 'click' : 'kick';
}

/** Audio-clock headroom before the first count-in beat, so beat 1 isn't
 *  scheduled in the past. Small enough that the visual (driven from raw
 *  setTimeout offsets) and the audio stay perceptually together. */
export const COUNT_IN_AUDIO_LEAD_SEC = 0.06;

/** Per-position metric accent for each meter (index 0 = beat 1). Both
 *  bars of a two-bar count-in reuse the same pattern. */
function accentPatternFor(timeSig: TimeSig): AccentLevel[] {
  switch (timeSig) {
    case '4/4': return ['strong', 'weak', 'medium', 'weak'];
    case '3/4': return ['strong', 'weak', 'weak'];
    case '6/8': return ['strong', 'weak', 'weak', 'medium', 'weak', 'weak'];
    case '12/8': return [
      'strong', 'weak', 'weak', 'medium', 'weak', 'weak',
      'medium', 'weak', 'weak', 'medium', 'weak', 'weak',
    ];
  }
}

export interface CountInBeat {
  /** 1-based beat position within its bar. The final beat renders
   *  "play" in the UI, but keeps its real position here. */
  position: number;
  /** 1-based bar index within the count-in (1 or 2). */
  bar: number;
  /** Delay from the start of the count-in, in milliseconds. */
  offsetMs: number;
  /** Metric weight — strong / medium / weak click + visual treatment. */
  accent: AccentLevel;
  /** The final beat: fires the GO chime ("play") and starts the drill. */
  isGo: boolean;
}

export interface CountInSchedule {
  beats: CountInBeat[];
  /** Inter-beat interval in ms (quarter-note for simple meters,
   *  eighth-note for compound). */
  intervalMs: number;
  /** Beats per bar (length of the accent pattern). */
  beatsPerBar: number;
  /** 1 for 4/4, 2 for every other meter. */
  totalBars: number;
  totalBeats: number;
}

function parseSig(ts: TimeSig): { beatsPerBar: number; beatUnit: number } {
  const [n, d] = ts.split('/').map(s => parseInt(s, 10));
  return { beatsPerBar: n || 4, beatUnit: d || 4 };
}

/**
 * Build the count-in beat list for a time signature + BPM.
 *
 * 4/4 is a single count-in bar (1 · 2 · 3 · play). Every other meter
 * gets an establishing bar first (full count 1→N) then the count-in bar
 * (1→N-1 then play on the downbeat-N position):
 *   3/4 → 1 2 3 · 1 2 play      6/8 → 1 2 3 4 5 6 · 1 2 3 4 5 play
 *
 * Each beat carries its metric accent (per `accentPatternFor`). Beat
 * unit: quarter-note for simple meters; for compound meters (6/8, 12/8)
 * BPM is the felt dotted-quarter beat, so each counted eighth =
 * 60000 / (BPM * 3) — a dotted quarter is 3 eighths.
 *
 * 4/4 and 12/8 use a SINGLE count-in bar (a 12/8 bar is already 12
 * eighths — two bars at a slow tempo would run 8+ seconds); 3/4 and 6/8
 * use two bars (establishing + count-in).
 */
export function buildCountInSchedule(timeSig: TimeSig, bpm: number): CountInSchedule {
  const safeBpm = Math.max(40, Math.min(220, bpm));
  const { beatsPerBar: n } = parseSig(timeSig);
  const intervalMs = isCompoundMeter(timeSig) ? 60000 / (safeBpm * 3) : 60000 / safeBpm;
  const pattern = accentPatternFor(timeSig);
  const totalBars = timeSig === '4/4' || timeSig === '12/8' ? 1 : 2;

  const beats: CountInBeat[] = [];
  let offset = 0;
  for (let bar = 1; bar <= totalBars; bar++) {
    const isLastBar = bar === totalBars;
    for (let position = 1; position <= n; position++) {
      const isGo = isLastBar && position === n;
      beats.push({ position, bar, offsetMs: offset, accent: pattern[position - 1], isGo });
      offset += intervalMs;
    }
  }

  return { beats, intervalMs, beatsPerBar: n, totalBars, totalBeats: beats.length };
}

export interface MetronomeState {
  playing: boolean;
  bpm: number;
  groove: GrooveId;
  timeSig: TimeSig;
  /** Linear volume 0..1. */
  volume: number;
}

export const DEFAULT_STATE: MetronomeState = {
  playing: false,
  bpm: 90,
  groove: 'click',
  timeSig: '4/4',
  volume: 0.5,
};

// --- Synthesised voices ---------------------------------------------

function playKick(ctx: AudioContext, t: number, volume: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(130, t);
  osc.frequency.exponentialRampToValueAtTime(45, t + 0.08);
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(volume, t + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.25);
}

function playSnare(ctx: AudioContext, t: number, volume: number) {
  // Noise burst + a short bright tone for body.
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.18, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1);
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const hpf = ctx.createBiquadFilter();
  hpf.type = 'highpass';
  hpf.frequency.value = 1500;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0, t);
  noiseGain.gain.linearRampToValueAtTime(volume * 0.9, t + 0.003);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  noise.connect(hpf).connect(noiseGain).connect(ctx.destination);
  noise.start(t);

  const osc = ctx.createOscillator();
  const oscGain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(220, t);
  osc.frequency.exponentialRampToValueAtTime(180, t + 0.05);
  oscGain.gain.setValueAtTime(0, t);
  oscGain.gain.linearRampToValueAtTime(volume * 0.35, t + 0.003);
  oscGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
  osc.connect(oscGain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.12);
}

function playHat(ctx: AudioContext, t: number, volume: number, closed = true) {
  // Short white-noise burst through a band-pass/high-pass.
  const buffer = ctx.createBuffer(1, ctx.sampleRate * (closed ? 0.05 : 0.15), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const hpf = ctx.createBiquadFilter();
  hpf.type = 'highpass';
  hpf.frequency.value = 6000;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(volume * (closed ? 0.35 : 0.6), t + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + (closed ? 0.04 : 0.12));
  noise.connect(hpf).connect(gain).connect(ctx.destination);
  noise.start(t);
}

function playRide(ctx: AudioContext, t: number, volume: number) {
  // Brighter, longer hi-hat-esque voice for swing rides.
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.18, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 8000;
  bp.Q.value = 1.5;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(volume * 0.45, t + 0.003);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  noise.connect(bp).connect(gain).connect(ctx.destination);
  noise.start(t);
}

function playClick(ctx: AudioContext, t: number, volume: number, accent = false) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.value = accent ? 1400 : 900;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(volume * (accent ? 0.9 : 0.55), t + 0.001);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.05);
}

// --- Pattern engine -------------------------------------------------
//
// Each groove defines what happens on each 16th-note slot of a full
// bar (so we can express swing + off-beat hats consistently). Slot 0
// = downbeat of beat 1. A groove can return multiple hits per slot.

type Hit = { voice: 'kick' | 'snare' | 'hat' | 'hat-open' | 'ride' | 'click' | 'click-accent'; gain?: number };

function grooveHits(groove: GrooveId, slot: number, beatsPerBar: number, swing: boolean): Hit[] {
  switch (groove) {
    case 'click': {
      // One click per beat. Downbeat accented.
      if (slot % 4 !== 0) return [];
      const beat = slot / 4;
      return [{ voice: beat === 0 ? 'click-accent' : 'click' }];
    }

    case 'drum-basic': {
      const hits: Hit[] = [];
      // Hat on every 8th (slots 0, 2, 4, 6, 8, 10, 12, 14).
      if (slot % 2 === 0) hits.push({ voice: 'hat' });
      // Kick on 1 and 3 (slots 0, 8 for 4/4). For other time sigs we
      // map every other beat.
      if (slot % 8 === 0) hits.push({ voice: 'kick' });
      // Snare on 2 and 4 (slots 4, 12).
      if (beatsPerBar >= 4 && (slot === 4 || slot === 12)) hits.push({ voice: 'snare' });
      return hits;
    }

    case 'gospel': {
      // Classic gospel pocket: kick on 1, + (8th before 2), 3, +. Snare
      // on 2 and 4 with a ghost snare on the "e" of 3. Open hat on
      // the "and" of 4.
      const hits: Hit[] = [];
      if (slot % 2 === 0) hits.push({ voice: 'hat' });
      if (slot === 0 || slot === 3 || slot === 8 || slot === 11) hits.push({ voice: 'kick' });
      if (slot === 4 || slot === 12) hits.push({ voice: 'snare' });
      if (slot === 9) hits.push({ voice: 'snare', gain: 0.35 });
      if (slot === 14) hits.push({ voice: 'hat-open' });
      return hits;
    }

    case 'rnb-neosoul': {
      // Laid-back pocket — kick on 1 and "e" of 3; snare on 2 and 4;
      // 16th-note hats with subtle velocity variation; occasional
      // open hat for air.
      const hits: Hit[] = [];
      // Velocity pattern for 16th hats: accent on downbeats, soft on
      // 'e' and 'a'.
      const hatGain = slot % 4 === 0 ? 1 : slot % 2 === 0 ? 0.7 : 0.5;
      hits.push({ voice: 'hat', gain: hatGain });
      if (slot === 0 || slot === 9) hits.push({ voice: 'kick' });
      if (slot === 4 || slot === 12) hits.push({ voice: 'snare' });
      if (slot === 14) hits.push({ voice: 'hat-open', gain: 0.7 });
      return hits;
    }

    case 'jazz-swing': {
      // Swing ride: quarter on 1, triplet 2nd 8th on each beat (the
      // "spang-a-lang"). Snare ghosts on 2 and 4. Kick feathered on 1
      // and 3. Swing is intrinsic via the scheduler's triplet feel.
      const hits: Hit[] = [];
      if (slot === 0 || slot === 4 || slot === 8 || slot === 12) hits.push({ voice: 'ride', gain: 0.9 });
      if (swing && (slot === 3 || slot === 7 || slot === 11 || slot === 15)) {
        // Ride on the swung 2nd 8th — this maps to a triplet-felt
        // position in the scheduler.
        hits.push({ voice: 'ride', gain: 0.75 });
      }
      if (slot === 4 || slot === 12) hits.push({ voice: 'snare', gain: 0.35 });
      if (slot === 0 || slot === 8) hits.push({ voice: 'kick', gain: 0.55 });
      return hits;
    }

    case 'hip-hop': {
      // Sparse hip-hop pocket: kick on 1 and 3.5 (sync), snare on 2
      // and 4, closed hat on 8ths.
      const hits: Hit[] = [];
      if (slot % 2 === 0) hits.push({ voice: 'hat' });
      if (slot === 0) hits.push({ voice: 'kick' });
      if (slot === 10) hits.push({ voice: 'kick', gain: 0.9 });
      if (slot === 4 || slot === 12) hits.push({ voice: 'snare' });
      return hits;
    }

    case 'shuffle': {
      // Shuffle: kick + snare on each beat, triplet-feel hat on the
      // "and a" of each beat. Scheduler's swing=true shifts the off-
      // beat slots to the triplet 2nd note.
      const hits: Hit[] = [];
      if (slot % 4 === 0) hits.push({ voice: 'kick' });
      if (slot === 4 || slot === 12) hits.push({ voice: 'snare' });
      if (slot === 3 || slot === 7 || slot === 11 || slot === 15) hits.push({ voice: 'hat' });
      return hits;
    }

    // --- 3/4 (simple — beat = quarter, hits land on slot multiples of 4)
    case 'basic-3-4': {
      if (slot % 4 !== 0) return [];
      // beat 1 = kick; beats 2, 3 = hat.
      return slot === 0 ? [{ voice: 'kick' }] : [{ voice: 'hat' }];
    }
    case 'waltz': {
      if (slot % 4 !== 0) return [];
      // Classic lilt: softer downbeat kick, light hats on 2 and 3.
      return slot === 0
        ? [{ voice: 'kick', gain: 0.7 }]
        : [{ voice: 'hat', gain: 0.5 }];
    }

    // --- 6/8 / 12/8 (compound — beat = eighth, hits on slot multiples of
    // 4; the eighth index is slot/4). The scheduler runs these at the
    // eighth tempo so the felt dotted-quarter pulse lands right.
    case 'basic-6-8': {
      if (slot % 4 !== 0) return [];
      const e = slot / 4; // 0..5
      // Kick on eighths 1 and 4 (the two dotted-quarter pulses).
      return e === 0 || e === 3 ? [{ voice: 'kick' }] : [{ voice: 'hat' }];
    }
    case 'jig': {
      if (slot % 4 !== 0) return [];
      const e = slot / 4;
      // Lighter compound feel: kick only on 1, hats on 2–6.
      return e === 0 ? [{ voice: 'kick' }] : [{ voice: 'hat', gain: 0.7 }];
    }
    case 'basic-12-8': {
      if (slot % 4 !== 0) return [];
      const e = slot / 4; // 0..11
      // Kick on the four dotted-quarter pulses (eighths 1, 4, 7, 10).
      return e % 3 === 0 ? [{ voice: 'kick' }] : [{ voice: 'hat' }];
    }
    case 'blues-shuffle': {
      if (slot % 4 !== 0) return [];
      const e = slot / 4;
      // Kick on the two main felt pulses (eighths 1 and 7).
      return e === 0 || e === 6 ? [{ voice: 'kick' }] : [{ voice: 'hat' }];
    }
  }
}

// --- Scheduler ------------------------------------------------------
//
// Classic look-ahead metronome: every ~25 ms the scheduler wakes and
// schedules any events due in the next lookahead window (~100 ms).
// Web Audio handles the precise sample-accurate timing; JS just
// queues notes ahead of the audio clock.

class Metronome {
  state: MetronomeState = { ...DEFAULT_STATE };
  private ctx: AudioContext | null = null;
  private nextNoteTime = 0;
  private currentSlot = 0;
  private timer: number | null = null;
  private listeners = new Set<(s: MetronomeState) => void>();

  // Runtime flags: track "why" we started so auto-stop from a drill
  // (or a song-block inline control) doesn't kill a user-initiated
  // session. Drivers stack: a 'user' start, a 'drill' start, and a
  // 'song' start all push; only when the stack empties does the
  // click actually stop.
  private driverStack: Array<'user' | 'drill' | 'song'> = [];

  get isPlaying(): boolean {
    return this.state.playing;
  }

  subscribe(listener: (s: MetronomeState) => void): () => void {
    this.listeners.add(listener);
    // Snapshot current state on subscribe for convenience.
    listener(this.state);
    return () => { this.listeners.delete(listener); };
  }

  private emit() {
    // Shallow-copy so downstream reference comparisons work.
    const snap = { ...this.state };
    this.listeners.forEach(fn => fn(snap));
  }

  update(patch: Partial<MetronomeState>) {
    let next = { ...this.state, ...patch };
    // Changing the time signature snaps the groove to that meter's
    // default unless the current groove is still valid for it — a 4/4
    // groove must never play under 3/4, etc.
    if (patch.timeSig !== undefined && !groovesForTimeSig(next.timeSig).includes(next.groove)) {
      next = { ...next, groove: defaultGrooveForTimeSig(next.timeSig) };
    }
    this.state = next;
    this.emit();
  }

  async start(driver: 'user' | 'drill' | 'song' = 'user') {
    this.driverStack.push(driver);
    if (this.state.playing) return;
    const ctx = await ensureRunning();
    // forceStop (or a matching stop) may have emptied the stack while we
    // awaited the AudioContext resume — e.g. the user paused or ended
    // the session the instant a drill auto-started its click. Don't
    // resurrect a click whose owner already tore down: bail before
    // flipping `playing` or arming the scheduler.
    if (this.driverStack.length === 0) return;
    this.ctx = ctx;
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    this.currentSlot = 0;
    this.state = { ...this.state, playing: true };
    this.emit();
    this.scheduler();
  }

  stop(driver: 'user' | 'drill' | 'song' = 'user') {
    // Pop the matching driver; only actually stop when the stack
    // empties. This lets the drill-timer auto-start nest safely
    // inside a user-started metronome without being killed.
    const idx = this.driverStack.lastIndexOf(driver);
    if (idx >= 0) this.driverStack.splice(idx, 1);
    if (this.driverStack.length > 0) return;
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
    this.state = { ...this.state, playing: false };
    this.emit();
  }

  toggle() {
    if (this.state.playing) this.stop('user');
    else void this.start('user');
  }

  // --- Count-in (prep-flow Phase 4) --------------------------------
  //
  // One-shot 4-3-2-1-GO lead-in. Schedules count clicks + a GO chime
  // and drives the caller's visual via onTick / onGo. Returns a
  // cancel() that clears the pending ticks and fires GO immediately —
  // the tap-to-skip bypass.
  //
  // INVARIANT: count-in deliberately does NOT push/pop the driver stack
  // or touch the continuous scheduler. The count clicks are one-shot
  // sounds, not a running click. This keeps the drill surface (the drill
  // modal) the sole owner of the running `'drill'` metronome — so a
  // count-in can never leak a metronome that outlives its drill, and
  // start/stop/forceStop/update behave exactly as before.
  countIn(
    timeSig: TimeSig,
    bpm: number,
    cbs: {
      onTick?: (position: number, bar: number, accent: AccentLevel) => void;
      onGo?: () => void;
    },
  ): () => void {
    const schedule = buildCountInSchedule(timeSig, bpm);
    const timers: number[] = [];
    // Oscillators we've scheduled on the audio clock — kept so bypass /
    // teardown can silence any that haven't sounded yet.
    const sources: OscillatorNode[] = [];
    let cancelled = false;
    let wentGo = false;

    // VISUALS — driven by setTimeout at the raw beat offsets. Timer
    // jitter only nudges the numeral, never the sound, so this is purely
    // cosmetic (and keeps the callback timing deterministic for tests).
    for (const beat of schedule.beats) {
      const id = window.setTimeout(() => {
        if (beat.isGo) {
          if (!wentGo) {
            wentGo = true;
            cbs.onGo?.();
          }
          return;
        }
        cbs.onTick?.(beat.position, beat.bar, beat.accent);
      }, beat.offsetMs);
      timers.push(id);
    }

    // AUDIO — scheduled ALL AT ONCE on the Web Audio clock from a single
    // anchor, so every beat lands exactly `intervalMs` apart regardless
    // of main-thread / setTimeout jitter. This is the fix for uneven and
    // out-of-order count-ins: previously each click was played at
    // `currentTime + 0.02` whenever its setTimeout happened to fire.
    // Async because the AudioContext resume may need to await; guarded so
    // a missing context (tests / unsupported) degrades to visual-only.
    void (async () => {
      let ctx: AudioContext;
      try {
        ctx = await ensureRunning();
      } catch {
        return; // no Web Audio — visuals already cover it
      }
      if (cancelled) return; // bypassed during the resume await
      const t0 = ctx.currentTime + COUNT_IN_AUDIO_LEAD_SEC;
      for (const beat of schedule.beats) {
        const at = t0 + beat.offsetMs / 1000;
        try {
          if (beat.isGo) {
            sources.push(...scheduleGoChime(ctx, at, this.state.volume));
          } else if (countInVoiceFor(beat.accent) === 'kick') {
            sources.push(playCountKick(ctx, at, this.state.volume));
          } else {
            sources.push(playCountClick(ctx, at, this.state.volume));
          }
        } catch {
          /* a bad node shouldn't abort the rest of the count-in */
        }
      }
    })();

    // Bypass / teardown: clear the visual timers, silence any pending
    // scheduled audio, and (on bypass) jump straight to GO.
    return () => {
      cancelled = true;
      timers.forEach(t => window.clearTimeout(t));
      for (const s of sources) {
        try { s.stop(); } catch { /* already finished */ }
      }
      if (!wentGo) {
        wentGo = true;
        void playGoChime(this.state.volume);
        cbs.onGo?.();
      }
    };
  }

  // Hard stop regardless of the driver stack. Used when the owning
  // context tears down (e.g. a practice session ends) — the click must
  // never outlive its session, no matter who started it or how many
  // drivers are stacked.
  forceStop() {
    this.driverStack = [];
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.state.playing) {
      this.state = { ...this.state, playing: false };
      this.emit();
    }
  }

  private scheduler = () => {
    if (!this.ctx) return;
    const lookaheadSec = 0.12;
    // Guard against scheduling in the past. A beat whose time is
    // already behind ctx.currentTime renders SILENT — its whole gain
    // envelope (setValueAtTime(0,t) → ramp up → ramp to 0.0001) is in
    // the past by the time the audio thread reaches the node, so it
    // plays back at the envelope's final (near-zero) value. The clock
    // can fall behind from tab throttling, a slow AudioContext.resume()
    // on start, or an audio clock that hadn't advanced yet when start()
    // read currentTime. Re-anchor to just ahead of now so the next
    // beat is audible.
    if (this.nextNoteTime < this.ctx.currentTime) {
      this.nextNoteTime = this.ctx.currentTime + 0.05;
    }
    while (this.nextNoteTime < this.ctx.currentTime + lookaheadSec) {
      this.scheduleSlot(this.nextNoteTime, this.currentSlot);
      this.advanceSlot();
    }
    this.timer = window.setTimeout(this.scheduler, 25);
  };

  private scheduleSlot(t: number, slot: number) {
    if (!this.ctx) return;
    const { groove, timeSig, volume } = this.state;
    const beatsPerBar = TIME_SIG_BEATS[timeSig];
    const swing = groove === 'jazz-swing' || groove === 'shuffle';
    const hits = grooveHits(groove, slot % (beatsPerBar * 4), beatsPerBar, swing);
    for (const h of hits) {
      const g = volume * (h.gain ?? 1);
      switch (h.voice) {
        case 'kick':         playKick(this.ctx, t, g); break;
        case 'snare':        playSnare(this.ctx, t, g); break;
        case 'hat':          playHat(this.ctx, t, g, true); break;
        case 'hat-open':     playHat(this.ctx, t, g, false); break;
        case 'ride':         playRide(this.ctx, t, g); break;
        case 'click':        playClick(this.ctx, t, g, false); break;
        case 'click-accent': playClick(this.ctx, t, g, true); break;
      }
    }
  }

  private advanceSlot() {
    const { bpm, groove, timeSig } = this.state;
    // Simple meters: the engine "beat" is a quarter (60/bpm). Compound
    // meters (6/8, 12/8): BPM is the felt dotted-quarter, the grid unit
    // is the eighth = (60/bpm)/3, so a bar of `beatsPerBar` eighths lands
    // at the right duration (matches the count-in).
    const secondsPerBeat = isCompoundMeter(timeSig) ? (60 / bpm) / 3 : 60 / bpm;
    const slotsPerBeat = 4;
    const baseSlotDur = secondsPerBeat / slotsPerBeat;
    const beatsPerBar = TIME_SIG_BEATS[timeSig];
    const totalSlots = beatsPerBar * slotsPerBeat;
    const swing = groove === 'jazz-swing' || groove === 'shuffle';
    // Swing: the 2nd and 4th 16ths within each beat land on the
    // second triplet position instead of the square grid.
    let dur = baseSlotDur;
    if (swing) {
      const within = this.currentSlot % 4;
      // Triplet ratios — 2:1 swing gives 2/3 + 1/3 of a beat for the
      // two 8th positions; 16th shuffle smooths toward the 8th grid
      // so we apply to pairs of slots.
      if (within === 0) dur = secondsPerBeat * (2 / 3) / 2;
      else if (within === 1) dur = secondsPerBeat * (2 / 3) / 2;
      else if (within === 2) dur = secondsPerBeat * (1 / 3) / 2;
      else dur = secondsPerBeat * (1 / 3) / 2;
    }
    this.nextNoteTime += dur;
    this.currentSlot = (this.currentSlot + 1) % totalSlots;
  }

  // --- Tap tempo ----------------------------------------------------
  private tapTimes: number[] = [];
  tap() {
    const now = performance.now();
    this.tapTimes.push(now);
    // Keep the last 5 taps, discard anything older than 3 seconds.
    this.tapTimes = this.tapTimes.filter(t => now - t <= 3000).slice(-5);
    if (this.tapTimes.length < 2) return;
    const intervals: number[] = [];
    for (let i = 1; i < this.tapTimes.length; i++) {
      intervals.push(this.tapTimes[i] - this.tapTimes[i - 1]);
    }
    const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const bpm = Math.round(60000 / avg);
    if (bpm >= 40 && bpm <= 220) {
      this.update({ bpm });
    }
  }
}

// Global singleton. Everyone who needs the metronome imports from
// here; there's only ever one instance running per tab.
export const metronome = new Metronome();

// Eagerly restore the user's last-used settings so the FIRST use of the
// metronome in a session (compact banner toggle, drill auto-start, or
// the audio panel) reflects the saved style — not the 'click' default.
// MetronomeControl also hydrates on mount and writes changes back; this
// runs once at module load so the singleton is correct even if that
// panel is never opened. Fire-and-forget — on any failure the
// DEFAULT_STATE stands.
void (async () => {
  try {
    const [bpm, groove, timeSig, volume] = await Promise.all([
      getPref<number>(PREF_BPM, DEFAULT_STATE.bpm),
      getPref<GrooveId>(PREF_GROOVE, DEFAULT_STATE.groove),
      getPref<TimeSig>(PREF_TIME_SIG, DEFAULT_STATE.timeSig),
      getPref<number>(PREF_VOLUME, DEFAULT_STATE.volume),
    ]);
    metronome.update({
      bpm: Math.max(40, Math.min(220, bpm)),
      groove: groove in GROOVE_LABEL ? groove : DEFAULT_STATE.groove,
      timeSig: timeSig in TIME_SIG_BEATS ? timeSig : DEFAULT_STATE.timeSig,
      volume: Math.max(0, Math.min(1, volume)),
    });
  } catch {
    // Persistence unavailable — keep DEFAULT_STATE.
  }
})();
