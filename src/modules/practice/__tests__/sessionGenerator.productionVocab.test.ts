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
 *   · buildProductionVocabBlock — produces a fixed-duration
 *     ProposalBlock pointing at /production?view=vocabulary with the
 *     spec'd label + description.
 *   · countDueProductionVocabCards — Dexie integration; counts
 *     rows with cardId starting with `prod-vocab:` AND
 *     nextReviewDate ≤ now.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildProductionVocabBlock,
  countDueProductionVocabCards,
  hasProductionGoal,
  isProductionVocabBlockEligible,
  PRODUCTION_VOCAB_PLANNED_SECONDS,
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

describe('buildProductionVocabBlock', () => {
  it('produces a fixed-duration block with the curated quick-launch route', () => {
    const block = buildProductionVocabBlock(3);
    expect(block.id).toBe('block-production-vocab');
    expect(block.moduleRef).toBe('production');
    expect(block.moduleLabel).toBe('Production Vocab');
    expect(block.activityDescription).toBe('Flashcard review — terms and concepts');
    expect(block.plannedSeconds).toBe(PRODUCTION_VOCAB_PLANNED_SECONDS);
    expect(block.plannedSeconds).toBe(600);
    expect(block.quickLaunchRoute).toBe('/production?view=vocabulary');
    expect(block.itemRefs).toEqual([]);
    expect(block.isWarmup).toBe(false);
  });

  it('pluralises the why-snippet correctly', () => {
    expect(buildProductionVocabBlock(1).whySnippet).toContain('1 card');
    expect(buildProductionVocabBlock(1).whySnippet).not.toContain('cards');
    expect(buildProductionVocabBlock(7).whySnippet).toContain('7 cards');
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
