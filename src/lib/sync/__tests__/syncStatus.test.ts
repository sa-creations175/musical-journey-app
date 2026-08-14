// @vitest-environment jsdom
/**
 * Ordering for the sync-status readout.
 *
 * On a ~40-row table read on a phone, the ordering IS the usability:
 * the whole point of the surface is answering "did the merge work?"
 * without scrolling. attempts is the row being checked, and a
 * disagreement between local and cloud is the only thing that can be
 * wrong — so both must be at the top, and a table whose cloud count
 * could not be read must NOT be allowed to look like agreement.
 */
import { describe, expect, it } from 'vitest';
import { orderStatusRows, type SyncTableStatus } from '../status';

function row(
  table: string,
  local: number,
  cloud: number | null,
  error?: string,
): SyncTableStatus {
  return { table, pg: table, local, cloud, ...(error ? { error } : {}) };
}

describe('orderStatusRows', () => {
  it('puts attempts first whatever its counts say', () => {
    const out = orderStatusRows([
      row('songs', 5, 5),
      row('attempts', 25, 25),
      row('goals', 2, 2),
    ]);
    expect(out[0].table).toBe('attempts');
  });

  it('surfaces mismatched tables above agreeing ones', () => {
    const out = orderStatusRows([
      row('songs', 5, 5),
      row('goals', 7, 3),
      row('drillSessions', 9, 9),
    ]);
    expect(out.map(r => r.table)).toEqual(['goals', 'drillSessions', 'songs']);
  });

  it('treats an unreadable cloud count as a problem, not agreement', () => {
    // cloud === null must never sort with the healthy rows — an
    // unanswered question reading as "fine" is how a real failure gets
    // scrolled past.
    const out = orderStatusRows([
      row('songs', 5, 5),
      row('spacingState', 12, null, 'offline'),
    ]);
    expect(out[0].table).toBe('spacingState');
  });

  it('sorts alphabetically inside each rank, so the list is stable', () => {
    // Two runs of the same data must read identically, or comparing
    // two devices by eye is impossible.
    const rows = [
      row('zebra', 1, 1),
      row('alpha', 1, 1),
      row('mid', 2, 1),
      row('beta', 3, 1),
    ];
    expect(orderStatusRows(rows).map(r => r.table))
      .toEqual(['beta', 'mid', 'alpha', 'zebra']);
    // Same input in a different order gives the same output.
    expect(orderStatusRows([...rows].reverse()).map(r => r.table))
      .toEqual(['beta', 'mid', 'alpha', 'zebra']);
  });

  it('does not mutate its input', () => {
    const rows = [row('b', 1, 1), row('attempts', 1, 1)];
    const before = rows.map(r => r.table);
    orderStatusRows(rows);
    expect(rows.map(r => r.table)).toEqual(before);
  });

  it('handles an empty list', () => {
    expect(orderStatusRows([])).toEqual([]);
  });
});
