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
    // Important invariant: adding sub-groups can't double-count
    // items in module-wide aggregations. Picker UX ensures the user
    // picks either the shortcut OR the qualities, not both — the
    // SUM here is bookkeeping for the def list.
    //
    // Chord-shape side:
    //   legacy triads (288) + 6×48 quality sub-groups (288) +
    //   sevenths (360) + extensions (168) + special (36) = 1140
    // Scales side (Layer 1 + Layer 2 entries co-exist):
    //   legacy scale_drills (96) +
    //   scale_major (12) + scale_natural_minor (12) +
    //   scale_major_pentatonic (36) + 3×12 sp sub-groups (36) +
    //   scale_minor_pentatonic (36) + 3×12 sp sub-groups (36) = 264
    // Voice leading side (Layer 1 + Layer 2 entries co-exist, same
    // shape as the Scales side):
    //   legacy voice_leading (372) +
    //   diatonic-cycle (36) + five-one (72) + major-251 (72) +
    //   minor-251 (72) + minor-aba (24) + dom7b9 (48) + dim7 (48) = 744
    // Per-pattern denominators sum to 372 — same as the legacy bucket.
    // Aggregates use moduleItemCounts which doesn't double-count.
    const defSum = SHAPES_COVERAGE_GROUP_DEFS.reduce(
      (acc, g) => acc + g.denominator, 0,
    );
    const chordShapeSide = 288 + 6 * 48 + 360 + 168 + 36;
    const scalesSide = 96 + 12 + 12 + 36 + 3 * 12 + 36 + 3 * 12;
    const vlSide = 372 + 36 + 72 + 72 + 72 + 24 + 48 + 48;
    expect(defSum).toBe(chordShapeSide + scalesSide + vlSide);
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

describe('Scales sub-area coverage groups (Part 3)', () => {
  it('exposes all four Scales sub-area defs with catalog-sourced denominators', () => {
    expect(getShapesCoverageGroup('scale_major')!.denominator).toBe(12);
    expect(getShapesCoverageGroup('scale_natural_minor')!.denominator).toBe(12);
    expect(getShapesCoverageGroup('scale_major_pentatonic')!.denominator).toBe(36);
    expect(getShapesCoverageGroup('scale_minor_pentatonic')!.denominator).toBe(36);
  });

  it('exposes the six pent starting-point sub-defs at 12 cells each', () => {
    for (const id of [
      'scale_major_pentatonic_1',
      'scale_major_pentatonic_5',
      'scale_major_pentatonic_6',
      'scale_minor_pentatonic_1',
      'scale_minor_pentatonic_b3',
      'scale_minor_pentatonic_b7',
    ] as const) {
      expect(getShapesCoverageGroup(id)!.denominator).toBe(12);
    }
  });

  it('routes every Scales sub-area to the scale_drills activity area', () => {
    for (const id of [
      'scale_major',
      'scale_natural_minor',
      'scale_major_pentatonic',
      'scale_major_pentatonic_1',
      'scale_major_pentatonic_5',
      'scale_major_pentatonic_6',
      'scale_minor_pentatonic',
      'scale_minor_pentatonic_1',
      'scale_minor_pentatonic_b3',
      'scale_minor_pentatonic_b7',
    ]) {
      expect(coverageGroupIdToActivityArea(id)).toBe('scale_drills');
    }
  });

  describe('matchers — broad sub-areas', () => {
    it('scale_major accepts only major itemRefs', () => {
      const m = itemRefMatcherForCoverageGroup('scale_major')!;
      expect(m('scale:major:C')).toBe(true);
      expect(m('scale:major:Bb')).toBe(true);
      expect(m('scale:natural-minor:F')).toBe(false);
      expect(m('scale:major-pentatonic:1:C')).toBe(false);
      expect(m('chord-shape:maj:C:root')).toBe(false);
    });

    it('scale_natural_minor accepts only natural-minor itemRefs', () => {
      const m = itemRefMatcherForCoverageGroup('scale_natural_minor')!;
      expect(m('scale:natural-minor:F')).toBe(true);
      expect(m('scale:major:C')).toBe(false);
      expect(m('scale:minor-pentatonic:b3:C')).toBe(false);
    });

    it('scale_major_pentatonic accepts every starting point', () => {
      const m = itemRefMatcherForCoverageGroup('scale_major_pentatonic')!;
      expect(m('scale:major-pentatonic:1:C')).toBe(true);
      expect(m('scale:major-pentatonic:5:G')).toBe(true);
      expect(m('scale:major-pentatonic:6:Eb')).toBe(true);
      expect(m('scale:minor-pentatonic:1:C')).toBe(false);
      expect(m('scale:major:C')).toBe(false);
    });

    it('scale_minor_pentatonic accepts every starting point', () => {
      const m = itemRefMatcherForCoverageGroup('scale_minor_pentatonic')!;
      expect(m('scale:minor-pentatonic:1:C')).toBe(true);
      expect(m('scale:minor-pentatonic:b3:F')).toBe(true);
      expect(m('scale:minor-pentatonic:b7:Bb')).toBe(true);
      expect(m('scale:major-pentatonic:1:C')).toBe(false);
    });
  });

  describe('matchers — pent per-starting-point', () => {
    it('major-pent starting-point matchers narrow correctly', () => {
      const m1 = itemRefMatcherForCoverageGroup('scale_major_pentatonic_1')!;
      const m5 = itemRefMatcherForCoverageGroup('scale_major_pentatonic_5')!;
      const m6 = itemRefMatcherForCoverageGroup('scale_major_pentatonic_6')!;

      expect(m1('scale:major-pentatonic:1:C')).toBe(true);
      expect(m1('scale:major-pentatonic:5:C')).toBe(false);
      expect(m5('scale:major-pentatonic:5:Eb')).toBe(true);
      expect(m5('scale:major-pentatonic:6:Eb')).toBe(false);
      expect(m6('scale:major-pentatonic:6:G')).toBe(true);
      expect(m6('scale:major-pentatonic:1:G')).toBe(false);
      // Reject minor-pent itemRefs even with matching sp digit.
      expect(m1('scale:minor-pentatonic:1:C')).toBe(false);
    });

    it('minor-pent starting-point matchers narrow correctly', () => {
      const m1 = itemRefMatcherForCoverageGroup('scale_minor_pentatonic_1')!;
      const mB3 = itemRefMatcherForCoverageGroup('scale_minor_pentatonic_b3')!;
      const mB7 = itemRefMatcherForCoverageGroup('scale_minor_pentatonic_b7')!;

      expect(m1('scale:minor-pentatonic:1:C')).toBe(true);
      expect(m1('scale:minor-pentatonic:b3:C')).toBe(false);
      expect(mB3('scale:minor-pentatonic:b3:F')).toBe(true);
      expect(mB3('scale:minor-pentatonic:b7:F')).toBe(false);
      expect(mB7('scale:minor-pentatonic:b7:Bb')).toBe(true);
      // Reject major-pent itemRefs even with matching sp digit.
      expect(mB3('scale:major-pentatonic:1:C')).toBe(false);
    });
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

describe('Voice-leading per-pattern coverage groups', () => {
  const VL_PATTERN_DEFS: ReadonlyArray<{
    id: ShapesCoverageGroupId;
    patternId: string;
    denominator: number;
    sampleRef: string;
  }> = [
    {
      id: 'voice_leading_diatonic_cycle',
      patternId: 'diatonic-cycle',
      denominator: 36,
      sampleRef: 'vl:diatonic-cycle:pos1:C',
    },
    {
      id: 'voice_leading_five_one',
      patternId: 'five-one',
      denominator: 72,
      sampleRef: 'vl:five-one:guide-tones:A:C',
    },
    {
      id: 'voice_leading_major_251',
      patternId: 'major-251',
      denominator: 72,
      sampleRef: 'vl:major-251:seventh-chords:B:Bb',
    },
    {
      id: 'voice_leading_minor_251',
      patternId: 'minor-251',
      denominator: 72,
      sampleRef: 'vl:minor-251:full-voicing:A:F',
    },
    {
      id: 'voice_leading_minor_aba',
      patternId: 'minor-aba',
      denominator: 24,
      sampleRef: 'vl:minor-aba:pos-A:G',
    },
    {
      id: 'voice_leading_dom7b9',
      patternId: 'dom7b9',
      denominator: 48,
      sampleRef: 'vl:dom7b9:pos2:D',
    },
    {
      id: 'voice_leading_dim7',
      patternId: 'dim7',
      denominator: 48,
      sampleRef: 'vl:dim7:pos4:Eb',
    },
  ];

  it('exposes all 7 per-pattern defs with catalog-sourced denominators', () => {
    for (const d of VL_PATTERN_DEFS) {
      const def = getShapesCoverageGroup(d.id);
      expect(def, `missing def for ${d.id}`).toBeDefined();
      expect(def!.denominator).toBe(d.denominator);
      expect(def!.activityArea).toBe('voice_leading');
    }
  });

  it('per-pattern denominators sum to the broad voice_leading bucket (372)', () => {
    const sum = VL_PATTERN_DEFS.reduce(
      (acc, d) => acc + getShapesCoverageGroup(d.id)!.denominator,
      0,
    );
    expect(sum).toBe(getShapesCoverageGroup('voice_leading')!.denominator);
    expect(sum).toBe(372);
  });

  it('every per-pattern id routes to the voice_leading activity area', () => {
    for (const d of VL_PATTERN_DEFS) {
      expect(coverageGroupIdToActivityArea(d.id)).toBe('voice_leading');
    }
  });

  it('each matcher accepts only its own pattern\'s itemRefs', () => {
    for (const target of VL_PATTERN_DEFS) {
      const m = itemRefMatcherForCoverageGroup(target.id)!;
      expect(m, `missing matcher for ${target.id}`).not.toBeNull();
      // Accepts its own sample.
      expect(m(target.sampleRef)).toBe(true);
      // Rejects every sibling pattern's sample.
      for (const other of VL_PATTERN_DEFS) {
        if (other.id === target.id) continue;
        expect(
          m(other.sampleRef),
          `${target.id} should reject ${other.sampleRef}`,
        ).toBe(false);
      }
      // Rejects non-VL itemRefs.
      expect(m('chord-shape:maj:C:root')).toBe(false);
      expect(m('scale:major:C')).toBe(false);
      // Rejects malformed VL refs.
      expect(m('vl:not-a-pattern:C')).toBe(false);
    }
  });

  it('broad voice_leading matcher still accepts every pattern (back-compat)', () => {
    const broad = itemRefMatcherForCoverageGroup('voice_leading')!;
    for (const d of VL_PATTERN_DEFS) {
      expect(broad(d.sampleRef)).toBe(true);
    }
  });
});
