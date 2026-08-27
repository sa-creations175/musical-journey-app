import { describe, expect, it } from 'vitest';
import { formatClock } from '../sessionClock';
import {
  CHORD_RATE_OPTIONS,
  CHORD_TARGET_RATE,
  DEFAULT_DRILL_SECONDS,
  DRILL_LENGTHS,
  isAtTarget,
  newDraft,
  rateFor,
} from '../drillModel';

/**
 * The arithmetic behind the drill setup, and the clock's face.
 *
 * The STEP FLOW is deliberately not tested here. It is the thing the
 * prototype exists to settle and the thing Silas walks by hand against
 * it; a test asserting the order of four screens would pin my reading
 * of the prototype rather than the prototype.
 */

describe('the rate a drill runs at', () => {
  it('is the click divided by how many beats a shape gets', () => {
    expect(rateFor(60, 1)).toBe(60);
    expect(rateFor(120, 2)).toBe(60);
    expect(rateFor(120, 4)).toBe(30);
  });

  it('rounds rather than truncating, so 90 over 4 is not 22', () => {
    expect(rateFor(90, 4)).toBe(23);
  });

  it('clears the target at the boundary, not just above it', () => {
    // AT TARGET IS `>=`, and the boundary is the case that matters:
    // the setup screen's defaults land exactly on 60, so an exclusive
    // comparison would open every drill reading BELOW TARGET.
    expect(rateFor(CHORD_TARGET_RATE, 1)).toBe(CHORD_TARGET_RATE);
    expect(isAtTarget(CHORD_TARGET_RATE, 1)).toBe(true);
    expect(isAtTarget(CHORD_TARGET_RATE - 1, 1)).toBe(false);
  });

  it('reads below target when a shape is given more beats at one tempo', () => {
    expect(isAtTarget(120, 1)).toBe(true);
    expect(isAtTarget(120, 2)).toBe(true);   // 60 — exactly the target
    expect(isAtTarget(120, 4)).toBe(false);  // 30
  });
});

describe('what the setup screen opens on', () => {
  it('has no manner picked — the reader chooses, the app does not', () => {
    // `Start Drill` is disabled until this is answered. A default
    // would be the app deciding how the shape is played and recording
    // it as though the reader had.
    expect(newDraft().manner).toBeNull();
  });

  it('opens at a length that is one of the offered ones', () => {
    expect(newDraft().targetSeconds).toBe(DEFAULT_DRILL_SECONDS);
    expect(DRILL_LENGTHS).toContain(DEFAULT_DRILL_SECONDS);
  });

  it('opens at a rate that is one of the offered ones', () => {
    const beats = newDraft().beatsPerShape;
    expect(CHORD_RATE_OPTIONS.map(o => o.beatsPerShape)).toContain(beats);
  });
});

describe('the clock face', () => {
  it('shows mm:ss below an hour', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(9)).toBe('00:09');
    expect(formatClock(90)).toBe('01:30');
    expect(formatClock(3599)).toBe('59:59');
  });

  it('grows an hours field rather than counting to 60-plus minutes', () => {
    expect(formatClock(3600)).toBe('1:00:00');
    expect(formatClock(3661)).toBe('1:01:01');
  });

  it('never renders a negative clock', () => {
    // The drill countdown floors at zero, but the face is shared with
    // the session clock and a clock that could read -00:01 would be a
    // bug the reader sees before anyone else does.
    expect(formatClock(-5)).toBe('00:00');
  });
});
