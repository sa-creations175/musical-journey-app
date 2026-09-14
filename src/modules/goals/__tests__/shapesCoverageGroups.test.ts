// @vitest-environment jsdom
/**
 * shapesCoverageGroups.ts — denominators, matchers, and the Layer 2
 * triad-quality coverage groups.
 */
import { shapesTargetUniverse } from '../../shapes-and-patterns/cellTargets';
import { countsTowardShapesCoverage } from '../../shapes-and-patterns/drillModel';
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
      // 1 quality × 13 cells × 4 inversion states × 3 HANDS = 156.
      // The hand axis arrived on 31 Aug 2026: a denominator has to
      // count what the numerator counts, and the numerator has always
      // counted spacingState rows, which are per hand. Thirteen cells
      // since 14 Sep 2026: the twelve keys and the Circle of 4ths.
      expect(def!.denominator).toBe(156);
      expect(def!.activityArea).toBe('chord_shape_drills');
    }
    // Legacy "all triads" shortcut still present at 936 (6 × 156).
    expect(getShapesCoverageGroup('chord_shape_triads')!.denominator).toBe(936);
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
    //   sevenths (432) + extensions (168) + special (36) = 1212
    // Scales side (Layer 1 + Layer 2 entries co-exist):
    //   legacy scale_drills (96) +
    //   scale_major (12) + scale_natural_minor (12) +
    //   scale_major_pentatonic (36) + 3×12 sp sub-groups (36) +
    //   scale_minor_pentatonic (36) + 3×12 sp sub-groups (36) = 264
    // Voice leading side (Layer 1 + Layer 2 entries co-exist, same
    // shape as the Scales side):
    //   legacy voice_leading (408) +
    //   diatonic-cycle (36) + five-one (72) + major-251 (72) +
    //   minor-251 (72) + minor-aba (24) + dom7b9 (48) + dim7 (48) = 744
    // Per-pattern denominators sum to 408 — same as the legacy bucket.
    // Aggregates use moduleItemCounts which doesn't double-count.
    const defSum = SHAPES_COVERAGE_GROUP_DEFS.reduce(
      (acc, g) => acc + g.denominator, 0,
    );
    // Chord-shape side, post 20 Aug 2026 catalog cut. Every extension
    // and special bucket is still DEFINED (saved goals reference them,
    // and the scope-shrank notice needs their labels) but every one
    // now contributes 0:
    //   triads bucket (864) + 6 triad-quality subs (6×144=864) +
    //   sevenths bucket (1080) + 6 seventh-quality subs (6×180=1080) +
    //   extensions bucket (0) + 6 extension families (0) +
    //   special bucket (0)
    //
    // The seventh figures went 432 → 1080 on 31 Aug 2026: supplementary
    // left the score (6 inversion states per quality back to 5) and the
    // hand axis arrived (×3). And every figure is thirteen cells rather
    // than twelve since the Circle of 4ths cell joined on 14 Sep 2026.
    const chordShapeSide =
      936 + 6 * 156 +
      1170 + 6 * 195 +
      0 + 0 +
      0;
    // Scales gain the hand axis too — 96 cells are 288 drills.
    const scalesSide = 288 + 36 + 36 + 108 + 3 * 36 + 108 + 3 * 36;
    // Voice leading is two-handed by nature: one target per cell and
    // nothing to multiply. The broad bucket plus the twelve
    // per-pattern groups — eight of them 84, since the five named
    // progressions are shaped like Major 2-5-1.
    const vlSide = 828 + 36 + 84 * 8 + 24 + 48 + 48;
    expect(defSum).toBe(chordShapeSide + scalesSide + vlSide);
  });
});

describe('a coverage goal cannot exceed 100%', () => {
  /**
   * =====================================================================
   * THE BUG THIS JOB CLOSES, SIMULATED END TO END.
   *
   * The numerator counts spacingState ROWS through
   * `countsTowardShapesCoverage` and the group's matcher. A row is
   * `(itemRef, hand)`. The denominator had no hand axis and counted
   * `supplementary`, so drilling a group out fully put a numerator of
   * up to three times the denominator on screen.
   *
   * Here the whole catalog is treated as drilled — every target, every
   * hand — which is the most a numerator can ever reach. For every
   * group, that number equals its denominator exactly. Not "under":
   * EQUAL, because a denominator that a completed catalog cannot reach
   * is the same kind of lie in the other direction.
   * =====================================================================
   */
  const everythingDrilled = shapesTargetUniverse()
    .filter(t => countsTowardShapesCoverage(t.itemRef));

  it('for every group, a fully drilled catalog lands on exactly 100%', () => {
    for (const def of SHAPES_COVERAGE_GROUP_DEFS) {
      const matcher = itemRefMatcherForCoverageGroup(def.id);
      if (!matcher) continue;
      const covered = everythingDrilled.filter(t => matcher(t.itemRef)).length;
      expect(covered, `${def.id} numerator`).toBe(def.denominator);
    }
  });

  it('and drilling the supplementary voicing adds nothing on either side', () => {
    // The rows still exist for anyone who drilled them. They are not in
    // the universe and they fail the predicate, so they cannot inflate
    // a numerator against a denominator that does not count them.
    expect(countsTowardShapesCoverage('chord-shape:maj7:C:supplementary')).toBe(false);
    expect(everythingDrilled.some(t => t.itemRef.endsWith(':supplementary')))
      .toBe(false);
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
    // 12 keys × 3 hands, and the pents × 3 starting points.
    expect(getShapesCoverageGroup('scale_major')!.denominator).toBe(36);
    expect(getShapesCoverageGroup('scale_natural_minor')!.denominator).toBe(36);
    expect(getShapesCoverageGroup('scale_major_pentatonic')!.denominator).toBe(108);
    expect(getShapesCoverageGroup('scale_minor_pentatonic')!.denominator).toBe(108);
  });

  it('exposes the six pent starting-point sub-defs at 36 drills each', () => {
    for (const id of [
      'scale_major_pentatonic_1',
      'scale_major_pentatonic_5',
      'scale_major_pentatonic_6',
      'scale_minor_pentatonic_1',
      'scale_minor_pentatonic_b3',
      'scale_minor_pentatonic_b7',
    ] as const) {
      // 12 keys × 3 hands.
      expect(getShapesCoverageGroup(id)!.denominator).toBe(36);
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

  it('per-quality matchers now ACCEPT the supplementary state', () => {
    const majMatcher = itemRefMatcherForCoverageGroup('chord_shape_triads_maj')!;
    // Triads don't actually have a supplementary state in the
    // current model (that's sevenths-only), but the matcher
    // defensively excludes it for forward-compat.
    expect(majMatcher('chord-shape:maj:C:supplementary')).toBe(true);
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
      denominator: 84,
      sampleRef: 'vl:five-one:guide-tones:A:C',
    },
    {
      id: 'voice_leading_major_251',
      patternId: 'major-251',
      denominator: 84,
      sampleRef: 'vl:major-251:seventh-chords:B:Bb',
    },
    {
      id: 'voice_leading_minor_251',
      patternId: 'minor-251',
      denominator: 84,
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
    // The five named progressions, added to the passes 9 Sep 2026.
    // Shaped like Major 2-5-1, so 7 cells a key and 84 in all.
    {
      id: 'voice_leading_1_5_6_4',
      patternId: '1-5-6-4',
      denominator: 84,
      sampleRef: 'vl:1-5-6-4:guide-tones:A:C',
    },
    {
      id: 'voice_leading_1_6_4_5',
      patternId: '1-6-4-5',
      denominator: 84,
      sampleRef: 'vl:1-6-4-5:seventh-chords:C:F',
    },
    {
      id: 'voice_leading_1_6_2_5',
      patternId: '1-6-2-5',
      denominator: 84,
      sampleRef: 'vl:1-6-2-5:full-voicing:B:G',
    },
    {
      id: 'voice_leading_1_4_5',
      patternId: '1-4-5',
      denominator: 84,
      sampleRef: 'vl:1-4-5:guide-tones:B:Bb',
    },
    {
      id: 'voice_leading_backdoor',
      patternId: 'backdoor',
      denominator: 84,
      sampleRef: 'vl:backdoor:seventh-chords:A:Eb',
    },
  ];

  it('exposes a def per pattern, with catalog-sourced denominators', () => {
    for (const d of VL_PATTERN_DEFS) {
      const def = getShapesCoverageGroup(d.id);
      expect(def, `missing def for ${d.id}`).toBeDefined();
      expect(def!.denominator).toBe(d.denominator);
      expect(def!.activityArea).toBe('voice_leading');
    }
  });

  it('per-pattern denominators sum to the broad voice_leading bucket (828)', () => {
    const sum = VL_PATTERN_DEFS.reduce(
      (acc, d) => acc + getShapesCoverageGroup(d.id)!.denominator,
      0,
    );
    expect(sum).toBe(getShapesCoverageGroup('voice_leading')!.denominator);
    // 408 until the five named progressions joined the passes on
    // 9 Sep 2026. Every one of them has a per-pattern group of its
    // own, which is what keeps this sum equal to the bucket.
    expect(sum).toBe(828);
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

// =====================================================================
// Seventh-chord Layer 2 (per-quality sub-groups)
// =====================================================================

describe('Seventh-chord per-quality coverage groups', () => {
  const SEVENTH_QUALITY_IDS: ReadonlyArray<{
    id: ShapesCoverageGroupId;
    quality: string;
  }> = [
    { id: 'chord_shape_sevenths_maj7',  quality: 'maj7' },
    { id: 'chord_shape_sevenths_min7',  quality: 'min7' },
    { id: 'chord_shape_sevenths_dom7',  quality: 'dom7' },
    { id: 'chord_shape_sevenths_m7b5',  quality: 'm7b5' },
    { id: 'chord_shape_sevenths_dim7',  quality: 'dim7' },
    { id: 'chord_shape_sevenths_mmaj7', quality: 'mmaj7' },
  ];

  it('exposes all 6 per-quality seventh defs at 195 drills each', () => {
    for (const d of SEVENTH_QUALITY_IDS) {
      const def = getShapesCoverageGroup(d.id);
      expect(def, `missing def for ${d.id}`).toBeDefined();
      // 13 cells (twelve keys and the Circle of 4ths) × 5 inversion
      // states × 3 hands = 195. Supplementary is the sixth state and is
      // out of the score.
      expect(def!.denominator).toBe(195);
      expect(def!.activityArea).toBe('chord_shape_drills');
    }
  });

  it('Layer 2 denominators sum to the broad sevenths denominator', () => {
    const sum = SEVENTH_QUALITY_IDS.reduce(
      (acc, d) => acc + getShapesCoverageGroup(d.id)!.denominator,
      0,
    );
    expect(sum).toBe(getShapesCoverageGroup('chord_shape_sevenths')!.denominator);
    expect(sum).toBe(1170);
  });

  it('each matcher accepts only its own quality', () => {
    for (const target of SEVENTH_QUALITY_IDS) {
      const m = itemRefMatcherForCoverageGroup(target.id)!;
      expect(m, `missing matcher for ${target.id}`).not.toBeNull();
      expect(m(`chord-shape:${target.quality}:C:root`)).toBe(true);
      expect(m(`chord-shape:${target.quality}:Eb:inv3`)).toBe(true);
      for (const other of SEVENTH_QUALITY_IDS) {
        if (other.id === target.id) continue;
        expect(
          m(`chord-shape:${other.quality}:C:root`),
          `${target.id} should reject ${other.quality}`,
        ).toBe(false);
      }
      // Reject non-seventh chord-shape refs + non-chord-shape refs.
      expect(m('chord-shape:maj:C:root')).toBe(false);
      expect(m('scale:major:C')).toBe(false);
      expect(m('vl:diatonic-cycle:pos1:C')).toBe(false);
    }
  });

  it('SUPPLEMENTARY IS IN NO DENOMINATOR', () => {
    /**
     * The state matcher still accepts the ref — a matcher answers
     * "is this in this group", and a supplementary min7 row IS a min7
     * row. What decides whether it counts is the ENUMERATION, and
     * `chordCellTargets` has never emitted it.
     *
     * So the denominator is 195 and not 234, and no amount of
     * supplementary drilling can push a coverage goal past 100%,
     * because `countsTowardShapesCoverage` drops those rows on the
     * numerator side too. Both sides or neither.
     */
    const denom = getShapesCoverageGroup('chord_shape_sevenths_min7')!.denominator;
    expect(denom).toBe(195);
    expect(shapesTargetUniverse().some(t => t.itemRef.endsWith(':supplementary')))
      .toBe(false);
    expect(countsTowardShapesCoverage('chord-shape:min7:C:supplementary')).toBe(false);
  });
});

// =====================================================================
// Extension family Layer 2 (4 active + 2 forward-compat placeholders)
// =====================================================================

describe('Extension-family coverage groups', () => {
  const EXTENSION_FAMILIES: ReadonlyArray<{
    id: ShapesCoverageGroupId;
    qualities: ReadonlyArray<string>;
    denominator: number;
  }> = [
    {
      id: 'chord_shape_extensions_major',
      qualities: ['maj9', 'maj11', 'maj13', 'maj7s11', 'add9'],
      denominator: 60,
    },
    {
      id: 'chord_shape_extensions_minor',
      qualities: ['min9', 'min11', 'min13'],
      denominator: 36,
    },
    {
      id: 'chord_shape_extensions_dominant',
      qualities: ['dom9', 'dom11', 'dom13'],
      denominator: 36,
    },
    {
      id: 'chord_shape_extensions_altered_dominant',
      qualities: ['dom7b9', 'dom7s9', 'dom7b13'],
      denominator: 36,
    },
  ];

  // The 20 Aug 2026 drill-catalog cut removed every extension and
  // sixth-family quality, so all of these denominators are now 0.
  //
  // The DEFS DELIBERATELY REMAIN. A goal saved before the cut can
  // still carry `chord_shape_extensions_dominant` as its sub-area, and
  // the scope-shrank notice needs the id to resolve to a label so it
  // can say WHICH scope went away. What gets removed is their place in
  // the pickers, not their existence.
  it('still exposes every family def, now at zero cells', () => {
    for (const f of EXTENSION_FAMILIES) {
      const def = getShapesCoverageGroup(f.id);
      expect(def, `missing def for ${f.id}`).toBeDefined();
      expect(def!.denominator).toBe(0);
      expect(def!.activityArea).toBe('chord_shape_drills');
    }
    expect(getShapesCoverageGroup('chord_shape_extensions_diminished')!.denominator).toBe(0);
    expect(getShapesCoverageGroup('chord_shape_extensions_augmented')!.denominator).toBe(0);
  });

  it('the broad extensions and special buckets are zero too', () => {
    expect(getShapesCoverageGroup('chord_shape_extensions')!.denominator).toBe(0);
    expect(getShapesCoverageGroup('chord_shape_special')!.denominator).toBe(0);
  });

  it('family denominators still sum to the broad extensions denominator', () => {
    // The invariant survives the cut — both sides are 0. It is the
    // relationship that is pinned, not the number.
    const sum = EXTENSION_FAMILIES.reduce(
      (acc, f) => acc + getShapesCoverageGroup(f.id)!.denominator,
      0,
    );
    expect(sum).toBe(getShapesCoverageGroup('chord_shape_extensions')!.denominator);
  });

  it('each family matcher accepts only its own qualities', () => {
    for (const target of EXTENSION_FAMILIES) {
      const m = itemRefMatcherForCoverageGroup(target.id)!;
      expect(m, `missing matcher for ${target.id}`).not.toBeNull();
      // Accepts every quality in its family.
      for (const q of target.qualities) {
        expect(m(`chord-shape:${q}:C`), `${target.id} should accept ${q}`).toBe(true);
      }
      // Rejects every quality from every other family.
      for (const other of EXTENSION_FAMILIES) {
        if (other.id === target.id) continue;
        for (const q of other.qualities) {
          expect(
            m(`chord-shape:${q}:C`),
            `${target.id} should reject ${q}`,
          ).toBe(false);
        }
      }
      // Rejects non-extension chord-shape refs and non-chord-shape refs.
      expect(m('chord-shape:maj:C:root')).toBe(false);
      expect(m('chord-shape:maj7:C:root')).toBe(false);
      expect(m('scale:major:C')).toBe(false);
      expect(m('vl:diatonic-cycle:pos1:C')).toBe(false);
    }
  });

  it('placeholder matchers return false for every input today', () => {
    const dim = itemRefMatcherForCoverageGroup('chord_shape_extensions_diminished')!;
    const aug = itemRefMatcherForCoverageGroup('chord_shape_extensions_augmented')!;
    for (const sample of [
      'chord-shape:maj:C:root',
      'chord-shape:maj7:C:root',
      'chord-shape:maj9:C',
      'chord-shape:dom7b9:C',
      'scale:major:C',
      'vl:diatonic-cycle:pos1:C',
    ]) {
      expect(dim(sample)).toBe(false);
      expect(aug(sample)).toBe(false);
    }
  });

  it('routes every family id (incl. placeholders) to chord_shape_drills', () => {
    for (const id of [
      'chord_shape_extensions_major',
      'chord_shape_extensions_minor',
      'chord_shape_extensions_dominant',
      'chord_shape_extensions_altered_dominant',
      'chord_shape_extensions_diminished',
      'chord_shape_extensions_augmented',
    ]) {
      expect(coverageGroupIdToActivityArea(id)).toBe('chord_shape_drills');
    }
  });
});
