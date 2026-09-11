// @vitest-environment jsdom
/**
 * The song surface's writer.
 *
 * Two levels come out of one rated run and they are different things:
 * a BAND at every section the run covered, and one CLOCK entry for the
 * song in that key. Conflating them would schedule sections
 * independently, which is not how anyone practises a song.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../../../lib/db';
import { bandVerdictForRow } from '../../../../lib/spacing/row';
import { songSurface } from '../makeSurfaces';
import { isAtTarget, setupHasSomethingToSet, type DrillRecord } from '../surfaces';

const CELL = 'cell-verse-Ab';
const KEY = 'songkey-s1-Ab';
const BY_SECTION = new Map([
  ['sec-verse', CELL],
  ['sec-chorus', 'cell-chorus-Ab'],
  ['sec-bridge', 'cell-bridge-Ab'],
]);

/**
 * The panel opened on a CELL — a section test — unless told otherwise.
 * The entry decides what a pass claims, so it is a parameter rather
 * than something the fixture guesses.
 */
function surface(songTempo: number | null = 90, entry: 'section' | 'whole-song' = 'section') {
  return songSurface({
    cellLabel: 'Verse 1 · A♭',
    skillLabel: '',
    cellId: CELL,
    songKeyId: KEY,
    songId: 's1',
    keyName: 'Ab',
    cellIdBySectionId: BY_SECTION,
    sections: [...BY_SECTION.keys()].map(id => ({ id, label: id })),
    onOpenLeadSheet: () => {},
    readSessionElapsedMs: () => 0,
    readSessionId: () => SESSION,
    expectedSectionCount: BY_SECTION.size,
    songTitle: 'No Weapon',
    spelledKeyName: 'A\u266d',
    renderBadgePreview: () => null, renderMetronome: () => null,
      entry, sectionLabel: 'Verse 1', onSessionPause: () => {}, onSessionStart: () => {},
    isRetest: false,
    songTempo,
  });
}

const SESSION = 'ss-test-1';

/** What the metronome was at. Distinct from the song's tempo so the
 *  two cannot be confused in an assertion. */
const RUN_BPM = 96;

/** The streak the session was on before the run under test. Mutable so
 *  a test can put the session mid-streak without rebuilding the
 *  surface. */
let STREAK_BEFORE = 0;

const run = (over: Partial<DrillRecord> = {}): DrillRecord => ({
  ranSeconds: 140,
  // A song run has no target length.
  targetSeconds: 0,
  scope: null,
  style: null,
  feel: 3,
  fromTest: false,
  // WHAT THE RUN WAS PLAYED AT. It travels on the record now — the
  // panel reads the metronome when the run stops, rather than the
  // surface asking the host for it again at write time.
  bpm: RUN_BPM,
  sessionId: SESSION,
  streakBefore: STREAK_BEFORE,
  ...over,
});

const refsUnder = async (prefix: string) =>
  (await db.spacingState.toArray())
    .filter(r => String(r.itemRef).startsWith(prefix))
    .map(r => r.itemRef)
    .sort();

beforeEach(async () => {
  await db.spacingState.clear();
});

describe('the shape of the surface', () => {
  it('counts up, has no style, and takes the song s own tempo as target', () => {
    const s = surface(90);
    expect(s.id).toBe('song');
    expect(s.countsUp).toBe(true);
    expect(s.hasStyle).toBe(false);
    expect(s.targetRate).toBe(90);
    // The rate IS the tempo — no arithmetic.
    expect(s.rateFrom(84, 1)).toBe(84);
  });

  it('a song with no tempo set has no target, so every run counts', () => {
    expect(surface(null).targetRate).toBe(0);
  });
});

describe('one rated run writes two levels', () => {
  it('a band for the cell, and a clock for the song in that key', async () => {
    await surface().write(run());
    expect(await refsUnder('songCell:')).toEqual([`songCell:${CELL}`]);
    expect(await refsUnder('songKey:')).toEqual([`songKey:${KEY}`]);
  });

  it('the section it did NOT cover gets nothing', async () => {
    await surface().write(run());
    const refs = await refsUnder('songCell:');
    expect(refs).not.toContain('songCell:cell-chorus-Ab');
  });
});

describe('scope', () => {
  it('the whole song fans one rating across every section', async () => {
    await surface().write(run({ scope: ['sec-verse', 'sec-chorus', 'sec-bridge'] }));
    expect(await refsUnder('songCell:')).toEqual([
      'songCell:cell-bridge-Ab',
      'songCell:cell-chorus-Ab',
      `songCell:${CELL}`,
    ]);
    // Still ONE clock entry. The song was played once.
    expect(await refsUnder('songKey:')).toHaveLength(1);
  });

  it('a scoped run writes only the sections named', async () => {
    await surface().write(run({ scope: ['sec-chorus'] }));
    expect(await refsUnder('songCell:')).toEqual(['songCell:cell-chorus-Ab']);
  });

  it('NO SCOPE MEANS THE CELL YOU OPENED, not everything', async () => {
    // A rep that cannot say what it covered must claim the least.
    await surface().write(run({ scope: null }));
    expect(await refsUnder('songCell:')).toEqual([`songCell:${CELL}`]);
  });

  it('a section with no cell in this key is skipped, not invented', async () => {
    await surface().write(run({ scope: ['sec-verse', 'sec-nonexistent'] }));
    expect(await refsUnder('songCell:')).toEqual([`songCell:${CELL}`]);
  });
});

describe('the band rule rides through', () => {
  it('three PRACTICE reps cap at Developing however good they felt', async () => {
    const s = surface();
    for (let i = 0; i < 3; i++) await s.write(run({ feel: 4, fromTest: false }));
    const row = (await db.spacingState.toArray())
      .find(r => r.itemRef === `songCell:${CELL}`)!;
    expect(bandVerdictForRow(row)).toEqual({ kind: 'band', band: 'developing' });
  });

  it('three TEST reps at In flow reach Mastered', async () => {
    const s = surface();
    for (let i = 0; i < 3; i++) await s.write(run({ feel: 4, fromTest: true }));
    const row = (await db.spacingState.toArray())
      .find(r => r.itemRef === `songCell:${CELL}`)!;
    expect(bandVerdictForRow(row)).toEqual({ kind: 'band', band: 'mastered' });
  });

  it('the lowest of the three picks it', async () => {
    const s = surface();
    for (const feel of [4, 2, 4] as const) {
      await s.write(run({ feel, fromTest: true }));
    }
    const row = (await db.spacingState.toArray())
      .find(r => r.itemRef === `songCell:${CELL}`)!;
    expect(bandVerdictForRow(row)).toEqual({ kind: 'band', band: 'developing' });
  });

  it('one rated rep is Started, not a band', async () => {
    await surface().write(run({ feel: 4, fromTest: true }));
    const row = (await db.spacingState.toArray())
      .find(r => r.itemRef === `songCell:${CELL}`)!;
    expect(bandVerdictForRow(row)).toEqual({ kind: 'started', tries: 1 });
  });

  it('marks the reps with the mode that produced them', async () => {
    const s = surface();
    await s.write(run({ feel: 3, fromTest: true }));
    const row = (await db.spacingState.toArray())
      .find(r => r.itemRef === `songCell:${CELL}`)!;
    const entry = (row.performanceHistory as Array<Record<string, unknown>>)[0];
    expect(entry.fromTest).toBe(true);
  });
});

describe('an unrated run', () => {
  it('writes no band and no clock — there is no verdict to record', async () => {
    await surface().write(run({ feel: null }));
    expect(await db.spacingState.count()).toBe(0);
  });

  it('does not count toward the three', async () => {
    const s = surface();
    await s.write(run({ feel: 3, fromTest: true }));
    await s.write(run({ feel: null }));
    await s.write(run({ feel: 3, fromTest: true }));
    const row = (await db.spacingState.toArray())
      .find(r => r.itemRef === `songCell:${CELL}`)!;
    // Two rated reps, so still Started rather than a band.
    expect(bandVerdictForRow(row)).toEqual({ kind: 'started', tries: 2 });
  });
});

describe('the clock is per song-and-key, never per section', () => {
  it('a whole-song run writes three bands and ONE clock entry', async () => {
    await surface().write(run({ scope: ['sec-verse', 'sec-chorus', 'sec-bridge'] }));
    expect(await refsUnder('songCell:')).toHaveLength(3);
    expect(await refsUnder('songKey:')).toHaveLength(1);
  });

  it('no section ever gets a songKey ref of its own', async () => {
    await surface().write(run({ scope: ['sec-verse', 'sec-chorus'] }));
    const keyRefs = await refsUnder('songKey:');
    expect(keyRefs).toEqual([`songKey:${KEY}`]);
  });
});

/**
 * The three things `CellPanel` did that this surface did not.
 *
 * =====================================================================
 * THE SWAP CANNOT HAPPEN WITHOUT THESE, AND ONLY ONE OF THEM WOULD
 * ANNOUNCE ITSELF.
 *
 * A missing run row is visible — the run history is empty. A stale
 * `lastRunAt` is visible — the cell says it has not been touched.
 *
 * `keyState` is neither. It is a STORED value derived from the cells'
 * bands, and nothing else in the app recomputes it. Swap the panel
 * without carrying the rollup and every key row freezes at whatever it
 * said the day the swap landed — permanently, silently, and looking
 * exactly like a correct value. So it is pinned hardest.
 * =====================================================================
 */
describe('a run writes the cell, the log and the key', () => {
  const SECTIONS = [...BY_SECTION.entries()];

  async function seedCells(keyState: 'not_started' | 'learning' | 'comfortable') {
    await db.songKeys.put({
      id: KEY, songId: 's1', keyName: 'Ab', isOriginalKey: true,
      keyState, solidAt: null, solidDecayState: 'fine',
      lastDecayCheckAt: null, livedWithSessionCount: 0,
      livedWithFirstSessionAt: null, livedWithWindowStartAt: null,
      livedWithSessionsInWindow: 0, wholeSongTestPassedAt: null,
      isRetestRecommended: true, lastEngagedAt: null,
      createdAt: 1, updatedAt: 1,
    } as never);
    await db.songCells.bulkPut(SECTIONS.map(([sectionId, cellId]) => ({
      id: cellId, songId: 's1', songKeyId: KEY, sectionId,
      cellState: 'empty', consecutiveCleanCount: 0,
      lastRunAt: null, notes: null, markComfortable: false,
      comfortableAt: null, lastEngagedAt: null,
      createdAt: 1, updatedAt: 1,
    })) as never);
  }

  beforeEach(async () => {
    // The outer beforeEach clears only `spacingState`; the run log and
    // the cells persist across tests in this file, so counts here would
    // otherwise include every earlier test's rows.
    await db.songCellRunThroughs.clear();
    await db.songCells.clear();
    await db.songKeys.clear();
    await seedCells('not_started');
  });

  it('logs the run with the tempo it was PLAYED at', async () => {
    // 96, the metronome's number — not 90, the song's target. The two
    // are different on purpose here: a run row that recorded the target
    // is the exact defect the tempo work exists to remove.
    await surface(90).write(run({ feel: 3 }));
    const rows = await db.songCellRunThroughs.where('cellId').equals(CELL).toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].tempoBpm).toBe(RUN_BPM);
    expect(rows[0].wasClean).toBe(true);
  });

  it('a run with the metronome silent logs no tempo, not a made-up one', async () => {
    // THE SILENCE IS ON THE RUN, not on the surface. The panel reads
    // the metronome when the run stops and hands over what it found —
    // null when nothing was sounding — so a silent run is a record
    // with no tempo rather than a surface configured differently.
    await surface(90).write(run({ feel: 3, bpm: null }));
    const rows = await db.songCellRunThroughs.where('cellId').equals(CELL).toArray();
    expect(rows[0].tempoBpm).toBeNull();
  });

  it('moves lastRunAt — and it is the SURFACE that moves it now', async () => {
    // Never two writers of songCells. When the shell owns a surface,
    // `CellPanel` stops writing for it, or two `lastRunAt` values race
    // on one row and the winner is whichever transaction commits last.
    const before = await db.songCells.get(CELL);
    expect(before?.lastRunAt).toBeNull();
    await surface(90).write(run({ feel: 3 }));
    const after = await db.songCells.get(CELL);
    expect(after?.lastRunAt).not.toBeNull();
    expect(after?.lastEngagedAt).not.toBeNull();
  });

  it('RECOMPUTES keyState FROM THE CELLS — the one that would freeze', async () => {
    // One rated run on one section: the key has been touched, so it is
    // learning, not not_started. Nothing else in the app would have
    // moved it.
    expect((await db.songKeys.get(KEY))?.keyState).toBe('not_started');
    await surface(90).write(run({ feel: 3 }));
    expect((await db.songKeys.get(KEY))?.keyState).toBe('learning');
  });

  it('the key rollup sees EVERY cell, not just the covered one', async () => {
    // A section run covers one cell and still moves the key it belongs
    // to, so the rollup has to load the siblings rather than judge the
    // key from the run's own scope. Two sections untouched means the
    // key is not comfortable, however well this one went.
    await surface(90).write(run({ feel: 4 }));
    expect((await db.songKeys.get(KEY))?.keyState).toBe('learning');
  });

  it('clears the retired decay fields on the way past, like the cell path', async () => {
    await surface(90).write(run({ feel: 3 }));
    const key = await db.songKeys.get(KEY);
    expect(key?.solidDecayState).toBeNull();
    expect(key?.isRetestRecommended).toBe(false);
    expect(key?.lastEngagedAt).not.toBeNull();
  });

  it('a whole-song run logs a row against every section it covered', async () => {
    await surface(90).write(run({ feel: 3, scope: SECTIONS.map(([id]) => id) }));
    for (const [, cellId] of SECTIONS) {
      const rows = await db.songCellRunThroughs.where('cellId').equals(cellId).toArray();
      expect(rows).toHaveLength(1);
    }
  });

  it('an unrated run writes nothing at all', async () => {
    // No verdict, no claim — the same rule the band reps follow. A run
    // row without a rating would be a run the matrix could not read.
    await surface(90).write(run({ feel: null }));
    expect(await db.songCellRunThroughs.count()).toBe(0);
    expect((await db.songCells.get(CELL))?.lastRunAt).toBeNull();
  });
});

/**
 * The whole song, at the key level.
 *
 * =====================================================================
 * `recordKeyProving` HAD NO PRODUCTION CALLER.
 *
 * `logPractice.ts` and `stage.ts` both carry comments describing the
 * whole-song test moving that key's retest schedule. Nothing called it,
 * so the clock has not been moving — and the comments are exactly the
 * kind of thing a reader believes without checking.
 *
 * These pin the caller, and pin that the pass does NOT cast a fourth
 * rating on a key its three runs already rated.
 * =====================================================================
 */
describe('a run that covered the whole song', () => {
  const ALL = [...BY_SECTION.keys()];

  beforeEach(async () => {
    await db.songCellRunThroughs.clear();
    await db.songKeyRunThroughs.clear();
    await db.songCells.clear();
    await db.songKeys.clear();
    await db.spacingState.clear();
    STREAK_BEFORE = 0;
    await db.songKeys.put({
      id: KEY, songId: 's1', keyName: 'Ab', isOriginalKey: true,
      keyState: 'learning', solidAt: null, solidDecayState: null,
      lastDecayCheckAt: null, livedWithSessionCount: 0,
      livedWithFirstSessionAt: null, livedWithWindowStartAt: null,
      livedWithSessionsInWindow: 0, wholeSongTestPassedAt: null,
      isRetestRecommended: true, lastEngagedAt: null,
      createdAt: 1, updatedAt: 1,
    } as never);
    await db.songCells.bulkPut([...BY_SECTION.entries()].map(([sectionId, cellId]) => ({
      id: cellId, songId: 's1', songKeyId: KEY, sectionId,
      cellState: 'empty', consecutiveCleanCount: 0,
      lastRunAt: null, notes: null, markComfortable: false,
      comfortableAt: null, lastEngagedAt: null,
      createdAt: 1, updatedAt: 1,
    })) as never);
  });

  it('writes a key-level row, which the section rows cannot say between them', async () => {
    // `stage.ts`'s Internalized criterion asks whether the key has been
    // run clean at tempo at least once, and looks in songKeyRunThroughs.
    await surface(90).write(run({ feel: 3, scope: ALL }));
    const rows = await db.songKeyRunThroughs.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].wasClean).toBe(true);
    expect(rows[0].tempoBpm).toBe(RUN_BPM);
  });

  it('A SECTION RUN DOES NOT — coverage is what decides it', async () => {
    // Derived from what the run covered, not from a mode flag. A second
    // field saying "this was the whole song" would be a way for the two
    // to disagree.
    await surface(90).write(run({ feel: 3 }));
    expect(await db.songKeyRunThroughs.count()).toBe(0);
  });

  it('records the streak it was PART OF, not a fresh 1 each time', async () => {
    // One run at a time means the session owns the count. Without it
    // every stored row would read 1 and the log would show three
    // separate first-runs where there was a streak.
    STREAK_BEFORE = 2;
    await surface(90).write(run({ feel: 3, scope: ALL }));
    expect((await db.songKeyRunThroughs.toArray())[0].consecutiveCleanCount).toBe(3);
  });

  it('a below-Clean whole-song run resets the stored streak to zero', async () => {
    STREAK_BEFORE = 2;
    await surface(90).write(run({ feel: 1, scope: ALL }));
    expect((await db.songKeyRunThroughs.toArray())[0].consecutiveCleanCount).toBe(0);
  });
});

describe('passing the whole-song test', () => {
  beforeEach(async () => {
    await db.songKeys.clear();
    await db.spacingState.clear();
    await db.songKeys.put({
      id: KEY, songId: 's1', keyName: 'Ab', isOriginalKey: true,
      keyState: 'comfortable', solidAt: null, solidDecayState: null,
      lastDecayCheckAt: null, livedWithSessionCount: 0,
      livedWithFirstSessionAt: null, livedWithWindowStartAt: null,
      livedWithSessionsInWindow: 0, wholeSongTestPassedAt: null,
      isRetestRecommended: true, lastEngagedAt: null,
      createdAt: 1, updatedAt: 1,
    } as never);
  });

  it('ONLY A WHOLE-SONG PASS LEAVES A DURABLE FACT', () => {
    // A section test is entirely described by the band its three runs
    // set — there is no `sectionTestPassedAt` and there should not be,
    // because a second record could disagree with the band. A
    // whole-song pass writes `wholeSongTestPassedAt`, which
    // `stageCriteria` reads, and moves the key's retest clock.
    expect(surface(90, 'section').recordTestPass).toBeNull();
    expect(surface(90, 'whole-song').recordTestPass).not.toBeNull();
  });

  it('and the two entries claim different things', () => {
    // The section variant of the result screen gets its first live
    // writer here: nothing wrote a `songCell:` band outside this
    // surface, and this surface had no caller.
    expect(surface(90, 'section').describeTestPass('fluent', 3)).toEqual({
      kind: 'section', sectionLabel: 'Verse 1', band: 'fluent', lowestFeel: 3,
    });
    expect(surface(90, 'whole-song').describeTestPass('fluent', 3)).toEqual({
      kind: 'whole-song', songTitle: 'No Weapon', status: 'comfortable',
    });
  });

  it('writes wholeSongTestPassedAt, which is what stageCriteria reads', async () => {
    // The test stopped writing a status in 831e38b, so this timestamp
    // IS the Learning → Comfortable record.
    await surface(90, 'whole-song').recordTestPass!();
    const key = await db.songKeys.get(KEY);
    expect(key?.wholeSongTestPassedAt).not.toBeNull();
    expect(key?.isRetestRecommended).toBe(false);
  });

  it('MOVES THE RETEST CLOCK — the caller recordKeyProving never had', async () => {
    const before = await db.spacingState
      .where('itemRef').equals(`songKey:${KEY}`).first();
    expect(before).toBeUndefined();
    await surface(90, 'whole-song').recordTestPass!();
    const after = await db.spacingState
      .where('itemRef').equals(`songKey:${KEY}`).first();
    expect(after).toBeDefined();
    expect(after?.nextDueAt).not.toBeNull();
  });

  it('DOES NOT cast a fourth rating on the key', async () => {
    // The three runs each wrote their own rating here. A pass adding a
    // fourth would put a Clean rep on the row that nobody played — and
    // under the streak rule that rep could complete a streak by itself.
    await surface(90, 'whole-song').recordTestPass!();
    const row = await db.spacingState
      .where('itemRef').equals(`songKey:${KEY}`).first();
    const history = (row?.performanceHistory ?? []) as Array<Record<string, unknown>>;
    expect(history).toHaveLength(1);
    expect(history[0].kind).toBe('rating');
    expect(history[0].scores).toBe(false);
  });
});

/**
 * The song's setup screen would be a title and a Start button.
 *
 * Pinned on the REAL surface rather than a fixture, because the
 * predicate is only useful if the surface it was built for actually
 * answers no — and each of the three answers comes from a field set
 * for its own reasons, any of which could drift.
 */
describe('a song has nothing to set up', () => {
  it('no style, no target length, and one rate option', () => {
    const s = surface(90);
    expect(s.hasStyle).toBe(false);
    expect(s.countsUp).toBe(true);
    expect(s.rateOptions).toHaveLength(1);
    expect(setupHasSomethingToSet(s)).toBe(false);
  });
});

describe('the tempo allowance, where a run is judged', () => {
  /**
   * THE WRITTEN RULE: a test run counts from ten below the song's tempo.
   * `isAtTarget` is what the panel reads to tag a run BELOW and leave it
   * out of the streak, and it read the target alone — so on a 120 song
   * a whole-song run at 115 was BELOW. 10 Sep 2026.
   */
  for (const entry of ['whole-song', 'section'] as const) {
    it(`${entry}: target − 10 counts, target − 11 does not, target counts`, () => {
      const s = surface(120, entry);
      expect(isAtTarget(s, 110, 1)).toBe(true);
      expect(isAtTarget(s, 109, 1)).toBe(false);
      expect(isAtTarget(s, 120, 1)).toBe(true);
    });
  }
});
