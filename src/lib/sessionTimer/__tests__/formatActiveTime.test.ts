import { describe, it, expect } from 'vitest';
import { formatActiveTime } from '../formatActiveTime';

describe('formatActiveTime', () => {
  it('zero / negative / NaN floor to 0:00', () => {
    expect(formatActiveTime(0)).toBe('0:00');
    expect(formatActiveTime(-1)).toBe('0:00');
    expect(formatActiveTime(NaN)).toBe('0:00');
    expect(formatActiveTime(Infinity)).toBe('0:00');
  });

  it('renders mm:ss under one hour', () => {
    expect(formatActiveTime(1_000)).toBe('0:01');
    expect(formatActiveTime(59_000)).toBe('0:59');
    expect(formatActiveTime(60_000)).toBe('1:00');
    expect(formatActiveTime(90_000)).toBe('1:30');
    expect(formatActiveTime(59 * 60_000 + 59_000)).toBe('59:59');
  });

  it('renders h:mm:ss at and beyond one hour', () => {
    expect(formatActiveTime(60 * 60_000)).toBe('1:00:00');
    expect(formatActiveTime(60 * 60_000 + 5_000)).toBe('1:00:05');
    expect(formatActiveTime(2 * 60 * 60_000 + 3 * 60_000 + 4_000)).toBe('2:03:04');
  });

  it('floors sub-second remainders', () => {
    expect(formatActiveTime(999)).toBe('0:00');
    expect(formatActiveTime(1_999)).toBe('0:01');
  });
});
