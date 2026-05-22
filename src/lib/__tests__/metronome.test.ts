// @vitest-environment jsdom
/**
 * Prep-flow Phase 4 — count-in schedule + countIn() behaviour.
 *
 * buildCountInSchedule is pure (no timers, no audio) so the meter/tempo
 * logic is asserted directly. countIn() is exercised with fake timers
 * (jsdom for window.setTimeout); there's no AudioContext in this
 * environment, so the audio path is a guarded no-op and only the
 * callback contract is observable — which is exactly the surface the
 * visual overlay depends on. fake-indexeddb satisfies the metronome
 * module's eager pref hydration on import.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildCountInSchedule,
  coerceCountInTimeSig,
  metronome,
} from '../metronome';

describe('buildCountInSchedule', () => {
  it('4/4 is a single bar: 4 · 3 · 2 · GO', () => {
    const s = buildCountInSchedule('4/4', 120);
    expect(s.totalBeats).toBe(4);
    expect(s.beats.map(b => b.display)).toEqual([4, 3, 2, 1]);
    expect(s.beats.map(b => b.isGo)).toEqual([false, false, false, true]);
    expect(s.beats.every(b => b.bar === 1)).toBe(true);
    // Quarter-note interval at 120 BPM.
    expect(s.intervalMs).toBe(500);
    // Only the first beat (the bar's downbeat) is accented.
    expect(s.beats.map(b => b.accent)).toEqual([true, false, false, false]);
  });

  it('3/4 is two bars: 3 2 1 · 3 2 GO', () => {
    const s = buildCountInSchedule('3/4', 120);
    expect(s.totalBeats).toBe(6);
    expect(s.beats.map(b => b.display)).toEqual([3, 2, 1, 3, 2, 1]);
    expect(s.beats.map(b => b.bar)).toEqual([1, 1, 1, 2, 2, 2]);
    expect(s.beats.filter(b => b.isGo)).toHaveLength(1);
    expect(s.beats[5].isGo).toBe(true);
  });

  it('5/4 (simple): two bars of five, quarter-note interval', () => {
    const s = buildCountInSchedule('5/4', 120);
    expect(s.totalBeats).toBe(10);
    expect(s.beats.map(b => b.display)).toEqual([5, 4, 3, 2, 1, 5, 4, 3, 2, 1]);
    expect(s.intervalMs).toBe(500);
    expect(s.beats[9].isGo).toBe(true);
  });

  it('7/8 is treated as simple (7 not divisible by 3): quarter-note interval', () => {
    const s = buildCountInSchedule('7/8', 120);
    expect(s.totalBeats).toBe(14);
    expect(s.intervalMs).toBe(500);
    expect(s.beats[13].isGo).toBe(true);
  });

  it('2/4: two short bars — 2 1 · 2 GO', () => {
    const s = buildCountInSchedule('2/4', 120);
    expect(s.beats.map(b => b.display)).toEqual([2, 1, 2, 1]);
    expect(s.beats.map(b => b.bar)).toEqual([1, 1, 2, 2]);
    expect(s.beats[3].isGo).toBe(true);
  });

  it('6/8 (compound): counts six eighths per bar at the compound interval', () => {
    const s = buildCountInSchedule('6/8', 120);
    expect(s.totalBeats).toBe(12);
    expect(s.beats.map(b => b.display)).toEqual([6, 5, 4, 3, 2, 1, 6, 5, 4, 3, 2, 1]);
    // Compound eighth interval = 60000 / (BPM * 1.5).
    expect(s.intervalMs).toBeCloseTo(60000 / (120 * 1.5), 5);
    expect(s.beats[11].isGo).toBe(true);
  });

  it('GO always lands on the last beat of the final bar', () => {
    for (const ts of ['4/4', '3/4', '2/4', '6/8', '5/4', '7/8'] as const) {
      const s = buildCountInSchedule(ts, 100);
      const goIdx = s.beats.findIndex(b => b.isGo);
      expect(goIdx).toBe(s.beats.length - 1);
      expect(s.beats.filter(b => b.isGo)).toHaveLength(1);
    }
  });

  it('offsets advance by exactly one interval per beat', () => {
    const s = buildCountInSchedule('4/4', 120);
    expect(s.beats.map(b => b.offsetMs)).toEqual([0, 500, 1000, 1500]);
  });

  it('clamps absurd BPM into the metronome range', () => {
    expect(buildCountInSchedule('4/4', 5).intervalMs).toBe(60000 / 40);
    expect(buildCountInSchedule('4/4', 9999).intervalMs).toBe(60000 / 220);
  });
});

describe('coerceCountInTimeSig', () => {
  it('keeps supported picker values', () => {
    for (const ts of ['4/4', '3/4', '2/4', '6/8', '5/4', '7/8'] as const) {
      expect(coerceCountInTimeSig(ts)).toBe(ts);
    }
  });

  it('trims whitespace', () => {
    expect(coerceCountInTimeSig('  3/4 ')).toBe('3/4');
  });

  it('falls back to 4/4 for unsupported / malformed / empty', () => {
    expect(coerceCountInTimeSig('9/8')).toBe('4/4');
    expect(coerceCountInTimeSig('12/8')).toBe('4/4');
    expect(coerceCountInTimeSig('free time')).toBe('4/4');
    expect(coerceCountInTimeSig('')).toBe('4/4');
    expect(coerceCountInTimeSig(undefined)).toBe('4/4');
    expect(coerceCountInTimeSig(null)).toBe('4/4');
  });
});

describe('metronome.countIn', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    metronome.forceStop();
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('fires onTick for every count beat then onGo once, in order', () => {
    const onTick = vi.fn();
    const onGo = vi.fn();
    metronome.countIn('4/4', 120, { onTick, onGo });

    // The count starts immediately: 4 at 0ms, 3 at 500, 2 at 1000 are
    // clicks; GO is the 4th beat at 1500ms.
    vi.advanceTimersByTime(1000);
    expect(onTick.mock.calls).toEqual([[4, 1], [3, 1], [2, 1]]);
    expect(onGo).not.toHaveBeenCalled();

    vi.advanceTimersByTime(500);
    expect(onTick).toHaveBeenCalledTimes(3);
    expect(onGo).toHaveBeenCalledTimes(1);
  });

  it('fires onTick (display, bar) for both bars of a two-bar meter', () => {
    const onTick = vi.fn();
    const onGo = vi.fn();
    metronome.countIn('3/4', 120, { onTick, onGo });
    vi.advanceTimersByTime(6 * 500);
    expect(onTick.mock.calls).toEqual([
      [3, 1], [2, 1], [1, 1], [3, 2], [2, 2],
    ]);
    expect(onGo).toHaveBeenCalledTimes(1);
  });

  it('bypass: cancel() fires GO immediately and stops remaining ticks', () => {
    const onTick = vi.fn();
    const onGo = vi.fn();
    const cancel = metronome.countIn('6/8', 120, { onTick, onGo });

    vi.advanceTimersByTime(1); // only the immediate (offset-0) beat
    expect(onTick).toHaveBeenCalledTimes(1);

    cancel();
    expect(onGo).toHaveBeenCalledTimes(1);

    // No further ticks or a second GO once cancelled.
    vi.advanceTimersByTime(10_000);
    expect(onTick).toHaveBeenCalledTimes(1);
    expect(onGo).toHaveBeenCalledTimes(1);
  });

  it('reaching GO and then cancelling never double-fires onGo', () => {
    const onGo = vi.fn();
    const cancel = metronome.countIn('4/4', 120, { onTick: vi.fn(), onGo });
    vi.advanceTimersByTime(4 * 500);
    expect(onGo).toHaveBeenCalledTimes(1);
    cancel();
    expect(onGo).toHaveBeenCalledTimes(1);
  });

  it('INVARIANT: count-in never starts the continuous metronome', () => {
    expect(metronome.state.playing).toBe(false);
    const cancel = metronome.countIn('4/4', 120, { onTick: vi.fn(), onGo: vi.fn() });
    vi.advanceTimersByTime(4 * 500);
    // GO fired, but the running click was never started — the drill
    // surface owns that. The driver stack is untouched.
    expect(metronome.state.playing).toBe(false);
    cancel();
    expect(metronome.state.playing).toBe(false);
  });
});
