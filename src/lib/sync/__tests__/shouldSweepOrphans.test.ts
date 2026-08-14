// @vitest-environment jsdom
/**
 * Tests for shouldSweepOrphans — the gate on the replace-pull's
 * delete pass, now that the content pull is watermark-filtered.
 *
 * The failure this gate sits in front of is the worst one available in
 * the sync layer. Orphan detection deletes local rows absent from the
 * cloud id set. Once the content pull only returns "rows changed since
 * T", that result is no longer the cloud id set — so deriving ids from
 * it would mark every UNCHANGED row as absent and wipe the local table.
 *
 * engine.ts keeps that impossible structurally: the id set comes from
 * fetchAllCloudIds, an id-only full query that takes no argument
 * derived from the content fetch. This file pins the three conditions
 * deciding whether that query runs at all.
 */
import { describe, expect, it } from 'vitest';
import { shouldSweepOrphans } from '../engine';

describe('shouldSweepOrphans', () => {
  it('sweeps in replace mode when due and the table is not append-only', () => {
    expect(shouldSweepOrphans('replace', undefined, true)).toBe(true);
    expect(shouldSweepOrphans('replace', false, true)).toBe(true);
  });

  it('never sweeps in additive mode', () => {
    // Additive means the queue still holds unpushed local writes, so
    // the cloud is not authoritative and nothing may be deleted —
    // regardless of how overdue the sweep is.
    expect(shouldSweepOrphans('additive', false, true)).toBe(false);
    expect(shouldSweepOrphans('additive', undefined, true)).toBe(false);
  });

  it('never sweeps an append-only table', () => {
    // No deletes to propagate, so the full id query would be pure cost.
    // For attempts that query is the largest table in the app.
    expect(shouldSweepOrphans('replace', true, true)).toBe(false);
    expect(shouldSweepOrphans('replace', true, false)).toBe(false);
  });

  it('respects the cadence for ordinary tables', () => {
    expect(shouldSweepOrphans('replace', false, false)).toBe(false);
  });

  it('requires all three conditions, not any of them', () => {
    // Enumerated so a future refactor to || or a dropped clause fails
    // here rather than in production.
    const cases: Array<[('additive' | 'replace'), boolean, boolean, boolean]> = [
      ['replace', false, true, true],
      ['replace', false, false, false],
      ['replace', true, true, false],
      ['replace', true, false, false],
      ['additive', false, true, false],
      ['additive', false, false, false],
      ['additive', true, true, false],
      ['additive', true, false, false],
    ];
    for (const [mode, appendOnly, due, expected] of cases) {
      expect(
        shouldSweepOrphans(mode, appendOnly, due),
        `${mode} appendOnly=${appendOnly} due=${due}`,
      ).toBe(expected);
    }
  });
});
