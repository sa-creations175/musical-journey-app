// @vitest-environment jsdom
/**
 * Phase 2 step 7e — pure-helper tests for the expanded
 * feasibility detail formatters.
 *
 * jsdom env required because the helpers transitively import
 * progress.ts → db.ts (touches `window` under an
 * `import.meta.env.DEV` guard). Same pattern as
 * yearlyAnchorReview.test.ts.
 */
import { describe, it, expect } from 'vitest';
import {
  feasibilityDetailText,
  formatRollupBreakdown,
  formatUmbrellaDetail,
  isAllUnrecoverableRollup,
} from '../feasibilityDetail';
import {
  UNRECOVERABLE_MESSAGE,
  type GoalFeasibility,
  type GoalFeasibilityStatus,
} from '../progress';

const emptyBreakdown: Record<GoalFeasibilityStatus, number> = {
  on_track: 0, at_risk: 0, critical: 0, unrecoverable: 0,
};

describe('feasibilityDetailText', () => {
  it('returns the calculated recommendation for measurable goals', () => {
    const f: GoalFeasibility = {
      kind: 'measurable',
      status: 'at_risk',
      projected: 90,
      target: 100,
      currentValue: 0,
      daysRemaining: 60,
      recommendation: 'At current pace, projected to cover 90 of 100 cards by Jun 11.',
    };
    expect(feasibilityDetailText(f)).toBe(
      'At current pace, projected to cover 90 of 100 cards by Jun 11.',
    );
  });

  it('returns the motivational placeholder for aspirational goals', () => {
    const f: GoalFeasibility = {
      kind: 'aspirational',
      message: 'Every session moves you closer to this vision.',
    };
    expect(feasibilityDetailText(f)).toBe(
      'Every session moves you closer to this vision.',
    );
  });

  it('returns null for unknown feasibility', () => {
    expect(feasibilityDetailText({ kind: 'unknown' })).toBeNull();
  });

  it('returns null for missing input', () => {
    expect(feasibilityDetailText(null)).toBeNull();
  });
});

describe('formatRollupBreakdown', () => {
  it('omits zero counts', () => {
    expect(
      formatRollupBreakdown({ ...emptyBreakdown, on_track: 3 }),
    ).toBe('3 on track');
  });

  it('joins multiple non-zero counts with " · " in canonical order', () => {
    expect(
      formatRollupBreakdown({
        on_track: 2, at_risk: 1, critical: 0, unrecoverable: 1,
      }),
    ).toBe('2 on track · 1 behind pace · 1 unrecoverable');
  });

  it('uses descriptive state labels (not the pill action verbs)', () => {
    // Pills say "Pick up pace" / "Act now"; breakdown describes
    // states ("behind pace" / "urgent") because the breakdown is
    // describing children, not directing action.
    expect(
      formatRollupBreakdown({
        on_track: 0, at_risk: 1, critical: 1, unrecoverable: 0,
      }),
    ).toBe('1 behind pace · 1 urgent');
  });

  it('returns empty string when every count is zero', () => {
    expect(formatRollupBreakdown(emptyBreakdown)).toBe('');
  });
});

describe('isAllUnrecoverableRollup', () => {
  it('returns true when rollup status is null and unrecoverable count > 0', () => {
    expect(
      isAllUnrecoverableRollup({
        status: null,
        breakdown: { ...emptyBreakdown, unrecoverable: 3 },
      }),
    ).toBe(true);
  });

  it('returns false when there are actionable children', () => {
    expect(
      isAllUnrecoverableRollup({
        status: 'at_risk',
        breakdown: { ...emptyBreakdown, at_risk: 1, unrecoverable: 1 },
      }),
    ).toBe(false);
  });

  it('returns false for a fully-empty rollup (no measurable children)', () => {
    expect(
      isAllUnrecoverableRollup({ status: null, breakdown: emptyBreakdown }),
    ).toBe(false);
  });
});

describe('formatUmbrellaDetail', () => {
  it('returns the unified UNRECOVERABLE_MESSAGE when all-unrecoverable', () => {
    expect(
      formatUmbrellaDetail({
        status: null,
        breakdown: { ...emptyBreakdown, unrecoverable: 2 },
      }),
    ).toBe(UNRECOVERABLE_MESSAGE);
  });

  it('returns the breakdown summary in the mixed-status case', () => {
    expect(
      formatUmbrellaDetail({
        status: 'at_risk',
        breakdown: { on_track: 2, at_risk: 1, critical: 0, unrecoverable: 0 },
      }),
    ).toBe('2 on track · 1 behind pace');
  });

  it('returns null for an empty rollup (no measurable children)', () => {
    expect(
      formatUmbrellaDetail({ status: null, breakdown: emptyBreakdown }),
    ).toBeNull();
  });

  it('returns the breakdown when one unrecoverable sits alongside actionable children', () => {
    // 6h.2 rule: unrecoverable doesn't pull the umbrella down,
    // it just appears in the breakdown count alongside everyone
    // else. Unified message is reserved for the all-
    // unrecoverable case at the umbrella level.
    expect(
      formatUmbrellaDetail({
        status: 'on_track',
        breakdown: { on_track: 1, at_risk: 0, critical: 0, unrecoverable: 1 },
      }),
    ).toBe('1 on track · 1 unrecoverable');
  });
});
