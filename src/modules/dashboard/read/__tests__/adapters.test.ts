/**
 * The submission collapse, and the two rules every adapter holds.
 *
 * These assert the mechanism: which rows group, which deliberately do
 * not, and that a catalog row with nothing logged still occupies the
 * denominator.
 */
import { describe, expect, it } from 'vitest';
import type { AttemptRecord } from '../../../../lib/db';
import {
  collapseSubmissions,
  statsForAttemptCatalog,
  ungroupableCount,
} from '../adapters';
import { chordProgressionsCatalog, scalesModesCatalog } from '../catalogs';

const NOW = 1_700_000_000_000;

function attempt(patch: Partial<AttemptRecord>): AttemptRecord {
  return {
    moduleId: 'chord-progressions',
    itemId: '1-4-5',
    correct: true,
    timestamp: NOW,
    ...patch,
  } as AttemptRecord;
}

/** The four rows one submitted answer writes for a four-chord
 *  progression: same itemId, same submission, timestamp + i. */
function submission(
  slotResults: boolean[],
  patch: Partial<AttemptRecord> = {},
): AttemptRecord[] {
  const submissionId = `sub-${patch.timestamp ?? NOW}`;
  return slotResults.map((correct, i) => attempt({
    correct,
    submissionId,
    ...patch,
    timestamp: (patch.timestamp ?? NOW) + i,
  }));
}

describe('collapseSubmissions', () => {
  it('turns one submitted answer into one result', () => {
    const collapsed = collapseSubmissions(submission([true, true, true, true]));
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0].correct).toBe(true);
  });

  it('is all-or-nothing — three of four is wrong, not 75%', () => {
    // The full-progression drill tests holding the whole thing
    // together. Counting slots independently would report 75% for an
    // answer that was not correct.
    const collapsed = collapseSubmissions(submission([true, true, false, true]));
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0].correct).toBe(false);
  });

  it('keeps the latest timestamp so recency reads as the submission', () => {
    const collapsed = collapseSubmissions(submission([true, true, true, true]));
    expect(collapsed[0].timestamp).toBe(NOW + 3);
  });

  it('carries focus protection across the whole submission', () => {
    const rows = submission([true, true, true, true]);
    rows[2] = { ...rows[2], excludeFromFluency: true };
    expect(collapseSubmissions(rows)[0].excludeFromFluency).toBe(true);
  });

  it('keeps separate submissions separate', () => {
    const collapsed = collapseSubmissions([
      ...submission([true, true], { timestamp: NOW }),
      ...submission([false, true], { timestamp: NOW + 1000 }),
    ]);
    expect(collapsed).toHaveLength(2);
    expect(collapsed.filter(a => a.correct)).toHaveLength(1);
  });

  it('collapses chord rows and inversion rows independently', () => {
    // A slash progression writes both from the same answer. They are
    // separate catalog items and each collapses on its own, so a
    // correct chord with a wrong inversion is one right and one wrong,
    // not one wrong.
    const submissionId = 'sub-slash';
    const collapsed = collapseSubmissions([
      attempt({ itemId: 'p', correct: true, submissionId, timestamp: NOW }),
      attempt({ itemId: 'p', correct: true, submissionId, timestamp: NOW + 1 }),
      attempt({ itemId: 'p-inversion', correct: false, submissionId, timestamp: NOW }),
      attempt({ itemId: 'p-inversion', correct: true, submissionId, timestamp: NOW + 1 }),
    ]);
    expect(collapsed).toHaveLength(2);
    expect(collapsed.find(a => a.itemId === 'p')!.correct).toBe(true);
    expect(collapsed.find(a => a.itemId === 'p-inversion')!.correct).toBe(false);
  });

  it('leaves legacy rows ungrouped rather than guessing', () => {
    // Rows written before submissionId existed carry none. Clustering
    // them on timestamp proximity would be a heuristic over data never
    // designed to carry the grouping. They stay one row per slot.
    const legacy = [
      attempt({ correct: true, timestamp: NOW }),
      attempt({ correct: true, timestamp: NOW + 1 }),
      attempt({ correct: false, timestamp: NOW + 2 }),
      attempt({ correct: true, timestamp: NOW + 3 }),
    ];
    const collapsed = collapseSubmissions(legacy);
    expect(collapsed).toHaveLength(4);
    expect(collapsed.filter(a => a.correct)).toHaveLength(3);
  });

  it('handles a mixed log without cross-contaminating', () => {
    const collapsed = collapseSubmissions([
      ...submission([true, false]),
      attempt({ correct: true, timestamp: NOW + 500 }),
    ]);
    expect(collapsed).toHaveLength(2);
  });

  it('passes single-row modules straight through', () => {
    const rows = [
      attempt({ moduleId: 'intervals', itemId: 'M3', submissionId: undefined }),
      attempt({ moduleId: 'reading', itemId: 'sig:0:major:name', timestamp: NOW + 1 }),
    ];
    expect(collapseSubmissions(rows)).toHaveLength(2);
  });
});

describe('ungroupableCount', () => {
  it('counts the legacy rows an affordance has to explain', () => {
    const rows = [
      ...submission([true, true]),
      attempt({ correct: true, timestamp: NOW + 500 }),
      attempt({ correct: false, timestamp: NOW + 501 }),
      attempt({ moduleId: 'chord-progressions', itemId: 'motion:1-5-asc', timestamp: NOW + 600 }),
    ];
    expect(ungroupableCount(rows, id => id === '1-4-5')).toBe(2);
  });
});

describe('statsForAttemptCatalog — the two rules', () => {
  it('returns one row per catalog item, in catalog order', () => {
    const stats = statsForAttemptCatalog(scalesModesCatalog, []);
    expect(stats).toHaveLength(scalesModesCatalog.items.length);
    expect(stats.map(s => s.itemRef)).toEqual(scalesModesCatalog.items.map(i => i.id));
  });

  it('keeps unpractised rows in the denominator', () => {
    const stats = statsForAttemptCatalog(scalesModesCatalog, [
      attempt({ moduleId: 'scales-modes', itemId: 'ionian-tab1' }),
    ]);
    expect(stats).toHaveLength(18);
    expect(stats.filter(s => s.engagementCount === 0)).toHaveLength(17);
  });

  it('drops engagements against refs outside the catalog', () => {
    const stats = statsForAttemptCatalog(scalesModesCatalog, [
      attempt({ moduleId: 'scales-modes', itemId: 'not-a-mode-tab1' }),
    ]);
    expect(stats.every(s => s.engagementCount === 0)).toBe(true);
  });

  it('applies the collapse before bucketing', () => {
    // Four slot rows for one progression must land as ONE engagement
    // against that catalog row, not four.
    const progression = chordProgressionsCatalog.items.find(
      i => i.path[1] === 'full progression' && i.label === 'chord accuracy',
    )!;
    const stats = statsForAttemptCatalog(
      chordProgressionsCatalog,
      submission([true, true, true, false], { itemId: progression.id }),
    );
    const row = stats.find(s => s.itemRef === progression.id)!;
    expect(row.engagementCount).toBe(1);
    expect(row.score).toBe(0);
  });
});
