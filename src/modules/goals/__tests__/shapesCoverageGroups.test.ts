// @vitest-environment jsdom
/**
 * shapesCoverageGroups.ts — denominators, matchers, and the Layer 2
 * triad-quality coverage groups.
 */
import { describe, expect, it } from 'vitest';
import {
  SHAPES_COVERAGE_GROUP_DEFS,
  coverageGroupIdToActivityArea,
  getShapesCoverageGroup,
  itemRefMatcherForCoverageGroup,
  type ShapesCoverageGroupId,
} from '../shapesCoverageGroups';

const TRIAD_QUALITY_IDS: ReadonlyArray<ShapesCoverageGroupId> = [
  'chord_shape_triads_maj',
  'chord_shape_triads_min',
  'chord_shape_triads_dim',
  'chord_shape_triads_aug',
  'chord_shape_triads_sus2',
  'chord_shape_triads_sus4',
];

describe('SHAPES_COVERAGE_GROUP_DEFS — Layer 2 triad qualities', () => {
  it('exposes all 6 per-quality triad sub-groups + the legacy shortcut', () => {
    for (const id of TRIAD_QUALITY_IDS) {
      const def = getShapesCoverageGroup(id);
      expect(def, `missing group def for ${id}`).toBeDefined();
      // 1 quality × 12 keys × 4 inversion states = 48 items each.
      expect(def!.denominator).toBe(48);
      expect(def!.activityArea).toBe('chord_shape_drills');
    }
    // Legacy "all triads" shortcut still present at 288 (6 × 12 × 4).
    expect(getShapesCoverageGroup('chord_shape_triads')!.denominator).toBe(288);
  });

  it('Layer 2 denominators sum to the Layer 1 triad-inversions denominator', () => {
    const sum = TRIAD_QUALITY_IDS.reduce(
      (acc, id) => acc + (getShapesCoverageGroup(id)!.denominator),
      0,
    );
    expect(sum).toBe(getShapesCoverageGroup('chord_shape_triads')!.denominator);
  });

  it('all triad-related ids roll up to the chord_shape_drills activity area', () => {
    expect(coverageGroupIdToActivityArea('chord_shape_triads')).toBe('chord_shape_drills');
    for (const id of TRIAD_QUALITY_IDS) {
      expect(coverageGroupIdToActivityArea(id)).toBe('chord_shape_drills');
    }
  });

  it('total count across all picker options sums to the def list', () => {
    // Important invariant: adding the 6 quality sub-groups can't
    // double-count items in module-wide aggregations. Picker UX
    // ensures the user picks either the shortcut OR the qualities,
    // not both — the SUM here is bookkeeping for the def list.
    // Sum = legacy triads (288) + 6×48 quality sub-groups (288) +
    //       sevenths (360) + extensions (168) + special (36) +
    //       scale (96 post-Scales fan-out) + vl (36) = 1272 in the
    //       def list (Layer 1 + Layer 2 entries co-exist for picker
    //       convenience; aggregates use moduleItemCounts which
    //       doesn't double-count).
    const defSum = SHAPES_COVERAGE_GROUP_DEFS.reduce(
      (acc, g) => acc + g.denominator, 0,
    );
    expect(defSum).toBe(288 + 6 * 48 + 360 + 168 + 36 + 96 + 36);
  });
});

describe('itemRefMatcherForCoverageGroup — scale_drills covers pent fan-out', () => {
  it('matches both 3-part and 4-part scale itemRefs', () => {
    const matcher = itemRefMatcherForCoverageGroup('scale_drills')!;
    expect(matcher).not.toBeNull();
    // Existing 3-part itemRefs (major / nat-min).
    expect(matcher('scale:major:C')).toBe(true);
    expect(matcher('scale:natural-minor:F')).toBe(true);
    // 4-part pent itemRefs introduced by Scales submodule Part 1.
    expect(matcher('scale:major-pentatonic:5:Eb')).toBe(true);
    expect(matcher('scale:minor-pentatonic:b3:Bb')).toBe(true);
    // Non-scale itemRefs still reject.
    expect(matcher('chord-shape:maj:C:root')).toBe(false);
    expect(matcher('vl:aba-251:C')).toBe(false);
  });
});

describe('itemRefMatcherForCoverageGroup — Layer 2 quality matchers', () => {
  it('per-quality matchers accept their own quality, reject others', () => {
    const majMatcher = itemRefMatcherForCoverageGroup('chord_shape_triads_maj')!;
    expect(majMatcher).not.toBeNull();
    expect(majMatcher('chord-shape:maj:C:root')).toBe(true);
    expect(majMatcher('chord-shape:maj:G:inv2')).toBe(true);
    expect(majMatcher('chord-shape:min:C:root')).toBe(false);
    expect(majMatcher('chord-shape:dim:C:fluid')).toBe(false);
  });

  it('per-quality matchers reject the supplementary state', () => {
    const majMatcher = itemRefMatcherForCoverageGroup('chord_shape_triads_maj')!;
    // Triads don't actually have a supplementary state in the
    // current model (that's sevenths-only), but the matcher
    // defensively excludes it for forward-compat.
    expect(majMatcher('chord-shape:maj:C:supplementary')).toBe(false);
  });

  it('per-quality matchers reject non-chord-shape refs', () => {
    const minMatcher = itemRefMatcherForCoverageGroup('chord_shape_triads_min')!;
    expect(minMatcher('scale:major:C')).toBe(false);
    expect(minMatcher('vl:aba-251:C')).toBe(false);
  });

  it('legacy chord_shape_triads matcher still accepts every triad quality', () => {
    const all = itemRefMatcherForCoverageGroup('chord_shape_triads')!;
    expect(all('chord-shape:maj:C:root')).toBe(true);
    expect(all('chord-shape:min:G:inv2')).toBe(true);
    expect(all('chord-shape:dim:Eb:fluid')).toBe(true);
    expect(all('chord-shape:aug:F:inv1')).toBe(true);
    expect(all('chord-shape:sus2:Bb:root')).toBe(true);
    expect(all('chord-shape:sus4:A:fluid')).toBe(true);
    // Sevenths shouldn't match the triads umbrella.
    expect(all('chord-shape:maj7:C:root')).toBe(false);
  });

  it('sus2 and sus4 matchers don\'t cross-match (substring guard)', () => {
    // Defensive: parts[1] is an exact match, not a startsWith, so
    // 'sus2' and 'sus4' stay distinct even though one suffix is a
    // prefix of nothing relevant. Test pins the contract.
    const sus2 = itemRefMatcherForCoverageGroup('chord_shape_triads_sus2')!;
    const sus4 = itemRefMatcherForCoverageGroup('chord_shape_triads_sus4')!;
    expect(sus2('chord-shape:sus2:C:root')).toBe(true);
    expect(sus2('chord-shape:sus4:C:root')).toBe(false);
    expect(sus4('chord-shape:sus4:C:root')).toBe(true);
    expect(sus4('chord-shape:sus2:C:root')).toBe(false);
  });
});
