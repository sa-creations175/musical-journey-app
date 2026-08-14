// @vitest-environment jsdom
/**
 * Tests for the cross-tab upgrade policy.
 *
 * The asymmetry under test: reloading a busy tab discards work the user
 * cannot get back, while showing an overlay on an idle tab costs one
 * click. So every ambiguous input must resolve to "busy", and these
 * cases exist to pin the ones that could plausibly drift the other way
 * — an unlisted route, a missing probe, a probe that throws.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetDbLifecycleForTests,
  __setPerformReloadForTests,
  isNonDrillRoute,
  onAnotherTabUpgrading,
  onUpgradeBlocked,
  setIdleProbe,
  shouldAutoReload,
} from '../dbLifecycle';

const IDLE = {
  pathname: '/',
  sessionActive: false,
  inSessionDrillActive: false,
};

let reloads: number;

beforeEach(() => {
  __resetDbLifecycleForTests();
  reloads = 0;
  __setPerformReloadForTests(() => { reloads += 1; });
});

afterEach(() => {
  __resetDbLifecycleForTests();
});

describe('isNonDrillRoute', () => {
  it('allows the dashboard, calendars and the session-log stub', () => {
    expect(isNonDrillRoute('/')).toBe(true);
    expect(isNonDrillRoute('/session-log')).toBe(true);
    expect(isNonDrillRoute('/harmonic-fluency/calendar')).toBe(true);
    expect(isNonDrillRoute('/ear-training/intervals/calendar')).toBe(true);
  });

  it('tolerates a trailing slash', () => {
    expect(isNonDrillRoute('/harmonic-fluency/calendar/')).toBe(true);
    expect(isNonDrillRoute('')).toBe(true);
  });

  it('refuses every drill and editing surface', () => {
    for (const path of [
      '/reading',
      '/ear-training/intervals',
      '/ear-training/chord-recognition',
      '/ear-training/chord-progressions',
      '/ear-training/chord-progression-quiz',
      '/ear-training/scales-modes',
      '/harmonic-fluency',
      '/shapes-and-patterns',
      '/repertoire',
      '/production',
      '/goals',
      '/harmonic-diary',
      '/practice-sessions',
      '/practice-sessions/active',
    ]) {
      expect(isNonDrillRoute(path), path).toBe(false);
    }
  });

  it('refuses the skills catalogue, which edits annotations inline', () => {
    // Looks like a browsing surface; SkillDetailPanel saves starter
    // text and associations from within it.
    expect(isNonDrillRoute('/skills-catalogue')).toBe(false);
  });

  it('refuses an unknown route — the allowlist defaults to busy', () => {
    // The property that makes this safe as the app grows: a route
    // added later is NOT auto-reloaded until someone lists it.
    expect(isNonDrillRoute('/some-future-module')).toBe(false);
    expect(isNonDrillRoute('/reading/preview')).toBe(false);
  });
});

describe('shouldAutoReload', () => {
  it('reloads only when route, session and drill state all say idle', () => {
    expect(shouldAutoReload(IDLE)).toBe(true);
  });

  it('refuses while a session is running OR paused', () => {
    // Paused is not idle — the user is inside a session, just away.
    expect(shouldAutoReload({ ...IDLE, sessionActive: true })).toBe(false);
  });

  it('refuses while an in-session drill runner owns the screen', () => {
    expect(shouldAutoReload({ ...IDLE, inSessionDrillActive: true })).toBe(false);
  });

  it('refuses on a drill route even with no session at all', () => {
    // Standalone drilling is the case with no session signal to read,
    // and it is the most common way to be mid-answer.
    expect(shouldAutoReload({ ...IDLE, pathname: '/reading' })).toBe(false);
  });

  it('requires every condition, not a majority', () => {
    const cases: Array<[string, boolean, boolean, boolean]> = [
      ['/', false, false, true],
      ['/', true, false, false],
      ['/', false, true, false],
      ['/reading', false, false, false],
      ['/reading', true, true, false],
    ];
    for (const [pathname, sessionActive, inSessionDrillActive, expected] of cases) {
      expect(
        shouldAutoReload({ pathname, sessionActive, inSessionDrillActive }),
        `${pathname} session=${sessionActive} drill=${inSessionDrillActive}`,
      ).toBe(expected);
    }
  });
});

describe('onAnotherTabUpgrading', () => {
  it('reloads without showing anything when the probe says idle', () => {
    setIdleProbe(() => true);
    onAnotherTabUpgrading();
    expect(reloads).toBe(1);
  });

  it('shows the overlay instead of reloading when the probe says busy', () => {
    setIdleProbe(() => false);
    onAnotherTabUpgrading();
    expect(reloads).toBe(0);
  });

  it('treats a MISSING probe as busy', () => {
    // No probe means React never mounted, or unmounted — state we
    // cannot observe. Reloading a tab whose contents are unknown is
    // the one outcome worth avoiding.
    setIdleProbe(null);
    onAnotherTabUpgrading();
    expect(reloads).toBe(0);
  });

  it('treats a THROWING probe as busy', () => {
    // The probe runs React-land code. Inferring "idle" from an
    // exception would discard the user's work on a bug.
    setIdleProbe(() => { throw new Error('probe exploded'); });
    onAnotherTabUpgrading();
    expect(reloads).toBe(0);
  });

  it('notifies subscribers so the overlay can appear', () => {
    const listener = vi.fn();
    window.addEventListener('dblifecyclechange', listener);
    try {
      setIdleProbe(() => false);
      onAnotherTabUpgrading();
      expect(listener).toHaveBeenCalled();
    } finally {
      window.removeEventListener('dblifecyclechange', listener);
    }
  });
});

describe('onUpgradeBlocked', () => {
  it('never reloads — the other tab is the one that has to yield', () => {
    // Reloading here would just re-block, in a loop.
    setIdleProbe(() => true);
    onUpgradeBlocked();
    expect(reloads).toBe(0);
  });

  it('notifies subscribers so the message can appear', () => {
    const listener = vi.fn();
    window.addEventListener('dblifecyclechange', listener);
    try {
      onUpgradeBlocked();
      expect(listener).toHaveBeenCalled();
    } finally {
      window.removeEventListener('dblifecyclechange', listener);
    }
  });
});
