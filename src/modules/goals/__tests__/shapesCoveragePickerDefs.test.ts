/**
 * One picker source, not two.
 *
 * GoalCreationFlow used to render every coverage-group def while
 * GoalSuggestionFlow filtered `denominator > 0` on extension families
 * only. The two disagreed about what was offerable even before the
 * 20 Aug 2026 catalog cut; after it, that gap would have shown eight
 * "(0 items)" pills in one flow and none in the other.
 */
import { describe, expect, it } from 'vitest';
import {
  SHAPES_COVERAGE_GROUP_DEFS,
  SHAPES_COVERAGE_PICKER_DEFS,
} from '../shapesCoverageGroups';

describe('SHAPES_COVERAGE_PICKER_DEFS', () => {
  it('offers only groups that have items', () => {
    expect(SHAPES_COVERAGE_PICKER_DEFS.every(g => g.denominator > 0)).toBe(true);
  });

  it('drops every extension and sixth group after the cut', () => {
    const dropped = SHAPES_COVERAGE_PICKER_DEFS.filter(
      g => g.id.startsWith('chord_shape_extensions') || g.id === 'chord_shape_special',
    );
    expect(dropped).toEqual([]);
  });

  it('keeps the full def list intact for saved goals to resolve against', () => {
    // The defs still exist — the scope-shrank notice needs a zero-item
    // id to resolve to a human label so it can name what went away.
    expect(SHAPES_COVERAGE_GROUP_DEFS.length)
      .toBeGreaterThan(SHAPES_COVERAGE_PICKER_DEFS.length);
    expect(
      SHAPES_COVERAGE_GROUP_DEFS.find(g => g.id === 'chord_shape_extensions'),
    ).toBeDefined();
  });

  it('still offers triads, sevenths, scales and voice-leading', () => {
    const ids = SHAPES_COVERAGE_PICKER_DEFS.map(g => g.id);
    expect(ids).toContain('chord_shape_triads');
    expect(ids).toContain('chord_shape_sevenths');
    expect(ids).toContain('scale_drills');
    expect(ids).toContain('voice_leading');
  });

  it('is derived, not a blocklist — a returning quality comes back on its own', () => {
    // Nothing here names a cut quality. The filter is the live
    // denominator, so re-adding maj9 to CHORD_QUALITIES restores its
    // family pill without touching this file or either picker.
    const src = SHAPES_COVERAGE_PICKER_DEFS.map(g => g.id).join(' ');
    expect(src).not.toMatch(/maj9|min9|dom9|maj6/);
  });
});
