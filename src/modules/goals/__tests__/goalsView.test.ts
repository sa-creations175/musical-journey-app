/**
 * Phase 2 step 6d — defensive deserializer for the Goals home
 * view-mode userPref.
 */
import { describe, it, expect } from 'vitest';
import {
  parseGoalsView,
  DEFAULT_GOALS_VIEW,
  PREF_GOALS_ACTIVE_VIEW,
} from '../goalsView';

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

  it('PREF_GOALS_ACTIVE_VIEW is the canonical pref key', () => {
    // Pinning the key prevents accidental rename — if this test
    // changes, every existing user's pref read silently misses
    // their saved view.
    expect(PREF_GOALS_ACTIVE_VIEW).toBe('goals.home.activeView');
  });
});
