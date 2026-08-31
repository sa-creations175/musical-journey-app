/**
 * A time row knows what kind of run it was.
 *
 * =====================================================================
 * IT DID NOT, AND THE FLAG WAS ALREADY IN THE ROOM.
 *
 * `fromTest` reached the function that writes a drill session — it is
 * what the band rule reads on the spacing rep — and was dropped on the
 * way to the row. So the row carried how long a run lasted and not what
 * kind of run it was. "Practice time versus testing time" was a
 * question the data could not answer, and neither was "show me my test
 * runs": the two logs were not two views, they were a distinction
 * nothing recorded.
 *
 * ONE SOURCE. Nothing infers it, and nothing matches a run to a spacing
 * rep by timestamp to recover it — a join on time would silently
 * mis-attribute any two runs that landed in the same second.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, type DrillSession } from '../../../lib/db';
import { logScaleDrillSession } from '../drillModel';

const base = {
  itemRef: 'scale:c-major:2oct',
  hand: 'left' as const,
  durationSeconds: 60,
  feelRating: 3 as const,
};

/** How every reader must ask the question: absent counts as practice. */
const wasTest = (s: DrillSession) => s.fromTest === true;

beforeEach(async () => { await db.drillSessions.clear(); });

describe('the run says which it was', () => {
  it('a test run is recorded as one', async () => {
    await logScaleDrillSession({ ...base, fromTest: true });
    const [row] = await db.drillSessions.toArray();
    expect(row.fromTest).toBe(true);
    expect(wasTest(row)).toBe(true);
  });

  it('a practice run is not', async () => {
    await logScaleDrillSession({ ...base, fromTest: false });
    const [row] = await db.drillSessions.toArray();
    expect(row.fromTest).toBe(false);
    expect(wasTest(row)).toBe(false);
  });

  it('A LEGACY ROW WITH NO VALUE READS AS PRACTICE', async () => {
    // Not a third bucket and not "unknown". Rows written before the
    // field existed are practice runs and are read as such.
    await db.drillSessions.add({
      id: 'legacy-1', drillTypeId: base.itemRef, skillId: base.itemRef,
      hand: 'left', durationSeconds: 90, timestamp: 1,
    } as DrillSession);
    const [row] = await db.drillSessions.toArray();
    expect(row.fromTest).toBeUndefined();
    expect(wasTest(row)).toBe(false);
  });
});

describe('the two logs separate', () => {
  it('splits the runs, and the time with them', async () => {
    await logScaleDrillSession({ ...base, durationSeconds: 60, fromTest: false });
    await logScaleDrillSession({ ...base, durationSeconds: 30, fromTest: true });
    await logScaleDrillSession({ ...base, durationSeconds: 45, fromTest: true });
    await db.drillSessions.add({
      id: 'legacy-2', drillTypeId: base.itemRef, skillId: base.itemRef,
      hand: 'left', durationSeconds: 20, timestamp: 1,
    } as DrillSession);

    const rows = await db.drillSessions.toArray();
    const tests = rows.filter(wasTest);
    const practice = rows.filter(r => !wasTest(r));

    expect(tests).toHaveLength(2);
    // The one practice run, plus the legacy row that counts as one.
    expect(practice).toHaveLength(2);
    expect(tests.reduce((n, r) => n + r.durationSeconds, 0)).toBe(75);
    expect(practice.reduce((n, r) => n + r.durationSeconds, 0)).toBe(80);
  });

  it('and the hands stay separate within them', async () => {
    await logScaleDrillSession({ ...base, hand: 'left', fromTest: true });
    await logScaleDrillSession({ ...base, hand: 'right', fromTest: true });
    const rows = await db.drillSessions.toArray();
    expect(rows.filter(r => r.hand === 'left' && wasTest(r))).toHaveLength(1);
    expect(rows.filter(r => r.hand === 'right' && wasTest(r))).toHaveLength(1);
  });
});
