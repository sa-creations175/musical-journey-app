// @vitest-environment jsdom
/**
 * Tests for the lead-sheet → matrix sections one-way reconciler.
 * Both layers covered:
 *   · reconcileMatrixSections — pure transform, no Dexie. Easier to
 *     drive end-to-end test cases through without touching IndexedDB.
 *   · syncMatrixSectionsForSong — integration; verifies the
 *     reconciler's writes land in Dexie correctly and that cells
 *     keyed off the preserved matrix id stay intact across renames.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  db,
  type SongCell,
  type SongKey,
  type SongMatrixSection,
  type SongSection,
} from '../../../../lib/db';
import {
  reconcileMatrixSections,
  syncMatrixSectionsForSong,
} from '../matrixSectionsSync';

const SONG = 'song-1';
const NOW = 1_700_000_000_000;
const LATER = NOW + 60_000;

function mkLead(partial: Partial<SongSection> & { id: string; name: string; order: number }): SongSection {
  return {
    songId: SONG,
    lyrics: '',
    ...partial,
  };
}

function mkMatrix(partial: Partial<SongMatrixSection> & { id: string; name: string }): SongMatrixSection {
  return {
    songId: SONG,
    displayOrder: 0,
    isArchived: false,
    splitFromSectionId: null,
    songSectionId: null,
    createdAt: NOW - 1000,
    updatedAt: NOW - 1000,
    ...partial,
  };
}

function mkSongKey(partial: Partial<SongKey> & { id: string }): SongKey {
  return {
    songId: SONG,
    keyName: 'C',
    isOriginalKey: true,
    keyState: 'not_started',
    solidAt: null,
    solidDecayState: null,
    lastDecayCheckAt: null,
    livedWithSessionCount: 0,
    livedWithFirstSessionAt: null,
    livedWithWindowStartAt: null,
    livedWithSessionsInWindow: 0,
    wholeSongTestPassedAt: null,
    isRetestRecommended: false,
    lastEngagedAt: null,
    createdAt: NOW - 1000,
    updatedAt: NOW - 1000,
    ...partial,
  };
}

function mkCell(partial: Partial<SongCell> & { id: string; sectionId: string; songKeyId: string }): SongCell {
  return {
    songId: SONG,
    cellState: 'empty',
    comfortableAt: null,
    consecutiveCleanCount: 0,
    lastRunAt: null,
    lastRunWasClean: null,
    notes: null,
    lastEngagedAt: null,
    createdAt: NOW - 1000,
    updatedAt: NOW - 1000,
    ...partial,
  };
}

describe('reconcileMatrixSections — pure', () => {
  it('creates a matrix row when a new lead-sheet section has no counterpart', () => {
    const writes = reconcileMatrixSections(
      SONG,
      [mkLead({ id: 'sec-a', name: 'Verse 1', order: 0 })],
      [],
      LATER,
    );
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      id: 'matrixsection-sec-a',
      songSectionId: 'sec-a',
      name: 'Verse 1',
      displayOrder: 0,
      isArchived: false,
    });
  });

  it('rename preserves the matrix id when matched via songSectionId', () => {
    // Pre-existing matrix row that already references the lead-sheet
    // section id. Renaming the lead-sheet section just updates the
    // matrix row's name field — same id, same cells.
    const writes = reconcileMatrixSections(
      SONG,
      [mkLead({ id: 'sec-a', name: 'Verse 1 (renamed)', order: 0 })],
      [mkMatrix({ id: 'm-existing', name: 'Verse 1', songSectionId: 'sec-a' })],
      LATER,
    );
    expect(writes).toHaveLength(1);
    expect(writes[0].id).toBe('m-existing');
    expect(writes[0].name).toBe('Verse 1 (renamed)');
    expect(writes[0].songSectionId).toBe('sec-a');
  });

  it('orphans get archived rather than deleted', () => {
    const writes = reconcileMatrixSections(
      SONG,
      [mkLead({ id: 'sec-a', name: 'Verse', order: 0 })],
      [
        mkMatrix({ id: 'm-a', name: 'Verse', songSectionId: 'sec-a' }),
        // m-b has no corresponding lead-sheet section anymore.
        mkMatrix({ id: 'm-orphan', name: 'Old Bridge', songSectionId: 'sec-removed' }),
      ],
      LATER,
    );
    const orphanWrite = writes.find(w => w.id === 'm-orphan');
    expect(orphanWrite).toBeDefined();
    expect(orphanWrite?.isArchived).toBe(true);
    // m-a stays unchanged (no writes for it — it was already aligned).
    expect(writes.find(w => w.id === 'm-a')).toBeUndefined();
  });

  it('reorder updates displayOrder on every affected row', () => {
    const writes = reconcileMatrixSections(
      SONG,
      [
        mkLead({ id: 'sec-b', name: 'Chorus', order: 0 }),
        mkLead({ id: 'sec-a', name: 'Verse', order: 1 }),
      ],
      [
        mkMatrix({ id: 'm-a', name: 'Verse', displayOrder: 0, songSectionId: 'sec-a' }),
        mkMatrix({ id: 'm-b', name: 'Chorus', displayOrder: 1, songSectionId: 'sec-b' }),
      ],
      LATER,
    );
    const a = writes.find(w => w.id === 'm-a');
    const b = writes.find(w => w.id === 'm-b');
    expect(b?.displayOrder).toBe(0);
    expect(a?.displayOrder).toBe(1);
  });

  it('legacy matrix row without songSectionId matches by name on first sync', () => {
    // Existing matrix row from before the songSectionId field landed.
    // The reconciler "adopts" it via name match + stamps the link.
    const writes = reconcileMatrixSections(
      SONG,
      [mkLead({ id: 'sec-a', name: 'Verse', order: 0 })],
      [mkMatrix({ id: 'm-legacy', name: 'Verse', songSectionId: null })],
      LATER,
    );
    expect(writes).toHaveLength(1);
    expect(writes[0].id).toBe('m-legacy');
    expect(writes[0].songSectionId).toBe('sec-a');
  });

  it('archived row un-archives when the same lead-sheet name reappears', () => {
    const writes = reconcileMatrixSections(
      SONG,
      [mkLead({ id: 'sec-revived', name: 'Bridge', order: 0 })],
      [mkMatrix({
        id: 'm-archived',
        name: 'Bridge',
        isArchived: true,
        songSectionId: null,
      })],
      LATER,
    );
    expect(writes).toHaveLength(1);
    expect(writes[0].id).toBe('m-archived');
    expect(writes[0].isArchived).toBe(false);
    expect(writes[0].songSectionId).toBe('sec-revived');
  });

  it('is a no-op when lead-sheet + matrix are already aligned', () => {
    const writes = reconcileMatrixSections(
      SONG,
      [
        mkLead({ id: 'sec-a', name: 'Verse', order: 0 }),
        mkLead({ id: 'sec-b', name: 'Chorus', order: 1 }),
      ],
      [
        mkMatrix({ id: 'm-a', name: 'Verse', displayOrder: 0, songSectionId: 'sec-a' }),
        mkMatrix({ id: 'm-b', name: 'Chorus', displayOrder: 1, songSectionId: 'sec-b' }),
      ],
      LATER,
    );
    expect(writes).toEqual([]);
  });
});

beforeEach(async () => {
  await db.songSections.clear();
  await db.songMatrixSections.clear();
  await db.songCells.clear();
  await db.songKeys.clear();
});

describe('syncMatrixSectionsForSong — Dexie integration', () => {
  it('new lead-sheet section creates a matrix row in Dexie', async () => {
    await db.songSections.put(mkLead({ id: 'sec-a', name: 'Verse', order: 0 }));

    await syncMatrixSectionsForSong(SONG, LATER);

    const rows = await db.songMatrixSections
      .where('songId').equals(SONG).toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].songSectionId).toBe('sec-a');
    expect(rows[0].name).toBe('Verse');
  });

  it('renaming a lead-sheet section preserves the matrix id and cell links', async () => {
    // Seed: matched lead-sheet + matrix pair + a cell pointing at
    // the matrix row.
    await db.songSections.put(mkLead({ id: 'sec-a', name: 'Verse', order: 0 }));
    await db.songMatrixSections.put(mkMatrix({
      id: 'm-stable',
      name: 'Verse',
      songSectionId: 'sec-a',
    }));
    await db.songKeys.put(mkSongKey({ id: 'k-c' }));
    await db.songCells.put(mkCell({
      id: 'cell-1',
      sectionId: 'm-stable',
      songKeyId: 'k-c',
      cellState: 'comfortable',
    }));

    // Rename the lead-sheet section.
    await db.songSections.update('sec-a', { name: 'Verse 1' });
    await syncMatrixSectionsForSong(SONG, LATER);

    const matrixRow = await db.songMatrixSections.get('m-stable');
    expect(matrixRow?.name).toBe('Verse 1');
    expect(matrixRow?.songSectionId).toBe('sec-a');
    // Cell still attached to the same matrix id, still comfortable.
    const cell = await db.songCells.get('cell-1');
    expect(cell?.sectionId).toBe('m-stable');
    expect(cell?.cellState).toBe('comfortable');
  });

  it('deleting a lead-sheet section archives the matrix row + preserves cells', async () => {
    await db.songMatrixSections.put(mkMatrix({
      id: 'm-keep',
      name: 'Verse',
      songSectionId: 'sec-a',
    }));
    await db.songKeys.put(mkSongKey({ id: 'k-c' }));
    await db.songCells.put(mkCell({
      id: 'cell-1',
      sectionId: 'm-keep',
      songKeyId: 'k-c',
      cellState: 'comfortable',
    }));

    // No lead-sheet section exists (cleared in beforeEach).
    await syncMatrixSectionsForSong(SONG, LATER);

    const matrixRow = await db.songMatrixSections.get('m-keep');
    expect(matrixRow?.isArchived).toBe(true);
    const cell = await db.songCells.get('cell-1');
    expect(cell).toBeDefined();
    expect(cell?.cellState).toBe('comfortable');
  });

  it('reordering lead-sheet sections propagates displayOrder to matrix', async () => {
    await db.songSections.bulkPut([
      mkLead({ id: 'sec-a', name: 'Verse', order: 1 }),
      mkLead({ id: 'sec-b', name: 'Chorus', order: 0 }),
    ]);
    await db.songMatrixSections.bulkPut([
      mkMatrix({ id: 'm-a', name: 'Verse', displayOrder: 0, songSectionId: 'sec-a' }),
      mkMatrix({ id: 'm-b', name: 'Chorus', displayOrder: 1, songSectionId: 'sec-b' }),
    ]);

    await syncMatrixSectionsForSong(SONG, LATER);

    const a = await db.songMatrixSections.get('m-a');
    const b = await db.songMatrixSections.get('m-b');
    expect(b?.displayOrder).toBe(0);
    expect(a?.displayOrder).toBe(1);
  });
});
