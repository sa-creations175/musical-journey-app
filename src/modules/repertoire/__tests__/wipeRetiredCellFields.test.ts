// @vitest-environment jsdom
/**
 * The wipe is irreversible, so the tests are mostly about what it
 * must NOT do.
 *
 * Deleting the three gate fields is the easy half. The half worth
 * guarding is the four things that survive — `lastRunAt` above all,
 * because `findSeededKeyRows` uses it to refuse deleting a key row and
 * losing it would make practised rows look untouched.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../../lib/db';
import { getPref, setPref } from '../../../lib/userPrefs';
import {
  EXPECTED,
  PREF_RETIRED_CELL_FIELDS_WIPED,
  reportRetiredCellFields,
  wipeRetiredCellFields,
} from '../wipeRetiredCellFields';

/** A cell as it exists BEFORE the wipe — the three retired fields
 *  still on it, which is why this is cast rather than typed. */
function legacyCell(over: Record<string, unknown> = {}) {
  return {
    id: 'c1', songId: 's1', sectionId: 'sec1', songKeyId: 'k1',
    cellState: 'empty',
    comfortableAt: null,
    consecutiveCleanCount: 0,
    lastRunWasClean: null,
    lastRunAt: null, notes: null, lastEngagedAt: null,
    createdAt: 0, updatedAt: 0,
    ...over,
  } as never;
}

function runThrough(id: string) {
  return {
    id, cellId: 'c1', songId: 's1', sectionId: 'sec1', songKeyId: 'k1',
    wasClean: true, tempoBpm: 100, notes: null, createdAt: 0,
  } as never;
}

/** Exactly the corpus the wipe was authorised against. */
async function seedAuthorisedCorpus() {
  const cells: never[] = [];
  for (let i = 0; i < EXPECTED.cells; i++) {
    cells.push(legacyCell({
      id: `c${i}`,
      comfortableAt: i < EXPECTED.withComfortableAt ? 1 : null,
      consecutiveCleanCount: i < EXPECTED.withStreak ? 2 : 0,
      lastRunWasClean: i < EXPECTED.withStreak ? true : null,
      lastRunAt: i < EXPECTED.withStreak ? 111 : null,
      notes: i === 0 ? 'keep me' : null,
    }));
  }
  await db.songCells.bulkAdd(cells);
  await db.songCellRunThroughs.bulkAdd(
    Array.from({ length: EXPECTED.runThroughs }, (_, i) => runThrough(`r${i}`)),
  );
  await seedAuthorisedKeys();
  await seedKeyRunThroughs(13);
}

/** Keys as they exist before the wipe: 1 solid, 1 comfortable,
 *  2 learning, and enough not_started to be realistic. */
async function seedAuthorisedKeys() {
  await db.songKeys.bulkAdd([
    { id: 'k-solid', songId: 's1', keyName: 'Ab', isOriginalKey: true,
      keyState: 'solid', solidAt: 111, solidDecayState: 'solid',
      lastDecayCheckAt: null, livedWithSessionCount: 0,
      livedWithFirstSessionAt: null, livedWithWindowStartAt: null,
      livedWithSessionsInWindow: 0, wholeSongTestPassedAt: 222,
      isRetestRecommended: false, lastEngagedAt: null,
      createdAt: 0, updatedAt: 0 },
    { id: 'k-comfy', songId: 's1', keyName: 'C', isOriginalKey: false,
      keyState: 'comfortable', solidAt: null, solidDecayState: null,
      lastDecayCheckAt: null, livedWithSessionCount: 0,
      livedWithFirstSessionAt: null, livedWithWindowStartAt: null,
      livedWithSessionsInWindow: 0, wholeSongTestPassedAt: null,
      isRetestRecommended: false, lastEngagedAt: null,
      createdAt: 0, updatedAt: 0 },
    { id: 'k-l1', songId: 's1', keyName: 'F', isOriginalKey: false,
      keyState: 'learning', solidAt: null, solidDecayState: null,
      lastDecayCheckAt: null, livedWithSessionCount: 0,
      livedWithFirstSessionAt: null, livedWithWindowStartAt: null,
      livedWithSessionsInWindow: 0, wholeSongTestPassedAt: null,
      isRetestRecommended: false, lastEngagedAt: null,
      createdAt: 0, updatedAt: 0 },
    { id: 'k-l2', songId: 's1', keyName: 'G', isOriginalKey: false,
      keyState: 'learning', solidAt: null, solidDecayState: null,
      lastDecayCheckAt: null, livedWithSessionCount: 0,
      livedWithFirstSessionAt: null, livedWithWindowStartAt: null,
      livedWithSessionsInWindow: 0, wholeSongTestPassedAt: null,
      isRetestRecommended: false, lastEngagedAt: null,
      createdAt: 0, updatedAt: 0 },
    { id: 'k-none', songId: 's1', keyName: 'D', isOriginalKey: false,
      keyState: 'not_started', solidAt: null, solidDecayState: null,
      lastDecayCheckAt: null, livedWithSessionCount: 0,
      livedWithFirstSessionAt: null, livedWithWindowStartAt: null,
      livedWithSessionsInWindow: 0, wholeSongTestPassedAt: null,
      isRetestRecommended: false, lastEngagedAt: null,
      createdAt: 0, updatedAt: 0 },
  ] as never[]);
}

/** A key run-through — the log that must SURVIVE. */
async function seedKeyRunThroughs(n: number) {
  await db.songKeyRunThroughs.bulkAdd(
    Array.from({ length: n }, (_, i) => ({
      id: `kr${i}`, songKeyId: 'k-solid', songId: 's1', wasClean: true,
      consecutiveCleanCount: 1, tempoBpm: 100, notes: null,
      isRetest: false, createdAt: 0,
    })) as never[],
  );
}

beforeEach(async () => {
  await Promise.all([
    db.songCells.clear(), db.songCellRunThroughs.clear(),
    db.songKeys.clear(), db.songKeyRunThroughs.clear(), db.userPrefs.clear(),
  ]);
});

describe('the report is read-only', () => {
  it('counts without touching anything', async () => {
    await seedAuthorisedCorpus();
    const r = await reportRetiredCellFields();
    expect(r.cells).toBe(EXPECTED.cells);
    expect(r.withComfortableAt).toBe(EXPECTED.withComfortableAt);
    expect(r.withStreak).toBe(EXPECTED.withStreak);
    expect(r.runThroughs).toBe(EXPECTED.runThroughs);
    // Nothing moved.
    expect(await db.songCells.count()).toBe(EXPECTED.cells);
    expect(await db.songCellRunThroughs.count()).toBe(EXPECTED.runThroughs);
    expect(await getPref(PREF_RETIRED_CELL_FIELDS_WIPED, false)).toBe(false);
  });
});

describe('what it removes', () => {
  it('deletes the three fields from every cell', async () => {
    await seedAuthorisedCorpus();
    await wipeRetiredCellFields();
    const rows = (await db.songCells.toArray()) as unknown as Record<string, unknown>[];
    expect(rows).toHaveLength(EXPECTED.cells);
    for (const row of rows) {
      expect('comfortableAt' in row).toBe(false);
      expect('consecutiveCleanCount' in row).toBe(false);
      expect('lastRunWasClean' in row).toBe(false);
    }
  });

  it('empties the run-through log', async () => {
    await seedAuthorisedCorpus();
    await wipeRetiredCellFields();
    expect(await db.songCellRunThroughs.count()).toBe(0);
  });
});

describe('what it must NOT remove', () => {
  it('keeps lastRunAt — seededKeyRows refuses a deletion on it', async () => {
    await seedAuthorisedCorpus();
    await wipeRetiredCellFields();
    const withRun = (await db.songCells.toArray()).filter(c => c.lastRunAt !== null);
    expect(withRun).toHaveLength(EXPECTED.withStreak);
  });

  it('keeps notes', async () => {
    await seedAuthorisedCorpus();
    await wipeRetiredCellFields();
    const noted = (await db.songCells.toArray())
      .filter(c => (c.notes ?? '').trim() !== '');
    expect(noted).toHaveLength(1);
    expect(noted[0].notes).toBe('keep me');
  });

  it('keeps cellState — it is a synced NOT NULL column', async () => {
    await seedAuthorisedCorpus();
    await wipeRetiredCellFields();
    const rows = await db.songCells.toArray();
    expect(rows.every(c => typeof c.cellState === 'string')).toBe(true);
    expect(rows.every(c => c.cellState === 'empty')).toBe(true);
  });

  it('deletes no cells', async () => {
    await seedAuthorisedCorpus();
    await wipeRetiredCellFields();
    expect(await db.songCells.count()).toBe(EXPECTED.cells);
  });
});

describe('it refuses when the numbers moved', () => {
  it('will not run against a corpus it was not authorised for', async () => {
    // One cell short. The wipe is irreversible, so a database that
    // changed under the count is one nobody previewed.
    await seedAuthorisedCorpus();
    await db.songCells.delete('c0');

    const r = await wipeRetiredCellFields();
    expect(r.refused).toBe(true);
    // AND NOTHING WAS TOUCHED, which is the half that matters.
    expect(await db.songCellRunThroughs.count()).toBe(EXPECTED.runThroughs);
    const rows = (await db.songCells.toArray()) as unknown as Record<string, unknown>[];
    expect(rows.some(row => 'consecutiveCleanCount' in row)).toBe(true);
    expect(await getPref(PREF_RETIRED_CELL_FIELDS_WIPED, false)).toBe(false);
  });

  it('refuses on an extra run-through too', async () => {
    await seedAuthorisedCorpus();
    await db.songCellRunThroughs.add(runThrough('r-extra'));
    const r = await wipeRetiredCellFields();
    expect(r.refused).toBe(true);
    expect(await db.songCellRunThroughs.count()).toBe(EXPECTED.runThroughs + 1);
  });
});

describe('running it twice', () => {
  it('skips the second time', async () => {
    await seedAuthorisedCorpus();
    await wipeRetiredCellFields();
    const again = await wipeRetiredCellFields();
    expect(again.skipped).toBe(true);
  });

  it('is harmless with the pref cleared — deleting a gone field is a no-op', async () => {
    // The guard stops the work, not the damage. It cannot pass the
    // count check twice anyway, which is a second layer.
    await seedAuthorisedCorpus();
    await wipeRetiredCellFields();
    await setPref(PREF_RETIRED_CELL_FIELDS_WIPED, false);
    const again = await wipeRetiredCellFields();
    expect(again.skipped).toBe(false);
    expect(await db.songCells.count()).toBe(EXPECTED.cells);
    expect(await db.songCellRunThroughs.count()).toBe(0);
  });
});

describe('the key statuses, which were never earned', () => {
  it('resets every key to not_started', async () => {
    await seedAuthorisedCorpus();
    await wipeRetiredCellFields();
    const keys = await db.songKeys.toArray();
    expect(keys).toHaveLength(5);
    expect(keys.every(k => k.keyState === 'not_started')).toBe(true);
  });

  it('clears solidAt and wholeSongTestPassedAt', async () => {
    await seedAuthorisedCorpus();
    await wipeRetiredCellFields();
    const keys = await db.songKeys.toArray();
    expect(keys.filter(k => k.solidAt != null)).toHaveLength(0);
    expect(keys.filter(k => k.wholeSongTestPassedAt != null)).toHaveLength(0);
  });

  it('THE TIMESTAMP GOES WITH THE STATUS — solid cannot regenerate', async () => {
    // The whole reason the timestamp could not be left behind:
    // computeKeyStateFromCells returns 'solid' straight off a surviving
    // wholeSongTestPassedAt once the cells are comfortable, so the fake
    // status would rebuild itself on the next read.
    await seedAuthorisedCorpus();
    await wipeRetiredCellFields();
    const solidKey = await db.songKeys.get('k-solid');
    expect(solidKey?.wholeSongTestPassedAt).toBeNull();
    expect(solidKey?.keyState).toBe('not_started');
  });

  it('deletes no key rows', async () => {
    await seedAuthorisedCorpus();
    await wipeRetiredCellFields();
    expect(await db.songKeys.count()).toBe(5);
  });

  it('LEAVES songKeyRunThroughs alone — a single run is a real record', async () => {
    await seedAuthorisedCorpus();
    await wipeRetiredCellFields();
    expect(await db.songKeyRunThroughs.count()).toBe(13);
  });

  it('refuses when the key figures moved', async () => {
    await seedAuthorisedCorpus();
    await db.songKeys.update('k-l1', { keyState: 'not_started' });
    const r = await wipeRetiredCellFields();
    expect(r.refused).toBe(true);
    // Untouched: the solid key still claims solid.
    expect((await db.songKeys.get('k-solid'))?.keyState).toBe('solid');
    expect(await db.songCellRunThroughs.count()).toBe(EXPECTED.runThroughs);
  });
});

describe('the companions of a status that never existed', () => {
  it('clears solidDecayState and isRetestRecommended', async () => {
    await seedAuthorisedCorpus();
    await db.songKeys.update('k-solid', { isRetestRecommended: true } as never);
    await wipeRetiredCellFields();
    const keys = await db.songKeys.toArray();
    expect(keys.filter(k => k.solidDecayState != null)).toHaveLength(0);
    expect(keys.filter(k => k.isRetestRecommended)).toHaveLength(0);
  });

  it('leaves no key claiming a decay clock at all', async () => {
    // Was "…without a status", when a solid key could legitimately
    // carry one. Solid is retired, so NO key may: the field is
    // vestigial and the invariant is unconditional now.
    await seedAuthorisedCorpus();
    await wipeRetiredCellFields();
    const keys = await db.songKeys.toArray();
    for (const k of keys) {
      expect(k.solidDecayState).toBeNull();
      expect(k.isRetestRecommended).toBe(false);
    }
  });
});
