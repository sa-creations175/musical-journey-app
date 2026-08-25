/**
 * The clock for a question you HEAR.
 *
 * ---------------------------------------------------------------
 * ZERO AND ABSENT MEAN DIFFERENT THINGS, AND BOTH ARE CORRECT HERE.
 *
 * Answering before the sound finishes records 0 — a true lower bound
 * on an answer that genuinely happened immediately. Answering after
 * five minutes records nothing at all — the reader walked away and
 * there is no measurement to report. Rounding the first to zero is an
 * observation; clamping the second to five minutes would be an
 * invention.
 * ---------------------------------------------------------------
 */
import { describe, expect, it } from 'vitest';
import { WALK_AWAY_CEILING_MS, contextFields, heardElapsedFields } from '../attemptTiming';
import { chordBlockedMs, chordBrokenMs, intervalPlaybackMs } from '../audio';

const ENDS = 1_700_000_000_000;

describe('measuring from the end of playback', () => {
  it('records the time after the sound stopped, not including it', () => {
    expect(heardElapsedFields(ENDS, ENDS + 1_400).elapsedMs).toBe(1_400);
  });

  it('records zero for an answer given during playback', () => {
    const fields = heardElapsedFields(ENDS, ENDS - 900);
    expect(Object.hasOwn(fields, 'elapsedMs')).toBe(true);
    expect(fields.elapsedMs).toBe(0);
  });

  it('records nothing past the walk-away ceiling', () => {
    const fields = heardElapsedFields(ENDS, ENDS + WALK_AWAY_CEILING_MS + 1);
    expect(Object.hasOwn(fields, 'elapsedMs')).toBe(false);
  });

  it('records nothing when the question was never heard', () => {
    expect(Object.hasOwn(heardElapsedFields(null, ENDS), 'elapsedMs')).toBe(false);
  });
});

describe('playback durations are derived from the players', () => {
  it('an interval is two notes, the second overlapping the first', () => {
    // dur = 0.8; second starts at 0.95 * dur and runs a full dur.
    expect(intervalPlaybackMs(1.0, 0.8)).toBeCloseTo((0.05 + 0.76 + 0.8) * 1000, 5);
  });

  it('halving the speed roughly doubles the sound', () => {
    const full = intervalPlaybackMs(1.0);
    const half = intervalPlaybackMs(0.5);
    expect(half).toBeGreaterThan(full * 1.9);
  });

  it('a broken chord is much longer than a blocked one', () => {
    // The reason playStyle goes on the row at all.
    expect(chordBrokenMs(4, 1.0, 'asc')).toBeGreaterThan(chordBlockedMs(1.0) * 0.5);
    expect(chordBrokenMs(4, 1.0, 'both')).toBeGreaterThan(chordBrokenMs(4, 1.0, 'asc'));
  });

  it('counts the apex once when a broken chord goes up and back', () => {
    // 4 notes up and down without restriking the top is 7 strikes.
    const asc = chordBrokenMs(4, 1.0, 'asc');
    const both = chordBrokenMs(4, 1.0, 'both');
    expect(both - asc).toBeCloseTo(3 * 0.4 * 1000, 5);
  });
});

describe('the context fields', () => {
  it('omits what does not apply rather than writing undefined', () => {
    const fields = contextFields({ playbackSpeed: 0.75 });
    expect(fields).toEqual({ playbackSpeed: 0.75 });
    expect(Object.hasOwn(fields, 'playStyle')).toBe(false);
    expect(Object.hasOwn(fields, 'drillTab')).toBe(false);
  });

  it('carries all three where all three apply', () => {
    expect(contextFields({
      playbackSpeed: 1, playStyle: 'broken', drillTab: 'chord-motion',
    })).toEqual({ playbackSpeed: 1, playStyle: 'broken', drillTab: 'chord-motion' });
  });

  it('keeps a speed of zero, which is a value and not an absence', () => {
    expect(contextFields({ playbackSpeed: 0 })).toEqual({ playbackSpeed: 0 });
  });
});
