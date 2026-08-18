// @vitest-environment jsdom
/**
 * The shared four-step fluency scale.
 *
 * Two things here have real consequences and are pinned accordingly:
 * the legacy-5 collapse (rows written before "breakthrough" was
 * dropped still exist and must not read as null or as a 5), and
 * CONSISTENTLY_FLUENT_AVG, which replaced a literal that would have
 * silently stopped a promotion rule from ever firing.
 */
import { describe, expect, it } from 'vitest';
import {
  CONSISTENTLY_FLUENT_AVG,
  FEEL_OPTIONS,
  feelLabel,
  fluencyValue,
  normaliseFeel,
  type Feel,
} from '../fluencyScale';

describe('FEEL_OPTIONS', () => {
  it('is exactly four ascending steps', () => {
    expect(FEEL_OPTIONS.map(o => o.feel)).toEqual([1, 2, 3, 4]);
  });

  it('carries no breakthrough step', () => {
    // The fifth step was dropped deliberately: a breakthrough is an
    // event, not a level — you can have one while struggling.
    expect(FEEL_OPTIONS.some(o => o.label === 'breakthrough')).toBe(false);
  });

  it('projects onto the 25/50/75/100 values the dashboard averages', () => {
    expect(FEEL_OPTIONS.map(o => o.value)).toEqual([25, 50, 75, 100]);
    expect(fluencyValue(1)).toBe(25);
    expect(fluencyValue(4)).toBe(100);
  });

  it('labels every step', () => {
    expect(feelLabel(1)).toBe('struggled');
    expect(feelLabel(3)).toBe('comfortable');
    expect(feelLabel(4)).toBe('in flow');
  });
});

describe('normaliseFeel', () => {
  it('passes current values through untouched', () => {
    for (const feel of [1, 2, 3, 4] as Feel[]) {
      expect(normaliseFeel(feel)).toBe(feel);
    }
  });

  it('COLLAPSES a legacy 5 onto 4, not to null', () => {
    // Rows written before the fifth step was dropped still hold 5.
    // Returning null would drop them from every average and count;
    // 4 narrows a category that no longer exists onto its nearest
    // surviving neighbour, since a breakthrough was at minimum in
    // flow. Nothing is promoted and nothing invented.
    expect(normaliseFeel(5)).toBe(4);
  });

  it('clamps rather than throwing on out-of-range values', () => {
    // Runs over historical rows on a read path — a corrupt value
    // should degrade one row, not blank a card.
    expect(normaliseFeel(99)).toBe(4);
    expect(normaliseFeel(0)).toBe(1);
    expect(normaliseFeel(-3)).toBe(1);
  });

  it('returns null only for genuinely absent values', () => {
    expect(normaliseFeel(null)).toBeNull();
    expect(normaliseFeel(undefined)).toBeNull();
    expect(normaliseFeel(NaN)).toBeNull();
  });
});

describe('CONSISTENTLY_FLUENT_AVG', () => {
  it('sits below the maximum, so the rule can actually fire', () => {
    // THE POINT. The rule it gates was `avg >= 4` on a 1-5 scale,
    // where 4 was reachable via a mix because 5s pulled 3s up. With
    // the fifth step gone, 4 is the maximum — keeping the literal
    // would demand five perfect sessions in a row, and the failure
    // would be silent: no error, just a prompt that never appears.
    expect(CONSISTENTLY_FLUENT_AVG).toBeLessThan(4);
    expect(CONSISTENTLY_FLUENT_AVG).toBeGreaterThan(3);
  });

  it('rejects five straight comfortables', () => {
    const avg = [3, 3, 3, 3, 3].reduce((a, b) => a + b) / 5;
    expect(avg >= CONSISTENTLY_FLUENT_AVG).toBe(false);
  });

  it('accepts a realistic mostly-in-flow run', () => {
    // Three in flow, two comfortable — "more often in flow than not",
    // which is what the threshold is meant to mean.
    const avg = [4, 4, 4, 3, 3].reduce((a, b) => a + b) / 5;
    expect(avg >= CONSISTENTLY_FLUENT_AVG).toBe(true);
  });
});
