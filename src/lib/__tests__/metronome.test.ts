// @vitest-environment jsdom
/**
 * Prep-flow Phase 4 — count-in schedule + countIn() behaviour.
 *
 * buildCountInSchedule is pure (no timers, no audio) so the meter /
 * position / accent logic is asserted directly. countIn() is exercised
 * with fake timers (jsdom for window.setTimeout); there's no
 * AudioContext in this environment, so the audio path is a guarded no-op
 * and only the callback contract is observable — which is exactly the
 * surface the visual overlay depends on. fake-indexeddb satisfies the
 * metronome module's eager pref hydration on import.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildCountInSchedule,
  coerceCountInTimeSig,
  countInVoiceFor,
  metronome,
} from '../metronome';

describe('buildCountInSchedule — positions + structure', () => {
  it('4/4 is a single bar counting up: 1 · 2 · 3 · play', () => {
    const s = buildCountInSchedule('4/4', 120);
    expect(s.totalBeats).toBe(4);
    expect(s.totalBars).toBe(1);
    expect(s.beatsPerBar).toBe(4);
    expect(s.beats.map(b => b.position)).toEqual([1, 2, 3, 4]);
    expect(s.beats.every(b => b.bar === 1)).toBe(true);
    expect(s.intervalMs).toBe(500); // quarter-note at 120 BPM
  });

  it('3/4 is two bars: 1 2 3 · 1 2 play', () => {
    const s = buildCountInSchedule('3/4', 120);
    expect(s.totalBeats).toBe(6);
    expect(s.totalBars).toBe(2);
    expect(s.beats.map(b => b.position)).toEqual([1, 2, 3, 1, 2, 3]);
    expect(s.beats.map(b => b.bar)).toEqual([1, 1, 1, 2, 2, 2]);
  });

  it('5/4 (simple): two bars of five, quarter-note interval', () => {
    const s = buildCountInSchedule('5/4', 120);
    expect(s.totalBeats).toBe(10);
    expect(s.beats.map(b => b.position)).toEqual([1, 2, 3, 4, 5, 1, 2, 3, 4, 5]);
    expect(s.intervalMs).toBe(500);
  });

  it('7/8 is treated as simple (7 not divisible by 3): quarter-note interval', () => {
    const s = buildCountInSchedule('7/8', 120);
    expect(s.totalBeats).toBe(14);
    expect(s.intervalMs).toBe(500);
  });

  it('2/4: two short bars — 1 2 · 1 play', () => {
    const s = buildCountInSchedule('2/4', 120);
    expect(s.beats.map(b => b.position)).toEqual([1, 2, 1, 2]);
    expect(s.beats.map(b => b.bar)).toEqual([1, 1, 2, 2]);
  });

  it('6/8 (compound): six eighths per bar at the compound interval', () => {
    const s = buildCountInSchedule('6/8', 120);
    expect(s.totalBeats).toBe(12);
    expect(s.beats.map(b => b.position)).toEqual([1, 2, 3, 4, 5, 6, 1, 2, 3, 4, 5, 6]);
    expect(s.intervalMs).toBeCloseTo(60000 / (120 * 1.5), 5);
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

describe('buildCountInSchedule — "play" on the final beat', () => {
  it('flags exactly one GO beat, always the last one', () => {
    for (const ts of ['4/4', '3/4', '2/4', '6/8', '5/4', '7/8'] as const) {
      const s = buildCountInSchedule(ts, 100);
      const goIdx = s.beats.findIndex(b => b.isGo);
      expect(goIdx).toBe(s.beats.length - 1);
      expect(s.beats.filter(b => b.isGo)).toHaveLength(1);
    }
  });

  it('the play beat is the downbeat-N position of the final bar', () => {
    // 4/4 single bar → position 4 of bar 1.
    const s44 = buildCountInSchedule('4/4', 120);
    expect(s44.beats.at(-1)).toMatchObject({ position: 4, bar: 1, isGo: true });
    // 3/4 two bars → position 3 of bar 2.
    const s34 = buildCountInSchedule('3/4', 120);
    expect(s34.beats.at(-1)).toMatchObject({ position: 3, bar: 2, isGo: true });
  });
});

describe('buildCountInSchedule — metric accent tagging', () => {
  it('tags each beat with the meter accent pattern (repeated per bar)', () => {
    const cases: Record<string, ('strong' | 'medium' | 'weak')[]> = {
      '4/4': ['strong', 'weak', 'medium', 'weak'],
      '3/4': ['strong', 'weak', 'weak'],
      '2/4': ['strong', 'weak'],
      '6/8': ['strong', 'weak', 'weak', 'medium', 'weak', 'weak'],
      '5/4': ['strong', 'weak', 'weak', 'medium', 'weak'],
      '7/8': ['strong', 'weak', 'medium', 'weak', 'medium', 'weak', 'weak'],
    };
    for (const [ts, pattern] of Object.entries(cases)) {
      const s = buildCountInSchedule(ts as Parameters<typeof buildCountInSchedule>[0], 120);
      const perBar = ts === '4/4' ? pattern : [...pattern, ...pattern];
      expect(s.beats.map(b => b.accent)).toEqual(perBar);
    }
  });

  it('beat 1 is always strong; the play beat keeps its position accent', () => {
    const s = buildCountInSchedule('4/4', 120);
    expect(s.beats[0].accent).toBe('strong');
    // 4/4 position 4 is weak per the pattern, even though it is the play beat.
    expect(s.beats.at(-1)).toMatchObject({ isGo: true, accent: 'weak' });
  });
});

describe('count-in voice (two-sound model)', () => {
  it('maps strong + medium to kick, weak to click', () => {
    expect(countInVoiceFor('strong')).toBe('kick');
    expect(countInVoiceFor('medium')).toBe('kick');
    expect(countInVoiceFor('weak')).toBe('click');
  });

  it('produces the right kick/click feel per meter (one bar)', () => {
    const feel: Record<string, ('kick' | 'click')[]> = {
      '4/4': ['kick', 'click', 'kick', 'click'],
      '3/4': ['kick', 'click', 'click'],
      '2/4': ['kick', 'click'],
      '6/8': ['kick', 'click', 'click', 'kick', 'click', 'click'],
      '5/4': ['kick', 'click', 'click', 'kick', 'click'],
      '7/8': ['kick', 'click', 'kick', 'click', 'kick', 'click', 'click'],
    };
    for (const [ts, voices] of Object.entries(feel)) {
      const s = buildCountInSchedule(ts as Parameters<typeof buildCountInSchedule>[0], 120);
      const bar1 = s.beats.filter(b => b.bar === 1).map(b => countInVoiceFor(b.accent));
      expect(bar1).toEqual(voices);
    }
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

  it('fires onTick(position, bar, accent) for every count beat then onGo once', () => {
    const onTick = vi.fn();
    const onGo = vi.fn();
    metronome.countIn('4/4', 120, { onTick, onGo });

    // 1 (0ms), 2 (500), 3 (1000) are clicks; play is beat 4 at 1500ms.
    vi.advanceTimersByTime(1000);
    expect(onTick.mock.calls).toEqual([
      [1, 1, 'strong'],
      [2, 1, 'weak'],
      [3, 1, 'medium'],
    ]);
    expect(onGo).not.toHaveBeenCalled();

    vi.advanceTimersByTime(500);
    expect(onTick).toHaveBeenCalledTimes(3);
    expect(onGo).toHaveBeenCalledTimes(1);
  });

  it('walks both bars of a two-bar meter, play replacing the last onTick', () => {
    const onTick = vi.fn();
    const onGo = vi.fn();
    metronome.countIn('3/4', 120, { onTick, onGo });
    vi.advanceTimersByTime(6 * 500);
    expect(onTick.mock.calls).toEqual([
      [1, 1, 'strong'], [2, 1, 'weak'], [3, 1, 'weak'],
      [1, 2, 'strong'], [2, 2, 'weak'],
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
    expect(metronome.state.playing).toBe(false);
    cancel();
    expect(metronome.state.playing).toBe(false);
  });
});
