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
// Harmonic Fluency — 155 + 55 + 63 + 54 = 327
// (Foundational now includes pentatonic-scales; key-signatures grew
//  by 18 ksc-* scale-construction cards.)
// -------------------------------------------------------------------

describe('harmonicFluencyCounts', () => {
  const c = harmonicFluencyCounts();

  it('foundational = sdm 84 + nn 24 + ks 40 + pent 7 + tt 12 + enh 35 = 202', () => {
    expect(c.byGroup.foundational).toBe(202);
  });

  it('chordKnowledge = dq 20 + cc 20 + sc 16 = 56', () => {
    expect(c.byGroup.chordKnowledge).toBe(56);
  });

  it('functionalApplied = fh 19 + rkp 24 + pr 20 = 63', () => {
    expect(c.byGroup.functionalApplied).toBe(63);
  });

  it('earRecognition = mo 19 + iv 20 + et 15 = 54', () => {
    expect(c.byGroup.earRecognition).toBe(54);
  });

  it('total = 375 across all 15 categories', () => {
    expect(c.total).toBe(375);
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
// Shapes & Patterns — Phase 4 inversion redesign:
// triads (6×12×4 = 288) + sevenths (6×12×5 = 360) +
// extensions (14×12 = 168) + special (3×12 = 36) = 852 chord-shape;
// + 48 scales + 36 voice-leading = 936 total (Mental Viz excluded).
// Supplementary two-handed seventh rows are excluded — they're
// practice tools, not acquisition-gating items.
// -------------------------------------------------------------------

describe('shapesCounts', () => {
  const c = shapesCounts();

  it('chordShapeDrills counts triad+seventh inversions plus voicing-based extensions/special', () => {
    // 6×12×4 + 6×12×5 + 14×12 + 3×12 = 288 + 360 + 168 + 36 = 852
    expect(c.chordShapeDrills).toBe(852);
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

  it('total = 1320 (sum of sub-areas, post-VL fan-out)', () => {
    // 852 chord-shape + 96 scale + 372 voice-leading.
    expect(c.total).toBe(1320);
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
