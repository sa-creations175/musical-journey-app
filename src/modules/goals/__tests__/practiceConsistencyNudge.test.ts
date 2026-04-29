// @vitest-environment jsdom
/**
 * Phase 2 step 5c.6 contract tests for `practiceConsistencyNudge`.
 * Non-blocking validation that fires when the meta-habit's three
 * inputs are mutually inconsistent. Pure function so the rule is
 * unit-testable without React state.
 *
 * Two violation classes:
 *   1. aspiration < weeklyFloor — "ideal" below "minimum"
 *   2. monthlyFloor < weeklyFloor × 4 — monthly safety-net wouldn't
 *      survive four weeks of hitting the weekly floor exactly
 *
 * jsdom env required because YearlyAnchorFlow.tsx imports the
 * dimensions module which transitively pulls db.ts. Same pattern
 * as songCumulativeNudge.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { practiceConsistencyNudge } from '../YearlyAnchorFlow';

describe('practiceConsistencyNudge', () => {
  it('returns null for the spec defaults (4 / 18 / 5)', () => {
    expect(practiceConsistencyNudge({
      weeklyFloor: 4, monthlyFloor: 18, aspiration: 5,
    })).toBeNull();
  });

  it('returns null when aspiration ≥ weeklyFloor and monthlyFloor ≥ weeklyFloor × 4', () => {
    expect(practiceConsistencyNudge({
      weeklyFloor: 5, monthlyFloor: 22, aspiration: 7,
    })).toBeNull();
  });

  it('returns null on the boundary (monthlyFloor === weeklyFloor × 4 exactly)', () => {
    expect(practiceConsistencyNudge({
      weeklyFloor: 5, monthlyFloor: 20, aspiration: 5,
    })).toBeNull();
  });

  it('returns null when aspiration === weeklyFloor (boundary case)', () => {
    expect(practiceConsistencyNudge({
      weeklyFloor: 4, monthlyFloor: 18, aspiration: 4,
    })).toBeNull();
  });

  it('returns null for all-zero inputs (user hasn\'t filled in)', () => {
    expect(practiceConsistencyNudge({
      weeklyFloor: 0, monthlyFloor: 0, aspiration: 0,
    })).toBeNull();
  });

  it('fires when aspiration < weeklyFloor', () => {
    const result = practiceConsistencyNudge({
      weeklyFloor: 5, monthlyFloor: 22, aspiration: 3,
    });
    expect(result).not.toBeNull();
    expect(result).toContain('aspiration (3/week)');
    expect(result).toContain('weekly floor (5/week)');
  });

  it('fires when monthlyFloor < weeklyFloor × 4', () => {
    const result = practiceConsistencyNudge({
      weeklyFloor: 5, monthlyFloor: 10, aspiration: 5,
    });
    expect(result).not.toBeNull();
    expect(result).toContain('monthly floor (10/month)');
    expect(result).toContain('5 × 4 = 20 days');
  });

  it('fires with both violations as a single combined message', () => {
    // weeklyFloor 5, aspiration 3 (violates), monthlyFloor 12 (12 < 20).
    const result = practiceConsistencyNudge({
      weeklyFloor: 5, monthlyFloor: 12, aspiration: 3,
    });
    expect(result).not.toBeNull();
    expect(typeof result).toBe('string');
    expect(result).toContain('aspiration (3/week)');
    expect(result).toContain('monthly floor (12/month)');
    // Single combined message joined with " and "
    expect(result).toMatch(/and/);
  });

  it('does not fire on the loose default (4 / 16 / 4) — exactly weeklyFloor × 4', () => {
    expect(practiceConsistencyNudge({
      weeklyFloor: 4, monthlyFloor: 16, aspiration: 4,
    })).toBeNull();
  });

  it('fires on (4 / 15 / 4) — 15 < 16, just below the boundary', () => {
    const result = practiceConsistencyNudge({
      weeklyFloor: 4, monthlyFloor: 15, aspiration: 4,
    });
    expect(result).not.toBeNull();
    expect(result).toContain('15/month');
    expect(result).toContain('4 × 4 = 16 days');
  });

  it('returns the nudge as a string ending with the safety-net framing', () => {
    const result = practiceConsistencyNudge({
      weeklyFloor: 5, monthlyFloor: 12, aspiration: 3,
    });
    expect(result).toContain('Floor is a safety net');
    expect(result).toContain('aspiration is the ideal');
  });
});
