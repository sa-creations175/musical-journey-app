/**
 * The one action that reaches what is already scheduled.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { db, type SpacingState } from '../../db';
import { setPref } from '../../userPrefs';
import { MS_PER_DAY } from '../engine';
import { PREF_SPACING_TREE } from '../store';
import { countAffected, recalculateAllSchedules } from '../recalculate';

const T0 = 1_800_000_000_000;

async function seed(over: Partial<SpacingState> = {}): Promise<SpacingState> {
  const row: SpacingState = {
    id: crypto.randomUUID(),
    itemRef: 'ks-4',
    moduleRef: 'harmonic-fluency',
    hand: 'both',
    style: 'solid',
    memoryType: 'declarative',
    acquisitionStage: 'acquired',
    currentIntervalDays: 30,
    lastEngagedAt: T0,
    nextDueAt: T0 + 30 * MS_PER_DAY,
    performanceHistory: Array.from({ length: 10 }, () => ({
      t: T0, kind: 'attempt', correct: true,
    })),
    spacingStage: 'maintaining',
    exposuresDone: 12,
    extraExposures: 0,
    ...over,
  };
  await db.spacingState.add(row);
  return row;
}

beforeEach(async () => {
  await db.spacingState.clear();
  await db.userPrefs.clear();
});

describe('recalculating', () => {
  it('pulls a card under a ceiling that has just been lowered', async () => {
    await seed();
    // 10 correct answers → Mastered → the card sits at 30 days under a
    // 60-day ceiling. Drop Mastered's ceiling to 7 and it must come in.
    await setPref(PREF_SPACING_TREE, {
      'harmonic-fluency': {
        maintaining: { perBand: { mastered: { ceilingDays: 7 } } },
      },
    });
    expect(await countAffected()).toBe(1);
    expect(await recalculateAllSchedules()).toBe(1);
    const row = (await db.spacingState.toArray())[0];
    expect(row.nextDueAt).toBe(T0 + 7 * MS_PER_DAY);
    expect(row.currentIntervalDays).toBe(7);
  });

  it('measures from the last answer, not from now', async () => {
    // Otherwise every card in the library gets a fresh full-length wait
    // starting today, and one due tomorrow is pushed out by a month for
    // the crime of having had its ceiling adjusted.
    await seed();
    await setPref(PREF_SPACING_TREE, {
      'harmonic-fluency': { maintaining: { perBand: { mastered: { ceilingDays: 7 } } } },
    });
    await recalculateAllSchedules();
    const row = (await db.spacingState.toArray())[0];
    expect(row.nextDueAt).toBe(T0 + 7 * MS_PER_DAY);
  });

  it('changes nothing when the settings still produce the same date', async () => {
    await seed();
    expect(await countAffected()).toBe(0);
    expect(await recalculateAllSchedules()).toBe(0);
  });

  it('leaves a card that has never been started alone', async () => {
    await seed({ nextDueAt: null, lastEngagedAt: null });
    await setPref(PREF_SPACING_TREE, {
      'harmonic-fluency': { maintaining: { perBand: { mastered: { ceilingDays: 7 } } } },
    });
    expect(await countAffected()).toBe(0);
    const row = (await db.spacingState.toArray())[0];
    expect(row.nextDueAt).toBeNull();
  });

  it('leaves a level that is out of the schedule alone', async () => {
    await seed();
    await setPref(PREF_SPACING_TREE, {
      'harmonic-fluency': {
        inSchedule: false,
        maintaining: { perBand: { mastered: { ceilingDays: 7 } } },
      },
    });
    expect(await countAffected()).toBe(0);
    expect(await recalculateAllSchedules()).toBe(0);
  });

  it('does not drag an acquiring card out of its pattern', async () => {
    // The tally's gaps are already measured from the last answer, so
    // there is nothing to recompute without inventing history.
    await seed({ spacingStage: 'acquiring', exposuresDone: 2, currentIntervalDays: 0 });
    await setPref(PREF_SPACING_TREE, {
      'harmonic-fluency': { maintaining: { firstWaitDays: 9 } },
    });
    expect(await countAffected()).toBe(0);
  });
});
