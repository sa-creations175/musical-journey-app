// @vitest-environment jsdom
/**
 * How a matrix cell paints.
 *
 * The two axes are multiplied, so the tests have to separate them:
 * a cell that reads dim because it is unstarted and one that reads dim
 * because it is stale are different facts, and a single opacity
 * assertion cannot tell them apart.
 */
import { describe, expect, it } from 'vitest';
import type { SongCell } from '../../../../lib/db';
import {
  CELL_FILL_COMFORTABLE,
  CELL_FILL_EMPTY,
  CELL_FILL_PARTWAY,
  CELL_FILL_STARTED,
  cellFreshnessAlpha,
  cellHeat,
} from '../cellHeat';

const NOW = 1_760_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

function cell(over: Partial<SongCell> = {}): SongCell {
  return {
    id: 'c1', songId: 's1', sectionId: 'sec1', songKeyId: 'k1',
    cellState: 'learning', comfortableAt: null, consecutiveCleanCount: 0,
    lastRunAt: NOW, lastRunWasClean: true, notes: null,
    lastEngagedAt: NOW, createdAt: 0, updatedAt: 0, ...over,
  };
}

describe('the fill ramp reads how far it has got', () => {
  it('an absent cell and an empty one both read empty', () => {
    expect(cellHeat(null, NOW).fill).toBe(CELL_FILL_EMPTY);
    expect(cellHeat(cell({ cellState: 'empty' }), NOW).fill).toBe(CELL_FILL_EMPTY);
  });

  it('started but no clean run yet', () => {
    expect(cellHeat(cell({ consecutiveCleanCount: 0 }), NOW).fill)
      .toBe(CELL_FILL_STARTED);
  });

  it('partway once a streak exists', () => {
    // Guard the guard: the fixture differs from the one above ONLY in
    // the streak, so nothing else can be producing the change.
    for (const n of [1, 2]) {
      expect(cellHeat(cell({ consecutiveCleanCount: n }), NOW).fill)
        .toBe(CELL_FILL_PARTWAY);
    }
  });

  it('full once comfortable', () => {
    expect(cellHeat(cell({ cellState: 'comfortable' }), NOW).fill)
      .toBe(CELL_FILL_COMFORTABLE);
  });

  it('the ramp only ever climbs', () => {
    expect(CELL_FILL_EMPTY)
      .toBeLessThan(CELL_FILL_STARTED);
    expect(CELL_FILL_STARTED).toBeLessThan(CELL_FILL_PARTWAY);
    expect(CELL_FILL_PARTWAY).toBeLessThan(CELL_FILL_COMFORTABLE);
  });
});

describe('comfortable is a threshold, not the top of the ramp', () => {
  it('draws a border, which no other state does', () => {
    // Opacity alone reads as a gradient, and "three clean in a row" is
    // a different KIND of fact from two.
    expect(cellHeat(cell({ cellState: 'comfortable' }), NOW).bordered).toBe(true);
    expect(cellHeat(cell({ consecutiveCleanCount: 2 }), NOW).bordered).toBe(false);
    expect(cellHeat(cell({ cellState: 'empty' }), NOW).bordered).toBe(false);
    expect(cellHeat(null, NOW).bordered).toBe(false);
  });
});

describe('freshness is a separate axis', () => {
  it('fades with time since the last run', () => {
    expect(cellFreshnessAlpha(NOW, NOW)).toBe(1.0);
    expect(cellFreshnessAlpha(NOW - 5 * DAY, NOW)).toBe(0.9);
    expect(cellFreshnessAlpha(NOW - 15 * DAY, NOW)).toBe(0.7);
    expect(cellFreshnessAlpha(NOW - 40 * DAY, NOW)).toBe(0.5);
  });

  it('a comfortable cell left alone fades WITHOUT losing its fill', () => {
    // THE REASON THERE ARE TWO AXES. One number cannot say both "this
    // was finished" and "nobody has touched it in a month", and
    // collapsing them would make an abandoned cell indistinguishable
    // from an unstarted one.
    const stale = cellHeat(cell({ cellState: 'comfortable', lastRunAt: NOW - 40 * DAY }), NOW);
    expect(stale.fill).toBe(CELL_FILL_COMFORTABLE);
    expect(stale.alpha).toBe(0.5);
    expect(stale.bordered).toBe(true);
  });

  it('an empty cell does not pretend to be stale', () => {
    // There is nothing to be fresh about, and fading it would make
    // "never started" read as "abandoned".
    expect(cellHeat(cell({ cellState: 'empty', lastRunAt: null }), NOW).alpha).toBe(1);
  });

  it('a never-run cell reads as stale rather than fresh', () => {
    expect(cellFreshnessAlpha(null, NOW)).toBe(0.5);
  });
});
