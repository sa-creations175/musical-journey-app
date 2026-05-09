// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  INVERSION_LABEL,
  attemptItemId,
  inversionsForIntervalCount,
  normalizeAttemptItemId,
  parseAttemptItemId,
  rotateForInversion,
} from '../inversionUtils';

describe('rotateForInversion — triads', () => {
  it('inv 0 returns root position unchanged (copy)', () => {
    const src = [0, 4, 7];
    const result = rotateForInversion(src, 0);
    expect(result).toEqual([0, 4, 7]);
    // returns a copy, not the original
    expect(result).not.toBe(src);
  });

  it('inv 1 puts the 3rd in the bass: [0,4,7] → [4,7,12]', () => {
    expect(rotateForInversion([0, 4, 7], 1)).toEqual([4, 7, 12]);
  });

  it('inv 2 puts the 5th in the bass: [0,4,7] → [7,12,16]', () => {
    expect(rotateForInversion([0, 4, 7], 2)).toEqual([7, 12, 16]);
  });

  it('out-of-range inversion clamps to root', () => {
    expect(rotateForInversion([0, 4, 7], 3)).toEqual([0, 4, 7]);
    expect(rotateForInversion([0, 4, 7], -1)).toEqual([0, 4, 7]);
  });
});

describe('rotateForInversion — sevenths', () => {
  it('inv 1: [0,4,7,10] → [4,7,10,12]', () => {
    expect(rotateForInversion([0, 4, 7, 10], 1)).toEqual([4, 7, 10, 12]);
  });

  it('inv 2: [0,4,7,10] → [7,10,12,16]', () => {
    expect(rotateForInversion([0, 4, 7, 10], 2)).toEqual([7, 10, 12, 16]);
  });

  it('inv 3: [0,4,7,10] → [10,12,16,19]', () => {
    expect(rotateForInversion([0, 4, 7, 10], 3)).toEqual([10, 12, 16, 19]);
  });
});

describe('rotateForInversion — degenerate input', () => {
  it('empty array returns empty', () => {
    expect(rotateForInversion([], 1)).toEqual([]);
  });

  it('single-note returns clone for any inversion', () => {
    expect(rotateForInversion([0], 0)).toEqual([0]);
    expect(rotateForInversion([0], 1)).toEqual([0]);
  });
});

describe('attemptItemId / parseAttemptItemId — round-trip', () => {
  it('builds the canonical "{chord}:{inv}" shape', () => {
    expect(attemptItemId('maj', 0)).toBe('maj:0');
    expect(attemptItemId('maj', 2)).toBe('maj:2');
    expect(attemptItemId('dom7', 3)).toBe('dom7:3');
  });

  it('round-trips a canonical id', () => {
    expect(parseAttemptItemId('maj:1')).toEqual({ chordId: 'maj', inversion: 1 });
    expect(parseAttemptItemId('dom7:3')).toEqual({ chordId: 'dom7', inversion: 3 });
  });

  it('legacy ids without suffix parse as inversion 0', () => {
    expect(parseAttemptItemId('maj')).toEqual({ chordId: 'maj', inversion: 0 });
  });

  it('garbage suffix coerces to inversion 0', () => {
    expect(parseAttemptItemId('maj:foo')).toEqual({ chordId: 'maj', inversion: 0 });
    expect(parseAttemptItemId('maj:9')).toEqual({ chordId: 'maj', inversion: 0 });
    expect(parseAttemptItemId('maj:-1')).toEqual({ chordId: 'maj', inversion: 0 });
  });
});

describe('normalizeAttemptItemId — read-side legacy fallback', () => {
  it('appends :0 to legacy ids', () => {
    expect(normalizeAttemptItemId('maj')).toBe('maj:0');
    expect(normalizeAttemptItemId('dom7sus4')).toBe('dom7sus4:0');
  });

  it('passes through canonical ids unchanged', () => {
    expect(normalizeAttemptItemId('maj:0')).toBe('maj:0');
    expect(normalizeAttemptItemId('maj:1')).toBe('maj:1');
  });
});

describe('inversionsForIntervalCount', () => {
  it('triad → [0,1,2]', () => {
    expect(inversionsForIntervalCount(3)).toEqual([0, 1, 2]);
  });

  it('seventh → [0,1,2,3]', () => {
    expect(inversionsForIntervalCount(4)).toEqual([0, 1, 2, 3]);
  });

  it('extensions (5+ notes) cap at 3 inversions per the type', () => {
    expect(inversionsForIntervalCount(5)).toEqual([0, 1, 2, 3]);
    expect(inversionsForIntervalCount(7)).toEqual([0, 1, 2, 3]);
  });

  it('one or two notes → expected slim sets', () => {
    expect(inversionsForIntervalCount(0)).toEqual([0]);
    expect(inversionsForIntervalCount(1)).toEqual([0]);
    expect(inversionsForIntervalCount(2)).toEqual([0, 1]);
  });
});

describe('INVERSION_LABEL', () => {
  it('exposes ordinals for 0–3', () => {
    expect(INVERSION_LABEL[0]).toBe('Root');
    expect(INVERSION_LABEL[1]).toBe('1st inversion');
    expect(INVERSION_LABEL[2]).toBe('2nd inversion');
    expect(INVERSION_LABEL[3]).toBe('3rd inversion');
  });
});
