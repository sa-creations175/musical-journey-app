import { describe, it, expect } from 'vitest';
import {
  buildPrepItemBreakdown,
  MAX_BREAKDOWN_ITEMS,
} from '../prepItemBreakdown';

describe('buildPrepItemBreakdown', () => {
  it('returns null for no items', () => {
    expect(buildPrepItemBreakdown(undefined, 120)).toBeNull();
    expect(buildPrepItemBreakdown([], 120)).toBeNull();
  });

  it('returns null for a list longer than the cap', () => {
    const many = Array.from({ length: MAX_BREAKDOWN_ITEMS + 1 }, (_, i) => `x:${i}`);
    expect(buildPrepItemBreakdown(many, 600)).toBeNull();
  });

  it('splits a uniform (unknown-format) block evenly', () => {
    const rows = buildPrepItemBreakdown(['x:1', 'x:2', 'x:3'], 90);
    expect(rows).not.toBeNull();
    expect(rows!.map(r => r.seconds)).toEqual([30, 30, 30]);
    // Unknown formats fall back to the raw ref as the label.
    expect(rows!.map(r => r.label)).toEqual(['x:1', 'x:2', 'x:3']);
  });

  it('weights scales by canonical per-cell time (nat-min 3× major)', () => {
    // major=30, natural-minor=90 → weights 30:90 → 1:3 of a 240s budget.
    const rows = buildPrepItemBreakdown(
      ['scale:major:C', 'scale:natural-minor:C'],
      240,
    );
    expect(rows).not.toBeNull();
    expect(rows!.map(r => r.seconds)).toEqual([60, 180]);
  });

  it('shares track the adjusted total (so +/- adjustment flows through)', () => {
    const small = buildPrepItemBreakdown(['scale:major:C', 'scale:natural-minor:C'], 120);
    expect(small!.map(r => r.seconds)).toEqual([30, 90]);
    const big = buildPrepItemBreakdown(['scale:major:C', 'scale:natural-minor:C'], 480);
    expect(big!.map(r => r.seconds)).toEqual([120, 360]);
  });

  it('weights the fluid chord-shape cell heavier than a plain cell', () => {
    // plain=90, fluid=120 → weights 90:120 → 3:4 of a 210s budget.
    const rows = buildPrepItemBreakdown(
      ['chord-shape:maj7:C:inv1', 'chord-shape:maj7:C:fluid'],
      210,
    );
    expect(rows).not.toBeNull();
    expect(rows!.map(r => r.seconds)).toEqual([90, 120]);
  });
});
