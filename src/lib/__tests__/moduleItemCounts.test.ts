// @vitest-environment jsdom
/**
 * Phase 2 step 3 contract tests. Pins the live denominators that the
 * coverage goal UI in GoalCreationFlow.tsx now reads from
 * `moduleItemCounts`. Catalog drift fails these tests on purpose:
 * when content grows, the failing test points directly at the
 * sub-area whose count changed so the UI denominators move with it.
 *
 * jsdom env is needed because the catalog imports transitively pull
 * `db.ts`, which assigns `window.db` under an `import.meta.env.DEV`
 * guard at module load — same pattern as spacingState.test.ts.
 */
import { describe, it, expect } from 'vitest';
import {
  earTrainingCounts,
  harmonicFluencyCounts,
  shapesCounts,
  productionCounts,
} from '../moduleItemCounts';

// -------------------------------------------------------------------
// Ear Training — 26 + 30 + 69 + 18 = 143 (spacingState-row counts)
// -------------------------------------------------------------------

describe('earTrainingCounts', () => {
  const c = earTrainingCounts();

  it('intervals = 13 catalog × 2 directions = 26', () => {
    expect(c.intervals).toBe(26);
  });

  it('chordRecognition = 30', () => {
    expect(c.chordRecognition).toBe(30);
  });

  it('chordProgressions = 69 (full PROGRESSIONS catalog)', () => {
    expect(c.chordProgressions).toBe(69);
  });

  it('scalesModes = 9 modes × 2 tabs (HearScale + SitInside) = 18', () => {
    expect(c.scalesModes).toBe(18);
  });

  it('total = 143 (sum of sub-areas)', () => {
    expect(c.total).toBe(143);
    expect(c.total).toBe(
      c.intervals + c.chordRecognition + c.chordProgressions + c.scalesModes,
    );
  });
});

// -------------------------------------------------------------------
// Harmonic Fluency — 337 + 100 + 105 + 107 = 649
// (Foundational now includes pentatonic-scales; key-signatures grew
//  by 18 ksc-* scale-construction cards. Pentatonics went 7 → 41 on
//  24 Aug 2026: the two keyed shapes became twelve keys each and a
//  major-pentatonic shape was added, so 5 formula cards + 36 keyed.)
// (Scale-degree math went 84 → 168 on 24 Aug 2026: the quality-carrying
//  set replaced the originals, which survive inside it as its
//  alteration-zero subset. It passed through 252 while both sets were
//  live, so a reader's history could be migrated before the old ids
//  were deleted — see sdmQualityMigration.ts.)
// -------------------------------------------------------------------

describe('harmonicFluencyCounts', () => {
  const c = harmonicFluencyCounts();

  it('foundational = sdm 168 + nn 24 + ks 57 + pent 41 + tt 12 + enh 35 = 337', () => {
    expect(c.byGroup.foundational).toBe(337);
  });

  it('chordKnowledge = dq 20 + cc 20 + sc 60 = 100', () => {
    expect(c.byGroup.chordKnowledge).toBe(100);
  });

  it('functionalApplied = fh 52 + rkp 27 + pr 26 = 105', () => {
    expect(c.byGroup.functionalApplied).toBe(105);
  });

  it('earRecognition = mo 52 + iv 40 + et 15 = 107', () => {
    expect(c.byGroup.earRecognition).toBe(107);
  });

  it('total = 649 across all 15 categories', () => {
    expect(c.total).toBe(649);
  });

  it('total equals sum of group totals', () => {
    const groupSum =
      c.byGroup.foundational +
      c.byGroup.chordKnowledge +
      c.byGroup.functionalApplied +
      c.byGroup.earRecognition;
    expect(groupSum).toBe(c.total);
  });

  it('byCategory covers all 15 canonical categories', () => {
    expect(Object.keys(c.byCategory).sort()).toEqual([
      'chord-construction',
      'diatonic-qualities',
      'ear-theory',
      'enharmonic-equivalents',
      'functional-harmony',
      'intervals',
      'key-signatures',
      'modes',
      'named-notes',
      'pentatonic-scales',
      'progressions',
      'reverse-key-pivots',
      'scale-degree-math',
      'slash-chords',
      'tritone-pairs',
    ]);
  });

  it('byCategory sums to total', () => {
    const sum = Object.values(c.byCategory).reduce((a, b) => a + b, 0);
    expect(sum).toBe(c.total);
  });
});

// -------------------------------------------------------------------
// Shapes & Patterns — post 20 Aug 2026 drill-catalog cut:
// triads (6×12×4 = 288) + sevenths (6×12×6 = 432) = 720 chord-shape;
// + 96 scales + 372 voice-leading = 1188 total (Mental Viz excluded).
// Extensions (14) and special/sixth (3) left the catalog — see
// docs/DASHBOARD_REDESIGN_DESIGN.md § Catalog cuts.
// Supplementary two-handed seventh rows are excluded — they're
// practice tools, not acquisition-gating items. That is the whole
// EVERY inversion state gates since 20 Aug 2026, supplementary
// included, so materialisable and gating are the same 720.
// -------------------------------------------------------------------

describe('shapesCounts', () => {
  const c = shapesCounts();

  it('chordShapeDrills counts triad + seventh inversion states only', () => {
    // 6×12×4 + 6×12×6 = 288 + 432 = 720
    expect(c.chordShapeDrills).toBe(720);
  });

  it('scaleDrills = 96 from the Scales-submodule catalog (12 + 36 + 12 + 36)', () => {
    // major (12) + major-pent 3 sp × 12 keys (36) + nat-min (12)
    // + minor-pent 3 sp × 12 keys (36) = 96. SCALE_CELLS in
    // scaleSkills.ts is the source of truth.
    expect(c.scaleDrills).toBe(96);
  });

  it('voiceLeading = 31 sub-cells × 12 keys = 372 (Phase 1 VL catalog)', () => {
    // Per src/docs/VOICE_LEADING_SUBMODULE_DESIGN.md § Total Cell Count
    // (corrected catalog): five-one (6) + major-251 (6) + minor-251 (6)
    // + diatonic-cycle (3) + minor-aba (2) + dom7b9 (4) + dim7 (4)
    // = 31 sub-cells per key × 12 keys.
    expect(c.voiceLeading).toBe(372);
  });

  it('total = 1188 (sum of sub-areas)', () => {
    // 720 chord-shape + 96 scale + 372 voice-leading.
    expect(c.total).toBe(1188);
    expect(c.total).toBe(c.chordShapeDrills + c.scaleDrills + c.voiceLeading);
  });

  it('total excludes Mental Visualization (no mentalViz field on the shape)', () => {
    // Defensive contract: if anyone adds Mental Viz to ShapesCounts,
    // this test stays the canonical reminder that mental-viz is a
    // consistency-only surface per the April 27 design call.
    expect(Object.keys(c)).not.toContain('mentalViz');
    expect(Object.keys(c)).not.toContain('mentalVisualization');
  });
});

// -------------------------------------------------------------------
// Production — 8 + 8 + 8 + 22 + 5 + 5 = 56
// -------------------------------------------------------------------

describe('productionCounts', () => {
  const c = productionCounts();

  it('byPath has all 6 canonical paths', () => {
    expect(Object.keys(c.byPath).sort()).toEqual([
      'arrangement',
      'business',
      'genre-productions',
      'language-of-production',
      'vocal-production',
      'workflow-foundations',
    ]);
  });

  it('workflow-foundations = 8', () => {
    expect(c.byPath['workflow-foundations']).toBe(8);
  });

  it('language-of-production = 8', () => {
    expect(c.byPath['language-of-production']).toBe(8);
  });

  it('vocal-production = 8', () => {
    expect(c.byPath['vocal-production']).toBe(8);
  });

  it('genre-productions = 22 (11 two-session arcs)', () => {
    expect(c.byPath['genre-productions']).toBe(22);
  });

  it('arrangement = 5', () => {
    expect(c.byPath['arrangement']).toBe(5);
  });

  it('business = 5', () => {
    expect(c.byPath['business']).toBe(5);
  });

  it('total = 56 (sum of paths)', () => {
    expect(c.total).toBe(56);
    const pathSum = Object.values(c.byPath).reduce((a, b) => a + b, 0);
    expect(pathSum).toBe(c.total);
  });
});
