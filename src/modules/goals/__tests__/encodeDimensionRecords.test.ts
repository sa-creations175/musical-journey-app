// @vitest-environment jsdom
/**
 * Phase 2 step 5e contract tests for `encodeDimensionRecords`.
 * Pins the wire-format spec each module's dimensions produce: how
 * Breadth / Mastery / Depth / Consistency map onto existing or
 * new metric ids, when a row goes to overall vs specific, when
 * relatedItems carries multi-pick, and which metrics are skipped
 * when a dimension is empty.
 *
 * Save-side smoke tests for the actual transaction live in 5g
 * once the save path is exercised end-to-end. 5e ships the encoder
 * tests.
 *
 * jsdom env required because YearlyAnchorFlow's imports
 * transitively pull db.ts.
 */
import { describe, it, expect } from 'vitest';
import {
  encodeDimensionRecords,
  endOfYearMs,
  type AnchorDraft,
  type EarTrainingAnchor,
  type HarmonicFluencyAnchor,
  type PracticeConsistencyAnchor,
  type ProductionAnchor,
  type ShapesPatternsAnchor,
  type SongRepertoireAnchor,
} from '../YearlyAnchorFlow';

function et(state: EarTrainingAnchor): AnchorDraft {
  return { moduleId: 'ear-training', name: null, earTraining: state };
}
function hf(state: HarmonicFluencyAnchor): AnchorDraft {
  return { moduleId: 'harmonic-fluency', name: null, harmonicFluency: state };
}
function sp(state: ShapesPatternsAnchor): AnchorDraft {
  return { moduleId: 'shapes-and-patterns', name: null, shapesPatterns: state };
}
function songs(state: SongRepertoireAnchor): AnchorDraft {
  return { moduleId: 'repertoire', name: null, songRepertoire: state };
}
function prod(state: ProductionAnchor): AnchorDraft {
  return { moduleId: 'production', name: null, production: state };
}
function pc(state: PracticeConsistencyAnchor): AnchorDraft {
  return { moduleId: 'practice-consistency', name: null, practiceConsistency: state };
}

// -------------------------------------------------------------------
// endOfYearMs
// -------------------------------------------------------------------

describe('endOfYearMs', () => {
  it('returns Dec 31 23:59:59.999 of the given year (local time)', () => {
    const ms = endOfYearMs(2026);
    const d = new Date(ms);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(11);
    expect(d.getDate()).toBe(31);
    expect(d.getHours()).toBe(23);
    expect(d.getMinutes()).toBe(59);
    expect(d.getSeconds()).toBe(59);
    expect(d.getMilliseconds()).toBe(999);
  });
});

// -------------------------------------------------------------------
// Ear Training encoder
// -------------------------------------------------------------------

describe('encodeDimensionRecords — Ear Training', () => {
  const baseEt: EarTrainingAnchor = {
    breadth: { kind: 'all' },
    mastery: { groupIds: [] },
    depth: { accuracyPercent: 80 },
    consistency: { count: 4, cadence: 'week' },
  };

  it('all-defaults produces Breadth + Depth + Consistency (3 records, no Mastery)', () => {
    const records = encodeDimensionRecords(et(baseEt));
    expect(records).toHaveLength(3);
    expect(records.map(r => r.targetMetric)).toEqual([
      'ear_training_coverage_at_acquired',
      'ear_training_accuracy_overall',
      'ear_training_sessions_per_cadence',
    ]);
  });

  it('Breadth = all uses _coverage_at_acquired with the live total', () => {
    const records = encodeDimensionRecords(et(baseEt));
    const breadth = records[0];
    expect(breadth.targetMetric).toBe('ear_training_coverage_at_acquired');
    expect(breadth.targetValue).toBe(143);
    expect(breadth.targetUnit).toBe('items');
    expect(breadth.relatedItems).toEqual([]);
  });

  it('Breadth = subset uses _specific with summed denominator and relatedItems', () => {
    const e: EarTrainingAnchor = {
      ...baseEt,
      breadth: { kind: 'subset', groupIds: ['intervals', 'chord-recognition'] },
    };
    const records = encodeDimensionRecords(et(e));
    const breadth = records.find(r => r.targetMetric === 'ear_training_coverage_at_acquired_specific');
    expect(breadth).toBeDefined();
    expect(breadth!.targetValue).toBe(26 + 30);  // intervals + chord-recognition
    expect(breadth!.targetUnit).toBe('intervals');
    expect(breadth!.relatedItems).toEqual(['intervals', 'chord-recognition']);
  });

  it('Mastery non-empty produces a Mastery record', () => {
    const e: EarTrainingAnchor = { ...baseEt, mastery: { groupIds: ['intervals'] } };
    const records = encodeDimensionRecords(et(e));
    const mastery = records.find(r => r.targetMetric.includes('mastery'));
    expect(mastery).toBeDefined();
    expect(mastery!.targetMetric).toBe('ear_training_mastery_at_mastered_specific');
    expect(mastery!.relatedItems).toEqual(['intervals']);
  });

  it('Mastery covering all 4 groups uses the overall metric', () => {
    const e: EarTrainingAnchor = {
      ...baseEt,
      mastery: { groupIds: ['intervals', 'chord-recognition', 'chord-progressions', 'scales-modes'] },
    };
    const records = encodeDimensionRecords(et(e));
    const mastery = records.find(r => r.targetMetric.includes('mastery'));
    expect(mastery!.targetMetric).toBe('ear_training_mastery_at_mastered');
    expect(mastery!.targetValue).toBe(143);
    expect(mastery!.relatedItems).toEqual([]);
  });

  it('Depth always emits an accuracy record', () => {
    const records = encodeDimensionRecords(et({ ...baseEt, depth: { accuracyPercent: 92 } }));
    const depth = records.find(r => r.targetMetric === 'ear_training_accuracy_overall');
    expect(depth!.targetValue).toBe(92);
    expect(depth!.targetUnit).toBe('%');
  });

  it('Consistency emits sessions_per_cadence with cadence in targetUnit', () => {
    const records = encodeDimensionRecords(et({ ...baseEt, consistency: { count: 3, cadence: 'month' } }));
    const c = records.find(r => r.targetMetric === 'ear_training_sessions_per_cadence');
    expect(c!.targetValue).toBe(3);
    expect(c!.targetUnit).toBe('month');
  });

  it('Breadth = subset with empty groupIds skips the Breadth record', () => {
    const e: EarTrainingAnchor = { ...baseEt, breadth: { kind: 'subset', groupIds: [] } };
    const records = encodeDimensionRecords(et(e));
    const breadth = records.find(r => r.targetMetric.includes('coverage'));
    expect(breadth).toBeUndefined();
  });
});

// -------------------------------------------------------------------
// Harmonic Fluency encoder
// -------------------------------------------------------------------

describe('encodeDimensionRecords — Harmonic Fluency', () => {
  const baseHf: HarmonicFluencyAnchor = {
    breadth: { kind: 'all' },
    mastery: { groupIds: [] },
    depth: { accuracyPercent: 80 },
    consistency: { count: 4, cadence: 'week' },
  };

  it('Breadth = all uses harmonic_fluency_coverage_at_acquired with 302', () => {
    const records = encodeDimensionRecords(hf(baseHf));
    const breadth = records[0];
    expect(breadth.targetMetric).toBe('harmonic_fluency_coverage_at_acquired');
    expect(breadth.targetValue).toBe(302);
    expect(breadth.targetUnit).toBe('cards');
  });

  it('Mastery covering all 4 HF groups uses the overall mastery metric', () => {
    const e: HarmonicFluencyAnchor = {
      ...baseHf,
      mastery: { groupIds: ['foundational', 'chord-knowledge', 'functional-applied', 'ear-recognition'] },
    };
    const records = encodeDimensionRecords(hf(e));
    const mastery = records.find(r => r.targetMetric.includes('mastery'));
    expect(mastery!.targetMetric).toBe('harmonic_fluency_mastery_at_mastered');
  });
});

// -------------------------------------------------------------------
// Shapes & Patterns encoder
// -------------------------------------------------------------------

describe('encodeDimensionRecords — Shapes & Patterns', () => {
  const baseSp: ShapesPatternsAnchor = {
    breadth: { kind: 'all' },
    depth: { areaIds: [] },
    mastery: { areaIds: [] },
    consistency: { count: 30, cadence: 'week' },
  };

  it('Depth empty + Mastery empty → 2 records (Breadth + Consistency only)', () => {
    const records = encodeDimensionRecords(sp(baseSp));
    expect(records).toHaveLength(2);
    expect(records.map(r => r.targetMetric)).toEqual([
      'shapes_coverage_at_acquired',
      'shapes_minutes_per_cadence',
    ]);
  });

  it('Depth non-empty produces shapes_proficiency_overall with area:level + relatedItems', () => {
    const s: ShapesPatternsAnchor = {
      ...baseSp,
      depth: { areaIds: ['chord_shape_drills', 'voice_leading'] },
    };
    const records = encodeDimensionRecords(sp(s));
    const depth = records.find(r => r.targetMetric === 'shapes_proficiency_overall');
    expect(depth).toBeDefined();
    expect(depth!.targetUnit).toBe('chord_shape_drills:solid');
    expect(depth!.relatedItems).toEqual(['chord_shape_drills', 'voice_leading']);
    expect(depth!.targetValue).toBeNull();
  });

  it('Consistency uses minutes_per_cadence with cadence in targetUnit', () => {
    const records = encodeDimensionRecords(sp(baseSp));
    const c = records.find(r => r.targetMetric === 'shapes_minutes_per_cadence');
    expect(c!.targetValue).toBe(30);
    expect(c!.targetUnit).toBe('week');
  });

  it('Mastery covering all 3 areas uses overall mastery metric', () => {
    const s: ShapesPatternsAnchor = {
      ...baseSp,
      mastery: { areaIds: ['chord_shape_drills', 'scale_drills', 'voice_leading'] },
    };
    const records = encodeDimensionRecords(sp(s));
    const m = records.find(r => r.targetMetric.includes('mastery'));
    expect(m!.targetMetric).toBe('shapes_mastery_at_mastered');
  });
});

// -------------------------------------------------------------------
// Song Repertoire encoder
// -------------------------------------------------------------------

describe('encodeDimensionRecords — Song Repertoire', () => {
  it('all-zero counts produce only the Consistency record', () => {
    const records = encodeDimensionRecords(songs({
      breadthCount: 0, depthCount: 0, masteryCount: 0,
      consistency: { count: 4, cadence: 'week' },
    }));
    expect(records).toHaveLength(1);
    expect(records[0].targetMetric).toBe('repertoire_sessions_per_cadence');
  });

  it('non-zero counts use song_whole_at_level with level in targetUnit', () => {
    const records = encodeDimensionRecords(songs({
      breadthCount: 5, depthCount: 3, masteryCount: 1,
      consistency: { count: 4, cadence: 'week' },
    }));
    expect(records).toHaveLength(4);
    expect(records[0].targetMetric).toBe('song_whole_at_level');
    expect(records[0].targetUnit).toBe('comfortable');
    expect(records[0].targetValue).toBe(5);
    expect(records[1].targetUnit).toBe('solid');
    expect(records[1].targetValue).toBe(3);
    expect(records[2].targetUnit).toBe('internalized');
    expect(records[2].targetValue).toBe(1);
  });

  it('Songs Consistency ships the new repertoire_sessions_per_cadence metric', () => {
    const records = encodeDimensionRecords(songs({
      breadthCount: 0, depthCount: 0, masteryCount: 0,
      consistency: { count: 5, cadence: 'month' },
    }));
    const c = records[0];
    expect(c.targetMetric).toBe('repertoire_sessions_per_cadence');
    expect(c.targetValue).toBe(5);
    expect(c.targetUnit).toBe('month');
  });
});

// -------------------------------------------------------------------
// Production encoder
// -------------------------------------------------------------------

describe('encodeDimensionRecords — Production', () => {
  const baseP: ProductionAnchor = {
    breadth: { kind: 'all' },
    depth: { pathIds: [] },
    consistency: { count: 2, cadence: 'week' },
  };

  it('all-defaults produces Breadth + Consistency (2 records, no Mastery, no Depth)', () => {
    const records = encodeDimensionRecords(prod(baseP));
    expect(records).toHaveLength(2);
    expect(records.map(r => r.targetMetric)).toEqual([
      'production_coverage_at_acquired',
      'production_hours_per_cadence',
    ]);
  });

  it('Depth uses production_path_completion + relatedItems for multi-pick', () => {
    const p: ProductionAnchor = {
      ...baseP,
      depth: { pathIds: ['workflow-foundations', 'genre-productions'] },
    };
    const records = encodeDimensionRecords(prod(p));
    const depth = records.find(r => r.targetMetric === 'production_path_completion');
    expect(depth).toBeDefined();
    expect(depth!.relatedItems).toEqual(['workflow-foundations', 'genre-productions']);
    expect(depth!.targetValue).toBe(8 + 22);  // workflow + genre lesson counts
  });

  it('Consistency uses hours_per_cadence', () => {
    const records = encodeDimensionRecords(prod(baseP));
    const c = records.find(r => r.targetMetric === 'production_hours_per_cadence');
    expect(c!.targetValue).toBe(2);
    expect(c!.targetUnit).toBe('week');
  });

  it('never produces a Production mastery record', () => {
    const records = encodeDimensionRecords(prod(baseP));
    expect(records.every(r => !r.targetMetric.includes('mastery'))).toBe(true);
  });
});

// -------------------------------------------------------------------
// Practice Consistency encoder
// -------------------------------------------------------------------

describe('encodeDimensionRecords — Practice Consistency', () => {
  it('produces exactly 3 records (weekly / monthly / aspiration) — no umbrella Consistency', () => {
    const records = encodeDimensionRecords(pc({
      weeklyFloor: 4, monthlyFloor: 18, aspiration: 5,
    }));
    expect(records).toHaveLength(3);
    expect(records.map(r => r.targetMetric)).toEqual([
      'practice_weekly_floor_days',
      'practice_monthly_floor_days',
      'practice_aspiration_days_per_week',
    ]);
  });

  it('values flow through to targetValue', () => {
    const records = encodeDimensionRecords(pc({
      weeklyFloor: 5, monthlyFloor: 22, aspiration: 7,
    }));
    expect(records[0].targetValue).toBe(5);
    expect(records[1].targetValue).toBe(22);
    expect(records[2].targetValue).toBe(7);
  });

  it('targetUnit carries the unit suffix', () => {
    const records = encodeDimensionRecords(pc({
      weeklyFloor: 4, monthlyFloor: 18, aspiration: 5,
    }));
    expect(records[0].targetUnit).toBe('days/week');
    expect(records[1].targetUnit).toBe('days/month');
    expect(records[2].targetUnit).toBe('days/week');
  });
});

// -------------------------------------------------------------------
// Empty draft (defensive)
// -------------------------------------------------------------------

describe('encodeDimensionRecords — defensive', () => {
  it('returns [] when the active module slot is missing', () => {
    expect(encodeDimensionRecords({ moduleId: 'ear-training', name: null })).toEqual([]);
  });
});
