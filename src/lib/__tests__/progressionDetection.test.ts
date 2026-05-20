import { describe, expect, it } from 'vitest';
import { detectPatterns, type DetectChord } from '../progressionDetection';

/**
 * Lead-sheet chord-progression detection (redesign, May 2026).
 *
 * Matching is on root motion (scale degree); quality differences are
 * informational deviation notes, not match blockers. The one exception
 * is harmonic function: a chord whose EFFECTIVE tag is
 * 'secondary_dominant' can't fill a tonic/subdominant slot.
 */

// Build a DetectChord with sensible quality defaults.
function ch(
  degree: string,
  opts: Partial<Omit<DetectChord, 'degree'>> = {},
): DetectChord {
  return {
    degree,
    isMinor: opts.isMinor ?? false,
    isDominant: opts.isDominant ?? false,
    effectiveTag: opts.effectiveTag,
    barIndex: opts.barIndex ?? 0,
  };
}

describe('detectPatterns — exact / flexible matching', () => {
  it('detects a textbook ii-V-I with no deviations', () => {
    const seq = [
      ch('2', { isMinor: true, barIndex: 0 }),
      ch('5', { isDominant: true, barIndex: 1 }),
      ch('1', { barIndex: 2 }),
    ];
    const matches = detectPatterns(seq);
    const iiVI = matches.find(m => m.patternId === 'ii-V-I');
    expect(iiVI).toBeDefined();
    expect(iiVI!.numerals).toEqual(['ii', 'V', 'I']);
    expect(iiVI!.deviations).toEqual([]);
    expect(iiVI!.startBar).toBe(0);
    expect(iiVI!.endBar).toBe(2);
  });

  it('matches V-I-IV when the V is minor, noting the deviation', () => {
    // 5m7 → 1dom9(13) → 4maj7  (root motion 5-1-4)
    const seq = [
      ch('5', { isMinor: true, barIndex: 2 }),
      ch('1', { isDominant: true, barIndex: 3 }),
      ch('4', { barIndex: 4 }),
    ];
    const matches = detectPatterns(seq);
    const m = matches.find(p => p.patternId === 'V-I-IV');
    expect(m).toBeDefined();
    expect(m!.numerals).toEqual(['V', 'I', 'IV']);
    // V expected major, input minor → "V is minor". The dominant I is
    // still major-ish, so it is NOT flagged.
    expect(m!.deviations).toEqual(['V is minor']);
    expect(m!.startBar).toBe(2);
    expect(m!.endBar).toBe(4);
  });

  it('notes a dominant ii in ii-V-I', () => {
    const seq = [
      ch('2', { isDominant: true, barIndex: 0 }),
      ch('5', { isDominant: true, barIndex: 1 }),
      ch('1', { barIndex: 2 }),
    ];
    const m = detectPatterns(seq).find(p => p.patternId === 'ii-V-I');
    expect(m).toBeDefined();
    expect(m!.deviations).toEqual(['ii is dominant']);
  });

  it('emits nested matches (V-I inside V-I-IV)', () => {
    const seq = [
      ch('5', { isDominant: true, barIndex: 0 }),
      ch('1', { barIndex: 1 }),
      ch('4', { barIndex: 2 }),
    ];
    const ids = detectPatterns(seq).map(m => m.patternId);
    expect(ids).toContain('V-I-IV');
    expect(ids).toContain('V-I');
  });
});

describe('detectPatterns — secondary-dominant exclusion', () => {
  it('an untagged 1dom7 still fills the I slot (gospel tonic color)', () => {
    // V-I with a dominant tonic, no tag → matches.
    const seq = [
      ch('5', { isDominant: true, barIndex: 0 }),
      ch('1', { isDominant: true, barIndex: 1 }),
    ];
    const m = detectPatterns(seq).find(p => p.patternId === 'V-I');
    expect(m).toBeDefined();
  });

  it('a secondary_dominant-tagged chord cannot fill a tonic slot', () => {
    const seq = [
      ch('5', { isDominant: true, barIndex: 0 }),
      ch('1', { isDominant: true, effectiveTag: 'secondary_dominant', barIndex: 1 }),
    ];
    const m = detectPatterns(seq).find(p => p.patternId === 'V-I');
    expect(m).toBeUndefined();
  });

  it('secondary_ii (minor V) does not block matching, only notes it', () => {
    // I-V-vi-IV with the V tagged secondary_ii (minor). V slot is the
    // dominant family (degree 5), not tonic/subdominant, so no exclusion.
    const seq = [
      ch('1', { barIndex: 0 }),
      ch('5', { isMinor: true, effectiveTag: 'secondary_ii', barIndex: 1 }),
      ch('6', { isMinor: true, barIndex: 2 }),
      ch('4', { barIndex: 3 }),
    ];
    const m = detectPatterns(seq).find(p => p.patternId === 'I-V-vi-IV');
    expect(m).toBeDefined();
    expect(m!.deviations).toContain('V is minor');
  });
});

describe('detectPatterns — rotation', () => {
  it('detects a rotation of the I-V-vi-IV loop', () => {
    // vi-IV-I-V is the same loop, different entry point.
    const seq = [
      ch('6', { isMinor: true, barIndex: 0 }),
      ch('4', { barIndex: 1 }),
      ch('1', { barIndex: 2 }),
      ch('5', { isDominant: true, barIndex: 3 }),
    ];
    const m = detectPatterns(seq).find(p => p.patternId === 'I-V-vi-IV');
    expect(m).toBeDefined();
    expect(m!.numerals).toEqual(['vi', 'IV', 'I', 'V']);
  });
});

describe('detectPatterns — guards', () => {
  it('returns nothing for a single chord', () => {
    expect(detectPatterns([ch('1')])).toEqual([]);
  });

  it('returns nothing for an empty sequence', () => {
    expect(detectPatterns([])).toEqual([]);
  });

  it('maps bar positions from the matched chords', () => {
    const seq = [
      ch('1', { barIndex: 5 }),
      ch('4', { barIndex: 6 }),
    ];
    const m = detectPatterns(seq).find(p => p.patternId === 'I-IV');
    expect(m).toBeDefined();
    expect(m!.startBar).toBe(5);
    expect(m!.endBar).toBe(6);
  });
});
