// @vitest-environment jsdom
/**
 * Phase 2 step 6g.2 — round-trip test for collapse persistence
 * against localStorage. Mirrors the page-level lifecycle:
 *
 *   1. Toggle a row (page calls toggleRowExpanded + saveRowCollapse)
 *   2. Simulate a reload (re-read localStorage via loadRowCollapse)
 *   3. resolveRowExpanded against the re-read state
 *
 * 6g originally persisted via userPrefs/Dexie. That path lost
 * writes to the userPrefs sync layer (drain + pullAll('replace')
 * race) — collapse state isn't worth coordinating across devices,
 * so it lives in localStorage instead. These tests pin the
 * synchronous round-trip works.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadRowCollapse,
  resolveRowExpanded,
  saveRowCollapse,
  STORAGE_KEY_ROW_COLLAPSE,
  toggleRowExpanded,
  type RowCollapseState,
} from '../goalRowCollapse';

beforeEach(() => {
  localStorage.clear();
});

function persistToggle(state: RowCollapseState, goalId: string, isUmbrella: boolean) {
  const next = toggleRowExpanded(state, goalId, isUmbrella);
  saveRowCollapse(next);
  return next;
}

describe('rowCollapse persistence round-trip (localStorage)', () => {
  it('survives a single toggle + reload (umbrella collapsed)', () => {
    let state: RowCollapseState = loadRowCollapse();
    state = persistToggle(state, 'g1', true);
    expect(state).toEqual({ g1: 'collapsed' });

    const reloaded = loadRowCollapse();
    expect(resolveRowExpanded(reloaded, 'g1', true)).toBe(false);
  });

  it('survives a regular row expand + reload', () => {
    let state: RowCollapseState = loadRowCollapse();
    state = persistToggle(state, 'g1', false);
    expect(state).toEqual({ g1: 'expanded' });

    const reloaded = loadRowCollapse();
    expect(resolveRowExpanded(reloaded, 'g1', false)).toBe(true);
  });

  it('toggle-back-to-default writes an empty map and reloads to default', () => {
    let state: RowCollapseState = loadRowCollapse();
    state = persistToggle(state, 'g1', true);
    state = persistToggle(state, 'g1', true);
    expect(state).toEqual({});

    const reloaded = loadRowCollapse();
    expect(resolveRowExpanded(reloaded, 'g1', true)).toBe(true);
  });

  it('preserves overrides for other goals when toggling one back to default', () => {
    let state: RowCollapseState = loadRowCollapse();
    state = persistToggle(state, 'g1', true);
    state = persistToggle(state, 'g2', false);
    state = persistToggle(state, 'g1', true);

    const reloaded = loadRowCollapse();
    expect(reloaded).toEqual({ g2: 'expanded' });
  });

  it('returns {} for an unwritten store (first-ever load)', () => {
    expect(loadRowCollapse()).toEqual({});
  });

  it('falls back to {} when stored JSON is malformed', () => {
    localStorage.setItem(STORAGE_KEY_ROW_COLLAPSE, '{not json');
    expect(loadRowCollapse()).toEqual({});
  });

  it('drops unrecognized override values during load', () => {
    localStorage.setItem(
      STORAGE_KEY_ROW_COLLAPSE,
      JSON.stringify({ g1: 'collapsed', g2: 'open', g3: 42 }),
    );
    expect(loadRowCollapse()).toEqual({ g1: 'collapsed' });
  });

  it('writes a stable JSON encoding readable by load', () => {
    saveRowCollapse({ g1: 'collapsed', g2: 'expanded' });
    const raw = localStorage.getItem(STORAGE_KEY_ROW_COLLAPSE);
    expect(raw).toBe('{"g1":"collapsed","g2":"expanded"}');
  });
});
