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

  it('splits by floored-canonical weights (major floored 60, nat-min 90)', () => {
    // weights 60:90 → 2:3 of a 240s budget → 96 / 144. Both ≥60, so the
    // per-item floor is a no-op here.
    const rows = buildPrepItemBreakdown(
      ['scale:major:C', 'scale:natural-minor:C'],
      240,
    );
    expect(rows).not.toBeNull();
    expect(rows!.map(r => r.seconds)).toEqual([96, 144]);
  });

  it('floors a small share up to 60 (matches the runner), shares grow with the total', () => {
    // weights 60:90. 120s → raw 48/72; major floors 48 → 60. 480s →
    // 192/288, both above the floor.
    const small = buildPrepItemBreakdown(['scale:major:C', 'scale:natural-minor:C'], 120);
    expect(small!.map(r => r.seconds)).toEqual([60, 72]);
    const big = buildPrepItemBreakdown(['scale:major:C', 'scale:natural-minor:C'], 480);
    expect(big!.map(r => r.seconds)).toEqual([192, 288]);
  });

  it('labels chord-recognition items with readable chord names (no :inversion suffix)', () => {
    const rows = buildPrepItemBreakdown(
      ['min:0', 'dim:0', 'aug:0', 'sus2:0'],
      240,
      'chord-recognition',
    );
    expect(rows).not.toBeNull();
    expect(rows!.map(r => r.label)).toEqual([
      'Minor', 'Diminished', 'Augmented', 'Sus2',
    ]);
  });

  it('appends the inversion for non-root chord-recognition items', () => {
    const rows = buildPrepItemBreakdown(['maj7:1'], 60, 'chord-recognition');
    expect(rows![0].label).toBe('Major 7 · 1st inversion');
  });

  it('without the chord-recognition moduleRef, refs fall back to raw (unchanged)', () => {
    const rows = buildPrepItemBreakdown(['min:0', 'dim:0'], 120);
    expect(rows!.map(r => r.label)).toEqual(['min:0', 'dim:0']);
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
