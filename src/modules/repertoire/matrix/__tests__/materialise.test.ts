// @vitest-environment jsdom
/**
 * Materialising the full twelve-key grid.
 *
 * Three rules carry real consequences and each is pinned separately:
 *
 *   1. Dedupe by keyName, not row id — matching on the id mints a
 *      duplicate row for a key the song already has.
 *   2. Touch no existing state. This runs over rows holding legacy
 *      stage-ladder values nothing can reconstruct, and it destroys the
 *      signal that protects them: once every row has cells,
 *      `engagedCellCount === 0` is the only way left to recognise one,
 *      and it survives only because the cells created here are empty.
 *   3. Additive only — nothing is deleted, including junk rows.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  db,
  type Song,
  type SongCell,
  type SongKey,
  type SongKeyState,
  type SongMatrixSection,
} from '../../../../lib/db';
import { CIRCLE_OF_FOURTHS_KEYS } from '../keys';
import { songCellRowId, songKeyRowId } from '../ids';
import { materialiseMatrixForSong, planMaterialisation } from '../materialise';

const NOW = 1_700_000_000_000;
const SONG = 's1';
const SECTION_NAMES = ['verse', 'chorus', 'bridge'];

function section(id: string, isArchived = false): SongMatrixSection {
  return {
    id, songId: SONG, name: id, displayOrder: 0, isArchived,
    splitFromSectionId: null, createdAt: NOW, updatedAt: NOW,
  } as SongMatrixSection;
}

function key(keyName: string, o: Partial<SongKey> = {}): SongKey {
  return {
    id: songKeyRowId(SONG, keyName), songId: SONG, keyName,
    isOriginalKey: false, keyState: 'not_started',
    solidAt: null, solidDecayState: null, lastDecayCheckAt: null,
    livedWithSessionCount: 0, livedWithFirstSessionAt: null,
    livedWithWindowStartAt: null, livedWithSessionsInWindow: 0,
    wholeSongTestPassedAt: null, isRetestRecommended: false,
    lastEngagedAt: null, createdAt: NOW, updatedAt: NOW, ...o,
  } as SongKey;
}

function cell(songKeyId: string, sectionId: string, o: Partial<SongCell> = {}): SongCell {
  return {
    id: songCellRowId(songKeyId, sectionId), songId: SONG, sectionId, songKeyId,
    cellState: 'empty', comfortableAt: null, consecutiveCleanCount: 0,
    lastRunAt: null, lastRunWasClean: null, notes: null, lastEngagedAt: null,
    createdAt: NOW, updatedAt: NOW, ...o,
  } as SongCell;
}

const SECTIONS = SECTION_NAMES.map(n => section(n));

describe('planMaterialisation', () => {
  it('fills an empty song to twelve keys × every section', () => {
    const plan = planMaterialisation(SONG, SECTIONS, [], [], NOW);
    expect(plan.newKeys).toHaveLength(12);
    expect(new Set(plan.newKeys.map(k => k.keyName)))
      .toEqual(new Set(CIRCLE_OF_FOURTHS_KEYS));
    expect(plan.newCells).toHaveLength(12 * 3);
  });

  it('every materialised cell is empty and unplayed', () => {
    // Rule 2. This is what keeps engagedCellCount === 0 meaningful
    // after the sweep, which is the only thing protecting the legacy
    // stage-ladder values from being recomputed away.
    const plan = planMaterialisation(SONG, SECTIONS, [], [], NOW);
    for (const c of plan.newCells) {
      expect(c.cellState).toBe('empty');
      expect(c.lastRunAt).toBeNull();
      expect(c.lastEngagedAt).toBeNull();
      expect(c.consecutiveCleanCount).toBe(0);
    }
  });

  it('never claims the anchor', () => {
    // A sweep inventing a second original produces exactly the
    // multiple-originals state the diagnostic exists to catch.
    const plan = planMaterialisation(SONG, SECTIONS, [], [], NOW);
    expect(plan.newKeys.every(k => k.isOriginalKey === false)).toBe(true);
  });

  it('DEDUPES BY keyName, not by row id', () => {
    // Rule 1. A row whose id embeds an older spelling still occupies
    // its key; matching on the id would mint a second Ab.
    const odd = key('Ab', { id: 'legacy-row-id' });
    const plan = planMaterialisation(SONG, SECTIONS, [odd], [], NOW);
    expect(plan.newKeys.some(k => k.keyName === 'Ab')).toBe(false);
    expect(plan.newKeys).toHaveLength(11);
  });

  it('hangs cells off the EXISTING row, not a regenerated id', () => {
    const odd = key('Ab', { id: 'legacy-row-id' });
    const plan = planMaterialisation(SONG, SECTIONS, [odd], [], NOW);
    const abCells = plan.newCells.filter(c => c.songKeyId === 'legacy-row-id');
    expect(abCells).toHaveLength(3);
  });

  it('leaves existing rows and cells completely untouched', () => {
    // Rule 2 again, at the row level: no state, no timestamps.
    const existingKey = key('Ab', { keyState: 'learning' as SongKeyState, updatedAt: NOW - 999 });
    const existingCell = cell(existingKey.id, 'verse', { cellState: 'comfortable', lastRunAt: NOW - 500 });
    const plan = planMaterialisation(SONG, SECTIONS, [existingKey], [existingCell], NOW);

    expect(plan.newKeys.some(k => k.keyName === 'Ab')).toBe(false);
    // The occupied intersection is not re-created.
    expect(plan.newCells.some(c => c.id === existingCell.id)).toBe(false);
    // ...but its siblings are.
    expect(plan.newCells.filter(c => c.songKeyId === existingKey.id)).toHaveLength(2);
  });

  it('skips archived sections', () => {
    // An archived section is hidden from the grid; cells for it would
    // be unreachable rows.
    const plan = planMaterialisation(SONG, [section('verse'), section('old', true)], [], [], NOW);
    expect(plan.newCells.every(c => c.sectionId === 'verse')).toBe(true);
    expect(plan.newCells).toHaveLength(12);
  });

  it('leaves a non-canonical row barren rather than giving it cells', () => {
    // Rule 3 plus a trap: giving a junk row cells would make it
    // permanently undeletable, because the repair refuses to orphan
    // dependents.
    const junk = key('B maj');
    const plan = planMaterialisation(SONG, SECTIONS, [junk], [], NOW);
    expect(plan.newCells.some(c => c.songKeyId === junk.id)).toBe(false);
    // ...and it is not removed either.
    expect(plan.newKeys.some(k => k.keyName === 'B maj')).toBe(false);
    expect(plan.newKeys).toHaveLength(12);
  });

  it('is a no-op on an already complete song', () => {
    const keys = CIRCLE_OF_FOURTHS_KEYS.map(k => key(k));
    const cells = keys.flatMap(k => SECTION_NAMES.map(s => cell(k.id, s)));
    const plan = planMaterialisation(SONG, SECTIONS, keys, cells, NOW);
    expect(plan.newKeys).toEqual([]);
    expect(plan.newCells).toEqual([]);
  });
});

describe('materialiseMatrixForSong', () => {
  beforeEach(async () => {
    await Promise.all([
      db.songs.clear(), db.songKeys.clear(),
      db.songCells.clear(), db.songMatrixSections.clear(),
    ]);
    await db.songs.put({ id: SONG, title: 'T', artist: 'A', key: 'Ab' } as Song);
    await db.songMatrixSections.bulkPut(SECTIONS);
  });

  it('produces a full grid with the anchor preserved', async () => {
    const added = await materialiseMatrixForSong(SONG, NOW);
    expect(added.cells).toBe(36);

    const keys = await db.songKeys.where('songId').equals(SONG).toArray();
    expect(keys).toHaveLength(12);
    const anchors = keys.filter(k => k.isOriginalKey);
    expect(anchors).toHaveLength(1);
    expect(anchors[0].keyName).toBe('Ab');
  });

  it('is idempotent — a second run writes nothing', async () => {
    await materialiseMatrixForSong(SONG, NOW);
    const second = await materialiseMatrixForSong(SONG, NOW + 1000);
    expect(second).toEqual({ keys: 0, cells: 0 });
    expect(await db.songCells.count()).toBe(36);
  });

  it('does not disturb practice already recorded', async () => {
    // The case that matters on the live data: a key carrying real
    // state must come through the sweep unchanged.
    await db.songKeys.put(key('C', { keyState: 'learning' as SongKeyState }));
    await db.songCells.put(cell(songKeyRowId(SONG, 'C'), 'verse', {
      cellState: 'comfortable', lastRunAt: NOW - 5,
    }));

    await materialiseMatrixForSong(SONG, NOW);

    const c = await db.songKeys.get(songKeyRowId(SONG, 'C'));
    expect(c?.keyState).toBe('learning');
    const played = await db.songCells.get(songCellRowId(songKeyRowId(SONG, 'C'), 'verse'));
    expect(played?.cellState).toBe('comfortable');
    expect(played?.lastRunAt).toBe(NOW - 5);
  });

  it('writes nothing for a song with no sections', async () => {
    await db.songMatrixSections.clear();
    const added = await materialiseMatrixForSong(SONG, NOW);
    expect(added).toEqual({ keys: 0, cells: 0 });
    expect(await db.songCells.count()).toBe(0);
  });

  it('leaves every materialised cell unengaged, so legacy state stays protected', async () => {
    // The end-to-end version of rule 2: after the sweep, a row that
    // was never played must still look unplayed, or the recompute
    // protection silently stops applying.
    await db.songKeys.put(key('A', { keyState: 'learning' as SongKeyState }));
    await materialiseMatrixForSong(SONG, NOW);

    const cells = await db.songCells
      .where('songKeyId').equals(songKeyRowId(SONG, 'A')).toArray();
    expect(cells).toHaveLength(3);
    expect(cells.every(c => c.cellState === 'empty' && c.lastRunAt === null)).toBe(true);
  });
});
