import { describe, expect, it } from 'vitest';
import { formatClock } from '../sessionClock';
import {
  DEFAULT_DRILL_SECONDS,
  DRILL_LENGTHS,
  isTooShort,
  newDraft,
} from '../drillModel';
import {
  CHORD_RATE_OPTIONS,
  SCALE_RATE_OPTIONS,
  TARGET_RATES,
  VOICE_LEADING_RATE_OPTIONS,
  isAtTarget,
  rateFor,
  type DrillSurface,
} from '../surfaces';
import {
  chordShapeSurface, scaleSurface, voiceLeadingSurface,
} from '../makeSurfaces';

/**
 * The arithmetic behind the drill setup, the clock's face, and what
 * each surface is allowed to differ on.
 *
 * The STEP FLOW is deliberately not tested here. It is the thing the
 * prototype exists to settle and the thing Silas walks by hand against
 * it; a test asserting the order of five screens would pin my reading
 * of the prototype rather than the prototype.
 */

const chord = chordShapeSurface({
  cellLabel: 'Cmaj7', skillLabel: 'Root position · Left',
  skill: { id: 's', kind: 'chord-shape', label: '', createdAt: 0 },
  drillType: {
    id: 't', skillId: 's', name: '', suggestedSeconds: 60, order: 0,
    repCount: 0, totalSeconds: 0, lastPracticedAt: null,
  },
  hand: 'left',
});
const scale = scaleSurface({
  cellLabel: 'C Major Scale', skillLabel: 'Left Hand',
  itemRef: 'scale:major:C', hand: 'left',
});
const vl = voiceLeadingSurface({
  cellLabel: 'Major 2–5–1 in E♭', skillLabel: 'Guide Tones · Position 1',
  itemRef: 'vl:major-251:level1:A:Eb',
});

describe('the rate each surface runs at', () => {
  it('chord shapes divide: more beats per shape is SLOWER', () => {
    expect(rateFor(chord, 60, 1)).toBe(60);
    expect(rateFor(chord, 60, 2)).toBe(30);
    expect(rateFor(chord, 120, 2)).toBe(60);
  });

  it('voice leading divides too — a chord change is like a shape', () => {
    expect(rateFor(vl, 60, 1)).toBe(60);
    expect(rateFor(vl, 120, 4)).toBe(30);
  });

  it('scales MULTIPLY: more notes per beat is FASTER', () => {
    // THE ONE THAT INVERTS, and the reason the surface carries the sum
    // rather than the caller flipping a sign. On a scale you are
    // quicker than the click, not slower than it.
    expect(rateFor(scale, 60, 1)).toBe(60);
    expect(rateFor(scale, 60, 4)).toBe(240);
    expect(rateFor(scale, 120, 2)).toBe(240);
  });

  it('rounds rather than truncating', () => {
    expect(rateFor(chord, 90, 4)).toBe(23);
  });
});

describe('at target, per surface', () => {
  it('clears at the boundary, not just above it', () => {
    // The defaults land exactly on the chord target, so an exclusive
    // comparison would open every drill reading BELOW TARGET.
    expect(isAtTarget(chord, TARGET_RATES['chord-shapes'], 1)).toBe(true);
    expect(isAtTarget(chord, TARGET_RATES['chord-shapes'] - 1, 1)).toBe(false);
  });

  it('holds scales to a much higher number, and four notes a beat reaches it', () => {
    expect(TARGET_RATES.scales).toBe(240);
    expect(isAtTarget(scale, 60, 1)).toBe(false);   // 60 notes a minute
    expect(isAtTarget(scale, 60, 4)).toBe(true);    // 240
  });

  it('holds voice leading to the chord-shape number', () => {
    expect(TARGET_RATES['voice-leading']).toBe(TARGET_RATES['chord-shapes']);
  });
});

describe('what each surface is allowed to differ on', () => {
  const surfaces: Array<[string, DrillSurface]> = [
    ['chord shapes', chord], ['scales', scale], ['voice leading', vl],
  ];

  it('only chord shapes ask for a style', () => {
    expect(chord.hasStyle).toBe(true);
    expect(scale.hasStyle).toBe(false);
    expect(vl.hasStyle).toBe(false);
  });

  it('each counts its rate in its own words', () => {
    expect(chord.rateLabel).toBe('changes a minute');
    expect(scale.rateLabel).toBe('notes a minute');
    expect(vl.rateLabel).toBe('chord changes a minute');
  });

  it('each offers its own options, and every option has a per', () => {
    expect(chord.rateOptions).toBe(CHORD_RATE_OPTIONS);
    expect(scale.rateOptions).toBe(SCALE_RATE_OPTIONS);
    expect(vl.rateOptions).toBe(VOICE_LEADING_RATE_OPTIONS);
    for (const [, s] of surfaces) {
      expect(s.rateOptions.length).toBeGreaterThan(0);
      for (const o of s.rateOptions) expect(o.per).toBeGreaterThan(0);
    }
  });

  it('every surface brings its own writer', () => {
    // THE CHECK THAT KEEPS THIS ONE SHELL. A surface that needed
    // something the interface does not carry would have to fork the
    // panel; every one of them fits through `write`.
    for (const [, s] of surfaces) expect(typeof s.write).toBe('function');
  });
});

describe('what the setup screen opens on', () => {
  it('has no style picked — the reader chooses, the app does not', () => {
    expect(newDraft().style).toBeNull();
  });

  it('opens at a length that is one of the offered ones', () => {
    expect(newDraft().targetSeconds).toBe(DEFAULT_DRILL_SECONDS);
    expect(DRILL_LENGTHS).toContain(DEFAULT_DRILL_SECONDS);
  });
});

describe('the floor, per run', () => {
  it('is measured on the run, not on the session', () => {
    expect(isTooShort(29, 30)).toBe(true);
    expect(isTooShort(30, 30)).toBe(false);
  });
});


describe('the clock face', () => {
  it('shows mm:ss below an hour', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(90)).toBe('01:30');
    expect(formatClock(3599)).toBe('59:59');
  });

  it('grows an hours field rather than counting to 60-plus minutes', () => {
    expect(formatClock(3600)).toBe('1:00:00');
  });

  it('never renders a negative clock', () => {
    expect(formatClock(-5)).toBe('00:00');
  });
});
