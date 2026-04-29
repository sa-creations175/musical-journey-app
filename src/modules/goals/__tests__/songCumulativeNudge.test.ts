// @vitest-environment jsdom
/**
 * Phase 2 step 5c.4 contract tests for `songCumulativeNudge`. The
 * non-blocking validation that fires when Songs Breadth/Depth/
 * Mastery counts violate the cumulative ordering (Internalized ≤
 * Solid ≤ Comfortable). Pure function so the rule is unit-testable
 * without React state — the rendered surface is presentational.
 *
 * jsdom env required because YearlyAnchorFlow.tsx imports the
 * dimensions module which transitively pulls db.ts (touches
 * `window` under an `import.meta.env.DEV` guard). Same pattern as
 * progress.test.ts and yearlyAnchorDimensions.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { songCumulativeNudge } from '../YearlyAnchorFlow';

const consistency = { count: 4, cadence: 'week' as const };

describe('songCumulativeNudge', () => {
  it('returns null for all-zero counts', () => {
    expect(songCumulativeNudge({
      breadthCount: 0, depthCount: 0, masteryCount: 0, consistency,
    })).toBeNull();
  });

  it('returns null for cumulative-ordered counts (5 / 3 / 1)', () => {
    expect(songCumulativeNudge({
      breadthCount: 5, depthCount: 3, masteryCount: 1, consistency,
    })).toBeNull();
  });

  it('returns null for equal counts (5 / 5 / 5) — coherent edge case', () => {
    // 5/5/5 means "all 5 songs at every level" — unusual but
    // coherent. The user is committing to a single set they want
    // to bring all the way to Internalized.
    expect(songCumulativeNudge({
      breadthCount: 5, depthCount: 5, masteryCount: 5, consistency,
    })).toBeNull();
  });

  it('returns null for partial fills with deeper levels at zero (5 / 3 / 0)', () => {
    expect(songCumulativeNudge({
      breadthCount: 5, depthCount: 3, masteryCount: 0, consistency,
    })).toBeNull();
  });

  it('returns null for "consistency-only this year" (0 / 0 / 0)', () => {
    expect(songCumulativeNudge({
      breadthCount: 0, depthCount: 0, masteryCount: 0, consistency,
    })).toBeNull();
  });

  it('returns a nudge when Mastery > Depth (3 / 1 / 2)', () => {
    const result = songCumulativeNudge({
      breadthCount: 3, depthCount: 1, masteryCount: 2, consistency,
    });
    expect(result).not.toBeNull();
    expect(result).toContain('3 comfortable');
    expect(result).toContain('1 solid');
    expect(result).toContain('2 internalized');
  });

  it('returns a nudge when Depth > Breadth (1 / 3 / 0)', () => {
    const result = songCumulativeNudge({
      breadthCount: 1, depthCount: 3, masteryCount: 0, consistency,
    });
    expect(result).not.toBeNull();
    expect(result).toContain('1 comfortable');
    expect(result).toContain('3 solid');
  });

  it('returns a single combined nudge when both relationships are violated', () => {
    // Both Mastery > Depth (5 > 2) AND Depth > Breadth (2 > 1).
    // Per the design call: gentle non-blocking nudge, not a stack
    // of scolding lines — should be one combined message.
    const result = songCumulativeNudge({
      breadthCount: 1, depthCount: 2, masteryCount: 5, consistency,
    });
    expect(result).not.toBeNull();
    // Single string, not an array.
    expect(typeof result).toBe('string');
    // Contains all three numbers in the canonical order.
    expect(result).toContain('1 comfortable');
    expect(result).toContain('2 solid');
    expect(result).toContain('5 internalized');
  });

  it('returns a nudge when only Mastery > Comfortable (transitively, via 0 Depth)', () => {
    // Edge case: Comfortable = 1, Solid = 0, Internalized = 3.
    // Mastery (3) > Depth (0) — fires. The transitive
    // Internalized > Comfortable case is implicitly covered by the
    // pairwise checks; we don't separately check `i > c`.
    const result = songCumulativeNudge({
      breadthCount: 1, depthCount: 0, masteryCount: 3, consistency,
    });
    expect(result).not.toBeNull();
  });

  it('does not fire on Mastery = Depth = Breadth (boundary case 7 / 7 / 7)', () => {
    expect(songCumulativeNudge({
      breadthCount: 7, depthCount: 7, masteryCount: 7, consistency,
    })).toBeNull();
  });

  it('does not fire on Mastery < Depth and Depth = Breadth (5 / 5 / 3)', () => {
    expect(songCumulativeNudge({
      breadthCount: 5, depthCount: 5, masteryCount: 3, consistency,
    })).toBeNull();
  });
});
