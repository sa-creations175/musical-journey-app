// @vitest-environment jsdom
/**
 * Phase 3 Step 8c — path-filter tests for the abundance flow.
 *
 * filterSpacingRowsByPath is the pure semantic filter that scopes
 * spacing rows by user intent before the standard module-aggregation
 * pipeline runs. The shuffle + Dexie integration is exercised
 * end-to-end in the walkthrough; these tests lock in the filter
 * boundaries.
 */
import { describe, expect, it } from 'vitest';
import { filterSpacingRowsByPath } from '../sessionGenerator';
import type { SpacingState } from '../../../lib/db';

const NOW = Date.now();

function row(partial: Partial<SpacingState>): SpacingState {
  return {
    id: 'row-x',
    itemRef: 'item-x',
    hand: 'both',
    moduleRef: 'shapes-and-patterns',
    memoryType: 'procedural',
    acquisitionStage: 'new',
    currentIntervalDays: 0,
    lastEngagedAt: null,
    nextDueAt: null,
    performanceHistory: [],
    ...partial,
  };
}

describe('filterSpacingRowsByPath — get-ahead', () => {
  it('keeps only rows with nextDueAt strictly in the future', () => {
    const rows = [
      row({ id: '1', nextDueAt: NOW + 86_400_000 }), // tomorrow
      row({ id: '2', nextDueAt: NOW - 1 }), // already due
      row({ id: '3', nextDueAt: null }), // never engaged
      row({ id: '4', nextDueAt: NOW + 60_000 }), // due in 1 minute
    ];
    const out = filterSpacingRowsByPath(rows, 'get-ahead');
    expect(out.map(r => r.id).sort()).toEqual(['1', '4']);
  });
});

describe('filterSpacingRowsByPath — drive-home', () => {
  it('keeps acquiring + acquired stages, drops new', () => {
    const rows = [
      row({ id: '1', acquisitionStage: 'new' }),
      row({ id: '2', acquisitionStage: 'acquiring' }),
      row({ id: '3', acquisitionStage: 'acquired' }),
    ];
    const out = filterSpacingRowsByPath(rows, 'drive-home');
    expect(out.map(r => r.id).sort()).toEqual(['2', '3']);
  });
});

describe('filterSpacingRowsByPath — expand', () => {
  it('keeps only the new stage', () => {
    const rows = [
      row({ id: '1', acquisitionStage: 'new' }),
      row({ id: '2', acquisitionStage: 'acquiring' }),
      row({ id: '3', acquisitionStage: 'acquired' }),
      row({ id: '4', acquisitionStage: 'new' }),
    ];
    const out = filterSpacingRowsByPath(rows, 'expand');
    expect(out.map(r => r.id).sort()).toEqual(['1', '4']);
  });
});
