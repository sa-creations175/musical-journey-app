// @vitest-environment jsdom
/**
 * Scope-level maintenance — the release half, and the hysteresis gap
 * between entering (>=0.90) and being suggested for release (<0.85).
 */
import { describe, expect, it } from 'vitest';
import type { PerformanceEntry } from '../../spacingState';
import {
  MAINTENANCE_ACCURACY_THRESHOLD,
  MAINTENANCE_RELEASE_THRESHOLD,
  itemBelowReleaseBar,
  itemMeetsMaintenanceBar,
  scopeShouldSuggestRelease,
  windowedAccuracy,
  type MaintenanceItemRow,
} from '../scopeMaintenance';
import {
  MAINTENANCE_DISMISSAL_QUIET_MS,
  isReleaseDismissalQuiet,
  recordForScope,
  shouldSuggestMaintenance,
  shouldSuggestRelease,
  withConfirmation,
  withDismissal,
  withRelease,
  withReleaseDismissal,
  type ScopeMaintenanceMap,
} from '../scopeMaintenanceState';

const DAY = 24 * 60 * 60 * 1000;
const BASE = new Date(2026, 0, 5, 12, 0, 0).getTime();
const KEY = 'harmonic_fluency_coverage_at_acquired';
const T0 = 1_700_000_000_000;

function attempts(n: number, days: number, wrong = 0): PerformanceEntry[] {
  return Array.from({ length: n }, (_, i) => ({
    t: BASE + (i % days) * DAY,
    kind: 'attempt' as const,
    correct: i >= wrong,
  }));
}

describe('windowedAccuracy', () => {
  it('is null on a partial buffer — no verdict, not a bad one', () => {
    expect(windowedAccuracy(attempts(19, 4))).toBeNull();
    expect(windowedAccuracy([])).toBeNull();
  });

  it('reports the fraction over the last twenty', () => {
    expect(windowedAccuracy(attempts(20, 4, 2))).toBeCloseTo(0.9);
    expect(windowedAccuracy(attempts(20, 4, 4))).toBeCloseTo(0.8);
  });
});

describe('itemBelowReleaseBar', () => {
  it('fires below 85%', () => {
    // 4 wrong of 20 = 80%.
    expect(itemBelowReleaseBar(attempts(20, 4, 4))).toBe(true);
  });

  it('does not fire exactly at 85%', () => {
    // 3 wrong of 20 = exactly 85%. The test is `< 0.85`, so this sits
    // at the bar rather than under it.
    expect(itemBelowReleaseBar(attempts(20, 4, 3))).toBe(false);
  });

  it('never fires on a partial buffer', () => {
    expect(itemBelowReleaseBar(attempts(10, 4, 10))).toBe(false);
  });

  it('ignores day spread — a decline is a decline however clustered', () => {
    // Entry would reject this for spread; release does not care.
    expect(itemBelowReleaseBar(attempts(20, 1, 6))).toBe(true);
  });
});

describe('the hysteresis gap', () => {
  it('the two thresholds are five points apart, release below entry', () => {
    expect(MAINTENANCE_RELEASE_THRESHOLD).toBeLessThan(MAINTENANCE_ACCURACY_THRESHOLD);
    expect(MAINTENANCE_ACCURACY_THRESHOLD - MAINTENANCE_RELEASE_THRESHOLD)
      .toBeCloseTo(0.05);
  });

  it('THE DEAD BAND: 86-89% neither re-qualifies nor triggers release', () => {
    // The whole point of the gap. An item sitting here produces no
    // suggestion in either direction, so a scope hovering at the bar
    // cannot alternate week to week.
    // 3 wrong of 20 = 85%: below entry's 90%, NOT below release's 85%.
    const dipped = attempts(20, 4, 3);
    expect(itemMeetsMaintenanceBar(dipped)).toBe(false);
    expect(itemBelowReleaseBar(dipped)).toBe(false);
  });

  it('a clean item qualifies for entry and never for release', () => {
    const clean = attempts(20, 4);
    expect(itemMeetsMaintenanceBar(clean)).toBe(true);
    expect(itemBelowReleaseBar(clean)).toBe(false);
  });
});

describe('scopeShouldSuggestRelease', () => {
  const HF = 'harmonic-fluency';
  const rows = (histories: PerformanceEntry[][]): MaintenanceItemRow[] =>
    histories.map((h, i) => ({
      itemRef: `card-${i}`, moduleRef: HF,
      acquisitionStage: 'acquired' as const, performanceHistory: h,
    }));
  const all = () => true;

  it('fires when ANY item has slipped', () => {
    expect(scopeShouldSuggestRelease(
      rows([attempts(20, 4), attempts(20, 4), attempts(20, 4, 5)]), all, [HF],
    )).toBe(true);
  });

  it('stays quiet when every item is holding', () => {
    expect(scopeShouldSuggestRelease(
      rows([attempts(20, 4), attempts(20, 4)]), all, [HF],
    )).toBe(false);
  });

  it('ignores out-of-scope and out-of-module items', () => {
    const slipped = rows([attempts(20, 4, 6)]);
    expect(scopeShouldSuggestRelease(slipped, () => false, [HF])).toBe(false);
    expect(scopeShouldSuggestRelease(slipped, all, ['intervals'])).toBe(false);
  });
});

describe('release suggestion state', () => {
  const rec = (m: ScopeMaintenanceMap) => recordForScope(m, KEY);
  const confirmed = withConfirmation({}, KEY, T0);

  it('only ever offered for a confirmed scope', () => {
    expect(shouldSuggestRelease(rec({}), true, T0)).toBe(false);
    expect(shouldSuggestRelease(rec(confirmed), true, T0)).toBe(true);
  });

  it('not offered when the scope has not slipped', () => {
    expect(shouldSuggestRelease(rec(confirmed), false, T0)).toBe(false);
  });

  it('quiets for seven days after a dismissal, then returns', () => {
    const dismissed = withReleaseDismissal(confirmed, KEY, T0);
    expect(shouldSuggestRelease(rec(dismissed), true, T0 + 1)).toBe(false);
    expect(shouldSuggestRelease(
      rec(dismissed), true, T0 + MAINTENANCE_DISMISSAL_QUIET_MS - 1,
    )).toBe(false);
    expect(shouldSuggestRelease(
      rec(dismissed), true, T0 + MAINTENANCE_DISMISSAL_QUIET_MS,
    )).toBe(true);
  });

  it('does not return if the scope recovered in the meantime', () => {
    const dismissed = withReleaseDismissal(confirmed, KEY, T0);
    expect(shouldSuggestRelease(
      rec(dismissed), false, T0 + MAINTENANCE_DISMISSAL_QUIET_MS,
    )).toBe(false);
  });

  it('CONFIRMED SCOPES NEVER AUTO-EXIT — slipping only suggests', () => {
    const slipped = withReleaseDismissal(confirmed, KEY, T0);
    expect(recordForScope(slipped, KEY).status).toBe('confirmed');
  });

  it('the two quiet windows are independent', () => {
    // Dismissing the ENTRY suggestion must not pre-spend the release
    // window: dismiss entry, confirm a day later, then slip.
    const entryDismissed = withDismissal({}, KEY, T0);
    const thenConfirmed = withConfirmation(entryDismissed, KEY, T0 + DAY);
    expect(shouldSuggestRelease(
      recordForScope(thenConfirmed, KEY), true, T0 + DAY + 1,
    )).toBe(true);
  });

  it('release clears the release-quiet window on the way out', () => {
    const dismissed = withReleaseDismissal(confirmed, KEY, T0);
    const released = withRelease(dismissed, KEY);
    expect(isReleaseDismissalQuiet(recordForScope(released, KEY), T0 + 1))
      .toBe(false);
  });

  it('a released scope can be suggested for entry again', () => {
    const released = withRelease(confirmed, KEY);
    expect(shouldSuggestMaintenance(recordForScope(released, KEY), true, T0 + 1))
      .toBe(true);
  });

  it('records written before release tracking existed read cleanly', () => {
    // Forward-compat with the pref rows step 2 already wrote.
    const legacy = {
      [KEY]: {
        status: 'confirmed' as const,
        confirmedAt: T0, dismissedAt: null, dismissalCount: 0,
      },
    };
    const r = recordForScope(legacy, KEY);
    expect(r.releaseDismissedAt).toBeNull();
    expect(r.releaseDismissalCount).toBe(0);
    expect(shouldSuggestRelease(r, true, T0)).toBe(true);
  });
});
