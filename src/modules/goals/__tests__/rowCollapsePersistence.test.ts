// @vitest-environment jsdom
/**
 * Phase 2 step 6g — round-trip test for collapse pref
 * persistence. Mirrors the page-level lifecycle:
 *
 *   1. Toggle a row (page calls toggleRowExpanded + setPref)
 *   2. Simulate a reload (re-read pref)
 *   3. resolveRowExpanded against the re-read state
 *
 * Reproduces the bug surfaced during 6g review: collapsing the
 * umbrella, reloading, and finding it expanded again.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../../lib/db';
import { getPref, setPref } from '../../../lib/userPrefs';
import {
  PREF_GOALS_ROW_COLLAPSE,
  parseRowCollapseState,
  resolveRowExpanded,
  toggleRowExpanded,
  type RowCollapseState,
} from '../goalRowCollapse';

beforeEach(async () => {
  await db.userPrefs.clear();
});

async function persistToggle(state: RowCollapseState, goalId: string, isUmbrella: boolean) {
  const next = toggleRowExpanded(state, goalId, isUmbrella);
  await setPref(PREF_GOALS_ROW_COLLAPSE, next);
  return next;
}

async function rehydrate(): Promise<RowCollapseState> {
  const raw = await getPref<unknown>(PREF_GOALS_ROW_COLLAPSE, {});
  return parseRowCollapseState(raw);
}

describe('rowCollapse persistence round-trip', () => {
  it('survives a single toggle + reload (umbrella collapsed)', async () => {
    let state: RowCollapseState = {};
    state = await persistToggle(state, 'g1', true);
    expect(state).toEqual({ g1: 'collapsed' });

    const reloaded = await rehydrate();
    expect(resolveRowExpanded(reloaded, 'g1', true)).toBe(false);
  });

  it('survives a regular row expand + reload', async () => {
    let state: RowCollapseState = {};
    state = await persistToggle(state, 'g1', false);
    expect(state).toEqual({ g1: 'expanded' });

    const reloaded = await rehydrate();
    expect(resolveRowExpanded(reloaded, 'g1', false)).toBe(true);
  });

  it('toggle-back-to-default writes an empty map and reloads to default', async () => {
    let state: RowCollapseState = {};
    state = await persistToggle(state, 'g1', true);
    state = await persistToggle(state, 'g1', true);
    expect(state).toEqual({});

    const reloaded = await rehydrate();
    expect(resolveRowExpanded(reloaded, 'g1', true)).toBe(true);
  });

  it('preserves overrides for other goals when toggling one back to default', async () => {
    let state: RowCollapseState = {};
    state = await persistToggle(state, 'g1', true); // umbrella collapsed
    state = await persistToggle(state, 'g2', false); // regular expanded
    state = await persistToggle(state, 'g1', true); // umbrella back to expanded (default)

    const reloaded = await rehydrate();
    expect(reloaded).toEqual({ g2: 'expanded' });
    expect(resolveRowExpanded(reloaded, 'g1', true)).toBe(true);
    expect(resolveRowExpanded(reloaded, 'g2', false)).toBe(true);
  });

  it('re-reads the same pref key the persist effect writes to', async () => {
    // Pin: if PREF_GOALS_ROW_COLLAPSE were typo'd in either
    // direction, this round-trip would fail because the read
    // would miss the write.
    await setPref(PREF_GOALS_ROW_COLLAPSE, { 'g1': 'collapsed' });
    const reloaded = await rehydrate();
    expect(reloaded).toEqual({ g1: 'collapsed' });
  });
});
