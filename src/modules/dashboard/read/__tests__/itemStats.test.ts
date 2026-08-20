/**
 * The three rules — accuracy, coverage, recency — and the one place
 * they now live.
 *
 * These assert on the mechanism, not on a rendered number: which
 * engagements enter the accuracy window, which enter coverage, and
 * which set recency. The divergence these replace was entirely about
 * that third question.
 */
import { describe, expect, it } from 'vitest';
import type { AttemptRecord } from '../../../../lib/db';
import {
  ACCURACY_WINDOW,
  COVERAGE_MIN_ENGAGEMENTS,
  LESSON_COVERAGE_RULE,
  emptyItemStats,
  engagementFromAttempt,
  engagementFromRating,
  engagementsFromAttempts,
  itemStatsByRef,
  itemStatsFromEngagements,
  type Engagement,
} from '../itemStats';

const DAY = 24 * 60 * 60 * 1000;
const T0 = 1_700_000_000_000;

function eng(patch: Partial<Engagement> & { score: number }): Engagement {
  return { itemRef: 'x', timestamp: T0, ...patch };
}

function attempt(patch: Partial<AttemptRecord>): AttemptRecord {
  return {
    moduleId: 'intervals',
    itemId: 'M3:asc',
    correct: true,
    timestamp: T0,
    ...patch,
  } as AttemptRecord;
}

// ── Accuracy ─────────────────────────────────────────────────────────

describe('accuracy', () => {
  it('is null with no engagements, not zero', () => {
    // 0% reads as "you got everything wrong". A dash reads as "no
    // signal". They are different claims.
    expect(itemStatsFromEngagements('x', []).score).toBeNull();
    expect(emptyItemStats('x').score).toBeNull();
  });

  it('uses what exists below a full window', () => {
    const stats = itemStatsFromEngagements('x', [
      eng({ score: 100 }), eng({ score: 0 }), eng({ score: 100 }),
    ]);
    expect(stats.windowTotal).toBe(3);
    expect(stats.score).toBeCloseTo(200 / 3);
  });

  it('spans exactly the last 20 eligible engagements', () => {
    // 20 wrong, then 20 right, newest last. The window must see only
    // the 20 right ones.
    const older = Array.from({ length: 20 }, (_, i) =>
      eng({ score: 0, timestamp: T0 + i }));
    const newer = Array.from({ length: 20 }, (_, i) =>
      eng({ score: 100, timestamp: T0 + 100 + i }));
    const stats = itemStatsFromEngagements('x', [...older, ...newer]);
    expect(stats.windowTotal).toBe(ACCURACY_WINDOW);
    expect(stats.score).toBe(100);
    expect(stats.engagementCount).toBe(40);
  });

  it('does not depend on input order', () => {
    // A caller handing over unsorted rows must not be able to produce
    // a different window.
    const rows = [
      eng({ score: 0, timestamp: T0 + 2 }),
      eng({ score: 100, timestamp: T0 }),
      eng({ score: 100, timestamp: T0 + 1 }),
    ];
    const forward = itemStatsFromEngagements('x', rows);
    const reversed = itemStatsFromEngagements('x', [...rows].reverse());
    expect(forward).toEqual(reversed);
  });
});

// ── excludeFromFluency: the rule that splits the columns ─────────────

describe('excludeFromFluency', () => {
  const rows = [
    eng({ score: 100, timestamp: T0 }),
    eng({ score: 100, timestamp: T0 + DAY, excludeFromFluency: true }),
    eng({ score: 100, timestamp: T0 + 2 * DAY, excludeFromFluency: true }),
  ];

  it('is excluded from accuracy', () => {
    const stats = itemStatsFromEngagements('x', rows);
    expect(stats.windowTotal).toBe(1);
    expect(stats.excludedCount).toBe(2);
  });

  it('is counted toward coverage', () => {
    // Three engagements, two of them focus-protected. You practised
    // the item three times; coverage asks whether you did the thing.
    const stats = itemStatsFromEngagements('x', rows);
    expect(stats.engagementCount).toBe(3);
    expect(stats.covered).toBe(true);
  });

  it('sets recency — this is where the old code diverged', () => {
    // dashboard/aggregation.ts dropped excluded rows before reading
    // the last timestamp, so a week of focus practice left an item
    // reading as untouched for a week. The newest row here is
    // excluded; lastAt must still be its timestamp.
    const stats = itemStatsFromEngagements('x', rows);
    expect(stats.lastAt).toBe(T0 + 2 * DAY);
  });

  it('leaves accuracy null when every engagement was excluded', () => {
    // Practised, but no eligible signal: covered, dash for accuracy,
    // and a real recency. All three at once.
    const stats = itemStatsFromEngagements('x', [
      eng({ score: 100, timestamp: T0, excludeFromFluency: true }),
      eng({ score: 100, timestamp: T0 + DAY, excludeFromFluency: true }),
      eng({ score: 0, timestamp: T0 + 2 * DAY, excludeFromFluency: true }),
    ]);
    expect(stats.score).toBeNull();
    expect(stats.windowTotal).toBe(0);
    expect(stats.covered).toBe(true);
    expect(stats.lastAt).toBe(T0 + 2 * DAY);
  });
});

// ── Coverage ─────────────────────────────────────────────────────────

describe('coverage', () => {
  it('needs 3 engagements by default', () => {
    expect(COVERAGE_MIN_ENGAGEMENTS).toBe(3);
    const two = [eng({ score: 100 }), eng({ score: 100, timestamp: T0 + 1 })];
    expect(itemStatsFromEngagements('x', two).covered).toBe(false);
    expect(itemStatsFromEngagements('x', [...two, eng({ score: 0, timestamp: T0 + 2 })]).covered)
      .toBe(true);
  });

  it('does not care whether the answers were right', () => {
    // An item seen once, guessed wrong and never revisited must stay
    // on the uncovered list; one seen three times is covered even if
    // all three were wrong. Coverage is not accuracy.
    const wrong = Array.from({ length: 3 }, (_, i) =>
      eng({ score: 0, timestamp: T0 + i }));
    expect(itemStatsFromEngagements('x', wrong).covered).toBe(true);
    expect(itemStatsFromEngagements('x', wrong).score).toBe(0);
  });

  it('uses the lesson rule for production lessons — "tried it", not a count', () => {
    // A lesson is not a rep you repeat. Reading it and taking it in
    // are worth recording but neither is practice, so 25 and 50 leave
    // it uncovered however many times they are logged.
    const opts = { coverageRule: LESSON_COVERAGE_RULE };
    const readIt = [eng({ score: 25 }), eng({ score: 25, timestamp: T0 + 1 }),
      eng({ score: 25, timestamp: T0 + 2 })];
    expect(itemStatsFromEngagements('x', readIt, opts).covered).toBe(false);

    const deepDive = [eng({ score: 50 })];
    expect(itemStatsFromEngagements('x', deepDive, opts).covered).toBe(false);

    // "tried it" covers on a single engagement.
    const tried = [eng({ score: 75 })];
    expect(itemStatsFromEngagements('x', tried, opts).covered).toBe(true);
    expect(itemStatsFromEngagements('x', tried, opts).engagementCount).toBe(1);
  });
});

// ── Accuracy kind ────────────────────────────────────────────────────

describe('accuracyKind', () => {
  it('defaults to measured', () => {
    expect(itemStatsFromEngagements('x', [eng({ score: 100 })]).accuracyKind)
      .toBe('measured');
  });

  it('is carried on the stats so 75 can never be shown as "75% correct"', () => {
    // S&P and Repertoire have no right or wrong. The column is
    // labelled fluency there, and the affordance reads this field.
    const stats = itemStatsFromEngagements(
      'x', [eng({ score: 75 })], { accuracyKind: 'self-rated' },
    );
    expect(stats.accuracyKind).toBe('self-rated');
    expect(stats.score).toBe(75);
  });

  it('counts windowCorrect as full-score engagements', () => {
    const stats = itemStatsFromEngagements('x', [
      eng({ score: 100 }), eng({ score: 0, timestamp: T0 + 1 }),
      eng({ score: 100, timestamp: T0 + 2 }),
    ]);
    expect(stats.windowCorrect).toBe(2);
    expect(stats.windowTotal).toBe(3);
  });
});

// ── Converters ───────────────────────────────────────────────────────

describe('engagementFromAttempt', () => {
  it('scores right/wrong as 100/0', () => {
    expect(engagementFromAttempt(attempt({ correct: true })).score).toBe(100);
    expect(engagementFromAttempt(attempt({ correct: false })).score).toBe(0);
  });

  it('canonicalises the item id', () => {
    const legacy = engagementFromAttempt(
      attempt({ moduleId: 'chord-recognition', itemId: 'maj' }),
    );
    expect(legacy.itemRef).toBe('maj:0');
  });

  it('carries the exclusion flag only when set', () => {
    expect(engagementFromAttempt(attempt({})).excludeFromFluency).toBeUndefined();
    expect(engagementFromAttempt(attempt({ excludeFromFluency: true })).excludeFromFluency)
      .toBe(true);
  });
});

describe('engagementFromRating', () => {
  it('projects the four-step scale onto 0-100', () => {
    expect(engagementFromRating('x', T0, 1)?.score).toBe(25);
    expect(engagementFromRating('x', T0, 2)?.score).toBe(50);
    expect(engagementFromRating('x', T0, 3)?.score).toBe(75);
    expect(engagementFromRating('x', T0, 4)?.score).toBe(100);
  });

  it('folds the dropped fifth step onto in-flow', () => {
    // Rows written before "breakthrough" was dropped still hold a 5.
    expect(engagementFromRating('x', T0, 5)?.score).toBe(100);
  });

  it('returns null for an unrated session rather than inventing a number', () => {
    // "Log the time and say nothing else" is a supported path in both
    // self-rated modules. Absence is not a low rating, and coercing it
    // would invent a fluency signal the player never gave.
    expect(engagementFromRating('x', T0, null)).toBeNull();
    expect(engagementFromRating('x', T0, undefined)).toBeNull();
  });
});

// ── Bucketing ────────────────────────────────────────────────────────

describe('itemStatsByRef', () => {
  it('buckets by canonical ref and keeps items independent', () => {
    const stats = itemStatsByRef(engagementsFromAttempts([
      attempt({ moduleId: 'chord-recognition', itemId: 'maj', correct: false }),
      attempt({ moduleId: 'chord-recognition', itemId: 'maj:0', correct: true, timestamp: T0 + 1 }),
      attempt({ moduleId: 'chord-recognition', itemId: 'min:1', correct: true, timestamp: T0 + 2 }),
    ]));
    // The legacy and modern rows are one item, not two.
    expect(stats.size).toBe(2);
    expect(stats.get('maj:0')!.engagementCount).toBe(2);
    expect(stats.get('maj:0')!.score).toBe(50);
    expect(stats.get('min:1')!.engagementCount).toBe(1);
  });

  it('omits items with no engagements — the denominator is not its job', () => {
    // Coverage denominators come from the catalog. A map built from
    // the log cannot supply one, and must not look like it can.
    const stats = itemStatsByRef([]);
    expect(stats.size).toBe(0);
  });
});
