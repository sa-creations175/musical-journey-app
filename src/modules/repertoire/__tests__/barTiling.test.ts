import { describe, expect, it } from 'vitest';
import type { ChordPlacement, Song, SongSection } from '../../../lib/db';
import { EIGHTHS_DURATION_VERSION } from '../eighthsMigration';
import { analyseSectionTiling, chordLabel, looksUndoubled } from '../barTiling';
import { BASIC_ARRANGEMENT_ID } from '../beatsModel';

const eighthsSong = {
  id: 's1',
  title: 'On Eighths',
  timeSignature: '4/4',
  eighths: true,
} as Song;
const beatsSong = { ...eighthsSong, eighths: false } as Song;

function p(
  id: string,
  barIndex: number,
  beatPos: number,
  beats: number,
  extra: Partial<ChordPlacement> = {},
): ChordPlacement {
  return {
    id,
    arrangementId: BASIC_ARRANGEMENT_ID,
    barIndex,
    beatPos,
    beats,
    chord: { function: '1', quality: 'maj' },
    ...extra,
  } as ChordPlacement;
}

function section(
  placements: ChordPlacement[],
  overrides: Partial<SongSection> = {},
): SongSection {
  return {
    id: 'sec-1',
    songId: 's1',
    name: 'Verse',
    order: 0,
    lyrics: '',
    chordPlacements: placements,
    eighthsDurationVersion: EIGHTHS_DURATION_VERSION,
    ...overrides,
  } as SongSection;
}

describe('analyseSectionTiling — the shape on screen', () => {
  it('a correctly converted bar of four chords tiles exactly', () => {
    // Bar 4's control shape: four chords, 2 slots each, adjacent.
    const t = analyseSectionTiling(
      eighthsSong,
      section([
        p('a', 0, 0, 2),
        p('b', 0, 1, 2),
        p('c', 0, 2, 2),
        p('d', 0, 3, 2),
      ]),
    )!;
    expect(t.slotsPerBar).toBe(8);
    expect(t.bars[0].fillsBar).toBe(true);
    expect(t.bars[0].gaps).toEqual([]);
    expect(t.bars[0].covered).toBe(8);
    expect(t.problemBars).toEqual([]);
  });

  it('a correctly converted bar of two chords tiles exactly', () => {
    const t = analyseSectionTiling(
      eighthsSong,
      section([p('a', 0, 0, 4), p('b', 0, 2, 4)]),
    )!;
    expect(t.bars[0].fillsBar).toBe(true);
    expect(t.bars[0].gaps).toEqual([]);
  });

  it('REPRODUCES bar 5: two chords, correct positions, undoubled durations', () => {
    // beatPos 0 and 2 are correct beat coordinates. The durations are
    // still in BEATS while the bar is measured in slots, so each chord
    // renders half width and a gap opens after each.
    const t = analyseSectionTiling(
      eighthsSong,
      section([p('a', 0, 0, 2), p('b', 0, 2, 2)]),
    )!;
    const bar = t.bars[0];
    expect(bar.fillsBar).toBe(false);
    expect(bar.covered).toBe(4);
    expect(bar.gaps).toEqual([
      { from: 2, to: 4 },
      { from: 6, to: 8 },
    ]);
    expect(looksUndoubled(bar)).toBe(true);
    expect(t.problemBars).toEqual([0]);
  });

  it('does not call a bar with genuine rests undoubled', () => {
    // One chord, one beat long, alone in the bar. Under-covered, but
    // doubling it would not tile the bar either.
    const t = analyseSectionTiling(eighthsSong, section([p('a', 0, 0, 2)]))!;
    expect(t.bars[0].fillsBar).toBe(false);
    expect(looksUndoubled(t.bars[0])).toBe(false);
  });

  it('ignores empty bars — a rest is not a defect', () => {
    const t = analyseSectionTiling(
      eighthsSong,
      section([p('a', 0, 0, 8), p('b', 2, 0, 8)], { barCount: 3 }),
    )!;
    expect(t.bars[1].isEmpty).toBe(true);
    expect(t.problemBars).toEqual([]);
  });

  it('detects overlap', () => {
    const t = analyseSectionTiling(
      eighthsSong,
      section([p('a', 0, 0, 8), p('b', 0, 2, 4)]),
    )!;
    expect(t.bars[0].overlaps.length).toBeGreaterThan(0);
    expect(t.bars[0].fillsBar).toBe(false);
    expect(looksUndoubled(t.bars[0])).toBe(false);
  });

  it('counts a tie past the bar end as overflow, not a gap', () => {
    const t = analyseSectionTiling(eighthsSong, section([p('a', 0, 0, 12)]))!;
    expect(t.bars[0].covered).toBe(8);
    expect(t.bars[0].overflow).toBe(4);
    expect(t.bars[0].gaps).toEqual([]);
  });

  it('places an offbeat chord on the odd slot', () => {
    const t = analyseSectionTiling(
      eighthsSong,
      section([p('a', 0, 0, 1), p('b', 0, 0, 7, { offbeat: true })]),
    )!;
    expect(t.bars[0].spans[1].startSlot).toBe(1);
    expect(t.bars[0].fillsBar).toBe(true);
  });
});

describe('analyseSectionTiling — units and stamps', () => {
  it('measures a beats song in beats, not slots', () => {
    const t = analyseSectionTiling(
      beatsSong,
      section([p('a', 0, 0, 2), p('b', 0, 2, 2)], {
        eighthsDurationVersion: undefined,
      }),
    )!;
    expect(t.slotsPerBar).toBe(4);
    expect(t.bars[0].fillsBar).toBe(true);
  });

  it('reports the stamp verbatim and what it claims', () => {
    const stamped = analyseSectionTiling(eighthsSong, section([p('a', 0, 0, 8)]))!;
    expect(stamped.stamp).toBe(EIGHTHS_DURATION_VERSION);
    expect(stamped.claimedUnit).toBe('slots');

    const bare = analyseSectionTiling(
      eighthsSong,
      section([p('a', 0, 0, 8)], { eighthsDurationVersion: undefined }),
    )!;
    expect(bare.stamp).toBeNull();
    expect(bare.claimedUnit).toBe('beats');
  });

  it('returns null for a section with no stored placements', () => {
    expect(
      analyseSectionTiling(eighthsSong, section([], { chordPlacements: undefined })),
    ).toBeNull();
  });

  it('only counts the active arrangement', () => {
    const t = analyseSectionTiling(
      eighthsSong,
      section([
        p('a', 0, 0, 8),
        p('other', 0, 0, 2, { arrangementId: 'alt' }),
      ]),
    )!;
    expect(t.placements).toBe(1);
    expect(t.bars[0].fillsBar).toBe(true);
  });
});

describe('chordLabel', () => {
  it('renders a slash chord the way the grid does', () => {
    expect(
      chordLabel(p('x', 0, 0, 2, { chord: { function: '1', quality: 'maj', bass: '5' } })),
    ).toBe('1maj/5');
    expect(chordLabel(p('x', 0, 0, 2, { chord: { function: '5', quality: 'maj' } }))).toBe(
      '5maj',
    );
  });
});
