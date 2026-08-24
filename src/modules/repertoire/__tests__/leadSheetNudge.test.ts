/**
 * Resolving the cell a lead-sheet edit should open.
 *
 * Pure. The property worth the most is that an UNRESOLVABLE edit
 * returns null rather than a plausible-looking wrong cell — the caller
 * hides the nudge entirely on null, and a button that opens the wrong
 * section would attach practice to work the user did not do.
 */
import { describe, expect, it } from 'vitest';
import type { SongCell, SongKey, SongMatrixSection } from '../../../lib/db';
import { cellForLeadSheetEdit } from '../leadSheetNudge';

const matrixSection = (over: Partial<SongMatrixSection> = {}): SongMatrixSection => ({
  id: 'ms-1', songId: 's1', name: 'Chorus', displayOrder: 0,
  isArchived: false, splitFromSectionId: null, createdAt: 0, updatedAt: 0,
  songSectionId: 'ls-1',
  ...over,
} as SongMatrixSection);

const songKey = (over: Partial<SongKey> = {}): SongKey => ({
  id: 'sk-C', songId: 's1', keyName: 'C', isOriginalKey: true,
  keyState: 'learning', solidAt: null, solidDecayState: null,
  lastDecayCheckAt: null, livedWithSessionCount: 0,
  livedWithFirstSessionAt: null, livedWithWindowStartAt: null,
  livedWithSessionsInWindow: 0, wholeSongTestPassedAt: null,
  isRetestRecommended: false, lastEngagedAt: 0, createdAt: 0, updatedAt: 0,
  ...over,
});

const cell = (over: Partial<SongCell> = {}): SongCell => ({
  id: 'cell-1', songId: 's1', songKeyId: 'sk-C', sectionId: 'ms-1',
  cellState: 'learning', comfortableAt: null, consecutiveCleanCount: 0,
  lastRunAt: null, lastRunWasClean: null, notes: null,
  lastEngagedAt: null, createdAt: 0, updatedAt: 0,
  ...over,
});

const resolve = (over: Partial<Parameters<typeof cellForLeadSheetEdit>[0]> = {}) =>
  cellForLeadSheetEdit({
    songSectionId: 'ls-1',
    matrixSections: [matrixSection()],
    songKeys: [songKey()],
    cells: [cell()],
    ...over,
  });

describe('the original key', () => {
  it('opens the edited section in the song’s original key', () => {
    expect(resolve()).toBe('cell-1');
  });

  it('ignores the key most recently practised', () => {
    // The lead sheet IS the chart in the original key. Editing it is
    // work on the thing in front of you, wherever you last played the
    // song — and editing is mostly early-life work anyway, before the
    // song has left its original key.
    const recent = songKey({ id: 'sk-Ab', keyName: 'Ab', isOriginalKey: false, lastEngagedAt: 9e12 });
    expect(resolve({
      songKeys: [recent, songKey()],
      cells: [cell({ id: 'cell-ab', songKeyId: 'sk-Ab' }), cell()],
    })).toBe('cell-1');
  });
});

describe('the link survives what a name would not', () => {
  it('follows songSectionId through a rename', () => {
    // Matrix rows own their ids and point back at the lead-sheet
    // section. Matching on name would break on the first rename and,
    // worse, could attach practice to a different section that
    // happened to share one.
    expect(resolve({
      matrixSections: [matrixSection({ name: 'Chorus (rewritten)' })],
    })).toBe('cell-1');
  });

  it('skips an archived matrix row', () => {
    // An archived row is a section that was deleted; its history stays
    // for the record, but it is not somewhere to start practising.
    expect(resolve({
      matrixSections: [matrixSection({ isArchived: true })],
    })).toBeNull();
  });

  it('does not resolve a DIFFERENT section', () => {
    expect(resolve({ songSectionId: 'ls-other' })).toBeNull();
  });
});

describe('null rather than a plausible wrong answer', () => {
  it('returns null when the matrix row does not exist yet', () => {
    // syncMatrixSectionsForSong runs off a Dexie write hook, so a
    // section added seconds ago may have no matrix row. A first edit
    // landing in that window is exactly when this happens.
    expect(resolve({ matrixSections: [] })).toBeNull();
  });

  it('returns null when no key is marked original', () => {
    expect(resolve({ songKeys: [songKey({ isOriginalKey: false })] })).toBeNull();
  });

  it('returns null when the cell has not been materialised', () => {
    expect(resolve({ cells: [] })).toBeNull();
  });

  it('never falls back to another key’s cell', () => {
    // The nastiest available wrong answer: a cell for the right
    // section in the wrong key would open a panel that looks correct
    // and files the practice under a key the user was not in.
    expect(resolve({
      cells: [cell({ id: 'cell-ab', songKeyId: 'sk-Ab' })],
    })).toBeNull();
  });
});
