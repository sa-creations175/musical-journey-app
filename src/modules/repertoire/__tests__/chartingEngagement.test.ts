// @vitest-environment jsdom
/**
 * Charting a section is engagement with it — and schedules nothing.
 *
 * The two halves matter separately. If the signal is not written, the
 * matrix cannot tell "charted but never played" from "never touched".
 * If it schedules, writing a lead sheet creates practice debt, and a
 * chart that creates debt is a chart that gets put off.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, type Song, type SongCell, type SongKey, type SongMatrixSection, type SongSection } from '../../../lib/db';
import { bandVerdictForRow } from '../../../lib/spacing/row';
import { getPref } from '../../../lib/userPrefs';
import {
  PREF_CHARTING_ENGAGEMENT_BACKFILLED,
  backfillChartingEngagement,
  noteSectionCharted,
  songCellItemRef,
} from '../chartingEngagement';

const SONG_ID = 'song-1';
const SEC_ID = 'lead-1';
const MATRIX_ID = 'matrix-1';
const ORIG_KEY_ID = 'key-orig';
const OTHER_KEY_ID = 'key-other';
const CELL_ID = 'cell-orig';
const OTHER_CELL_ID = 'cell-other';

const chord = (fn: string) => ({ function: fn, quality: '' });

async function seed(opts: { chords: boolean; matrixFk?: boolean; originalKey?: boolean } = { chords: true }) {
  await db.songs.add({ id: SONG_ID, title: 'Test Song', artist: 'A' } as Song);
  await db.songSections.add({
    id: SEC_ID, songId: SONG_ID, name: 'Verse 1', order: 0, lyrics: '',
    phrases: [{ id: 'p1', beats: [{ id: 'b1', type: 'word', text: 'x' }],
      chordsByArrangement: { basic: opts.chords ? { b1: chord('1') } : {} } }],
  } as SongSection);
  await db.songMatrixSections.add({
    id: MATRIX_ID, songId: SONG_ID, name: 'Verse 1', displayOrder: 0,
    isArchived: false, splitFromSectionId: null,
    songSectionId: opts.matrixFk === false ? null : SEC_ID,
    createdAt: 0, updatedAt: 0,
  } as SongMatrixSection);
  await db.songKeys.bulkAdd([
    { id: ORIG_KEY_ID, songId: SONG_ID, keyName: 'B',
      isOriginalKey: opts.originalKey !== false, keyState: 'not_started' } as SongKey,
    { id: OTHER_KEY_ID, songId: SONG_ID, keyName: 'E',
      isOriginalKey: false, keyState: 'not_started' } as SongKey,
  ]);
  await db.songCells.bulkAdd([
    { id: CELL_ID, songId: SONG_ID, sectionId: MATRIX_ID, songKeyId: ORIG_KEY_ID,
      cellState: 'empty', comfortableAt: null, consecutiveCleanCount: 0,
      lastRunAt: null, lastRunWasClean: null, notes: null, lastEngagedAt: null,
      createdAt: 0, updatedAt: 0 } as SongCell,
    { id: OTHER_CELL_ID, songId: SONG_ID, sectionId: MATRIX_ID, songKeyId: OTHER_KEY_ID,
      cellState: 'empty', comfortableAt: null, consecutiveCleanCount: 0,
      lastRunAt: null, lastRunWasClean: null, notes: null, lastEngagedAt: null,
      createdAt: 0, updatedAt: 0 } as SongCell,
  ]);
}

beforeEach(async () => {
  await Promise.all([
    db.songs.clear(), db.songSections.clear(), db.songMatrixSections.clear(),
    db.songKeys.clear(), db.songCells.clear(), db.spacingState.clear(),
    db.userPrefs.clear(),
  ]);
});

describe('noteSectionCharted', () => {
  it('writes a signal for a charted section', async () => {
    await seed({ chords: true });
    const ref = await noteSectionCharted(SEC_ID);
    expect(ref).toBe(songCellItemRef(CELL_ID));

    const rows = await db.spacingState.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].itemRef).toBe(`songCell:${CELL_ID}`);
    expect(rows[0].moduleRef).toBe('repertoire');
  });

  it('SCHEDULES NOTHING — no interval, no due date', async () => {
    await seed({ chords: true });
    await noteSectionCharted(SEC_ID);
    const row = (await db.spacingState.toArray())[0];
    // The whole point. An interval here would make writing a lead
    // sheet create practice debt.
    expect(row.currentIntervalDays).toBe(0);
    expect(row.nextDueAt).toBeNull();
  });

  it('the cell reads Started, and never a band', async () => {
    await seed({ chords: true });
    await noteSectionCharted(SEC_ID);
    const row = (await db.spacingState.toArray())[0];
    expect(bandVerdictForRow(row)).toEqual({ kind: 'started', tries: 0 });
  });

  it('writes nothing for a section with no chords', async () => {
    await seed({ chords: false });
    expect(await noteSectionCharted(SEC_ID)).toBeNull();
    expect(await db.spacingState.count()).toBe(0);
  });

  it('ORIGINAL KEY ONLY — the other key gets nothing', async () => {
    // A chart in the number system covers twelve keys on paper and
    // proves nothing about eleven of them.
    await seed({ chords: true });
    await noteSectionCharted(SEC_ID);
    const refs = (await db.spacingState.toArray()).map(r => r.itemRef);
    expect(refs).toEqual([songCellItemRef(CELL_ID)]);
    expect(refs).not.toContain(songCellItemRef(OTHER_CELL_ID));
  });

  it('is idempotent — a second chord types no second row', async () => {
    await seed({ chords: true });
    await noteSectionCharted(SEC_ID);
    const first = (await db.spacingState.toArray())[0];
    await noteSectionCharted(SEC_ID);
    await noteSectionCharted(SEC_ID);
    const rows = await db.spacingState.toArray();
    expect(rows).toHaveLength(1);
    // Untouched, not rewritten: a repeat is not new evidence and must
    // not move lastEngagedAt.
    expect(rows[0].lastEngagedAt).toBe(first.lastEngagedAt);
    expect(rows[0].performanceHistory).toHaveLength(1);
  });

  it('returns null when the matrix row has no lead-sheet link', async () => {
    // Legitimate: the matrix reconciler runs off a write hook, so a
    // section can be charted before its matrix row exists.
    await seed({ chords: true, matrixFk: false });
    expect(await noteSectionCharted(SEC_ID)).toBeNull();
    expect(await db.spacingState.count()).toBe(0);
  });

  it('returns null when the song has no original key', async () => {
    await seed({ chords: true, originalKey: false });
    expect(await noteSectionCharted(SEC_ID)).toBeNull();
    expect(await db.spacingState.count()).toBe(0);
  });

  it('returns null for a section that does not exist', async () => {
    expect(await noteSectionCharted('nope')).toBeNull();
  });

  it('APPEND-ONLY — deleting every chord does not remove the signal', async () => {
    await seed({ chords: true });
    await noteSectionCharted(SEC_ID);
    await db.songSections.update(SEC_ID, {
      phrases: [{ id: 'p1', beats: [{ id: 'b1', type: 'word', text: 'x' }],
        chordsByArrangement: { basic: {} } }],
    });
    await noteSectionCharted(SEC_ID);
    const rows = await db.spacingState.toArray();
    // The charting happened. Status does not walk backwards because a
    // file was edited afterwards.
    expect(rows).toHaveLength(1);
    expect(bandVerdictForRow(rows[0])).toEqual({ kind: 'started', tries: 0 });
  });
});

describe('backfillChartingEngagement', () => {
  it('writes the charted sections and sets its pref', async () => {
    await seed({ chords: true });
    const r = await backfillChartingEngagement();
    expect(r).toEqual({ skipped: false, written: 1, unresolved: 0, alreadyPresent: 0 });
    expect(await db.spacingState.count()).toBe(1);
    expect(await getPref(PREF_CHARTING_ENGAGEMENT_BACKFILLED, false)).toBe(true);
  });

  it('skips on a second run', async () => {
    await seed({ chords: true });
    await backfillChartingEngagement();
    const again = await backfillChartingEngagement();
    expect(again.skipped).toBe(true);
    expect(await db.spacingState.count()).toBe(1);
  });

  it('is harmless even with the pref cleared — the guard stops work, not damage', async () => {
    await seed({ chords: true });
    await backfillChartingEngagement();
    await db.userPrefs.clear();
    const again = await backfillChartingEngagement();
    expect(again.skipped).toBe(false);
    expect(again.written).toBe(0);
    expect(again.alreadyPresent).toBe(1);
    expect(await db.spacingState.count()).toBe(1);
  });

  it('counts a charted section it cannot resolve, and writes nothing for it', async () => {
    await seed({ chords: true, matrixFk: false });
    const r = await backfillChartingEngagement();
    expect(r.written).toBe(0);
    expect(r.unresolved).toBe(1);
    expect(await db.spacingState.count()).toBe(0);
  });

  it('ignores uncharted sections entirely', async () => {
    await seed({ chords: false });
    const r = await backfillChartingEngagement();
    expect(r).toEqual({ skipped: false, written: 0, unresolved: 0, alreadyPresent: 0 });
    expect(await db.spacingState.count()).toBe(0);
  });
});
