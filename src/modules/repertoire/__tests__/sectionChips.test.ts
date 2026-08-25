/**
 * The two chip axes, and the counts under them.
 *
 * THE FIXTURE THAT MATTERS IS `dashed and practised` — a section being
 * played whose chart the user has not called finished. A four-state
 * implementation gets exactly that one wrong, because the four states
 * anyone writes down are the four that feel like a progression:
 * nothing → chords added → practised → passed. This suite pins that
 * the border and the fill move independently, all six ways.
 */
import { describe, expect, it } from 'vitest';
import type { SongCell, SongKey, SongMatrixSection, SongSection } from '../../../lib/db';
import {
  needsChordsLine,
  readSectionChips,
  sectionFooterLine,
  type SectionChipFill,
} from '../sectionChips';

const SONG = 'song-1';
const ORIGINAL_KEY = 'songkey-1';

function section(id: string, name: string, chartComplete?: boolean): SongSection {
  return {
    id, songId: SONG, name, order: 0, lyrics: '',
    ...(chartComplete === undefined ? {} : { chartComplete }),
  };
}

function matrixRow(sectionId: string): SongMatrixSection {
  return {
    id: `matrix-${sectionId}`,
    songId: SONG,
    name: sectionId,
    displayOrder: 0,
    isArchived: false,
    splitFromSectionId: null,
    songSectionId: sectionId,
    createdAt: 0,
    updatedAt: 0,
  };
}

function cell(sectionId: string, cellState: SongCell['cellState']): SongCell {
  return {
    id: `cell-${sectionId}`,
    songId: SONG,
    sectionId: `matrix-${sectionId}`,
    songKeyId: ORIGINAL_KEY,
    cellState,
    comfortableAt: null,
    consecutiveCleanCount: 0,
    lastRunAt: null,
    lastRunWasClean: null,
    notes: null,
    lastEngagedAt: null,
    createdAt: 0,
    updatedAt: 0,
  };
}

const KEYS: SongKey[] = [
  {
    id: ORIGINAL_KEY, songId: SONG, keyName: 'C', isOriginalKey: true,
    keyState: 'not_started', solidAt: null,
  } as SongKey,
  {
    id: 'songkey-2', songId: SONG, keyName: 'G', isOriginalKey: false,
    keyState: 'not_started', solidAt: null,
  } as SongKey,
];

describe('readSectionChips — the two axes', () => {
  it('reads a dashed-and-practised section: no tick, real practice', () => {
    const out = readSectionChips({
      sections: [section('s1', 'Verse 1')],
      matrixSections: [matrixRow('s1')],
      cells: [cell('s1', 'learning')],
      songKeys: KEYS,
    });

    expect(out.chips).toHaveLength(1);
    // The combination a four-state enum collapses.
    expect(out.chips[0].chartComplete).toBe(false);
    expect(out.chips[0].fill).toBe('practised');
    expect(out.needChords).toBe(1);
    expect(out.inProgress).toBe(1);
  });

  it('all six combinations survive the derivation', () => {
    const fills: Array<[SongCell['cellState'], SectionChipFill]> = [
      ['empty', 'empty'],
      ['learning', 'practised'],
      ['comfortable', 'passed'],
    ];
    for (const ticked of [false, true]) {
      for (const [cellState, expected] of fills) {
        const out = readSectionChips({
          sections: [section('s1', 'Verse 1', ticked)],
          matrixSections: [matrixRow('s1')],
          cells: [cell('s1', cellState)],
          songKeys: KEYS,
        });
        expect(out.chips[0].chartComplete).toBe(ticked);
        expect(out.chips[0].fill).toBe(expected);
      }
    }
  });

  it('a ticked chart with no practice stays empty-filled', () => {
    // The inverse of the fixture above: the tick must not imply
    // progress any more than progress implies the tick.
    const out = readSectionChips({
      sections: [section('s1', 'Verse 1', true)],
      matrixSections: [matrixRow('s1')],
      cells: [cell('s1', 'empty')],
      songKeys: KEYS,
    });
    expect(out.chips[0].chartComplete).toBe(true);
    expect(out.chips[0].fill).toBe('empty');
    expect(out.needChords).toBe(0);
  });

  it('only the ORIGINAL key decides the fill', () => {
    const otherKeyCell = { ...cell('s1', 'comfortable'), songKeyId: 'songkey-2' };
    const out = readSectionChips({
      sections: [section('s1', 'Verse 1')],
      matrixSections: [matrixRow('s1')],
      cells: [otherKeyCell],
      songKeys: KEYS,
    });
    expect(out.chips[0].fill).toBe('empty');
  });

  it('missing evidence reads as empty, never as a guess', () => {
    // No matrix row yet (the reconciler runs off a write hook), and no
    // original-key row at all.
    const noMatrix = readSectionChips({
      sections: [section('s1', 'Verse 1')],
      matrixSections: [],
      cells: [cell('s1', 'comfortable')],
      songKeys: KEYS,
    });
    expect(noMatrix.chips[0].fill).toBe('empty');

    const noOriginalKey = readSectionChips({
      sections: [section('s1', 'Verse 1')],
      matrixSections: [matrixRow('s1')],
      cells: [cell('s1', 'comfortable')],
      songKeys: [KEYS[1]],
    });
    expect(noOriginalKey.chips[0].fill).toBe('empty');
  });

  it('an archived matrix row does not carry a chip fill', () => {
    const archived = { ...matrixRow('s1'), isArchived: true };
    const out = readSectionChips({
      sections: [section('s1', 'Verse 1')],
      matrixSections: [archived],
      cells: [cell('s1', 'comfortable')],
      songKeys: KEYS,
    });
    expect(out.chips[0].fill).toBe('empty');
  });

  it('walks the lead sheet, in the order given', () => {
    const out = readSectionChips({
      sections: [section('s1', 'Intro'), section('s2', 'Verse 1'), section('s3', 'Chorus')],
      matrixSections: [matrixRow('s1'), matrixRow('s2'), matrixRow('s3')],
      cells: [],
      songKeys: KEYS,
    });
    expect(out.chips.map(c => c.name)).toEqual(['Intro', 'Verse 1', 'Chorus']);
  });
});

describe('the footer line', () => {
  const reading = (
    specs: Array<[boolean, SongCell['cellState']]>,
  ) => readSectionChips({
    sections: specs.map(([ticked], i) => section(`s${i}`, `S${i}`, ticked)),
    matrixSections: specs.map((_, i) => matrixRow(`s${i}`)),
    cells: specs.map(([, state], i) => cell(`s${i}`, state)),
    songKeys: KEYS,
  });

  it('names every clause that has a number', () => {
    const out = reading([
      [true, 'comfortable'],
      [true, 'learning'],
      [true, 'learning'],
      [true, 'empty'],
      [true, 'empty'],
      [true, 'empty'],
    ]);
    expect(sectionFooterLine(out)).toBe('6 sections · 1 passed · 2 in progress');
  });

  it('drops a zero clause rather than printing it', () => {
    const nonePassed = reading([[true, 'learning'], [true, 'empty']]);
    expect(sectionFooterLine(nonePassed)).toBe('2 sections · 1 in progress');

    const noneInProgress = reading([[true, 'comfortable'], [true, 'empty']]);
    expect(sectionFooterLine(noneInProgress)).toBe('2 sections · 1 passed');

    const neither = reading([[true, 'empty'], [true, 'empty']]);
    expect(sectionFooterLine(neither)).toBe('2 sections');
  });

  it('singularises the section count', () => {
    expect(sectionFooterLine(reading([[true, 'empty']]))).toBe('1 section');
  });

  it('is null for a song with no sections', () => {
    const empty = readSectionChips({
      sections: [], matrixSections: [], cells: [], songKeys: KEYS,
    });
    expect(sectionFooterLine(empty)).toBeNull();
    expect(empty.chips).toHaveLength(0);
  });
});

describe('the needs-chords line', () => {
  it('counts the unticked sections', () => {
    const out = readSectionChips({
      sections: [section('s1', 'A'), section('s2', 'B', true), section('s3', 'C')],
      matrixSections: [],
      cells: [],
      songKeys: KEYS,
    });
    expect(needsChordsLine(out)).toBe('2 sections still need chords');
  });

  it('agrees with itself in the singular', () => {
    const out = readSectionChips({
      sections: [section('s1', 'A'), section('s2', 'B', true)],
      matrixSections: [],
      cells: [],
      songKeys: KEYS,
    });
    expect(needsChordsLine(out)).toBe('1 section still needs chords');
  });

  it('is null when every chart is ticked', () => {
    const out = readSectionChips({
      sections: [section('s1', 'A', true)],
      matrixSections: [],
      cells: [],
      songKeys: KEYS,
    });
    expect(needsChordsLine(out)).toBeNull();
  });
});
