// @vitest-environment jsdom
/**
 * Phase B Step 9c — progression-stages catalog tests.
 *
 * Pins the per-module stage counts + per-stage item counts to the
 * source catalogs. A test fails when a catalog grows (a new mode,
 * a new production lesson) without the progression-stages file
 * being updated — by design, to flag the missing entry.
 *
 * jsdom env required because the catalog chain pulls in db.ts
 * under an `import.meta.env.DEV` guard. The tests themselves don't
 * touch Dexie.
 */
import { describe, expect, it } from 'vitest';
import {
  MODULE_PROGRESSIONS,
  SUB_AREA_PROGRESSIONS,
  progressionForGoal,
} from '../progressionStages';
import { FLASHCARDS } from '../../harmonic-fluency/catalog';
import { CHORD_SEEDS } from '../../ear-training/chord-recognition/seed';
import { INTERVAL_SEEDS } from '../../ear-training/intervals/seed';
import { PRODUCTION_PATHS } from '../../production/content/paths';
import { lessonsByPath } from '../../production/content/lessons';

// =====================================================================
// S&P Chord Shapes
// =====================================================================

describe('Chord-Shapes progression — Layer 1 Triads', () => {
  it('produces 6 triad stages, each with 12 keys × 4 acquisition states = 48 items', () => {
    const sp = MODULE_PROGRESSIONS['shapes-and-patterns'];
    const triadStages = sp.stages.slice(0, 6);
    expect(triadStages).toHaveLength(6);
    for (const s of triadStages) {
      expect(s.itemRefs).toHaveLength(48);
      expect(s.itemRefs.every(r => r.startsWith('chord-shape:'))).toBe(true);
    }
    expect(triadStages.map(s => s.id)).toEqual([
      'triad-maj', 'triad-min', 'triad-dim',
      'triad-aug', 'triad-sus2', 'triad-sus4',
    ]);
  });

  it('augmented-triad stage carries the C-root itemRef the carryover tests use', () => {
    const sp = MODULE_PROGRESSIONS['shapes-and-patterns'];
    const aug = sp.stages.find(s => s.id === 'triad-aug')!;
    expect(aug.itemRefs).toContain('chord-shape:aug:C:root');
  });
});

describe('Chord-Shapes progression — Layer 2 Sevenths', () => {
  // The doc claims "48 items per stage" but the inversion redesign
  // pinned sevenths to 5 acquisition states (root/inv1/inv2/inv3/fluid),
  // so 12 × 5 = 60. Tests pin the catalog truth — see file header.
  it('produces 6 seventh stages, each with 60 items (12 keys × 5 acquisition states)', () => {
    const sp = MODULE_PROGRESSIONS['shapes-and-patterns'];
    const seventhStages = sp.stages.slice(6, 12);
    expect(seventhStages).toHaveLength(6);
    for (const s of seventhStages) {
      expect(s.itemRefs).toHaveLength(60);
    }
    expect(seventhStages.map(s => s.id)).toEqual([
      'seventh-maj7', 'seventh-min7', 'seventh-dom7',
      'seventh-m7b5', 'seventh-dim7', 'seventh-mmaj7',
    ]);
  });

  it('supplementary-state rows are excluded from acquisition counts', () => {
    const sp = MODULE_PROGRESSIONS['shapes-and-patterns'];
    const maj7 = sp.stages.find(s => s.id === 'seventh-maj7')!;
    expect(maj7.itemRefs.some(r => r.endsWith(':supplementary'))).toBe(false);
  });
});

describe('Chord-Shapes progression — Layer 3 Depth stages', () => {
  // Layer 3 has catalog-grounded + TBD entries. Tests pin which are
  // which (regression guard against accidentally dropping items as
  // the catalog grows).
  it('major-extensions stage is non-empty (maj9 + maj11 + maj13 + maj7♯11)', () => {
    const sp = MODULE_PROGRESSIONS['shapes-and-patterns'];
    const stage = sp.stages.find(s => s.id === 'depth-major-extensions')!;
    // 4 qualities × 12 keys = 48.
    expect(stage.itemRefs).toHaveLength(48);
  });

  it('TBD stages have empty itemRefs (slash, altered, augmaj7)', () => {
    const sp = MODULE_PROGRESSIONS['shapes-and-patterns'];
    const tbd = ['depth-altered', 'depth-slash', 'depth-augmaj7'];
    for (const id of tbd) {
      const stage = sp.stages.find(s => s.id === id)!;
      expect(stage).toBeDefined();
      expect(stage.itemRefs).toEqual([]);
    }
  });
});

// =====================================================================
// S&P Scales
// =====================================================================

describe('Scales progression — 4 stages, all keys covered', () => {
  it('major scale = 12 cells, major-pent = 36 (3 SPs × 12 keys), nat-min = 12, min-pent = 36', () => {
    const scaleProg = SUB_AREA_PROGRESSIONS['scale_drills'];
    expect(scaleProg).toHaveLength(4);
    const [maj, majPent, natMin, minPent] = scaleProg;
    expect(maj.itemRefs).toHaveLength(12);
    expect(majPent.itemRefs).toHaveLength(36);
    expect(natMin.itemRefs).toHaveLength(12);
    expect(minPent.itemRefs).toHaveLength(36);
  });

  it("pentatonic stages bundle the 3 starting points per key", () => {
    const majPent = SUB_AREA_PROGRESSIONS['scale_drills'][1];
    // Every pent itemRef has the 4-part shape `scale:major-pentatonic:{sp}:{key}`.
    expect(majPent.itemRefs.every(r => r.split(':').length === 4)).toBe(true);
  });
});

// =====================================================================
// S&P Voice Leading — stub
// =====================================================================

describe('Voice-Leading progression — TBD stub', () => {
  it('is documented but empty (no actionable progression until VL ships)', () => {
    expect(SUB_AREA_PROGRESSIONS['voice_leading']).toEqual([]);
  });
});

// =====================================================================
// ET — Intervals / Chord Recognition / Chord Progressions / Modes
// =====================================================================

describe('ET Intervals progression — single bundled stage', () => {
  it('one stage holding every interval × both directions', () => {
    const intervalsProg = SUB_AREA_PROGRESSIONS['intervals'];
    expect(intervalsProg).toHaveLength(1);
    expect(intervalsProg[0].itemRefs).toHaveLength(INTERVAL_SEEDS.length * 2);
  });
});

describe('ET Chord Recognition progression — 4 coverage tiers', () => {
  // Tier 3 (inversion items) is intentionally skipped — see
  // progressionStages.ts chordRecognitionTierItems comment.
  it('exposes T1, T2, T4, T5 — not T3 (inversion items not in coverage scope)', () => {
    const crProg = SUB_AREA_PROGRESSIONS['chord-recognition'];
    expect(crProg.map(s => s.id)).toEqual(['cr-t1', 'cr-t2', 'cr-t4', 'cr-t5']);
  });

  it('every stage item is a bare chord-id present in CHORD_SEEDS', () => {
    const scopeIds = new Set(CHORD_SEEDS.map(s => s.id));
    const crProg = SUB_AREA_PROGRESSIONS['chord-recognition'];
    for (const stage of crProg) {
      for (const ref of stage.itemRefs) {
        expect(scopeIds.has(ref)).toBe(true);
      }
    }
  });
});

describe('ET Scales/Modes progression — brightness order + minor variants', () => {
  it('Stage 1 = 7 modes × 2 tabs = 14 items in brightness order', () => {
    const mp = SUB_AREA_PROGRESSIONS['scales-modes'];
    expect(mp).toHaveLength(2);
    expect(mp[0].itemRefs).toHaveLength(14);
    // First two items pin the brightness-first ordering: lydian
    // before ionian (the doc's "brightness → darkness" walk).
    expect(mp[0].itemRefs[0]).toBe('lydian-tab1');
    expect(mp[0].itemRefs[1]).toBe('lydian-tab2');
    expect(mp[0].itemRefs[2]).toBe('ionian-tab1');
  });

  it('Stage 2 = harmonic-minor + melodic-minor only', () => {
    const stage2 = SUB_AREA_PROGRESSIONS['scales-modes'][1];
    expect(stage2.itemRefs).toEqual([
      'harmonic-minor-tab1', 'harmonic-minor-tab2',
      'melodic-minor-tab1', 'melodic-minor-tab2',
    ]);
  });
});

// =====================================================================
// HF — 4 stages by group
// =====================================================================

describe('HF progression — 4 category-group stages', () => {
  it('foundational / chord-knowledge / functional / ear, in order', () => {
    const hf = MODULE_PROGRESSIONS['harmonic-fluency'];
    expect(hf.stages.map(s => s.id)).toEqual([
      'hf-foundational',
      'hf-chord-knowledge',
      'hf-functional',
      'hf-ear',
    ]);
  });

  it('every stage item id maps to a real flashcard', () => {
    const cardIds = new Set(FLASHCARDS.map(c => c.id));
    const hf = MODULE_PROGRESSIONS['harmonic-fluency'];
    for (const stage of hf.stages) {
      for (const id of stage.itemRefs) expect(cardIds.has(id)).toBe(true);
    }
  });
});

// =====================================================================
// Production — 6 paths
// =====================================================================

describe('Production progression — one stage per path', () => {
  it('produces 6 stages whose items match lessonsByPath', () => {
    const prod = MODULE_PROGRESSIONS['production'];
    expect(prod.stages).toHaveLength(PRODUCTION_PATHS.length);
    for (let i = 0; i < PRODUCTION_PATHS.length; i++) {
      const expected = lessonsByPath(PRODUCTION_PATHS[i].id).map(l => l.id);
      expect(prod.stages[i].itemRefs).toEqual(expected);
    }
  });
});

// =====================================================================
// progressionForGoal — sub-area routing
// =====================================================================

describe('progressionForGoal — sub-area routing', () => {
  it('returns the sub-area progression when targetUnit matches a key', () => {
    const stages = progressionForGoal('shapes-and-patterns', 'chord_shape_triads_aug');
    expect(stages).toHaveLength(1);
    expect(stages[0].id).toBe('triad-aug');
  });

  it('falls back to the module-level progression when targetUnit is null', () => {
    const stages = progressionForGoal('shapes-and-patterns', null);
    expect(stages).toBe(MODULE_PROGRESSIONS['shapes-and-patterns'].stages);
  });

  it('falls back when targetUnit isn\'t a SUB_AREA key', () => {
    const stages = progressionForGoal('ear-training', 'made-up-sub');
    expect(stages).toBe(MODULE_PROGRESSIONS['ear-training'].stages);
  });

  it('repertoire + practice-consistency return empty stages (no progression)', () => {
    expect(MODULE_PROGRESSIONS['repertoire'].stages).toEqual([]);
    expect(MODULE_PROGRESSIONS['practice-consistency'].stages).toEqual([]);
  });
});
