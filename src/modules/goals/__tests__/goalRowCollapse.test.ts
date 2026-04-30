/**
 * Phase 2 step 6g — collapse-state pure helpers for goal rows.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveRowExpanded,
  toggleRowExpanded,
  parseRowCollapseState,
  type RowCollapseState,
} from '../goalRowCollapse';

describe('resolveRowExpanded', () => {
  it('defaults to expanded for umbrella rows with no override', () => {
    expect(resolveRowExpanded({}, 'g1', true)).toBe(true);
  });

  it('defaults to collapsed for regular rows with no override', () => {
    expect(resolveRowExpanded({}, 'g1', false)).toBe(false);
  });

  it('returns true when an "expanded" override exists', () => {
    const state: RowCollapseState = { g1: 'expanded' };
    expect(resolveRowExpanded(state, 'g1', false)).toBe(true);
    expect(resolveRowExpanded(state, 'g1', true)).toBe(true);
  });

  it('returns false when a "collapsed" override exists', () => {
    const state: RowCollapseState = { g1: 'collapsed' };
    expect(resolveRowExpanded(state, 'g1', false)).toBe(false);
    expect(resolveRowExpanded(state, 'g1', true)).toBe(false);
  });
});

describe('toggleRowExpanded', () => {
  it('toggles an umbrella from default-expanded to collapsed (stores override)', () => {
    const next = toggleRowExpanded({}, 'g1', true);
    expect(next).toEqual({ g1: 'collapsed' });
  });

  it('toggles a regular row from default-collapsed to expanded (stores override)', () => {
    const next = toggleRowExpanded({}, 'g1', false);
    expect(next).toEqual({ g1: 'expanded' });
  });

  it('toggling back to the default deletes the override (compact pref)', () => {
    const collapsed = toggleRowExpanded({}, 'g1', true);
    const back = toggleRowExpanded(collapsed, 'g1', true);
    expect(back).toEqual({});
  });

  it('does not mutate the input state', () => {
    const before: RowCollapseState = { g1: 'expanded' };
    const after = toggleRowExpanded(before, 'g1', false);
    expect(before).toEqual({ g1: 'expanded' });
    expect(after).toEqual({});
  });

  it('only touches the entry for the target goal id', () => {
    const before: RowCollapseState = { g1: 'expanded', g2: 'collapsed' };
    const after = toggleRowExpanded(before, 'g1', false);
    expect(after.g2).toBe('collapsed');
  });
});

describe('parseRowCollapseState', () => {
  it('returns {} for null / undefined / non-object inputs', () => {
    expect(parseRowCollapseState(null)).toEqual({});
    expect(parseRowCollapseState(undefined)).toEqual({});
    expect(parseRowCollapseState('legacy-string')).toEqual({});
    expect(parseRowCollapseState(42)).toEqual({});
    expect(parseRowCollapseState(['expanded'])).toEqual({});
  });

  it('keeps recognized overrides only', () => {
    expect(
      parseRowCollapseState({
        g1: 'expanded',
        g2: 'collapsed',
        g3: 'open',          // unknown
        g4: 42,              // wrong type
        g5: null,            // junk
      }),
    ).toEqual({
      g1: 'expanded',
      g2: 'collapsed',
    });
  });

  it('returns {} when the object has only invalid entries', () => {
    expect(parseRowCollapseState({ g1: 'open' })).toEqual({});
  });
});
