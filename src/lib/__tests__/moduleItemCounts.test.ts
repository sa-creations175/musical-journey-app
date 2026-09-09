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
import { intervalItemRefs } from '../../modules/ear-training/intervals/seed';
import { CHORD_SEEDS } from '../../modules/ear-training/chord-recognition/seed';
import { reachableChordRefs } from '../../modules/ear-training/chord-recognition/inversionUtils';
import {
  earTrainingCounts,
  harmonicFluencyCounts,
  shapesCounts,
  productionCounts,
} from '../moduleItemCounts';
import {
  sectionTargetCount, sectionTargets, targetKey,
} from '../../modules/shapes-and-patterns/cellTargets';

// -------------------------------------------------------------------
// Ear Training — 26 + 30 + 69 + 18 = 143 (spacingState-row counts)
// -------------------------------------------------------------------

describe('earTrainingCounts', () => {
  const c = earTrainingCounts();

  it('intervals = 12 two-way + 1 one-way unison = 25', () => {
    // NOT `seeds × 2`. A unison has one case — zero semitones up and
    // zero down are the same two notes — so the old arithmetic was
    // right about the code and wrong about the music.
    expect(c.intervals).toBe(25);
    // And it follows the seed list rather than this number: adding an
    // interval must move it without anyone editing here.
    expect(c.intervals).toBe(intervalItemRefs().length);
    expect(intervalItemRefs()).not.toContain('P1:desc');
  });

  it('chordRecognition = 30 roots + 21 reachable inversions = 51', () => {
    // Was 30 — a seed count, which ignored the dimension the drill's
    // own attempts carry: it writes `attemptItemId(chordId, inversion)`.
    // Derived, so widening an inversion exclusion moves this and the
    // dashboard denominator together.
    expect(c.chordRecognition).toBe(reachableChordRefs(CHORD_SEEDS).length);
    expect(c.chordRecognition).toBe(51);
  });

  it('chordProgressions = 69 (full PROGRESSIONS catalog)', () => {
    expect(c.chordProgressions).toBe(69);
  });

  it('scalesModes = 9 modes × 2 tabs (HearScale + SitInside) = 18', () => {
    expect(c.scalesModes).toBe(18);
  });

  it('total = 163 (sum of sub-areas)', () => {
    // 143 before the unison merge, 142 after it, and 163 once chord
    // recognition started counting inversions rather than seeds.
    expect(c.total).toBe(163);
    expect(c.total).toBe(
      c.intervals + c.chordRecognition + c.chordProgressions + c.scalesModes,
    );
  });
});

// -------------------------------------------------------------------
// Harmonic Fluency — 925 + 136 + 78 + 162 = 1301
// (9 Sep 2026: 1246 → 1301. Ruling 42 regenerated Mode Identification
//  to every key by every mode — 33 generated cards became 91, and the
//  three hand-written C cards folded into them. Ruling 40 makes F♯
//  major and G♭ major two of the thirteen keys. Modes 52 → 107,
//  earRecognition 107 → 162.)
// (8 Sep 2026: 1210 → 1246. Ruling 30 rebuilt the slash deck — 6/♭7
//  out, 1/5, 5/1, 1/4 and 2m/1 in, and the generator now covers C for
//  the four that have no hand-written card there. Slash chords 60 → 96,
//  chordKnowledge 100 → 136.)
// (3 Sep 2026, later the same day: 1081 → 1210. Reverse Key Pivots —
//  the third leg of the same triangle — generated to the family's own
//  grid at 156 and retired into it. Foundational 769 → 925,
//  functionalApplied 105 → 78. All 27 of its cards moved their history
//  onto their counterpart.)
// (3 Sep 2026: 648 → 1081. `degree-notes` seeded at 469 — twelve keys
//  x thirteen degrees x three questions, plus the one F♯ card that
//  survived the fold-in under its own id — and Named Notes (24) and
//  Tritone Pairs (12) retired into it. Foundational 336 → 769: it
//  loses both retired categories and gains the family. Thirty-five of
//  the thirty-six retired cards moved their history onto their
//  counterpart — see retiredCategoryMigration.ts.)
// (2 Sep 2026: 649 → 648. `ksc-3` was `ks-16` a second time — same
//  question, same answer — and one of the two had to go. Key
//  signatures 57 → 56, foundational 337 → 336.)
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

  it('foundational = sdm 168 + dgn 625 + ks 56 + pent 41 + enh 35 = 925', () => {
    expect(c.byGroup.foundational).toBe(925);
  });

  it('chordKnowledge = dq 20 + cc 20 + sc 96 = 136', () => {
    expect(c.byGroup.chordKnowledge).toBe(136);
  });

  it('functionalApplied = fh 52 + pr 26 = 78', () => {
    expect(c.byGroup.functionalApplied).toBe(78);
  });

  it('earRecognition = mo 107 + iv 40 + et 15 = 162', () => {
    expect(c.byGroup.earRecognition).toBe(162);
  });

  it('total = 1301 across all 13 categories', () => {
    expect(c.total).toBe(1301);
  });

  it('total equals sum of group totals', () => {
    const groupSum =
      c.byGroup.foundational +
      c.byGroup.chordKnowledge +
      c.byGroup.functionalApplied +
      c.byGroup.earRecognition;
    expect(groupSum).toBe(c.total);
  });

  it('byCategory covers all 13 canonical categories', () => {
    // `named-notes`, `tritone-pairs` and `reverse-key-pivots` are absent
    // because their cards are: all three folded into `degree-notes` on
    // 3 Sep 2026.
    expect(Object.keys(c.byCategory).sort()).toEqual([
      'chord-construction',
      'degree-notes',
      'diatonic-qualities',
      'ear-theory',
      'enharmonic-equivalents',
      'functional-harmony',
      'intervals',
      'key-signatures',
      'modes',
      'pentatonic-scales',
      'progressions',
      'scale-degree-math',
      'slash-chords',
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
// + 96 scales + 408 voice-leading = 1224 total (Mental Viz excluded).
// Extensions (14) and special/sixth (3) left the catalog — see
// docs/DASHBOARD_REDESIGN_DESIGN.md § Catalog cuts.
// Supplementary two-handed seventh rows are excluded — they're
// practice tools, not acquisition-gating items. That is the whole
// EVERY inversion state gates since 20 Aug 2026, supplementary
// included, so materialisable and gating are the same 720.
// -------------------------------------------------------------------

describe('shapesCounts', () => {
  const c = shapesCounts();

  it('COUNTS DRILLABLE THINGS: 1944 chord-shape drills', () => {
    /**
     * =================================================================
     * IT COUNTED 720, AND 720 WAS TWO MISTAKES CANCELLING NEITHER.
     *
     *   triads    6 qualities × 12 keys × 4 states × 3 hands =  864
     *   sevenths  6 qualities × 12 keys × 5 states × 3 hands = 1080
     *                                                          ----
     *                                                          1944
     *
     * NO HAND AXIS. 720 was quality × key × inversion state and
     * stopped — but a spacingState row is `(itemRef, hand)` and the
     * goal NUMERATOR counts rows, so a coverage goal could read over
     * 100%. Drill every triad in every key with all three hands and
     * the numerator was 864 against a denominator of 288.
     *
     * SUPPLEMENTARY COUNTED. It left the score on 31 Aug 2026: the
     * left-hand root under a right-hand triad is not a shape to own —
     * the triad is drilled on its own and the left hand is one note.
     * See `catalog.ts`, which carries both rulings.
     *
     * 2160 would be the figure with supplementary still in; 720 the
     * figure with no hand axis and supplementary in. Neither is a count
     * of things you sit down and drill.
     * =================================================================
     */
    expect(c.chordShapeDrills).toBe(1944);
    expect(c.chordShapeDrills).toBe(864 + 1080);
  });

  it('and 288 scale drills — 96 cells, three hands each', () => {
    // major (12) + major-pent 3 sp × 12 keys (36) + nat-min (12)
    // + minor-pent 3 sp × 12 keys (36) = 96 CELLS, and a scale cell is
    // three drills: left hand, right hand, both hands, two octaves.
    expect(c.scaleDrills).toBe(288);
    expect(c.scaleDrills).toBe(96 * 3);
  });

  it('voiceLeading = 34 sub-cells × 12 keys = 408 (Seventh Chords got its 3rd position)', () => {
    // Per src/docs/VOICE_LEADING_SUBMODULE_DESIGN.md § Total Cell Count
    // (corrected catalog): five-one (6) + major-251 (6) + minor-251 (6)
    // + diatonic-cycle (3) + minor-aba (2) + dom7b9 (4) + dim7 (4)
    // = 34 sub-cells per key × 12 keys.
    expect(c.voiceLeading).toBe(408);
  });

  it('total = 2640 (sum of sub-areas)', () => {
    // 1944 chord-shape + 288 scale + 408 voice-leading.
    expect(c.total).toBe(2640);
    expect(c.total).toBe(c.chordShapeDrills + c.scaleDrills + c.voiceLeading);
  });

  it('voice leading and mental visualisation are UNTOUCHED by the hand axis', () => {
    // Voice leading is two-handed by nature and mental visualisation
    // is away from the keyboard entirely: one target per cell, so
    // there is nothing to multiply. 408 and 504 either way.
    expect(c.voiceLeading).toBe(408);
    expect(sectionTargetCount('voice-leading')).toBe(408);
    expect(sectionTargetCount('mental-viz')).toBe(504);
  });

  it('and the total MOVES when something leaves the score', () => {
    // A denominator is what you are going for, not what exists. Take
    // one target out and every figure that counts it drops by one.
    const one = sectionTargets('scales')[0];
    const out = new Set([targetKey(one.itemRef, one.hand)]);
    expect(shapesCounts(out).scaleDrills).toBe(c.scaleDrills - 1);
    expect(shapesCounts(out).total).toBe(c.total - 1);
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
