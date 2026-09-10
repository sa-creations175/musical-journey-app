// @vitest-environment jsdom
/**
 * What opens a tier, walked from stored attempts rather than fixtures.
 *
 * =====================================================================
 * A PASS IS RIGHT WITHOUT AN AID, AND THE BAR IS 80.
 *
 * Silas's ruling of 10 Sep 2026. Every other unlock test in the app
 * hands `computeUnlocked*` a hand-built {passes, total} map, which
 * proves the walk and says nothing about where `passes` came from —
 * and where it comes from is the whole of the change. These three
 * tests start at `db.attempts`, with the ratings a real answer writes,
 * and end at the tier the reader is given.
 *
 * The two cases the ruling names in terms:
 *
 *   · twenty attempts, all Clean (75)                → unlocks
 *   · twenty, six of them Working on it (50) → 70%   → does not
 *
 * TWO LADDERS, NOT THREE. Chord progressions had one until 10 Sep 2026,
 * when it was retired — the Full Progression card has no Tiers and a
 * generated session draws the whole shared list, narrowed by the card's
 * own filter.
 *
 * Fourteen of twenty is 70%, which is under the bar even though every
 * one of the twenty was a right answer. That is the point of the
 * ruling: a card answered with the bass soloed is right, and does not
 * open anything.
 *
 * The third test is the migration: rows written before today carry no
 * rating at all, and read as the two ends of the scale — In flow for a
 * right answer, Struggled for a wrong one — so an old history unlocks
 * exactly what it used to, at the new threshold.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, newAttemptId, type AttemptRecord } from '../../../lib/db';
import { getUnlockedTier } from '../chord-recognition/tierUnlock';
import {
  CHORD_RECOGNITION_TIERS, toAttemptForm,
} from '../chord-recognition/chordRecognitionTiers';
import {
  getUnlockedScaleModesStage, modesForStage,
} from '../scales-modes/scaleModeTierUnlock';

/** Twenty attempts on one item, `working` of them rated Working on it
 *  (50) and the rest Clean (75). Every one of them is a RIGHT answer —
 *  the rating is what tells them apart. */
function attemptsFor(
  moduleId: string, itemId: string, working: number,
): AttemptRecord[] {
  return Array.from({ length: 20 }, (_, i) => ({
    id: newAttemptId(),
    moduleId,
    itemId,
    correct: true,
    feelRating: (i < working ? 2 : 3) as 1 | 2 | 3 | 4,
    timestamp: 1_700_000_000_000 + i,
  }));
}

/** The same twenty with no rating at all — a history written before
 *  10 Sep 2026. */
function unratedFor(moduleId: string, itemId: string): AttemptRecord[] {
  return attemptsFor(moduleId, itemId, 0).map((row) => {
    const bare = { ...row };
    delete bare.feelRating;
    return bare;
  });
}

const TIER_1 = CHORD_RECOGNITION_TIERS[1].map(toAttemptForm);

async function seed(rows: AttemptRecord[][]) {
  await db.attempts.bulkAdd(rows.flat());
}

beforeEach(async () => {
  await db.attempts.clear();
});

describe('chord recognition', () => {
  it('unlocks tier 2 on twenty attempts all rated Clean', async () => {
    await seed(TIER_1.map(id => attemptsFor('chord-recognition', id, 0)));
    expect(await getUnlockedTier()).toBe(2);
  });

  it('does not unlock when six of the twenty are Working on it', async () => {
    // 14 of 20 = 70%, under the 80% bar — and all twenty were right.
    await seed(TIER_1.map(id => attemptsFor('chord-recognition', id, 6)));
    expect(await getUnlockedTier()).toBe(1);
  });

  it('lets one item short through, and holds on two', async () => {
    // A TIER OPENS AT EIGHTY PER CENT OF ITS ITEMS since 10 Sep 2026.
    // Six items need five, so the last one falling short no longer
    // walls the tier — and two falling short still does. This test read
    // "one item short of the bar holds the whole tier" until the rule
    // changed, and that is the behaviour the ruling was about.
    const short = (n: number) => TIER_1.map((id, i) =>
      attemptsFor('chord-recognition', id, i >= TIER_1.length - n ? 6 : 0));
    await seed(short(1));
    expect(await getUnlockedTier()).toBe(2);

    await db.attempts.clear();
    await seed(short(2));
    expect(await getUnlockedTier()).toBe(1);
  });

  it('reads an unrated history as it always did', async () => {
    // Right and unrated is In flow, so twenty right answers clear.
    await seed(TIER_1.map(id => unratedFor('chord-recognition', id)));
    expect(await getUnlockedTier()).toBe(2);
  });
});

describe('scales and modes', () => {
  const STAGE_1 = modesForStage(1);

  it('unlocks stage 2 on twenty attempts all rated Clean', async () => {
    await seed(STAGE_1.map(id => attemptsFor('scales-modes', id, 0)));
    expect(await getUnlockedScaleModesStage()).toBe(2);
  });

  it('does not unlock when six of the twenty are Working on it', async () => {
    await seed(STAGE_1.map(id => attemptsFor('scales-modes', id, 6)));
    expect(await getUnlockedScaleModesStage()).toBe(1);
  });
});
