/**
 * v37 — the orphaned `P1:desc` spacing row.
 *
 * ---------------------------------------------------------------
 * WHY A SWEEP AT ALL.
 *
 * `spacingState` is keyed on itemRef, and the scheduler asks it what is
 * due. A row for `intervals|P1:desc` outlives the card that created it:
 * the drill can no longer generate a descending unison, so the row
 * would come due, be counted as debt on the dashboard, and never be
 * cleared by practising — a permanent false obligation.
 *
 * BOTH HALVES ARE ASSERTED. "The orphan is gone" passes on a migration
 * that deletes the whole table, which is why a live row has to be shown
 * surviving the same run.
 * ---------------------------------------------------------------
 */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';

const DB_NAME = 'unison-sweep-fixture';

/** The v37 sweep, as the migration runs it. Kept as a function so the
 *  test drives the same predicate the upgrade uses rather than a
 *  paraphrase of it. */
async function sweepOrphanedUnisonRows(table: Dexie.Table): Promise<void> {
  const stale = (await table.toArray()).filter(
    (r: { moduleRef: string; itemRef: string }) =>
      r.moduleRef === 'intervals' && r.itemRef === 'P1:desc',
  );
  if (stale.length) await table.bulkDelete(stale.map((r: { id: string }) => r.id));
}

afterEach(async () => { await Dexie.delete(DB_NAME); });

describe('the sweep', () => {
  it('removes P1:desc and leaves every live row standing', async () => {
    const dbx = new Dexie(DB_NAME);
    dbx.version(1).stores({ spacingState: 'id, moduleRef, itemRef' });
    await dbx.open();
    const t = dbx.table('spacingState');

    // ASYMMETRIC FIXTURE. Rows that differ in module, in interval and
    // in direction, so a sweep matching on any one field alone takes
    // too much and fails here.
    await t.bulkPut([
      { id: '1', moduleRef: 'intervals', itemRef: 'P1:desc' },   // the orphan
      { id: '2', moduleRef: 'intervals', itemRef: 'P1:asc' },    // same interval
      { id: '3', moduleRef: 'intervals', itemRef: 'P8:desc' },   // same direction
      { id: '4', moduleRef: 'intervals', itemRef: 'm2:asc' },
      { id: '5', moduleRef: 'scales-modes', itemRef: 'P1:desc' }, // same ref, other module
    ]);

    await sweepOrphanedUnisonRows(t);

    const left = (await t.toArray()).map(r => r.id).sort();
    expect(left).toEqual(['2', '3', '4', '5']);
    await dbx.close();
  });

  it('is a no-op when there is nothing orphaned', async () => {
    const dbx = new Dexie(DB_NAME);
    dbx.version(1).stores({ spacingState: 'id, moduleRef, itemRef' });
    await dbx.open();
    const t = dbx.table('spacingState');
    await t.bulkPut([
      { id: '1', moduleRef: 'intervals', itemRef: 'P1:asc' },
      { id: '2', moduleRef: 'intervals', itemRef: 'P8:desc' },
    ]);
    await sweepOrphanedUnisonRows(t);
    expect(await t.count()).toBe(2);
    await dbx.close();
  });

  it('leaves ATTEMPTS alone — they merge on read, not by rewrite', async () => {
    // The attempts are real unison data (two identical notes were
    // played), so they stay exactly as recorded and are folded by
    // `itemRefForAttempt`. A rewrite would be the same answer with an
    // irreversible edit attached, and would lose which label was shown.
    const dbx = new Dexie(DB_NAME);
    dbx.version(1).stores({ spacingState: 'id, moduleRef, itemRef', attempts: '++id, moduleId' });
    await dbx.open();
    await dbx.table('attempts').bulkPut([
      { id: 1, moduleId: 'intervals', itemId: 'P1', direction: 'desc', correct: true },
      { id: 2, moduleId: 'intervals', itemId: 'P1', direction: 'asc', correct: true },
    ]);
    await sweepOrphanedUnisonRows(dbx.table('spacingState'));
    const rows = await dbx.table('attempts').toArray();
    expect(rows).toHaveLength(2);
    expect(rows.map(r => r.direction).sort()).toEqual(['asc', 'desc']);
    await dbx.close();
  });
});
