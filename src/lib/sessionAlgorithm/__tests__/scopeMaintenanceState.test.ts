/**
 * Scope-level maintenance — state reducers and the suggestion rule.
 *
 * The pure half is tested directly; the persistence wrappers are thin
 * getPref/setPref calls over these same reducers.
 */
import { describe, expect, it } from 'vitest';
import {
  MAINTENANCE_DISMISSAL_QUIET_MS,
  isDismissalQuiet,
  isScopeInMaintenance,
  recordForScope,
  shouldSuggestMaintenance,
  withConfirmation,
  withDismissal,
  withRelease,
  type ScopeMaintenanceMap,
} from '../scopeMaintenanceState';

const KEY = 'harmonic_fluency_coverage_at_acquired';
const T0 = 1_700_000_000_000;
const EMPTY: ScopeMaintenanceMap = {};

describe('recordForScope', () => {
  it('returns a neutral record for an unknown scope', () => {
    expect(recordForScope(EMPTY, KEY)).toEqual({
      status: 'none', confirmedAt: null, dismissedAt: null, dismissalCount: 0,
    });
  });
});

describe('confirmation', () => {
  it('is the only way into maintenance', () => {
    expect(isScopeInMaintenance(EMPTY, KEY)).toBe(false);
    const next = withConfirmation(EMPTY, KEY, T0);
    expect(isScopeInMaintenance(next, KEY)).toBe(true);
    expect(next[KEY].confirmedAt).toBe(T0);
  });

  it('does not touch other scopes', () => {
    const next = withConfirmation(withConfirmation(EMPTY, 'a', T0), 'b', T0);
    expect(isScopeInMaintenance(next, 'a')).toBe(true);
    expect(isScopeInMaintenance(next, 'b')).toBe(true);
  });

  it('release takes a scope back out', () => {
    const confirmed = withConfirmation(EMPTY, KEY, T0);
    const released = withRelease(confirmed, KEY);
    expect(isScopeInMaintenance(released, KEY)).toBe(false);
    expect(released[KEY].confirmedAt).toBeNull();
  });

  it('releasing a scope that was never in maintenance is a no-op', () => {
    expect(withRelease(EMPTY, KEY)).toBe(EMPTY);
  });
});

describe('dismissal', () => {
  it('quiets for exactly seven days', () => {
    const r = recordForScope(withDismissal(EMPTY, KEY, T0), KEY);
    expect(isDismissalQuiet(r, T0)).toBe(true);
    expect(isDismissalQuiet(r, T0 + MAINTENANCE_DISMISSAL_QUIET_MS - 1)).toBe(true);
    // The boundary is the moment it expires, not a moment later.
    expect(isDismissalQuiet(r, T0 + MAINTENANCE_DISMISSAL_QUIET_MS)).toBe(false);
  });

  it('counts repeats and keeps the latest timestamp', () => {
    const once = withDismissal(EMPTY, KEY, T0);
    const twice = withDismissal(once, KEY, T0 + 10 * 24 * 60 * 60 * 1000);
    expect(twice[KEY].dismissalCount).toBe(2);
    expect(twice[KEY].dismissedAt).toBe(T0 + 10 * 24 * 60 * 60 * 1000);
  });

  it('is not a status — a dismissed scope is still "none"', () => {
    expect(withDismissal(EMPTY, KEY, T0)[KEY].status).toBe('none');
  });
});

describe('shouldSuggestMaintenance', () => {
  const rec = (map: ScopeMaintenanceMap) => recordForScope(map, KEY);

  it('suggests a qualifying scope with no history', () => {
    expect(shouldSuggestMaintenance(rec(EMPTY), true, T0)).toBe(true);
  });

  it('never suggests a scope that does not qualify', () => {
    expect(shouldSuggestMaintenance(rec(EMPTY), false, T0)).toBe(false);
  });

  it('stops once confirmed — the decision is made', () => {
    const confirmed = rec(withConfirmation(EMPTY, KEY, T0));
    expect(shouldSuggestMaintenance(confirmed, true, T0 + 1)).toBe(false);
  });

  it('stays quiet for the seven days after a dismissal', () => {
    const dismissed = rec(withDismissal(EMPTY, KEY, T0));
    expect(shouldSuggestMaintenance(dismissed, true, T0 + 1)).toBe(false);
    expect(shouldSuggestMaintenance(
      dismissed, true, T0 + MAINTENANCE_DISMISSAL_QUIET_MS - 1,
    )).toBe(false);
  });

  it('RETURNS after seven days when the scope still qualifies', () => {
    const dismissed = rec(withDismissal(EMPTY, KEY, T0));
    expect(shouldSuggestMaintenance(
      dismissed, true, T0 + MAINTENANCE_DISMISSAL_QUIET_MS,
    )).toBe(true);
  });

  it('does NOT return after seven days when accuracy has slipped', () => {
    // The requalification half. Nothing is stored about it — the live
    // verdict is an argument, so a scope that stopped qualifying
    // simply stops being offered.
    const dismissed = rec(withDismissal(EMPTY, KEY, T0));
    expect(shouldSuggestMaintenance(
      dismissed, false, T0 + MAINTENANCE_DISMISSAL_QUIET_MS,
    )).toBe(false);
  });

  it('a second dismissal restarts the quiet window', () => {
    const first = withDismissal(EMPTY, KEY, T0);
    const returnsAt = T0 + MAINTENANCE_DISMISSAL_QUIET_MS;
    expect(shouldSuggestMaintenance(rec(first), true, returnsAt)).toBe(true);
    const second = withDismissal(first, KEY, returnsAt);
    expect(shouldSuggestMaintenance(rec(second), true, returnsAt + 1)).toBe(false);
    expect(shouldSuggestMaintenance(
      rec(second), true, returnsAt + MAINTENANCE_DISMISSAL_QUIET_MS,
    )).toBe(true);
  });
});
