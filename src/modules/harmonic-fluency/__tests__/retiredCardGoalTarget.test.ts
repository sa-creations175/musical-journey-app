/**
 * The one number `ksc-3` left behind.
 *
 * =====================================================================
 * THE TWO ASSERTIONS THAT MATTER ARE SILENCE AND REFUSAL.
 *
 * Moving 649 to 648 is easy to get right and easy to check. What this
 * file is really for is everything else: a database with no such goal
 * at all — the expected answer, and one that has to be completely
 * silent — and a database whose shape is not the one the ruling was
 * made about. A second goal at 649, a completed one, a target nobody
 * authorised, a deck that moved again: every one of those stops the
 * write rather than adapting to it, and leaves the pref unset so it is
 * a state to come back to.
 *
 * AND NOTHING ELSE IS TOUCHED. Every test that writes seeds a goal in
 * another module and a Harmonic Fluency goal on another metric, and
 * shows both came through with their targets intact.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, type Goal, type GoalStatus } from '../../../lib/db';
import { harmonicFluencyCounts } from '../../../lib/moduleItemCounts';
import {
  AUTHORISED_TARGET,
  decideRetune,
  describeRetune,
  PREF_HF_COVERAGE_TARGET_RETUNED,
  retuneRetiredCardGoalTarget,
  STALE_TARGET,
} from '../retiredCardGoalTarget';
import { getPref, setPref } from '../../../lib/userPrefs';

const HF_OVERALL = 'harmonic_fluency_coverage_at_acquired';
const HF_SPECIFIC = 'harmonic_fluency_coverage_at_acquired_specific';
const SHAPES_OVERALL = 'shapes_coverage_at_acquired';

function goal(over: Partial<Goal> & { id: string }): Goal {
  return {
    scope: 'yearly',
    description: over.id,
    targetMetric: HF_OVERALL,
    targetValue: STALE_TARGET,
    targetUnit: 'items',
    currentValue: 0,
    contextTag: null,
    relatedModules: ['harmonic-fluency'],
    relatedItems: [],
    startDate: Date.UTC(2026, 0, 1),
    targetDate: Date.UTC(2026, 11, 31),
    status: 'active' as GoalStatus,
    parentGoalId: null,
    contributesNumericallyToParent: false,
    isUmbrella: false,
    lastEngagedAt: null,
    ...over,
  } as Goal;
}

/**
 * Two goals this must never touch, seeded alongside every case.
 *
 * The shapes one stands at 648 ON PURPOSE: the chord-shape catalog is
 * also 648, so a one-shot that matched on the NUMBER rather than the
 * metric would find it. This is the test that says it does not.
 */
const BYSTANDERS: readonly Goal[] = [
  goal({ id: 'shapes', targetMetric: SHAPES_OVERALL, targetValue: 648 }),
  goal({ id: 'hf-sub-area', targetMetric: HF_SPECIFIC, targetValue: 100 }),
];

async function seed(goals: readonly Goal[]) {
  await db.goals.bulkPut([...BYSTANDERS, ...goals]);
}

async function targetsOf(ids: readonly string[]) {
  const rows = await db.goals.bulkGet([...ids]);
  return rows.map(r => r?.targetValue ?? null);
}

beforeEach(async () => {
  await db.goals.clear();
  await db.userPrefs.clear();
});

describe('the ruling, without a database', () => {
  const LIVE = AUTHORISED_TARGET;

  it('does nothing where there is no Harmonic Fluency coverage goal', () => {
    expect(decideRetune([...BYSTANDERS], LIVE)).toEqual({ kind: 'none' });
  });

  it('does nothing where the goal already stands at the live count', () => {
    const g = goal({ id: 'g', targetValue: AUTHORISED_TARGET });
    expect(decideRetune([g], LIVE)).toEqual({ kind: 'none' });
  });

  it('moves one open goal from the stale target to the live one', () => {
    const g = goal({ id: 'g', description: 'Cover the deck' });
    expect(decideRetune([g], LIVE)).toEqual({
      kind: 'retune',
      goalId: 'g',
      description: 'Cover the deck',
      from: STALE_TARGET,
      to: AUTHORISED_TARGET,
    });
  });

  it('treats a paused goal as open — it is being come back to', () => {
    const g = goal({ id: 'g', status: 'paused' });
    expect(decideRetune([g], LIVE).kind).toBe('retune');
  });

  for (const status of ['completed', 'abandoned'] as const) {
    it(`refuses a ${status} goal rather than rewriting what was aimed at`, () => {
      const d = decideRetune([goal({ id: 'g', status })], LIVE);
      expect(d.kind).toBe('refused');
      expect(d.kind === 'refused' && d.reason).toContain(status);
    });
  }

  it('refuses when more than one goal stands at the stale target', () => {
    const d = decideRetune([goal({ id: 'a' }), goal({ id: 'b' })], LIVE);
    expect(d.kind).toBe('refused');
    expect(d.kind === 'refused' && d.reason).toContain('2 overall');
  });

  it('refuses a target it was not authorised against', () => {
    const d = decideRetune([goal({ id: 'g', targetValue: 500 })], LIVE);
    expect(d.kind).toBe('refused');
    expect(d.kind === 'refused' && d.reason).toContain('500');
  });

  it('refuses when the deck has moved again', () => {
    const d = decideRetune([goal({ id: 'g' })], 640);
    expect(d.kind).toBe('refused');
    expect(d.kind === 'refused' && d.reason).toContain('640');
  });

  it('ignores an umbrella goal, whose progress is a rollup', () => {
    const g = goal({ id: 'g', isUmbrella: true, targetValue: null });
    expect(decideRetune([g], LIVE)).toEqual({ kind: 'none' });
  });
});

describe('the ruling, against the database', () => {
  it('moves the goal, marks itself done, and touches nothing else', async () => {
    await seed([goal({ id: 'g', description: 'All of Harmonic Fluency' })]);

    const report = await retuneRetiredCardGoalTarget();

    expect(report.decision.kind).toBe('retune');
    expect((await db.goals.get('g'))!.targetValue).toBe(AUTHORISED_TARGET);
    expect(await targetsOf(['shapes', 'hf-sub-area'])).toEqual([648, 100]);
    expect(await getPref(PREF_HF_COVERAGE_TARGET_RETUNED, false)).toBe(true);
    expect(describeRetune(report)).toContain('All of Harmonic Fluency');
  });

  it('says nothing at all when there is no such goal', async () => {
    await seed([]);

    const report = await retuneRetiredCardGoalTarget();

    expect(report.decision).toEqual({ kind: 'none' });
    // NO LINE, and NOT marked done. Silence is the outcome, not a step.
    expect(describeRetune(report)).toBeNull();
    expect(await getPref(PREF_HF_COVERAGE_TARGET_RETUNED, false)).toBe(false);
    expect(await targetsOf(['shapes', 'hf-sub-area'])).toEqual([648, 100]);
  });

  it('a refusal writes nothing and leaves the pref unset', async () => {
    await seed([goal({ id: 'a' }), goal({ id: 'b' })]);

    const report = await retuneRetiredCardGoalTarget();

    expect(report.decision.kind).toBe('refused');
    expect(await targetsOf(['a', 'b'])).toEqual([STALE_TARGET, STALE_TARGET]);
    expect(await getPref(PREF_HF_COVERAGE_TARGET_RETUNED, false)).toBe(false);
    expect(describeRetune(report)).toContain('REFUSED');
  });

  it('does not run twice', async () => {
    await setPref(PREF_HF_COVERAGE_TARGET_RETUNED, true);
    await seed([goal({ id: 'g' })]);

    const report = await retuneRetiredCardGoalTarget();

    expect(report.skipped).toBe(true);
    expect((await db.goals.get('g'))!.targetValue).toBe(STALE_TARGET);
    expect(describeRetune(report)).toBeNull();
  });
});

describe('the numbers this is pinned to', () => {
  it('the live deck is the target this may write', () => {
    // The pin that makes the refusal above meaningful: if the catalog
    // moves again, `AUTHORISED_TARGET` stops matching and every retune
    // refuses until somebody rules on it.
    expect(harmonicFluencyCounts().total).toBe(AUTHORISED_TARGET);
    expect(STALE_TARGET).toBe(AUTHORISED_TARGET + 1);
  });
});
