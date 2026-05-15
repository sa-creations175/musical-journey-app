// @vitest-environment jsdom
/**
 * Phase B Step 9b — carry-over banner state helpers.
 *
 * Persistence on localStorage, keyed implicitly by the calendar
 * month. Month rollover (Jan → Dec / next year) invalidates last
 * month's decisions automatically — the helper reads `monthKey` and
 * returns "fresh" if the stored key doesn't match.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  _resetCarryoverBannerStateForTests,
  currentMonthKey,
  dismissBannerForMonth,
  isBannerDismissedForMonth,
  loadCarryoverDecisions,
  pendingModulesForBanner,
  saveCarryoverDecisions,
} from '../carryoverBannerState';

beforeEach(() => {
  _resetCarryoverBannerStateForTests();
});

// =====================================================================
// currentMonthKey
// =====================================================================

describe('currentMonthKey', () => {
  it('formats YYYY-MM for the calendar month containing the timestamp', () => {
    expect(currentMonthKey(new Date(2026, 4, 15).getTime())).toBe('2026-05');
    expect(currentMonthKey(new Date(2026, 0, 1).getTime())).toBe('2026-01');
    expect(currentMonthKey(new Date(2025, 11, 31).getTime())).toBe('2025-12');
  });
});

// =====================================================================
// Banner dismissal
// =====================================================================

describe('isBannerDismissedForMonth / dismissBannerForMonth', () => {
  it('reads false when no dismissal is stored', () => {
    expect(isBannerDismissedForMonth()).toBe(false);
  });

  it('reads true after dismissBannerForMonth is called for the current month', () => {
    dismissBannerForMonth();
    expect(isBannerDismissedForMonth()).toBe(true);
  });

  it('previous month dismissal does NOT carry into a new month', () => {
    const APRIL = new Date(2026, 3, 15).getTime();
    const MAY = new Date(2026, 4, 5).getTime();
    dismissBannerForMonth(APRIL);
    expect(isBannerDismissedForMonth(APRIL)).toBe(true);
    expect(isBannerDismissedForMonth(MAY)).toBe(false);
  });
});

// =====================================================================
// Decisions
// =====================================================================

describe('saveCarryoverDecisions / loadCarryoverDecisions', () => {
  it('loads {} when nothing is stored', () => {
    expect(loadCarryoverDecisions()).toEqual({});
  });

  it('round-trips decisions for the current month', () => {
    saveCarryoverDecisions({
      'harmonic-fluency': 'accepted',
      'ear-training':     'declined',
    });
    expect(loadCarryoverDecisions()).toEqual({
      'harmonic-fluency': 'accepted',
      'ear-training':     'declined',
    });
  });

  it('previous month decisions DO NOT carry into a new month', () => {
    const APRIL = new Date(2026, 3, 15).getTime();
    const MAY = new Date(2026, 4, 5).getTime();
    saveCarryoverDecisions({ 'harmonic-fluency': 'accepted' }, APRIL);
    expect(loadCarryoverDecisions(APRIL)).toEqual({ 'harmonic-fluency': 'accepted' });
    expect(loadCarryoverDecisions(MAY)).toEqual({});
  });
});

// =====================================================================
// pendingModulesForBanner
// =====================================================================

describe('pendingModulesForBanner', () => {
  it('returns modules without a recorded decision', () => {
    const detected = ['harmonic-fluency', 'ear-training', 'shapes-and-patterns'] as const;
    const decisions = { 'harmonic-fluency': 'accepted' } as const;
    expect(pendingModulesForBanner(detected, decisions)).toEqual([
      'ear-training', 'shapes-and-patterns',
    ]);
  });

  it('returns [] when all detected modules have decisions (banner hides)', () => {
    expect(
      pendingModulesForBanner(
        ['harmonic-fluency', 'ear-training'],
        { 'harmonic-fluency': 'accepted', 'ear-training': 'declined' },
      ),
    ).toEqual([]);
  });

  it("returns the full list when no decisions have been made", () => {
    expect(
      pendingModulesForBanner(['harmonic-fluency', 'shapes-and-patterns'], {}),
    ).toEqual(['harmonic-fluency', 'shapes-and-patterns']);
  });

  it('Decline counts as a decision (item stays in backlog, banner-wise resolved)', () => {
    expect(
      pendingModulesForBanner(['harmonic-fluency'], { 'harmonic-fluency': 'declined' }),
    ).toEqual([]);
  });
});
