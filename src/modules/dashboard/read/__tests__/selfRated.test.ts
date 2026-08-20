/**
 * The three modules that never write `db.attempts`.
 *
 * Each reads a different source with a different shape, and the failures
 * these pin are the ones where a number would get invented: an unrated
 * rep coerced to a value, a cumulative ladder averaged into a rung the
 * player never reached, "not started" rendered as a score of zero.
 */
import { describe, expect, it } from 'vitest';
import type {
  DrillSession, DrillSkill, ProductionLesson, ProductionLessonSession, SpacingState,
} from '../../../../lib/db';
import {
  MENTAL_VIZ_RATING_PROJECTION,
  mentalVizEngagements,
  productionLessonEngagements,
  shapesEngagements,
} from '../selfRated';
import { statsForCatalog } from '../adapters';
import { productionLessonsCatalog, shapesCatalog } from '../catalogs';

const NOW = 1_700_000_000_000;
const DAY = 86_400_000;

function session(patch: Partial<DrillSession>): DrillSession {
  return {
    id: `d-${Math.random()}`, drillTypeId: 't', skillId: 'skill-1',
    hand: 'both', style: 'solid', durationSeconds: 120,
    feelRating: 3, timestamp: NOW, ...patch,
  } as DrillSession;
}

function skill(patch: Partial<DrillSkill>): DrillSkill {
  return {
    id: 'skill-1', kind: 'chord-shape', keyName: 'C', quality: 'maj',
    inversionState: 'root', createdAt: NOW, ...patch,
  } as DrillSkill;
}

function spacing(patch: Partial<SpacingState>): SpacingState {
  return {
    id: 'x', itemRef: 'mv:triad:maj:root:C', moduleRef: 'mental-viz',
    hand: 'both', style: 'solid', memoryType: 'procedural',
    acquisitionStage: 'acquiring', currentIntervalDays: 0,
    lastEngagedAt: null, nextDueAt: null, performanceHistory: [], ...patch,
  } as SpacingState;
}

function lesson(patch: Partial<ProductionLesson>): ProductionLesson {
  return {
    id: 'wf-01', pathId: 'workflow', order: 1, rating: 0,
    revisitCount: 0, lastOpenedAt: null, createdAt: NOW, updatedAt: NOW, ...patch,
  } as ProductionLesson;
}

// ── Shapes & Patterns ────────────────────────────────────────────────

describe('shapesEngagements', () => {
  it('reads the four-step rating the player actually gave', () => {
    const out = shapesEngagements(
      [session({ feelRating: 1 }), session({ feelRating: 4, timestamp: NOW + 1 })],
      [skill({})],
    );
    expect(out.map(e => e.score)).toEqual([25, 100]);
    expect(out.every(e => e.itemRef === 'chord-shape:maj:C:root')).toBe(true);
  });

  it('drops an unrated rep rather than defaulting it', () => {
    // logSession records duration whether or not the rep was rated.
    // Coercing that to a number would invent a fluency signal.
    expect(shapesEngagements(
      [session({ feelRating: undefined })], [skill({})],
    )).toEqual([]);
  });

  it('folds the dropped fifth step onto in-flow', () => {
    expect(shapesEngagements(
      [session({ feelRating: 5 as DrillSession['feelRating'] })], [skill({})],
    )[0].score).toBe(100);
  });

  it('collapses hand and style onto one cell', () => {
    // Two reps of one shape, not two shapes. The denominator counts the
    // shape once, so the numerator has to as well.
    const out = shapesEngagements([
      session({ hand: 'right', style: 'solid' }),
      session({ hand: 'left', style: 'arpeggiated', timestamp: NOW + 1 }),
    ], [skill({})]);
    expect(new Set(out.map(e => e.itemRef)).size).toBe(1);
    expect(out).toHaveLength(2);
  });

  it('passes scale and voice-leading refs through as their own skillId', () => {
    // Those drills run off static catalogs and have no drillSkills row,
    // so logScaleDrillSession stands the itemRef in for skillId.
    const out = shapesEngagements([
      session({ skillId: 'scale:major:C' }),
      session({ skillId: 'vl:major-251:guide-tones:A:C', timestamp: NOW + 1 }),
    ], []);
    expect(out.map(e => e.itemRef))
      .toEqual(['scale:major:C', 'vl:major-251:guide-tones:A:C']);
  });

  it('lands on real catalog rows', () => {
    // The end-to-end check that matters: a rep must reach the cell the
    // denominator counts, not a ref that looks plausible.
    const stats = statsForCatalog(shapesCatalog, shapesEngagements(
      [session({ feelRating: 4 })], [skill({})],
    ));
    const row = stats.find(s => s.itemRef === 'chord-shape:maj:C:root')!;
    expect(row.engagementCount).toBe(1);
    expect(row.score).toBe(100);
    expect(row.accuracyKind).toBe('self-rated');
  });

  it('ignores mental-viz skills — that is its own module', () => {
    expect(shapesEngagements(
      [session({ skillId: 'mv-skill' })],
      [skill({ id: 'mv-skill', kind: 'mental-viz', variant: 'shape-viz' })],
    ).map(e => e.itemRef)).toEqual(['mv-skill']);
    // Unmatched, so it falls through as a literal id and is dropped by
    // catalog membership rather than being guessed into a shape ref.
    const stats = statsForCatalog(shapesCatalog, shapesEngagements(
      [session({ skillId: 'mv-skill' })],
      [skill({ id: 'mv-skill', kind: 'mental-viz', variant: 'shape-viz' })],
    ));
    expect(stats.every(s => s.engagementCount === 0)).toBe(true);
  });
});

// ── Mental visualisation ─────────────────────────────────────────────

describe('mentalVizEngagements', () => {
  it('projects the three stored ratings onto the four-step scale', () => {
    const out = mentalVizEngagements([spacing({
      performanceHistory: [
        { t: NOW, kind: 'rating', rating: 'crawling' },
        { t: NOW + 1, kind: 'rating', rating: 'cruising' },
        { t: NOW + 2, kind: 'rating', rating: 'flying' },
      ] as unknown as SpacingState['performanceHistory'],
    })]);
    expect(out.map(e => e.score)).toEqual([25, 75, 100]);
    expect(MENTAL_VIZ_RATING_PROJECTION.cruising).toBe(75);
  });

  it('ignores non-rating history entries', () => {
    // The column is discriminated by kind and carries attempt and
    // recency signals from other modules' shapes.
    const out = mentalVizEngagements([spacing({
      performanceHistory: [
        { t: NOW, kind: 'attempt', correct: true },
        { t: NOW + 1, kind: 'recency' },
        { t: NOW + 2, kind: 'rating', rating: 'flying' },
      ] as unknown as SpacingState['performanceHistory'],
    })]);
    expect(out).toHaveLength(1);
    expect(out[0].score).toBe(100);
  });

  it('ignores rows from other modules', () => {
    expect(mentalVizEngagements([spacing({
      moduleRef: 'shapes-and-patterns',
      performanceHistory: [
        { t: NOW, kind: 'rating', rating: 'flying' },
      ] as unknown as SpacingState['performanceHistory'],
    })])).toEqual([]);
  });

  it('survives an unknown rating string rather than scoring it', () => {
    expect(mentalVizEngagements([spacing({
      performanceHistory: [
        { t: NOW, kind: 'rating', rating: 'breakthrough' },
      ] as unknown as SpacingState['performanceHistory'],
    })])).toEqual([]);
  });
});

// ── Production lessons ───────────────────────────────────────────────

describe('productionLessonEngagements', () => {
  it('emits the current rating, not a rolling average', () => {
    // The scale is a cumulative ladder. Averaging "read it" and
    // "mastered" would report "deep dive" — a rung the player has never
    // been on.
    const out = productionLessonEngagements([lesson({ rating: 100 })]);
    expect(out).toHaveLength(1);
    expect(out[0].score).toBe(100);
  });

  it('emits nothing for a lesson at zero', () => {
    // Not started is the absence of a rating, not a rating of zero. The
    // row reads as a dash, not as a failure.
    expect(productionLessonEngagements([lesson({ rating: 0 })])).toEqual([]);
  });

  it('covers at "tried it" and not below', () => {
    for (const [rating, covered] of [[25, false], [50, false], [75, true], [100, true]] as const) {
      const stats = statsForCatalog(
        productionLessonsCatalog,
        productionLessonEngagements([lesson({ rating })]),
      );
      const row = stats.find(s => s.itemRef === 'wf-01')!;
      expect(row.covered, `rating ${rating}`).toBe(covered);
    }
  });

  it('prefers a real session timestamp over updatedAt', () => {
    // Any write to the row moves updatedAt, including one that is not
    // practice.
    const sessions: ProductionLessonSession[] = [
      { id: 's1', lessonId: 'wf-01', timestamp: NOW - 5 * DAY } as ProductionLessonSession,
      { id: 's2', lessonId: 'wf-01', timestamp: NOW - DAY } as ProductionLessonSession,
    ];
    const out = productionLessonEngagements(
      [lesson({ rating: 75, updatedAt: NOW })], sessions,
    );
    expect(out[0].timestamp).toBe(NOW - DAY);
  });

  it('falls back to lastOpenedAt, then updatedAt', () => {
    expect(productionLessonEngagements(
      [lesson({ rating: 75, lastOpenedAt: NOW - 3 * DAY, updatedAt: NOW })],
    )[0].timestamp).toBe(NOW - 3 * DAY);
    expect(productionLessonEngagements(
      [lesson({ rating: 75, lastOpenedAt: null, updatedAt: NOW })],
    )[0].timestamp).toBe(NOW);
  });
});
