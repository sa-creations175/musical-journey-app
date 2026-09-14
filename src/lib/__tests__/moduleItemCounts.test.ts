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
// Ear Training — 25 + 48 + 8 + 18 = 99 (spacingState-row counts)
// (11 Sep 2026: 102 → 99. Three chord-recognition cards were retired
//  for sounding as chords the catalog already held.)
// (9 Sep 2026: 163 → 102. The chord-progressions catalog was cut from
//  69 named progressions to the eight survivors Silas named.)
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

  it('chordRecognition = 27 roots + 21 reachable inversions = 48', () => {
    // Was 30 — a seed count, which ignored the dimension the drill's
    // own attempts carry: it writes `attemptItemId(chordId, inversion)`.
    // Derived, so widening an inversion exclusion moves this and the
    // dashboard denominator together.
    expect(c.chordRecognition).toBe(reachableChordRefs(CHORD_SEEDS).length);
    expect(c.chordRecognition).toBe(48);
  });

  it('chordProgressions = 8 (the whole PROGRESSIONS catalog)', () => {
    // Sixty-nine until the cut of 9 Sep 2026. It is the whole catalog
    // either way — the number moves when the catalog does, and the
    // point of naming it here is that a cut has to be noticed rather
    // than absorbed.
    expect(c.chordProgressions).toBe(8);
  });

  it('scalesModes = 9 modes × 2 tabs (HearScale + SitInside) = 18', () => {
    expect(c.scalesModes).toBe(18);
  });

  it('total = 99 (sum of sub-areas)', () => {
    // 143 before the unison merge, 142 after it, 163 once chord
    // recognition started counting inversions rather than seeds, 102
    // after the chord-progressions cut of 9 Sep 2026, and 99 once the
    // three duplicate chord cards were retired on 11 Sep 2026.
    expect(c.total).toBe(99);
    expect(c.total).toBe(
      c.intervals + c.chordRecognition + c.chordProgressions + c.scalesModes,
    );
  });
});

// -------------------------------------------------------------------
// Harmonic Fluency — 949 + 152 + 252 + 244 = 1597
// (14 Sep 2026, later still: 1605 → 1597. Mode Identification's
//  `mo-1` to `mo-6` fold into the generated mode cards in the key of
//  C; Functional Harmony's `fh-11` and `fh-12` fold into generated C
//  cards that arrive in their place, and `fh-16` and `fh-19` retire.
//  Modes 107 → 101, earRecognition 250 → 244; functional-harmony
//  40 → 38, functionalApplied 254 → 252.)
// (14 Sep 2026, later: 1620 → 1605. Ear-Theory Crossover retired. Ten
//  of its fifteen cards asked a fact another deck asks and their
//  history folded onto that card; five had nothing to fold into.
//  earRecognition 265 → 250, and the deck has thirteen categories.)
// (14 Sep 2026: 1621 → 1620. `dq-extra-1`, major's 4 as a triad, is
//  retired and its history folds into `dq-maj-4`. Diatonic Chord
//  Qualities 30 → 29, chordKnowledge 153 → 152.)
// (13 Sep 2026: 1611 → 1621. Diatonic Chord Qualities gains harmonic
//  minor's three missing degrees and all seven of melodic minor.)
// (9 Sep 2026: 1607 → 1611. The four Modal Improvisation cards whose
//  own key could not give them a fair set of wrong answers come back,
//  drawing on one neighbouring key. Modal Improvisation 126 → 130,
//  functionalApplied 250 → 254.)
// (9 Sep 2026: 1481 → 1607. Modal Improvisation, a new family: which
//  notes fit over the chord the band is on, ten chords in thirteen
//  keys less the four the decoy guard refuses. functionalApplied
//  124 → 250.)
// (9 Sep 2026: 1494 → 1481. The thirteen octave interval cards went —
//  "the interval from D♭ to D♭ ascending" answers itself. Intervals
//  156 → 143, earRecognition 278 → 265.)
// (9 Sep 2026: 1495 → 1494. `pr-13`, the bossa I-VI-ii-V in F, is the
//  dominant-6 variation of the 1-6-2-5 and will live as a variation on
//  that card. Progressions 85 → 84, functionalApplied 125 → 124.)
// (9 Sep 2026: 1496 → 1495. `fh-3`, the hand-written ii-V-I in C, is
//  the twelfth cadence card to fold into the 2-5-1. functional-harmony
//  41 → 40, functionalApplied 126 → 125.)
// (9 Sep 2026, the family read in full: 1548 → 1496. The generated
//  progression list settles at six — the gospel walk-up, rhythm
//  changes, the neo-soul cycle and 6-4-1-5 went, with the four
//  hand-written cards they folded in from. Progressions 137 → 85,
//  functionalApplied 178 → 126.)
// (9 Sep 2026, progression follow-ups: 1559 → 1548. The 2-5-1 lives
//  once: Functional Harmony's eleven `fh-ii-v-i-` cards fold into
//  Progression Vocabulary's thirteen, which already asked the same
//  question in different words. functional-harmony 52 → 41,
//  functionalApplied 189 → 178. The group total falls by eleven and
//  the deck loses eleven duplicates.)
// (9 Sep 2026, progression follow-ups: 1563 → 1559. Four one-key cards
//  removed — the descending minor, the Dorian vamp, 4-1-5-6 and
//  1-♭7-4. A progression is in every key or it is not in the deck.
//  Progressions 141 → 137, functionalApplied 193 → 189.)
// (9 Sep 2026, progression follow-ups: 1538 → 1563. The turnaround
//  1-6-2-5 and the 1-4-5 joined the generated set, thirteen keys each;
//  `pr-18` folded into the 1-4-5 in A. Progressions 116 → 141,
//  functionalApplied 168 → 193.)
// (9 Sep 2026, intervals settled: 1553 → 1538. The fifteen inversion
//  FACT cards went — the skill is the relationship between two notes
//  on the keyboard, both ways, and the grid asks both directions of
//  every pair already. Intervals 171 → 156, earRecognition 293 → 278.)
// (9 Sep 2026, commit 8: 1463 → 1553. Progression Vocabulary
//  regenerated — the eight named progressions that can be written in
//  a major key, in all thirteen. Eight hand-written in-key cards and
//  the six 1-5-6-4 top-ups folded in; progressions 26 → 116,
//  functionalApplied 78 → 168.)
// (9 Sep 2026, commit 8: 1466 → 1463. Pentatonics: the five formula
//  cards went, major gained F♯, and the twelve "share the same" cards
//  became thirteen lick cards. Pentatonics 41 → 38, foundational
//  952 → 949.)
// (9 Sep 2026, commit 8: 1439 → 1466. Key Signatures regenerated —
//  the count in thirteen keys, the relative pair both ways in thirteen
//  keys, and a count-to-key card per mode. Key signatures 56 → 83,
//  foundational 925 → 952.)
// (9 Sep 2026, commit 8: 1432 → 1439. Slash Chords regenerated for the
//  thirteen keys — 84 generated cards became 91. chordKnowledge
//  136 → 143.)
// (9 Sep 2026, follow-up: 1426 → 1432. The six interval cards that had
//  been skipped over spelling came back — the minor 2nd above D♭ is
//  E𝄫 (D), written the way the deck already writes E♯ (F). Intervals
//  165 → 171, earRecognition 287 → 293.)
// (9 Sep 2026, second half: 1301 → 1426. Ruling 43 regenerated Interval
//  Identification to every note by every distance — twenty hand-picked
//  pairs and five top-ups became 150, six of the 156 combinations being
//  unspellable without a double accidental. Intervals 40 → 165,
//  earRecognition 162 → 287.)
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

  it('foundational = sdm 168 + dgn 625 + ks 83 + pent 38 + enh 35 = 949', () => {
    expect(c.byGroup.foundational).toBe(949);
  });

  it('chordKnowledge = dq 29 + cc 20 + sc 103 = 152', () => {
    expect(c.byGroup.chordKnowledge).toBe(152);
  });

  it('functionalApplied = fh 38 + pr 84 + mi 130 = 252', () => {
    expect(c.byGroup.functionalApplied).toBe(252);
  });

  it('earRecognition = mo 101 + iv 143 = 244', () => {
    expect(c.byGroup.earRecognition).toBe(244);
  });

  it('total = 1597 across all 13 categories', () => {
    expect(c.total).toBe(1597);
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
    // 3 Sep 2026. `ear-theory` retired on 14 Sep 2026.
    expect(Object.keys(c.byCategory).sort()).toEqual([
      'chord-construction',
      'degree-notes',
      'diatonic-qualities',
      'enharmonic-equivalents',
      'functional-harmony',
      'intervals',
      'key-signatures',
      'modal-improvisation',
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
// + 96 scales + 828 voice-leading = 1644 total (Mental Viz excluded).
// (9 Sep 2026: voice leading 408 → 828, five named progressions added.)
// Extensions (14) and special/sixth (3) left the catalog — see
// docs/DASHBOARD_REDESIGN_DESIGN.md § Catalog cuts.
// Supplementary two-handed seventh rows are excluded — they're
// practice tools, not acquisition-gating items. That is the whole
// EVERY inversion state gates since 20 Aug 2026, supplementary
// included, so materialisable and gating are the same 720.
// -------------------------------------------------------------------

describe('shapesCounts', () => {
  const c = shapesCounts();

  it('COUNTS DRILLABLE THINGS: 2106 chord-shape drills', () => {
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
     *
     * THE CIRCLE OF 4THS CELL joined on 14 Sep 2026: a thirteenth cell
     * in every quality column, with a key cell's targets on its own
     * itemRefs. 72 triad targets and 90 seventh targets, so 2106.
     * =================================================================
     */
    expect(c.chordShapeDrills).toBe(2106);
    expect(c.chordShapeDrills).toBe(864 + 1080 + 72 + 90);
  });

  it('and 288 scale drills — 96 cells, three hands each', () => {
    // major (12) + major-pent 3 sp × 12 keys (36) + nat-min (12)
    // + minor-pent 3 sp × 12 keys (36) = 96 CELLS, and a scale cell is
    // three drills: left hand, right hand, both hands, two octaves.
    expect(c.scaleDrills).toBe(288);
    expect(c.scaleDrills).toBe(96 * 3);
  });

  it('voiceLeading = 69 sub-cells × 13 cells = 897', () => {
    // Eight patterns shaped 2+3+2 (five-one, major-251, minor-251 and
    // the five named progressions added 9 Sep 2026) = 56, plus
    // diatonic-cycle (3) + minor-aba (2) + dom7b9 (4) + dim7 (4)
    // = 69 sub-cells per key × the twelve keys and the Circle of 4ths
    // cell (13 Sep 2026). Was 828 before the Circle, and 408 before that.
    expect(c.voiceLeading).toBe(897);
    expect(c.voiceLeading).toBe(69 * 13);
  });

  it('total = 3291 (sum of sub-areas)', () => {
    // 2106 chord-shape + 288 scale + 897 voice-leading. Was 3222 before
    // the Chord Movements & Passes Circle cell, 3060 before the chord
    // shapes' one, and 2640 before the five named progressions joined
    // the passes.
    expect(c.total).toBe(3291);
    expect(c.total).toBe(c.chordShapeDrills + c.scaleDrills + c.voiceLeading);
  });

  it('voice leading and mental visualisation are UNTOUCHED by the hand axis', () => {
    // Voice leading is two-handed by nature and mental visualisation
    // is away from the keyboard entirely: one target per cell, so
    // there is nothing to multiply. 897 and 504 either way.
    expect(c.voiceLeading).toBe(897);
    expect(sectionTargetCount('voice-leading')).toBe(897);
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
