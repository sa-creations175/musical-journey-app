// @vitest-environment jsdom
/**
 * Repairs for the song-key data.
 *
 * These are the only destructive-ish operations in the repertoire
 * module, and two of them can permanently destroy the ONLY record that
 * a song was worked in a key — so the refusals matter more than the
 * happy paths, and most of what is pinned here is a refusal.
 *
 * Fixtures mirror the real data the diagnostic surfaced rather than
 * inventing shapes: No Weapon's anchor stored not_started while its
 * cells said comfortable; its `A` row stored learning against eight
 * cells none of which was ever played.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  db,
  type Song,
  type SongCell,
  type SongCellRunThrough,
  type SongKey,
  type SongKeyState,
  type SongMatrixSection,
} from '../../../lib/db';
import type { SongKeyRowInfo } from '../keyDiagnostics';
import {
  canApplyWithoutConfirm,
  deleteJunkKeyRow,
  normaliseSongKey,
  recomputeKeyStateFromCells,
  recomputeSafety,
  resolveKeyMismatch,
} from '../keyRepairs';

const NOW = 1_700_000_000_000;
const SONG = 's1';
const SECTIONS = ['verse', 'chorus', 'bridge'];

function info(o: Partial<SongKeyRowInfo> = {}): SongKeyRowInfo {
  return {
    id: 'songkey-s1-C', keyName: 'C', isOriginalKey: false,
    keyState: 'not_started', updatedAt: NOW,
    cellCount: 0, engagedCellCount: 0, runThroughCount: 0,
    derivedState: null, flags: [], deletable: false, ...o,
  };
}

async function seedSong(key: string | undefined = 'Ab') {
  await db.songs.put({ id: SONG, title: 'No Weapon', artist: 'x', key } as Song);
  await db.songMatrixSections.bulkPut(SECTIONS.map((name, i) => ({
    id: `sec-${name}`, songId: SONG, name, displayOrder: i,
    isArchived: false, splitFromSectionId: null,
    createdAt: NOW, updatedAt: NOW,
  } as SongMatrixSection)));
}

function key(keyName: string, isOriginalKey: boolean, keyState: SongKeyState = 'not_started'): SongKey {
  return {
    id: `songkey-${SONG}-${keyName}`, songId: SONG, keyName, isOriginalKey, keyState,
    solidAt: null, solidDecayState: null, lastDecayCheckAt: null,
    livedWithSessionCount: 0, livedWithFirstSessionAt: null,
    livedWithWindowStartAt: null, livedWithSessionsInWindow: 0,
    wholeSongTestPassedAt: null, isRetestRecommended: false,
    lastEngagedAt: null, createdAt: NOW, updatedAt: NOW,
  } as SongKey;
}

function cell(songKeyId: string, sectionId: string, o: Partial<SongCell> = {}): SongCell {
  return {
    id: `cell-${songKeyId}-${sectionId}`, songId: SONG, sectionId, songKeyId,
    cellState: 'empty', comfortableAt: null, consecutiveCleanCount: 0,
    lastRunAt: null, lastRunWasClean: null, notes: null, lastEngagedAt: null,
    createdAt: NOW, updatedAt: NOW, ...o,
  } as SongCell;
}

beforeEach(async () => {
  await Promise.all([
    db.songs.clear(), db.songKeys.clear(), db.songCells.clear(),
    db.songCellRunThroughs.clear(), db.songMatrixSections.clear(),
  ]);
});

// ---------------------------------------------------------------------

describe('recomputeSafety', () => {
  it('is none when there is nothing to derive from or nothing changes', () => {
    expect(recomputeSafety(info({ derivedState: null }))).toBe('none');
    expect(recomputeSafety(info({ keyState: 'learning', derivedState: 'learning' }))).toBe('none');
  });

  it('calls a promotion a promotion, regardless of played count', () => {
    // No Weapon's anchor: stored not_started, cells say comfortable.
    // Played cells are positive evidence — they cannot exist without
    // run-throughs — so this needs no confirmation.
    expect(recomputeSafety(info({
      keyState: 'not_started', derivedState: 'comfortable', engagedCellCount: 3,
    }))).toBe('promotion');
  });

  it('calls a demotion backed by played cells evidenced', () => {
    expect(recomputeSafety(info({
      keyState: 'solid', derivedState: 'learning', engagedCellCount: 2,
    }))).toBe('evidenced-demotion');
  });

  it('calls a demotion with NOTHING played unevidenced', () => {
    // No Weapon / A: learning stored, 8 cells, 0 played. The stored
    // value came from the legacy stage ladder and the cells prove
    // nothing about it.
    expect(recomputeSafety(info({
      keyState: 'learning', derivedState: 'not_started',
      cellCount: 8, engagedCellCount: 0,
    }))).toBe('unevidenced-demotion');
  });

  it('keys on engagedCellCount, NOT cellCount', () => {
    // Step 3 gives every row empty cells, erasing "has no cells" as a
    // signal forever. Played count is the only durable distinction, so
    // eight empty cells must read the same as zero.
    const withCells = info({ keyState: 'learning', derivedState: 'not_started', cellCount: 8, engagedCellCount: 0 });
    const withoutCells = info({ keyState: 'learning', derivedState: 'not_started', cellCount: 0, engagedCellCount: 0 });
    expect(recomputeSafety(withCells)).toBe(recomputeSafety(withoutCells));
  });

  it('gates confirmation on exactly the two evidenced cases', () => {
    expect(canApplyWithoutConfirm('promotion')).toBe(true);
    expect(canApplyWithoutConfirm('evidenced-demotion')).toBe(true);
    expect(canApplyWithoutConfirm('unevidenced-demotion')).toBe(false);
    expect(canApplyWithoutConfirm('none')).toBe(false);
  });
});

// ---------------------------------------------------------------------

describe('deleteJunkKeyRow', () => {
  it('removes a dependent-free non-anchor row', async () => {
    await seedSong();
    await db.songKeys.bulkPut([key('Ab', true), key('Ab flat', false)]);
    await deleteJunkKeyRow(`songkey-${SONG}-Ab flat`);
    expect(await db.songKeys.count()).toBe(1);
  });

  it('REFUSES to delete the anchor', async () => {
    // Blessed's only row is a non-canonical Gb that is also its
    // original key; removing it leaves the song with no key rows at
    // all — worse than the state being repaired.
    await seedSong('Gb');
    await db.songKeys.put(key('Gb', true));
    await expect(deleteJunkKeyRow(`songkey-${SONG}-Gb`)).rejects.toThrow(/original-key/);
    expect(await db.songKeys.count()).toBe(1);
  });

  it('REFUSES when cells have appeared since the diagnostic ran', async () => {
    // The snapshot the button was rendered from can be minutes old.
    // There is no cascade anywhere in the codebase, so orphans would
    // be unreachable and invisible.
    await seedSong();
    await db.songKeys.bulkPut([key('Ab', true), key('B maj', false)]);
    await db.songCells.put(cell(`songkey-${SONG}-B maj`, 'verse'));
    await expect(deleteJunkKeyRow(`songkey-${SONG}-B maj`)).rejects.toThrow(/orphan/);
    expect(await db.songKeys.count()).toBe(2);
  });

  it('REFUSES when run-throughs have appeared since', async () => {
    await seedSong();
    await db.songKeys.bulkPut([key('Ab', true), key('B maj', false)]);
    await db.songCellRunThroughs.put({
      id: 'r1', cellId: 'c', songId: SONG, sectionId: 'verse',
      songKeyId: `songkey-${SONG}-B maj`, wasClean: true,
      tempoBpm: null, notes: null, createdAt: NOW,
    } as SongCellRunThrough);
    await expect(deleteJunkKeyRow(`songkey-${SONG}-B maj`)).rejects.toThrow(/orphan/);
  });
});

// ---------------------------------------------------------------------

describe('normaliseSongKey', () => {
  it('moves Blessed from Gb to F#, anchor and song record together', async () => {
    await seedSong('Gb');
    await db.songKeys.put(key('Gb', true));
    await normaliseSongKey(SONG, 'F#');

    expect((await db.songs.get(SONG))?.key).toBe('F#');
    const rows = await db.songKeys.where('songId').equals(SONG).toArray();
    expect(rows.find(r => r.isOriginalKey)?.keyName).toBe('F#');
    // The unrenderable row is gone, not left behind demoted.
    expect(rows.some(r => r.keyName === 'Gb')).toBe(false);
  });

  it('keeps the superseded row when it carries practice', async () => {
    // Renaming must never silently discard history, even for a key
    // name the grid cannot render.
    await seedSong('Gb');
    await db.songKeys.put(key('Gb', true));
    await db.songCells.put(cell(`songkey-${SONG}-Gb`, 'verse', { cellState: 'learning' }));
    await normaliseSongKey(SONG, 'F#');

    const rows = await db.songKeys.where('songId').equals(SONG).toArray();
    expect(rows.find(r => r.isOriginalKey)?.keyName).toBe('F#');
    expect(rows.some(r => r.keyName === 'Gb')).toBe(true);
  });
});

// ---------------------------------------------------------------------

describe('resolveKeyMismatch', () => {
  it('moves the anchor when the song record is chosen', async () => {
    await seedSong('F');
    await db.songKeys.bulkPut([key('Eb', true), key('F', false, 'learning')]);
    await resolveKeyMismatch(SONG, 'use-song-key');

    const rows = await db.songKeys.where('songId').equals(SONG).toArray();
    expect(rows.find(r => r.isOriginalKey)?.keyName).toBe('F');
    expect((await db.songs.get(SONG))?.key).toBe('F');
  });

  it('corrects the song record when the matrix is chosen', async () => {
    // A Couple Minutes: the song said F, the anchor said Eb, and Eb
    // was the truth. A repair that always trusted Song.key would have
    // moved the anchor off the correct key.
    await seedSong('F');
    await db.songKeys.bulkPut([key('Eb', true), key('F', false, 'learning')]);
    await resolveKeyMismatch(SONG, 'use-matrix-anchor');

    expect((await db.songs.get(SONG))?.key).toBe('Eb');
    const rows = await db.songKeys.where('songId').equals(SONG).toArray();
    expect(rows.find(r => r.isOriginalKey)?.keyName).toBe('Eb');
    // The worked non-original row survives either way.
    expect(rows.find(r => r.keyName === 'F')?.keyState).toBe('learning');
  });
});

// ---------------------------------------------------------------------

describe('recomputeKeyStateFromCells', () => {
  it('applies a promotion', async () => {
    await seedSong();
    await db.songKeys.put(key('Ab', true, 'not_started'));
    await db.songCells.bulkPut(SECTIONS.map(sec =>
      cell(`songkey-${SONG}-Ab`, sec, { cellState: 'comfortable' })));

    const out = await recomputeKeyStateFromCells(`songkey-${SONG}-Ab`);
    expect(out).toEqual({ from: 'not_started', to: 'comfortable' });
    expect((await db.songKeys.get(`songkey-${SONG}-Ab`))?.keyState).toBe('comfortable');
  });

  it('REFUSES an unevidenced demotion without force', async () => {
    await seedSong();
    await db.songKeys.put(key('A', false, 'learning'));
    await db.songCells.bulkPut(SECTIONS.map(sec => cell(`songkey-${SONG}-A`, sec)));

    await expect(recomputeKeyStateFromCells(`songkey-${SONG}-A`))
      .rejects.toThrow(/no practice/);
    expect((await db.songKeys.get(`songkey-${SONG}-A`))?.keyState).toBe('learning');
  });

  it('applies the same demotion with force', async () => {
    // The override exists because the app cannot tell "never played"
    // from "played before cells existed" — and the user can.
    await seedSong();
    await db.songKeys.put(key('A', false, 'learning'));
    await db.songCells.bulkPut(SECTIONS.map(sec => cell(`songkey-${SONG}-A`, sec)));

    const out = await recomputeKeyStateFromCells(`songkey-${SONG}-A`, { force: true });
    expect(out).toEqual({ from: 'learning', to: 'not_started' });
    expect((await db.songKeys.get(`songkey-${SONG}-A`))?.keyState).toBe('not_started');
  });

  it('does NOT require force for a demotion backed by played cells', async () => {
    await seedSong();
    await db.songKeys.put(key('C', false, 'comfortable'));
    await db.songCells.bulkPut([
      cell(`songkey-${SONG}-C`, 'verse', { cellState: 'learning' }),
      cell(`songkey-${SONG}-C`, 'chorus'),
      cell(`songkey-${SONG}-C`, 'bridge'),
    ]);
    const out = await recomputeKeyStateFromCells(`songkey-${SONG}-C`);
    expect(out).toEqual({ from: 'comfortable', to: 'learning' });
  });

  it('REFUSES when the song has no matrix sections', async () => {
    // computeKeyStateFromCells returns not_started unconditionally at
    // zero sections, so recomputing would demote every row on a song
    // whose matrix was never set up.
    await db.songs.put({ id: SONG, title: 'x', artist: 'y', key: 'Ab' } as Song);
    await db.songKeys.put(key('Ab', true, 'learning'));
    await db.songCells.put(cell(`songkey-${SONG}-Ab`, 'verse'));

    await expect(recomputeKeyStateFromCells(`songkey-${SONG}-Ab`))
      .rejects.toThrow(/no matrix sections/);
  });

  it('leaves lastEngagedAt alone — no practice happened here', async () => {
    // Moving it would fabricate engagement and reset the decay clock
    // for practice the user never did.
    await seedSong();
    await db.songKeys.put({ ...key('Ab', true, 'not_started'), lastEngagedAt: NOW - 999 });
    await db.songCells.bulkPut(SECTIONS.map(sec =>
      cell(`songkey-${SONG}-Ab`, sec, { cellState: 'comfortable' })));

    await recomputeKeyStateFromCells(`songkey-${SONG}-Ab`);
    expect((await db.songKeys.get(`songkey-${SONG}-Ab`))?.lastEngagedAt).toBe(NOW - 999);
  });

  it('clears solidDecayState when the state drops below solid', async () => {
    // The schema documents solidDecayState as null whenever keyState
    // is not solid; leaving a stale one would be a fresh
    // inconsistency in place of the repaired one.
    await seedSong();
    await db.songKeys.put({
      ...key('C', false, 'solid'), solidDecayState: 'fading', isRetestRecommended: true,
    });
    await db.songCells.bulkPut([
      cell(`songkey-${SONG}-C`, 'verse', { cellState: 'learning' }),
      cell(`songkey-${SONG}-C`, 'chorus'),
      cell(`songkey-${SONG}-C`, 'bridge'),
    ]);

    await recomputeKeyStateFromCells(`songkey-${SONG}-C`);
    const row = await db.songKeys.get(`songkey-${SONG}-C`);
    expect(row?.keyState).toBe('learning');
    expect(row?.solidDecayState).toBeNull();
    expect(row?.isRetestRecommended).toBe(false);
  });

  it('returns null and writes nothing when stored already agrees', async () => {
    await seedSong();
    await db.songKeys.put(key('Ab', true, 'not_started'));
    await db.songCells.bulkPut(SECTIONS.map(sec => cell(`songkey-${SONG}-Ab`, sec)));
    expect(await recomputeKeyStateFromCells(`songkey-${SONG}-Ab`)).toBeNull();
  });
});

describe('addressing rows by their stored id', () => {
  it('acts on a row whose id does NOT match songId + keyName', async () => {
    // The UI used to rebuild the id from songId and keyName. All three
    // current generators happen to produce that shape, but a row whose
    // keyName was edited after creation keeps its original id — and a
    // rebuilt guess addresses nothing.
    await seedSong();
    await db.songKeys.bulkPut([
      key('Ab', true),
      { ...key('X', false), id: 'legacy-row-id', keyName: 'B maj' },
    ]);
    await deleteJunkKeyRow('legacy-row-id');
    expect(await db.songKeys.count()).toBe(1);
  });

  it('THROWS rather than silently succeeding on a missing row', async () => {
    // The failure this prevents: a press that addresses a row which is
    // not there returns quietly, the caller reports "done", and
    // nothing changed. Indistinguishable from a dead button.
    await seedSong();
    await expect(deleteJunkKeyRow('does-not-exist')).rejects.toThrow(/no key row found/);
    await expect(recomputeKeyStateFromCells('does-not-exist')).rejects.toThrow(/no key row found/);
  });

  it('still returns null for a real row that needs no change', async () => {
    // "No change needed" and "row missing" must stay distinguishable —
    // collapsing them is how the silent failure happened.
    await seedSong();
    await db.songKeys.put(key('Ab', true, 'not_started'));
    await db.songCells.bulkPut(SECTIONS.map(sec => cell(`songkey-${SONG}-Ab`, sec)));
    expect(await recomputeKeyStateFromCells(`songkey-${SONG}-Ab`)).toBeNull();
  });
});

