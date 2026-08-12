import { describe, expect, it } from 'vitest';
import {
  beatNoteName,
  beatsFromSlots,
  formatDurationBeats,
  parseDurationBeats,
  slotsFromBeats,
  slotsFromDurationInput,
} from '../chordDuration';

describe('beatNoteName — the label is derived, never assumed', () => {
  it('names the note value from the time signature denominator', () => {
    expect(beatNoteName(4)).toBe('quarter notes');
    expect(beatNoteName(8)).toBe('eighth notes');
    expect(beatNoteName(2)).toBe('half notes');
    expect(beatNoteName(16)).toBe('sixteenth notes');
  });

  it('does not call an eighth-note beat a quarter note', () => {
    // 6/8: a beat IS an eighth. Hardcoding "quarter notes" would
    // replace one wrong label with another.
    expect(beatNoteName(8)).not.toContain('quarter');
  });

  it('names an unrecognised denominator honestly rather than guessing', () => {
    expect(beatNoteName(32)).toBe('1/32 notes');
  });
});

describe('the stored value is slots; the shown value is beats', () => {
  it('a full 4/4 bar reads 4, not 8', () => {
    // The complaint that started this: the field said "8 beats" for a
    // chord lasting one bar.
    expect(formatDurationBeats(8, true)).toBe('4');
    expect(beatsFromSlots(8, true)).toBe(4);
  });

  it('is unchanged on a song not using eighths', () => {
    expect(formatDurationBeats(4, false)).toBe('4');
    expect(beatsFromSlots(4, false)).toBe(4);
  });

  it('shows halves as halves', () => {
    expect(formatDurationBeats(5, true)).toBe('2½');
    expect(formatDurationBeats(3, true)).toBe('1½');
    expect(formatDurationBeats(1, true)).toBe('½');
  });

  it('makes an accidental half-beat VISIBLE instead of hiding it in an odd number', () => {
    // 5 slots used to render as the bare number "5" under a "beats"
    // label, which read as five beats and was the seed of the whole
    // cascade problem.
    expect(formatDurationBeats(5, true)).not.toBe('5');
  });
});

describe('parseDurationBeats', () => {
  it('accepts plain and decimal numbers', () => {
    expect(parseDurationBeats('2')).toBe(2);
    expect(parseDurationBeats('2.5')).toBe(2.5);
    expect(parseDurationBeats(' 3 ')).toBe(3);
  });

  it('accepts the half glyph, with and without a whole part', () => {
    expect(parseDurationBeats('2½')).toBe(2.5);
    expect(parseDurationBeats('½')).toBe(0.5);
  });

  it('accepts fractions and mixed numbers', () => {
    expect(parseDurationBeats('3/2')).toBe(1.5);
    expect(parseDurationBeats('1 1/2')).toBe(1.5);
  });

  it('returns null for input that is not a duration', () => {
    expect(parseDurationBeats('')).toBeNull();
    expect(parseDurationBeats('abc')).toBeNull();
    expect(parseDurationBeats('2x')).toBeNull();
    expect(parseDurationBeats('1/0')).toBeNull();
  });
});

describe('slotsFromDurationInput — the round trip the editor uses', () => {
  it('converts beats to slots on an eighths song', () => {
    expect(slotsFromDurationInput('4', true, 8)).toBe(8);
    expect(slotsFromDurationInput('2½', true, 8)).toBe(5);
    expect(slotsFromDurationInput('½', true, 8)).toBe(1);
  });

  it('is one-to-one when the song is not on eighths', () => {
    expect(slotsFromDurationInput('3', false, 4)).toBe(3);
  });

  it('rounds a half on a song that cannot express one', () => {
    // 2.5 beats is unrepresentable at whole-beat granularity. Rounding
    // is honest; silently truncating to 2 would not be.
    expect(slotsFromDurationInput('2.5', false, 4)).toBe(3);
  });

  it('clamps to the bar and floors at one slot', () => {
    expect(slotsFromDurationInput('99', true, 8)).toBe(8);
    expect(slotsFromBeats(0.1, true)).toBe(1);
  });

  it('returns null for unparseable or non-positive input, so the caller can leave the chord alone', () => {
    expect(slotsFromDurationInput('', true, 8)).toBeNull();
    expect(slotsFromDurationInput('nope', true, 8)).toBeNull();
    expect(slotsFromDurationInput('0', true, 8)).toBeNull();
  });

  it('round-trips every representable duration in a 4/4 bar', () => {
    for (let slots = 1; slots <= 8; slots++) {
      const shown = formatDurationBeats(slots, true);
      expect(slotsFromDurationInput(shown, true, 8)).toBe(slots);
    }
  });
});
