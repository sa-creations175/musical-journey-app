// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, type Goal } from '../../../lib/db';
import {
  findActiveMonthlyForModule,
  findAnchorGoalForModule,
} from '../anchorLookup';

const NOW = 1_700_000_000_000;
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

function goal(partial: Partial<Goal>): Goal {
  return {
    id: `g-${Math.random().toString(36).slice(2, 8)}`,
    scope: 'yearly',
    description: 'test goal',
    targetMetric: null,
    targetValue: null,
    targetUnit: null,
    currentValue: 0,
    contextTag: 'mixed',
    relatedModules: ['harmonic-fluency'],
    relatedItems: [],
    startDate: NOW,
    targetDate: NOW + ONE_YEAR_MS,
    status: 'active',
    parentGoalId: null,
    contributesNumericallyToParent: false,
    isUmbrella: false,
    lastEngagedAt: null,
    ...partial,
  };
}

describe('findAnchorGoalForModule', () => {
  beforeEach(async () => {
    await db.goals.clear();
  });

  it('returns the active yearly anchor when one exists for the module', async () => {
    const anchor = goal({ id: 'g-hf-yearly', scope: 'yearly' });
    await db.goals.add(anchor);
    expect((await findAnchorGoalForModule('harmonic-fluency'))?.id).toBe('g-hf-yearly');
  });

  it('returns null when no yearly goal exists for the module', async () => {
    await db.goals.add(goal({ scope: 'yearly', relatedModules: ['ear-training'] }));
    expect(await findAnchorGoalForModule('harmonic-fluency')).toBeNull();
  });

  it('skips paused, completed, and abandoned yearly goals', async () => {
    await db.goals.bulkAdd([
      goal({ id: 'g-paused',    scope: 'yearly', status: 'paused' }),
      goal({ id: 'g-completed', scope: 'yearly', status: 'completed' }),
      goal({ id: 'g-abandoned', scope: 'yearly', status: 'abandoned' }),
    ]);
    expect(await findAnchorGoalForModule('harmonic-fluency')).toBeNull();
  });

  it('skips non-yearly goals even when they reference the module', async () => {
    await db.goals.bulkAdd([
      goal({ id: 'g-monthly',   scope: 'monthly' }),
      goal({ id: 'g-quarterly', scope: 'quarterly' }),
      goal({ id: 'g-lifetime',  scope: 'lifetime' }),
    ]);
    expect(await findAnchorGoalForModule('harmonic-fluency')).toBeNull();
  });

  it('returns the most recently-started anchor when multiple match', async () => {
    await db.goals.bulkAdd([
      goal({ id: 'g-old',  scope: 'yearly', startDate: NOW - ONE_YEAR_MS }),
      goal({ id: 'g-new',  scope: 'yearly', startDate: NOW }),
      goal({ id: 'g-mid',  scope: 'yearly', startDate: NOW - ONE_YEAR_MS / 2 }),
    ]);
    expect((await findAnchorGoalForModule('harmonic-fluency'))?.id).toBe('g-new');
  });

  it('matches when the module is one of multiple in relatedModules', async () => {
    await db.goals.add(
      goal({
        id: 'g-multi',
        scope: 'yearly',
        relatedModules: ['ear-training', 'harmonic-fluency', 'shapes-and-patterns'],
      }),
    );
    expect((await findAnchorGoalForModule('harmonic-fluency'))?.id).toBe('g-multi');
    expect((await findAnchorGoalForModule('ear-training'))?.id).toBe('g-multi');
    expect((await findAnchorGoalForModule('shapes-and-patterns'))?.id).toBe('g-multi');
    expect(await findAnchorGoalForModule('production')).toBeNull();
  });

  it('prefers an umbrella over its children even when a child has a later startDate', async () => {
    // Children inherit scope + relatedModules from the parent's baseFields
    // and can be persisted with a startDate fractionally later than the
    // umbrella's. Without umbrella-preference, a startDate tiebreak race
    // returns the child instead of the umbrella.
    await db.goals.bulkAdd([
      goal({
        id: 'umbrella',
        scope: 'yearly',
        isUmbrella: true,
        parentGoalId: null,
        startDate: NOW,
      }),
      goal({
        id: 'child-coverage',
        scope: 'yearly',
        isUmbrella: false,
        parentGoalId: 'umbrella',
        startDate: NOW + 5, // milliseconds later — bulkAdd timing
      }),
      goal({
        id: 'child-accuracy',
        scope: 'yearly',
        isUmbrella: false,
        parentGoalId: 'umbrella',
        startDate: NOW + 10,
      }),
    ]);
    expect((await findAnchorGoalForModule('harmonic-fluency'))?.id).toBe('umbrella');
  });

  it('returns null when only child goals match (never anchors to a child of an unrelated umbrella)', async () => {
    // Child rows under an umbrella that DOESN'T match the queried
    // module — e.g. the user has a cross-module umbrella and one of
    // its children is HF-tagged. The HF-tagged child should not
    // serve as an anchor for new HF monthly goals; the suggestion
    // flow blocks until a top-level HF anchor exists.
    await db.goals.bulkAdd([
      goal({
        id: 'cross-umbrella',
        scope: 'yearly',
        isUmbrella: true,
        parentGoalId: null,
        relatedModules: ['ear-training'], // not HF
      }),
      goal({
        id: 'child-hf-tagged',
        scope: 'yearly',
        isUmbrella: false,
        parentGoalId: 'cross-umbrella',
        relatedModules: ['harmonic-fluency'],
      }),
    ]);
    expect(await findAnchorGoalForModule('harmonic-fluency')).toBeNull();
  });

  it('falls back to top-level non-umbrella yearly when no umbrella exists', async () => {
    // Single-target yearly goals (one metric, not umbrella) are
    // still valid anchors — the user just hasn't set a multi-target
    // yearly goal yet.
    await db.goals.add(
      goal({
        id: 'single-target',
        scope: 'yearly',
        isUmbrella: false,
        parentGoalId: null,
      }),
    );
    expect((await findAnchorGoalForModule('harmonic-fluency'))?.id).toBe('single-target');
  });
});

describe('findActiveMonthlyForModule', () => {
  beforeEach(async () => {
    await db.goals.clear();
  });

  it('returns the active monthly goal when one exists', async () => {
    const m = goal({ id: 'g-monthly', scope: 'monthly' });
    await db.goals.add(m);
    expect((await findActiveMonthlyForModule('harmonic-fluency'))?.id).toBe('g-monthly');
  });

  it('returns null when no monthly goal exists for the module', async () => {
    await db.goals.add(goal({ scope: 'yearly' }));
    expect(await findActiveMonthlyForModule('harmonic-fluency')).toBeNull();
  });

  it('returns the most recently-started monthly when multiple match', async () => {
    await db.goals.bulkAdd([
      goal({ id: 'g-jan', scope: 'monthly', startDate: NOW - 60 * 24 * 60 * 60 * 1000 }),
      goal({ id: 'g-mar', scope: 'monthly', startDate: NOW }),
      goal({ id: 'g-feb', scope: 'monthly', startDate: NOW - 30 * 24 * 60 * 60 * 1000 }),
    ]);
    expect((await findActiveMonthlyForModule('harmonic-fluency'))?.id).toBe('g-mar');
  });
});
