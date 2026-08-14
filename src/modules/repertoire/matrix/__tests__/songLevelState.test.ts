// @vitest-environment jsdom
/**
 * Song-level state under a FULLY MATERIALISED matrix.
 *
 * The bug these guard: the state machine and the cross-key prompt both
 * asked whether non-original cells / key rows EXISTED, which was a
 * sound proxy only while rows were created one key at a time by an
 * explicit user choice. Materialising all 12 keys makes existence
 * universal, so both reads silently flip to true for every song —
 * inflating Cross-key on songs never played outside their home key,
 * and killing the expansion prompt permanently.
 *
 * Every case below therefore builds the full 12-key grid and asserts
 * on what the user has PLAYED, never on how many rows are present.
 */
import { describe, expect, it } from 'vitest';
import type { SongCell, SongKey, SongKeyState } from '../../../../lib/db';
import {
  computeSongLevelState,
  hasCrossKeyEngagement,
  isCellEngaged,
  isKeyRowEngaged,
} from '../songLevelState';

const NOW = 1_700_000_000_000;
const KEYS = ['C', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'F#', 'B', 'E', 'A', 'D', 'G'];
const SECTIONS = ['verse', 'chorus', 'bridge'];

function key(keyName: string, isOriginal: boolean, keyState: SongKeyState): SongKey {
  return {
    id: `songkey-s1-${keyName}`,
    songId: 's1',
    keyName,
    isOriginalKey: isOriginal,
    keyState,
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
    createdAt: NOW,
    updatedAt: NOW,
  } as SongKey;
}

function cell(
  songKeyId: string,
  sectionId: string,
  overrides: Partial<SongCell> = {},
): SongCell {
  return {
    id: `cell-${songKeyId}-${sectionId}`,
    songId: 's1',
    sectionId,
    songKeyId,
    cellState: 'empty',
    comfortableAt: null,
    consecutiveCleanCount: 0,
    lastRunAt: null,
    lastRunWasClean: null,
    notes: null,
    lastEngagedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as SongCell;
}

/** The post-repair steady state: 12 keys × 3 sections, nothing played. */
function fullGrid(originalKey = 'Ab', originalState: SongKeyState = 'comfortable') {
  const songKeys = KEYS.map(k =>
    key(k, k === originalKey, k === originalKey ? originalState : 'not_started'),
  );
  const songCells = songKeys.flatMap(k => SECTIONS.map(s => cell(k.id, s)));
  return { songKeys, songCells };
}

describe('isCellEngaged', () => {
  it('a freshly materialised cell is NOT engaged', () => {
    expect(isCellEngaged(cell('songkey-s1-C', 'verse'))).toBe(false);
  });

  it('counts a run-through that left the state at empty', () => {
    // A failed run sets lastRunAt without advancing cellState. That is
    // still practice — and it is the cell the user is working hardest
    // on, so treating it as untouched under-reports the worst case.
    expect(isCellEngaged(cell('songkey-s1-C', 'verse', {
      lastRunAt: NOW, lastRunWasClean: false,
    }))).toBe(true);
  });

  it('counts any advanced state', () => {
    expect(isCellEngaged(cell('k', 'v', { cellState: 'learning' }))).toBe(true);
    expect(isCellEngaged(cell('k', 'v', { cellState: 'comfortable' }))).toBe(true);
  });
});

describe('hasCrossKeyEngagement', () => {
  it('is FALSE on a full 12-key grid with nothing played', () => {
    // The whole point. 33 non-original cells exist; none was played.
    const { songKeys, songCells } = fullGrid();
    expect(songCells.filter(c => !c.songKeyId.endsWith('-Ab'))).toHaveLength(33);
    expect(hasCrossKeyEngagement(songKeys, songCells)).toBe(false);
  });

  it('ignores engagement in the ORIGINAL key', () => {
    const { songKeys, songCells } = fullGrid();
    const played = songCells.map(c =>
      c.songKeyId === 'songkey-s1-Ab' ? { ...c, cellState: 'comfortable' as const } : c,
    );
    expect(hasCrossKeyEngagement(songKeys, played)).toBe(false);
  });

  it('is TRUE once a single non-original cell is played', () => {
    const { songKeys, songCells } = fullGrid();
    const played = songCells.map(c =>
      c.id === 'cell-songkey-s1-C-verse' ? { ...c, lastRunAt: NOW } : c,
    );
    expect(hasCrossKeyEngagement(songKeys, played)).toBe(true);
  });

  it('is false when there are no non-original keys at all', () => {
    const songKeys = [key('Ab', true, 'comfortable')];
    const songCells = SECTIONS.map(s => cell('songkey-s1-Ab', s));
    expect(hasCrossKeyEngagement(songKeys, songCells)).toBe(false);
  });
});

describe('computeSongLevelState under a materialised grid', () => {
  it('does NOT report cross_key merely because 12 keys exist', () => {
    // The silent inflation: comfortable original key + a full grid
    // must still read `comfortable`, not `cross_key`.
    const { songKeys, songCells } = fullGrid('Ab', 'comfortable');
    expect(computeSongLevelState(songKeys, songCells, 3, NOW).state).toBe('comfortable');
  });

  it('reports cross_key once a non-original cell is actually played', () => {
    const { songKeys, songCells } = fullGrid('Ab', 'comfortable');
    const played = songCells.map(c =>
      c.id === 'cell-songkey-s1-C-verse' ? { ...c, cellState: 'learning' as const } : c,
    );
    expect(computeSongLevelState(songKeys, played, 3, NOW).state).toBe('cross_key');
  });

  it('still reports learning when the original key is untouched', () => {
    const { songKeys, songCells } = fullGrid('Ab', 'not_started');
    expect(computeSongLevelState(songKeys, songCells, 3, NOW).state).toBe('learning');
  });

  it('percentages are unmoved by materialisation', () => {
    // learningPercent / crossKeyPercent count `comfortable` cells, and
    // their denominators (totalSections, 11 × totalSections) already
    // assumed a full grid — so empty rows must contribute nothing.
    const { songKeys, songCells } = fullGrid('Ab', 'comfortable');
    const state = computeSongLevelState(songKeys, songCells, 3, NOW);
    expect(state.learningPercent).toBe(0);
    expect(state.crossKeyPercent).toBe(0);
    expect(state.solidKeyCount).toBe(0);
  });

  it('learningPercent still tracks comfortable original-key cells', () => {
    const { songKeys, songCells } = fullGrid('Ab', 'comfortable');
    const played = songCells.map(c =>
      c.songKeyId === 'songkey-s1-Ab' && c.sectionId !== 'bridge'
        ? { ...c, cellState: 'comfortable' as const }
        : c,
    );
    expect(computeSongLevelState(songKeys, played, 3, NOW).learningPercent).toBe(67);
  });
});

describe('isKeyRowEngaged', () => {
  it('a materialised but unplayed key row is NOT engaged', () => {
    // Drives the row dimming. If this returned true, all 12 rows would
    // render identically and the grid would stop showing where the
    // user has been.
    expect(isKeyRowEngaged(key('C', false, 'not_started'))).toBe(false);
  });

  it('any advanced key state is engaged', () => {
    for (const state of ['learning', 'comfortable', 'solid'] as const) {
      expect(isKeyRowEngaged(key('C', false, state)), state).toBe(true);
    }
  });

  it('an absent row is not engaged', () => {
    expect(isKeyRowEngaged(null)).toBe(false);
  });

  it('the original key is not engaged just for being original', () => {
    expect(isKeyRowEngaged(key('Ab', true, 'not_started'))).toBe(false);
  });
});
