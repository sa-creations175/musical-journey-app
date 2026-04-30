// @vitest-environment jsdom
/**
 * Phase 2 step 6d — Goals home view-mode primitives.
 *
 * Originally userPrefs/Dexie-backed; switched to localStorage
 * in 6h.1 after a sync-pull race wiped writes on rapid reload
 * (same fix that 6g.2 applied to rowCollapse).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseGoalsView,
  DEFAULT_GOALS_VIEW,
  STORAGE_KEY_GOALS_ACTIVE_VIEW,
  loadGoalsView,
  saveGoalsView,
} from '../goalsView';

beforeEach(() => {
  localStorage.clear();
});

describe('parseGoalsView', () => {
  it('returns the canonical values when stored correctly', () => {
    expect(parseGoalsView('timeframe')).toBe('timeframe');
    expect(parseGoalsView('module')).toBe('module');
  });

  it('falls back to the default for null / undefined (first visit)', () => {
    expect(parseGoalsView(null)).toBe('timeframe');
    expect(parseGoalsView(undefined)).toBe('timeframe');
  });

  it('falls back to the default for unknown strings', () => {
    expect(parseGoalsView('legacy-view-name')).toBe('timeframe');
    expect(parseGoalsView('')).toBe('timeframe');
    expect(parseGoalsView('TIMEFRAME')).toBe('timeframe'); // case-sensitive
  });

  it('falls back to the default for non-string inputs', () => {
    expect(parseGoalsView(0)).toBe('timeframe');
    expect(parseGoalsView(true)).toBe('timeframe');
    expect(parseGoalsView({ view: 'module' })).toBe('timeframe');
    expect(parseGoalsView(['module'])).toBe('timeframe');
  });
});

describe('exported constants', () => {
  it('DEFAULT_GOALS_VIEW is the timeframe view', () => {
    expect(DEFAULT_GOALS_VIEW).toBe('timeframe');
  });

  it('STORAGE_KEY_GOALS_ACTIVE_VIEW is the canonical localStorage key', () => {
    // Pinning the key prevents accidental rename — if this test
    // changes, every existing user's saved view silently misses
    // on first read after deploy.
    expect(STORAGE_KEY_GOALS_ACTIVE_VIEW).toBe('goals.home.activeView');
  });
});

describe('loadGoalsView / saveGoalsView round-trip', () => {
  it('returns default on first visit (storage empty)', () => {
    expect(loadGoalsView()).toBe('timeframe');
  });

  it('persists module view across reload', () => {
    saveGoalsView('module');
    expect(loadGoalsView()).toBe('module');
  });

  it('persists timeframe view (toggling back from module)', () => {
    saveGoalsView('module');
    saveGoalsView('timeframe');
    expect(loadGoalsView()).toBe('timeframe');
  });

  it('falls back to default when storage holds an unrecognized string', () => {
    localStorage.setItem(STORAGE_KEY_GOALS_ACTIVE_VIEW, 'legacy-grid');
    expect(loadGoalsView()).toBe('timeframe');
  });

  it('writes the raw view string (no JSON wrapping)', () => {
    saveGoalsView('module');
    expect(localStorage.getItem(STORAGE_KEY_GOALS_ACTIVE_VIEW)).toBe('module');
  });
});
