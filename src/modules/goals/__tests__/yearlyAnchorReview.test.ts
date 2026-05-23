// @vitest-environment jsdom
/**
 * Phase 2 step 5d contract tests for the review-screen pure helpers.
 * Pins the wire format of `defaultAnchorName`, `dimensionRowsFor`,
 * and `summarizeAnchor` across all six module shapes so the review
 * surface stays in lockstep with the per-module dimension state
 * shapes shipped in 5c.1–5c.6.
 *
 * jsdom env required because the helpers transitively import
 * YearlyAnchorFlow → moduleMeta → … → db.ts (touches `window`
 * under an `import.meta.env.DEV` guard).
 */
import { describe, it, expect } from 'vitest';
import type {
  AnchorDraft,
  AnchorModuleId,
  EarTrainingAnchor,
  HarmonicFluencyAnchor,
  PracticeConsistencyAnchor,
  ProductionAnchor,
  ShapesPatternsAnchor,
  SongRepertoireAnchor,
} from '../YearlyAnchorFlow';
import {
  defaultAnchorName,
  dimensionRowsFor,
  isLegacyAnchorName,
  summarizeAnchor,
} from '../yearlyAnchorReview';

const YEAR = 2026;

function draftFor(moduleId: AnchorModuleId, slot: Partial<AnchorDraft>): AnchorDraft {
  return { moduleId, name: null, ...slot };
}

// -------------------------------------------------------------------
// defaultAnchorName
// -------------------------------------------------------------------

describe('defaultAnchorName', () => {
  it.each<[AnchorModuleId, string]>([
    [
      'ear-training',
      'Make music speak to me — intervals, chords, progressions, all of it.',
    ],
    ['harmonic-fluency', 'Master the language of harmony.'],
    [
      'shapes-and-patterns',
      'Lock the shapes in. See them, hear them, flow between them — every key.',
    ],
    [
      'repertoire',
      'Own my songs. Play them freely, shape them intentionally, make them mine.',
    ],
    [
      'production',
      'Make the studio feel like home. Master the tools, play, and create freely.',
    ],
    [
      'practice-consistency',
      'Show up every day. Make music practice as natural as breathing.',
    ],
  ])('returns the vision statement for %s', (moduleId, expected) => {
    expect(defaultAnchorName(moduleId, YEAR)).toBe(expected);
  });

  it('ignores the year argument — vision statements are timeless', () => {
    expect(defaultAnchorName('ear-training', 2026)).toBe(
      defaultAnchorName('ear-training', 2030),
    );
  });
});

describe('isLegacyAnchorName', () => {
  it('detects the original "[Module] [Year]" shape', () => {
    expect(isLegacyAnchorName('Ear Training 2026', 'ear-training', 2026)).toBe(true);
    expect(isLegacyAnchorName('  Ear Training 2026  ', 'ear-training', 2026)).toBe(true);
  });

  it('detects the 6c.2 "Build comprehensive ... mastery in [Year]" shape', () => {
    expect(
      isLegacyAnchorName(
        'Build comprehensive Ear Training mastery in 2026',
        'ear-training',
        2026,
      ),
    ).toBe(true);
  });

  it('returns false for the current vision-statement default', () => {
    expect(
      isLegacyAnchorName(
        defaultAnchorName('ear-training', 2026),
        'ear-training',
        2026,
      ),
    ).toBe(false);
  });

  it('returns false for user-customized strings', () => {
    expect(isLegacyAnchorName('My ET year', 'ear-training', 2026)).toBe(false);
  });

  it('does not match a different module or year', () => {
    expect(isLegacyAnchorName('Ear Training 2026', 'harmonic-fluency', 2026)).toBe(false);
    expect(isLegacyAnchorName('Ear Training 2025', 'ear-training', 2026)).toBe(false);
    expect(
      isLegacyAnchorName(
        'Build comprehensive Ear Training mastery in 2025',
        'ear-training',
        2026,
      ),
    ).toBe(false);
  });
});

// -------------------------------------------------------------------
// dimensionRowsFor — Ear Training
// -------------------------------------------------------------------

describe('dimensionRowsFor — Ear Training', () => {
  const baseEt: EarTrainingAnchor = {
    breadth: { kind: 'all' },
    mastery: { groupIds: [] },
    depth: { accuracyPercent: 80 },
    consistency: { count: 4, cadence: 'week' },
  };

  it('returns 4 rows in B-M-D-C order', () => {
    const rows = dimensionRowsFor(draftFor('ear-training', { earTraining: baseEt }));
    expect(rows.map(r => r.dimension)).toEqual(['breadth', 'mastery', 'depth', 'consistency']);
  });

  it('Breadth = all surfaces "All N items" with the live total', () => {
    const rows = dimensionRowsFor(draftFor('ear-training', { earTraining: baseEt }));
    expect(rows[0].value).toMatch(/^All \d+ items$/);
    expect(rows[0].value).toContain('143');  // live count from earTrainingCounts
  });

  it('Breadth = subset surfaces the joined group labels', () => {
    const et: EarTrainingAnchor = {
      ...baseEt,
      breadth: { kind: 'subset', groupIds: ['intervals', 'chord-recognition'] },
    };
    const rows = dimensionRowsFor(draftFor('ear-training', { earTraining: et }));
    expect(rows[0].value).toBe('intervals and chord recognition');
  });

  it('Breadth = subset with no groupIds shows "Not yet picked"', () => {
    const et: EarTrainingAnchor = { ...baseEt, breadth: { kind: 'subset', groupIds: [] } };
    const rows = dimensionRowsFor(draftFor('ear-training', { earTraining: et }));
    expect(rows[0].value).toBe('Not yet picked');
  });

  it('Mastery empty shows "—"', () => {
    const rows = dimensionRowsFor(draftFor('ear-training', { earTraining: baseEt }));
    expect(rows[1].value).toBe('—');
  });

  it('Mastery non-empty shows "Master {groups}"', () => {
    const et: EarTrainingAnchor = {
      ...baseEt,
      mastery: { groupIds: ['intervals', 'scales-modes'] },
    };
    const rows = dimensionRowsFor(draftFor('ear-training', { earTraining: et }));
    expect(rows[1].value).toBe('Master intervals and scales & modes');
  });

  it('Depth shows "{N}% target accuracy"', () => {
    const rows = dimensionRowsFor(draftFor('ear-training', { earTraining: baseEt }));
    expect(rows[2].value).toBe('80% target accuracy');
  });

  it('Consistency shows "{N}× per {cadence}"', () => {
    const rows = dimensionRowsFor(draftFor('ear-training', { earTraining: baseEt }));
    expect(rows[3].value).toBe('4× per week');
  });
});

// -------------------------------------------------------------------
// dimensionRowsFor — Shapes & Patterns
// -------------------------------------------------------------------

describe('dimensionRowsFor — Shapes & Patterns', () => {
  const baseSp: ShapesPatternsAnchor = {
    breadth: { kind: 'all' },
    depth: { areaIds: [] },
    mastery: { areaIds: [] },
    consistency: { count: 30, cadence: 'week' },
  };

  it('returns 4 rows in B-D-M-C order (Screen 1 order)', () => {
    const rows = dimensionRowsFor(draftFor('shapes-and-patterns', { shapesPatterns: baseSp }));
    expect(rows.map(r => r.dimension)).toEqual(['breadth', 'depth', 'mastery', 'consistency']);
  });

  it('Consistency uses minutes', () => {
    const rows = dimensionRowsFor(draftFor('shapes-and-patterns', { shapesPatterns: baseSp }));
    expect(rows[3].value).toBe('30 minutes per week');
  });

  it('Depth + Mastery surface joined area labels when populated', () => {
    const sp: ShapesPatternsAnchor = {
      ...baseSp,
      depth:   { areaIds: ['chord_shape_drills', 'scale_drills'] },
      mastery: { areaIds: ['voice_leading'] },
    };
    const rows = dimensionRowsFor(draftFor('shapes-and-patterns', { shapesPatterns: sp }));
    expect(rows[1].value).toBe('Reach Solid in chord shape drills and scale drills');
    expect(rows[2].value).toBe('Truly own voice-leading');
  });
});

// -------------------------------------------------------------------
// dimensionRowsFor — Song Repertoire
// -------------------------------------------------------------------

describe('dimensionRowsFor — Song Repertoire', () => {
  const baseSr: SongRepertoireAnchor = {
    breadthCount: 0,
    depthCount: 0,
    masteryCount: 0,
    consistency: { count: 4, cadence: 'week' },
  };

  it('returns 4 rows in B-D-M-C order with parenthetical level labels', () => {
    const rows = dimensionRowsFor(draftFor('repertoire', { songRepertoire: baseSr }));
    expect(rows.map(r => r.title)).toEqual([
      'Breadth (Comfortable)',
      'Depth (Solid)',
      'Mastery (Internalized)',
      'Consistency',
    ]);
  });

  it('zero counts show "—"', () => {
    const rows = dimensionRowsFor(draftFor('repertoire', { songRepertoire: baseSr }));
    expect(rows[0].value).toBe('—');
    expect(rows[1].value).toBe('—');
    expect(rows[2].value).toBe('—');
  });

  it('non-zero counts show "{N} songs"', () => {
    const sr: SongRepertoireAnchor = {
      ...baseSr,
      breadthCount: 5,
      depthCount: 3,
      masteryCount: 1,
    };
    const rows = dimensionRowsFor(draftFor('repertoire', { songRepertoire: sr }));
    expect(rows[0].value).toBe('5 songs');
    expect(rows[1].value).toBe('3 songs');
    expect(rows[2].value).toBe('1 songs');
  });
});

// -------------------------------------------------------------------
// dimensionRowsFor — Production (3 questions)
// -------------------------------------------------------------------

describe('dimensionRowsFor — Production', () => {
  const baseP: ProductionAnchor = {
    breadth: { kind: 'all' },
    depth: { pathIds: [] },
    consistency: { count: 2, cadence: 'week' },
  };

  it('returns 3 rows in B-D-C order (no Mastery)', () => {
    const rows = dimensionRowsFor(draftFor('production', { production: baseP }));
    expect(rows.map(r => r.dimension)).toEqual(['breadth', 'depth', 'consistency']);
    expect(rows.map(r => r.dimension)).not.toContain('mastery');
  });

  it('Consistency uses hours', () => {
    const rows = dimensionRowsFor(draftFor('production', { production: baseP }));
    expect(rows[2].value).toBe('2 hours per week');
  });

  it('Depth surfaces "Go deep on {paths}" when populated', () => {
    const p: ProductionAnchor = {
      ...baseP,
      depth: { pathIds: ['workflow-foundations', 'genre-productions'] },
    };
    const rows = dimensionRowsFor(draftFor('production', { production: p }));
    expect(rows[1].value).toBe('Go deep on workflow foundations and genre productions');
  });
});

// -------------------------------------------------------------------
// dimensionRowsFor — Practice Consistency (meta-habit)
// -------------------------------------------------------------------

describe('dimensionRowsFor — Practice Consistency', () => {
  const basePc: PracticeConsistencyAnchor = {
    weeklyFloor: 4,
    monthlyFloor: 18,
    aspiration: 5,
  };

  it('returns 3 rows in weeklyFloor / monthlyFloor / aspiration order', () => {
    const rows = dimensionRowsFor(draftFor('practice-consistency', { practiceConsistency: basePc }));
    expect(rows.map(r => r.dimension)).toEqual(['weeklyFloor', 'monthlyFloor', 'aspiration']);
  });

  it('values include the unit (days per week / month)', () => {
    const rows = dimensionRowsFor(draftFor('practice-consistency', { practiceConsistency: basePc }));
    expect(rows[0].value).toBe('4 days per week');
    expect(rows[1].value).toBe('18 days per month');
    expect(rows[2].value).toBe('5 days per week');
  });

  it('singular pluralization: 1 day, not 1 days', () => {
    const rows = dimensionRowsFor(draftFor('practice-consistency', {
      practiceConsistency: { weeklyFloor: 1, monthlyFloor: 1, aspiration: 1 },
    }));
    expect(rows[0].value).toBe('1 day per week');
    expect(rows[1].value).toBe('1 day per month');
  });
});

// -------------------------------------------------------------------
// summarizeAnchor — natural-language paragraphs
// -------------------------------------------------------------------

describe('summarizeAnchor — Ear Training', () => {
  it('matches the design doc shape: "By Dec 31, {year}, you want to … and practice Nx per week."', () => {
    const et: EarTrainingAnchor = {
      breadth: { kind: 'all' },
      mastery: { groupIds: ['chord-recognition', 'chord-progressions'] },
      depth: { accuracyPercent: 85 },
      consistency: { count: 4, cadence: 'week' },
    };
    const draft = draftFor('ear-training', { earTraining: et });
    const summary = summarizeAnchor(draft, 2026, 'Ear Training 2026');
    expect(summary).toMatch(/^By Dec 31, 2026, you want to /);
    expect(summary).toContain('cover all 143 ear training items');
    expect(summary).toContain('master the chord recognition and chord progressions groups');
    expect(summary).toContain('hit 85% overall accuracy');
    expect(summary).toContain('practice 4× per week');
    expect(summary).toMatch(/\.$/);
  });

  it('omits the mastery clause when no groups are selected', () => {
    const et: EarTrainingAnchor = {
      breadth: { kind: 'all' },
      mastery: { groupIds: [] },
      depth: { accuracyPercent: 80 },
      consistency: { count: 3, cadence: 'week' },
    };
    const summary = summarizeAnchor(draftFor('ear-training', { earTraining: et }), 2026, 'x');
    expect(summary).not.toContain('master');
  });
});

describe('summarizeAnchor — Song Repertoire', () => {
  it('omits zero-count clauses', () => {
    const sr: SongRepertoireAnchor = {
      breadthCount: 5,
      depthCount: 0,
      masteryCount: 0,
      consistency: { count: 4, cadence: 'week' },
    };
    const summary = summarizeAnchor(draftFor('repertoire', { songRepertoire: sr }), 2026, 'x');
    expect(summary).toContain('know how to play 5 songs');
    expect(summary).not.toContain('performance-ready');
    expect(summary).not.toContain('internalize');
    expect(summary).toContain('cultivate Song Repertoire 4× per week');
  });

  it('always includes the consistency clause', () => {
    const sr: SongRepertoireAnchor = {
      breadthCount: 0, depthCount: 0, masteryCount: 0,
      consistency: { count: 3, cadence: 'month' },
    };
    const summary = summarizeAnchor(draftFor('repertoire', { songRepertoire: sr }), 2026, 'x');
    expect(summary).toContain('cultivate Song Repertoire 3× per month');
  });

  it('singularizes "1 song"', () => {
    const sr: SongRepertoireAnchor = {
      breadthCount: 1, depthCount: 0, masteryCount: 1,
      consistency: { count: 4, cadence: 'week' },
    };
    const summary = summarizeAnchor(draftFor('repertoire', { songRepertoire: sr }), 2026, 'x');
    expect(summary).toContain('know how to play 1 song,');
    expect(summary).toContain('internalize 1 song,');
  });
});

describe('summarizeAnchor — Production', () => {
  it('uses hours for consistency', () => {
    const p: ProductionAnchor = {
      breadth: { kind: 'all' },
      depth: { pathIds: [] },
      consistency: { count: 2, cadence: 'week' },
    };
    const summary = summarizeAnchor(draftFor('production', { production: p }), 2026, 'x');
    expect(summary).toContain('all 56 production lessons');
    expect(summary).toContain('spend 2 hours per week');
  });
});

describe('summarizeAnchor — Practice Consistency', () => {
  it('describes floor + safety net + aspiration in one sentence', () => {
    const pc: PracticeConsistencyAnchor = {
      weeklyFloor: 4, monthlyFloor: 18, aspiration: 5,
    };
    const summary = summarizeAnchor(draftFor('practice-consistency', { practiceConsistency: pc }), 2026, 'x');
    expect(summary).toContain('floor of 4 days per week');
    expect(summary).toContain('18 per month as the safety net');
    expect(summary).toContain('aspire to 5 days per week');
  });
});

describe('summarizeAnchor — empty draft', () => {
  it('returns an empty string when no module slot is populated', () => {
    expect(summarizeAnchor({ moduleId: 'ear-training', name: null }, 2026, 'x')).toBe('');
  });
});

// -------------------------------------------------------------------
// dimensionRowsFor — empty draft (defensive)
// -------------------------------------------------------------------

describe('dimensionRowsFor — empty draft', () => {
  it('returns [] when the active module slot is missing', () => {
    // Should never happen in normal flow (buildInitialDraft seeds
    // the slot for every supported moduleId), but the helper must
    // not crash if it does.
    expect(dimensionRowsFor({ moduleId: 'ear-training', name: null })).toEqual([]);
  });
});

// -------------------------------------------------------------------
// dimensionRowsFor — Harmonic Fluency
// -------------------------------------------------------------------

describe('dimensionRowsFor — Harmonic Fluency', () => {
  const baseHf: HarmonicFluencyAnchor = {
    breadth: { kind: 'all' },
    mastery: { groupIds: [] },
    depth: { accuracyPercent: 80 },
    consistency: { count: 4, cadence: 'week' },
  };

  it('Breadth = all uses "cards" not "items"', () => {
    const rows = dimensionRowsFor(draftFor('harmonic-fluency', { harmonicFluency: baseHf }));
    expect(rows[0].value).toContain('cards');
    expect(rows[0].value).toContain('369');
  });
});
