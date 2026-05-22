// Session chimes — short Web Audio cues that live alongside (but
// distinct from) the metronome click. Built on the same `ensureRunning`
// audio foundation so no samples are needed and the module import stays
// cheap.
//
// Phase 4 of the prep-flow redesign ships the GO chime (drill start).
// The 10-second warning and drill-end chimes (Phase 5) will join it
// here.

import { ensureRunning } from './audio';

/**
 * Count-in "kick" — the strong/medium beats of the lead-in. A short,
 * clean low thump: a fixed ~80 Hz sine (no pitch sweep, so there's no
 * perceived movement between beats) with a quick ~50 ms decay to
 * silence. A 2 ms gain ramp up from 0 avoids an onset click, and the
 * fast tail means the kick lands and gets out of the way before the
 * next beat.
 *
 * Caller supplies an already-running context + an absolute start time
 * (the count-in schedules each beat on the audio clock). `volume` is the
 * metronome volume so the count-in tracks the user's level.
 */
export function playCountKick(ctx: AudioContext, t: number, volume: number): OscillatorNode {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(80, t);
  // Clean onset (ramp from 0) → fast exponential decay to silence (~50 ms).
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(Math.max(0.0001, volume), t + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.06);
  // Returned so a caller (the count-in) can stop it early on bypass.
  return osc;
}

/**
 * Count-in "click" — the weak beats. A short, light high-frequency click
 * (~1000 Hz) with a quick ~40 ms decay. Neutral, sits under the kick.
 * Scaled by the metronome volume.
 */
export function playCountClick(ctx: AudioContext, t: number, volume: number): OscillatorNode {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.value = 1000;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(volume * 0.5, t + 0.001);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.05);
  return osc;
}

/**
 * GO chime — a distinct, resonant tone that marks the downbeat where a
 * drill begins. Deliberately a different timbre and a longer decay than
 * the metronome's square-wave click (a triangle fundamental at ~880 Hz
 * plus a quieter octave-and-a-fifth partial) so it reads as "start now"
 * rather than "another beat".
 *
 * `volume` scales the chime so it tracks the metronome's volume (a
 * volume of 0 ⇒ effectively muted). Self-contained and gesture-safe:
 * it awaits `ensureRunning()` internally and swallows the no-Web-Audio
 * case (tests / unsupported browsers) so callers never have to guard.
 */
export function scheduleGoChime(
  ctx: AudioContext,
  t: number,
  volume = 0.5,
): OscillatorNode[] {
  const partials: Array<{ freq: number; gain: number; decay: number }> = [
    { freq: 880, gain: 0.6, decay: 0.4 },
    { freq: 1320, gain: 0.25, decay: 0.32 },
  ];

  const oscs: OscillatorNode[] = [];
  for (const p of partials) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(p.freq, t);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(Math.max(0.0001, volume * p.gain), t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + p.decay);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + p.decay + 0.05);
    oscs.push(osc);
  }
  return oscs;
}

/** Self-contained GO chime — resolves the AudioContext and plays
 *  immediately. Used for one-off cues (non-keyboard Ready, count-in
 *  bypass). The count-in itself schedules the chime on the audio clock
 *  via `scheduleGoChime`. */
export async function playGoChime(volume = 0.5): Promise<void> {
  try {
    const ctx = await ensureRunning();
    scheduleGoChime(ctx, ctx.currentTime + 0.02, volume);
  } catch {
    // No AudioContext (tests / unsupported) — the chime is purely
    // decorative, so a silent no-op is the right fallback.
  }
}
