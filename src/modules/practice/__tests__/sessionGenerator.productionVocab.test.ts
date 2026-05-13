// @vitest-environment jsdom
/**
 * Tests for the Production Vocab parallel candidate stream:
 *
 *   · hasProductionGoal — true for any active goal whose candidate
 *     spec resolves to a Production moduleRef (coverage / accuracy /
 *     consistency / production_count). False for umbrella +
 *     unsupported + non-production goals.
 *   · isProductionVocabBlockEligible — gates on context ∈
 *     {laptop, phone}, Production goal present, ≥1 due vocab card.
 *   · computeProductionVocabSeconds — proportional sizing of the
 *     vocab block (15% of available, clamped to [3, 10] min).
 *   · buildProductionVocabBlock — produces a ProposalBlock pointing
 *     at /production?view=vocabulary with the spec'd label +
 *     description and the given duration.
 *   · countDueProductionVocabCards — Dexie integration; counts
 *     rows with cardId starting with `prod-vocab:` AND
 *     nextReviewDate ≤ now.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildProductionVocabBlock,
  computeProductionVocabSeconds,
  countDueProductionVocabCards,
  hasProductionGoal,
  isProductionVocabBlockEligible,
  PRODUCTION_VOCAB_MAX_SECONDS,
  PRODUCTION_VOCAB_MIN_SECONDS,
} from '../sessionGenerator';
import { db, type FlashcardState, type Goal } from '../../../lib/db';

const NOW = 1_700_000_000_000;

function mkGoal(partial: Partial<Goal>): Goal {
  return {
    id: 'goal-1',
    scope: 'monthly',
    description: '',
    targetMetric: null,
    targetValue: null,
    targetUnit: null,
    currentValue: 0,
    contextTag: null,
    relatedModules: [],
    relatedItems: [],
    startDate: NOW,
    targetDate: NOW + 30 * 86_400_000,
    status: 'active',
    parentGoalId: null,
    contributesNumericallyToParent: false,
    isUmbrella: false,
    lastEngagedAt: null,
    ...partial,
  };
}

function mkCard(partial: Partial<FlashcardState> & { cardId: string }): FlashcardState {
  return {
    easeFactor: 2.5,
    interval: 1,
    nextReviewDate: NOW,
    lastReviewed: NOW - 86_400_000,
    consecutiveCorrect: 0,
    totalAttempts: 1,
    totalCorrect: 0,
    ...partial,
  };
}

describe('hasProductionGoal', () => {
  it('true for a production coverage goal', () => {
    const g = mkGoal({ targetMetric: 'production_coverage_at_acquired' });
    expect(hasProductionGoal([g])).toBe(true);
  });

  it('true for a production consistency goal', () => {
    const g = mkGoal({ targetMetric: 'production_sessions_per_week' });
    expect(hasProductionGoal([g])).toBe(true);
  });

  it('true for a production_lesson_count goal', () => {
    const g = mkGoal({ targetMetric: 'production_lesson_count_overall' });
    expect(hasProductionGoal([g])).toBe(true);
  });

  it('false for an HF-only goal', () => {
    const g = mkGoal({ targetMetric: 'harmonic_fluency_coverage_at_acquired' });
    expect(hasProductionGoal([g])).toBe(false);
  });

  it('false for umbrella goals (no moduleRefs surface)', () => {
    const g = mkGoal({ isUmbrella: true });
    expect(hasProductionGoal([g])).toBe(false);
  });

  it('false for an empty goal list', () => {
    expect(hasProductionGoal([])).toBe(false);
  });
});

describe('isProductionVocabBlockEligible', () => {
  const productionGoal = mkGoal({ targetMetric: 'production_coverage_at_acquired' });
  const hfGoal = mkGoal({ targetMetric: 'harmonic_fluency_coverage_at_acquired' });

  it('true on laptop with production goal + due cards', () => {
    expect(
      isProductionVocabBlockEligible({
        goals: [productionGoal],
        context: 'laptop',
        dueVocabCount: 3,
      }),
    ).toBe(true);
  });

  it('true on phone with production goal + due cards', () => {
    expect(
      isProductionVocabBlockEligible({
        goals: [productionGoal],
        context: 'phone',
        dueVocabCount: 1,
      }),
    ).toBe(true);
  });

  it('false on keys even with production goal + due cards', () => {
    expect(
      isProductionVocabBlockEligible({
        goals: [productionGoal],
        context: 'keys',
        dueVocabCount: 5,
      }),
    ).toBe(false);
  });

  it('false on mixed even with production goal + due cards', () => {
    expect(
      isProductionVocabBlockEligible({
        goals: [productionGoal],
        context: 'mixed',
        dueVocabCount: 5,
      }),
    ).toBe(false);
  });

  it('false on laptop when no production goal exists', () => {
    expect(
      isProductionVocabBlockEligible({
        goals: [hfGoal],
        context: 'laptop',
        dueVocabCount: 5,
      }),
    ).toBe(false);
  });

  it('false on laptop with production goal but no due cards', () => {
    expect(
      isProductionVocabBlockEligible({
        goals: [productionGoal],
        context: 'laptop',
        dueVocabCount: 0,
      }),
    ).toBe(false);
  });
});

describe('computeProductionVocabSeconds', () => {
  it('returns 15% of available, rounded', () => {
    // 30 min × 0.15 = 4.5 min = 270 s. In the [180, 600] window.
    expect(computeProductionVocabSeconds(30 * 60)).toBe(270);
    // 60 min × 0.15 = 9 min = 540 s.
    expect(computeProductionVocabSeconds(60 * 60)).toBe(540);
  });

  it('clamps below the minimum (3 min) for short sessions', () => {
    // 10 min × 0.15 = 90 s — under the 180 s floor.
    expect(computeProductionVocabSeconds(10 * 60)).toBe(PRODUCTION_VOCAB_MIN_SECONDS);
    expect(computeProductionVocabSeconds(15 * 60)).toBe(PRODUCTION_VOCAB_MIN_SECONDS);
    expect(computeProductionVocabSeconds(0)).toBe(PRODUCTION_VOCAB_MIN_SECONDS);
  });

  it('clamps above the maximum (10 min) for long sessions', () => {
    // 75 min × 0.15 = 11.25 min — over the 10-min cap.
    expect(computeProductionVocabSeconds(75 * 60)).toBe(PRODUCTION_VOCAB_MAX_SECONDS);
    expect(computeProductionVocabSeconds(120 * 60)).toBe(PRODUCTION_VOCAB_MAX_SECONDS);
  });

  it('exposes its constants for caller-side budget math', () => {
    expect(PRODUCTION_VOCAB_MIN_SECONDS).toBe(180);
    expect(PRODUCTION_VOCAB_MAX_SECONDS).toBe(600);
  });
});

describe('buildProductionVocabBlock', () => {
  it('produces a block at the supplied duration with the curated quick-launch route', () => {
    const block = buildProductionVocabBlock(3, 540);
    expect(block.id).toBe('block-production-vocab');
    expect(block.moduleRef).toBe('production');
    expect(block.moduleLabel).toBe('Production Vocab');
    expect(block.activityDescription).toBe('Flashcard review — terms and concepts');
    expect(block.plannedSeconds).toBe(540);
    expect(block.quickLaunchRoute).toBe('/production?view=vocabulary');
    expect(block.itemRefs).toEqual([]);
    expect(block.isWarmup).toBe(false);
  });

  it('honours the duration passed by the caller (no fixed default)', () => {
    expect(buildProductionVocabBlock(3, 180).plannedSeconds).toBe(180);
    expect(buildProductionVocabBlock(3, 600).plannedSeconds).toBe(600);
  });

  it('pluralises the why-snippet correctly', () => {
    expect(buildProductionVocabBlock(1, 300).whySnippet).toContain('1 card');
    expect(buildProductionVocabBlock(1, 300).whySnippet).not.toContain('cards');
    expect(buildProductionVocabBlock(7, 300).whySnippet).toContain('7 cards');
  });
});

beforeEach(async () => {
  await db.flashcardStates.clear();
});

describe('countDueProductionVocabCards — Dexie integration', () => {
  it('counts prod-vocab cards due now', async () => {
    await db.flashcardStates.bulkPut([
      mkCard({ cardId: 'prod-vocab:reverb', nextReviewDate: NOW - 1000 }),
      mkCard({ cardId: 'prod-vocab:eq', nextReviewDate: NOW }),
    ]);
    expect(await countDueProductionVocabCards(NOW)).toBe(2);
  });

  it('excludes non-prod-vocab card ids (HF cards live in the same table)', async () => {
    await db.flashcardStates.bulkPut([
      mkCard({ cardId: 'prod-vocab:reverb', nextReviewDate: NOW - 1000 }),
      mkCard({ cardId: 'hf:dom7-C', nextReviewDate: NOW - 1000 }),
    ]);
    expect(await countDueProductionVocabCards(NOW)).toBe(1);
  });

  it('excludes prod-vocab cards scheduled in the future', async () => {
    await db.flashcardStates.bulkPut([
      mkCard({ cardId: 'prod-vocab:past', nextReviewDate: NOW - 1000 }),
      mkCard({ cardId: 'prod-vocab:future', nextReviewDate: NOW + 86_400_000 }),
    ]);
    expect(await countDueProductionVocabCards(NOW)).toBe(1);
  });

  it('returns 0 when the table is empty', async () => {
    expect(await countDueProductionVocabCards(NOW)).toBe(0);
  });
});
