/**
 * The collapse of three tier computations into one
 * (`docs/RULE_LEGIBILITY.md` §1.12).
 *
 * These assert the mechanism the three used to disagree about: which
 * engagements set the timestamp that freshness and staleness read, and
 * whether legacy item ids bucket with modern ones.
 */
import { describe, expect, it } from 'vitest';
import type { AttemptRecord } from '../../../../lib/db';
import { STALE_DAYS, MIN_ATTEMPTS_FOR_TIER } from '../../../../lib/tier';
import { readingCatalog, scalesModesCatalog } from '../catalogs';
import {
  bucketAttemptsForCatalog,
  emptyTierCounts,
  itemStatsForCatalog,
  tierCountsForCatalog,
  tierAndLastFromAttempts,
  tierCountsFromAttempts,
  tierFromItemStats,
} from '../tierAdapter';
import { itemStatsFromEngagements } from '../itemStats';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_700_000_000_000;

function attempt(patch: Partial<AttemptRecord>): AttemptRecord {
  return {
    moduleId: 'intervals',
    itemId: 'M3:asc',
    correct: true,
    timestamp: NOW,
    ...patch,
  } as AttemptRecord;
}

/** A run of correct attempts ending `daysAgo` before NOW. */
function correctRun(count: number, daysAgo: number, patch: Partial<AttemptRecord> = {}) {
  return Array.from({ length: count }, (_, i) =>
    attempt({ timestamp: NOW - daysAgo * DAY - i * 1000, ...patch }));
}

describe('focus-protected reps set freshness — the §1.12 divergence', () => {
  it('reads the timestamp from an excluded attempt', () => {
    // aggregation.ts dropped excluded rows BEFORE reading the last
    // timestamp. Here the only recent attempt is focus-protected: the
    // item was drilled today, and `last` must say so.
    const { last } = tierAndLastFromAttempts([
      ...correctRun(10, 40),
      attempt({ timestamp: NOW - DAY, excludeFromFluency: true }),
    ], NOW);
    expect(last).toBe(NOW - DAY);
  });

  it('does not let focus practice tip a fluent item into stale', () => {
    // 10 correct 40 days ago would be stale on its own. A focus rep
    // yesterday means the player HAS been drilling it. Under the old
    // aggregation behaviour this read `stale`.
    const old = correctRun(10, STALE_DAYS + 10);
    expect(tierAndLastFromAttempts(old, NOW).tier).toBe('stale');

    const withFocusRep = [
      ...old,
      attempt({ timestamp: NOW - DAY, excludeFromFluency: true }),
    ];
    expect(tierAndLastFromAttempts(withFocusRep, NOW).tier).toBe('fluent');
  });

  it('still keeps focus reps out of the accuracy window', () => {
    // The flag's whole point: it changes recency, never accuracy. Ten
    // wrong eligible answers plus ten right focus-protected ones is
    // still a needsWork item.
    const stats = itemStatsFromEngagements('x', [
      ...correctRun(10, 1, { correct: false }),
      ...correctRun(10, 0, { excludeFromFluency: true }),
    ].map(a => ({
      itemRef: 'x',
      timestamp: a.timestamp,
      score: a.correct ? 100 : 0,
      ...(a.excludeFromFluency ? { excludeFromFluency: true as const } : {}),
    })));
    expect(stats.windowTotal).toBe(10);
    expect(stats.score).toBe(0);
    expect(tierFromItemStats(stats, NOW)).toBe('needsWork');
  });
});

describe('legacy item ids bucket with modern ones', () => {
  it('counts a bare chord id and its :0 form as one item', () => {
    // Only the in-quiz tracker folded these. The Dashboard counted
    // them as two separate items, each below the 5-attempt tier
    // threshold, so both read `untouched`.
    const counts = tierCountsFromAttempts([
      ...Array.from({ length: 3 }, (_, i) =>
        attempt({ moduleId: 'chord-recognition', itemId: 'maj', timestamp: NOW - i * 1000 })),
      ...Array.from({ length: 3 }, (_, i) =>
        attempt({ moduleId: 'chord-recognition', itemId: 'maj:0', timestamp: NOW - 10_000 - i * 1000 })),
    ], NOW);
    expect(counts.total).toBe(1);
    expect(counts.fluent + counts.mastered).toBe(1);
  });

  it('leaves other modules unfolded', () => {
    // `M3` and `M3:asc` are genuinely different ids outside chord
    // recognition and must stay two items.
    const counts = tierCountsFromAttempts([
      attempt({ moduleId: 'intervals', itemId: 'M3' }),
      attempt({ moduleId: 'intervals', itemId: 'M3:asc', timestamp: NOW + 1 }),
    ], NOW);
    expect(counts.total).toBe(2);
  });
});

describe('tierCountsFromAttempts', () => {
  it('counts one bucket per distinct item', () => {
    const counts = tierCountsFromAttempts([
      ...correctRun(6, 0, { itemId: 'a' }),
      ...correctRun(6, 0, { itemId: 'b' }),
    ], NOW);
    expect(counts.total).toBe(2);
    expect(counts.fluent + counts.mastered).toBe(2);
  });

  it('returns an empty tally for no attempts', () => {
    expect(tierCountsFromAttempts([], NOW)).toEqual(emptyTierCounts());
  });

  it('files an item with only focus-protected attempts as untouched, not absent', () => {
    // It has no eligible accuracy signal, so `untouched` is the honest
    // verdict — but the item was practised, so it belongs in the tally
    // rather than vanishing from it.
    const counts = tierCountsFromAttempts(
      correctRun(4, 0, { excludeFromFluency: true }), NOW,
    );
    expect(counts.total).toBe(1);
    expect(counts.untouched).toBe(1);
  });

  it('needs the tier minimum before it will call anything fluent', () => {
    const counts = tierCountsFromAttempts(
      correctRun(MIN_ATTEMPTS_FOR_TIER - 1, 0), NOW,
    );
    expect(counts.untouched).toBe(1);
    expect(counts.fluent).toBe(0);
  });
});

describe('bucketAttemptsForCatalog — the Skills-catalogue miss', () => {
  it('finds chord-recognition attempts under the bare chord id', () => {
    // THE BUG. registry.ts bucketed on the raw itemId and looked up
    // `c.id` from db.chordQualities, which is a bare `maj`. Attempts
    // have logged as `maj:0` since the inversion build, so the lookup
    // matched nothing and the catalogue showed the module untouched.
    const buckets = bucketAttemptsForCatalog([
      attempt({ moduleId: 'chord-recognition', itemId: 'maj:0' }),
      attempt({ moduleId: 'chord-recognition', itemId: 'maj:2', timestamp: NOW + 1 }),
    ]);
    const mod = buckets.get('chord-recognition')!;
    expect(mod.get('maj')).toHaveLength(2);
  });

  it('rolls every inversion of a chord into that chord row', () => {
    // The catalogue and the dashboard tree both show one row per
    // chord, with inversion below the leaf rather than beside it.
    const buckets = bucketAttemptsForCatalog([
      attempt({ moduleId: 'chord-recognition', itemId: 'min7:0' }),
      attempt({ moduleId: 'chord-recognition', itemId: 'min7:1', timestamp: NOW + 1 }),
      attempt({ moduleId: 'chord-recognition', itemId: 'min7:3', timestamp: NOW + 2 }),
      // Legacy bare id from before the inversion build.
      attempt({ moduleId: 'chord-recognition', itemId: 'min7', timestamp: NOW + 3 }),
    ]);
    const mod = buckets.get('chord-recognition')!;
    expect([...mod.keys()]).toEqual(['min7']);
    expect(mod.get('min7')).toHaveLength(4);
  });

  it('keeps modules separate and other ids untouched', () => {
    const buckets = bucketAttemptsForCatalog([
      attempt({ moduleId: 'intervals', itemId: 'M3' }),
      attempt({ moduleId: 'scales-modes', itemId: 'dorian-tab1' }),
      attempt({ moduleId: 'chord-progressions', itemId: 'motion:1-5-asc' }),
    ]);
    expect([...buckets.get('intervals')!.keys()]).toEqual(['M3']);
    expect([...buckets.get('scales-modes')!.keys()]).toEqual(['dorian-tab1']);
    expect([...buckets.get('chord-progressions')!.keys()]).toEqual(['motion:1-5-asc']);
  });
});

describe('tierCountsForCatalog — the denominator fix', () => {
  it('totals the catalog, not the log', () => {
    // THE BUG. snapshotEarTrainingModules derived `total` from items
    // present in db.attempts, so the denominator grew as you practised
    // and `untouched` was permanently 0. One attempt against one mode
    // must not make the module "1 item, 100% seen".
    const counts = tierCountsForCatalog(
      scalesModesCatalog,
      [attempt({ moduleId: 'scales-modes', itemId: 'ionian-tab1' })],
      NOW,
    );
    expect(counts.total).toBe(18);
    expect(counts.untouched).toBe(18);
  });

  it('does not move when nothing has been practised', () => {
    expect(tierCountsForCatalog(scalesModesCatalog, [], NOW).total).toBe(18);
  });

  it('ignores attempts against refs the catalog no longer holds', () => {
    // Numerator filtered to catalog membership by construction: stats
    // are looked up BY catalog ref, so stored practice that outlived a
    // catalog entry cannot push a percentage over 100%.
    const counts = tierCountsForCatalog(
      scalesModesCatalog,
      correctRun(10, 0, { moduleId: 'scales-modes', itemId: 'cut-mode-tab1' }),
      NOW,
    );
    expect(counts.total).toBe(18);
    expect(counts.untouched).toBe(18);
    expect(counts.fluent).toBe(0);
  });

  it('tiers a real run against its catalog row', () => {
    const counts = tierCountsForCatalog(
      scalesModesCatalog,
      correctRun(10, 0, { moduleId: 'scales-modes', itemId: 'dorian-tab2' }),
      NOW,
    );
    expect(counts.total).toBe(18);
    expect(counts.fluent + counts.mastered).toBe(1);
    expect(counts.untouched).toBe(17);
  });

  it('tiers a merged row on its refs combined', () => {
    // Reading's conceptual-knowledge row aggregates `count` and
    // `which`. Three attempts on each is six engagements for one row —
    // enough to clear the tier minimum, which neither ref would manage
    // alone.
    const refs = ['sig:2s:major:count', 'sig:2s:major:which'];
    const attempts = refs.flatMap((ref, r) =>
      Array.from({ length: 3 }, (_, i) =>
        attempt({ moduleId: 'reading', itemId: ref, timestamp: NOW - (r * 10 + i) * 1000 })));
    const stats = itemStatsForCatalog(readingCatalog, attempts)
      .find(s => s.itemRef === '2s:major:conceptual')!;
    expect(stats.engagementCount).toBe(6);
    expect(tierFromItemStats(stats, NOW)).not.toBe('untouched');
  });
});
