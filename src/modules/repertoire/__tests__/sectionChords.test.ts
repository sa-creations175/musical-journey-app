/**
 * Tests for the shared section-chord reader.
 *
 * The bug this module exists to kill: three call sites each decided
 * for themselves which chord-storage shape counted, and the readiness
 * classifier's list omitted `chordPlacements`. So the cases that
 * matter most here are the two storage shapes read in isolation —
 * a section stored ONLY as bar-anchored placements, and a section
 * stored ONLY in the legacy phrase maps — plus the guarantee that the
 * boolean is the list and not a second opinion about it.
 */
import { describe, expect, it } from 'vitest';
import type { ChordFunction, Song, SongSection } from '../../../lib/db';
import {
  mostCompleteArrangementId,
  readSectionChords,
  sectionHasChords,
} from '../sectionChords';

const song = (over: Partial<Song> = {}): Song => ({
  id: 'song-1',
  title: 'Test Song',
  artist: 'Test Artist',
  key: 'C',
  ...over,
} as Song);

const cf = (fn: string, quality = ''): ChordFunction => ({
  function: fn,
  quality,
});

const section = (over: Partial<SongSection> = {}): SongSection => ({
  id: 'sec-1',
  songId: 'song-1',
  name: 'Verse 1',
  order: 0,
  lyrics: '',
  ...over,
} as SongSection);

/** A section whose chords live ONLY in bar-anchored placements —
 *  what the lead-sheet editor writes today. */
const barGridOnly = (): SongSection =>
  section({
    // Present but empty: this is exactly the shape the seeder writes
    // and the shape the three invisible songs are in.
    phrases: [
      { id: 'p1', beats: [{ id: 'b1', type: 'blank' }], chordsByArrangement: { basic: {} } },
    ],
    chordPlacements: [
      { id: 'pl1', arrangementId: 'basic', barIndex: 0, beatPos: 0, beats: 4, chord: cf('1') },
      { id: 'pl2', arrangementId: 'basic', barIndex: 1, beatPos: 0, beats: 4, chord: cf('6', 'm7') },
      { id: 'pl3', arrangementId: 'basic', barIndex: 2, beatPos: 0, beats: 4, chord: cf('2', 'm7') },
      { id: 'pl4', arrangementId: 'basic', barIndex: 3, beatPos: 0, beats: 4, chord: cf('5', '7') },
    ],
  });

/** A section whose chords live ONLY in the pre-redesign phrase maps. */
const legacyOnly = (): SongSection =>
  section({
    phrases: [
      {
        id: 'p1',
        beats: [
          { id: 'b1', type: 'word', text: 'one' },
          { id: 'b2', type: 'word', text: 'two' },
        ],
        chordsByArrangement: { basic: { b1: cf('1'), b2: cf('4') } },
      },
    ],
    // The defining absence: never opened in the bar-grid editor.
  });

describe('readSectionChords — bar-anchored storage', () => {
  it('reads a section stored only in chordPlacements', () => {
    const chords = readSectionChords(song(), barGridOnly());
    expect(chords.map(c => c.function)).toEqual(['1', '6', '2', '5']);
  });

  it('is the exact case the old readiness classifier missed', () => {
    // Reproduces the retired private predicate: legacy fields only.
    const s = barGridOnly();
    const oldAnswer =
      (s.basicChords ?? '').trim() !== '' ||
      (s.alternateChords ?? '').trim() !== '' ||
      (s.phrases ?? []).some(
        p =>
          (p.chords ?? '').trim() !== '' ||
          Object.values(p.chordsByArrangement ?? {}).some(
            m => Object.keys(m).length > 0,
          ),
      );
    expect(oldAnswer).toBe(false);
    expect(sectionHasChords(song(), s)).toBe(true);
  });

  it('returns placements in bar order, not array order', () => {
    const s = section({
      chordPlacements: [
        { id: 'c', arrangementId: 'basic', barIndex: 2, beatPos: 0, beats: 4, chord: cf('5') },
        { id: 'a', arrangementId: 'basic', barIndex: 0, beatPos: 0, beats: 4, chord: cf('1') },
        { id: 'b', arrangementId: 'basic', barIndex: 1, beatPos: 0, beats: 4, chord: cf('4') },
      ],
    });
    expect(readSectionChords(song(), s).map(c => c.function)).toEqual(['1', '4', '5']);
  });

  it('an empty placements array is not chords', () => {
    const s = section({ chordPlacements: [] });
    expect(readSectionChords(song(), s)).toEqual([]);
    expect(sectionHasChords(song(), s)).toBe(false);
  });

  it('placements holding only blank chords are not chords', () => {
    const s = section({
      chordPlacements: [
        { id: 'pl1', arrangementId: 'basic', barIndex: 0, beatPos: 0, beats: 4, chord: cf('') },
      ],
    });
    expect(sectionHasChords(song(), s)).toBe(false);
  });
});

describe('readSectionChords — legacy phrase storage', () => {
  it('reads a section stored only in phrases[].chordsByArrangement', () => {
    const chords = readSectionChords(song(), legacyOnly());
    expect(chords.map(c => c.function)).toEqual(['1', '4']);
  });

  it('the old classifier and the reader agree here — this half never broke', () => {
    expect(sectionHasChords(song(), legacyOnly())).toBe(true);
  });

  it('a section with phrases but no chords has none', () => {
    const s = section({
      phrases: [
        {
          id: 'p1',
          beats: [{ id: 'b1', type: 'word', text: 'word' }],
          chordsByArrangement: { basic: {} },
        },
      ],
    });
    expect(readSectionChords(song(), s)).toEqual([]);
    expect(sectionHasChords(song(), s)).toBe(false);
  });

  it('reads the deprecated whole-line phrase chord string', () => {
    // No `beats`/`chordsByArrangement`, so normalizePhrase parses the
    // string onto beats and the bar grid picks it up.
    const s = section({ phrases: [{ id: 'p1', lyrics: 'a b', chords: '1 4' }] });
    expect(readSectionChords(song(), s).map(c => c.function)).toEqual(['1', '4']);
  });
});

describe('readSectionChords — precedence', () => {
  it('chordPlacements wins over legacy phrase maps', () => {
    // Both shapes populated with DIFFERENT chords. The bar grid is
    // what the user sees, so it must be what the reader returns.
    const s = section({
      phrases: [
        {
          id: 'p1',
          beats: [{ id: 'b1', type: 'word', text: 'x' }],
          chordsByArrangement: { basic: { b1: cf('7', 'm7b5') } },
        },
      ],
      chordPlacements: [
        { id: 'pl1', arrangementId: 'basic', barIndex: 0, beatPos: 0, beats: 4, chord: cf('1') },
      ],
    });
    expect(readSectionChords(song(), s).map(c => c.function)).toEqual(['1']);
  });

  it('an EMPTY chordPlacements array still wins — the section was cleared, not unmigrated', () => {
    // `chordPlacements: []` means the user deleted every chord in the
    // bar grid. Falling back to a stale phrase map would resurrect
    // chords they removed.
    const s = section({
      phrases: [
        {
          id: 'p1',
          beats: [{ id: 'b1', type: 'word', text: 'x' }],
          chordsByArrangement: { basic: { b1: cf('1') } },
        },
      ],
      chordPlacements: [],
    });
    expect(readSectionChords(song(), s)).toEqual([]);
    expect(sectionHasChords(song(), s)).toBe(false);
  });

  it('legacy token strings are consulted only when the grid is empty', () => {
    const s = section({
      basicChords: '1 4 5',
      phrases: [
        {
          id: 'p1',
          beats: [{ id: 'b1', type: 'word', text: 'x' }],
          chordsByArrangement: { basic: { b1: cf('2', 'm7') } },
        },
      ],
    });
    // Phrase map has a chord, so basicChords is never reached.
    expect(readSectionChords(song(), s).map(c => c.function)).toEqual(['2']);
  });

  it('reads basicChords when nothing else is charted', () => {
    const s = section({ basicChords: '1 4 5' });
    expect(readSectionChords(song(), s).map(c => c.function)).toEqual(['1', '4', '5']);
  });

  it('a migrated section never resurrects a deprecated token string', () => {
    // chordPlacements defined and empty = the user cleared the grid.
    // basicChords is ancient and nothing has written it in years;
    // putting those chords back on screen would contradict a delete.
    const s = section({ basicChords: '1 4 5', chordPlacements: [] });
    expect(readSectionChords(song(), s)).toEqual([]);
    expect(sectionHasChords(song(), s)).toBe(false);
  });

  it('reads alternateChords when nothing else is charted', () => {
    const s = section({ alternateChords: '2 5' });
    expect(sectionHasChords(song(), s)).toBe(true);
  });
});

describe('sectionHasChords is derived, not a second opinion', () => {
  const cases: Array<[string, SongSection]> = [
    ['bar-grid only', barGridOnly()],
    ['legacy only', legacyOnly()],
    ['empty section', section()],
    ['empty placements', section({ chordPlacements: [] })],
    ['blank phrases', section({ phrases: [{ id: 'p', beats: [], chordsByArrangement: { basic: {} } }] })],
    ['basicChords only', section({ basicChords: '1 5' })],
  ];

  it.each(cases)('%s: the boolean equals list-is-non-empty', (_label, s) => {
    expect(sectionHasChords(song(), s)).toBe(readSectionChords(song(), s).length > 0);
  });
});

describe('mostCompleteArrangementId — moved verbatim, behaviour pinned', () => {
  it('prefers the arrangement with the most charted chords', () => {
    const s = section({
      arrangements: [{ id: 'basic', name: 'Basic' }, { id: 'jazz', name: 'Jazz' }],
      chordPlacements: [
        { id: '1', arrangementId: 'basic', barIndex: 0, beatPos: 0, beats: 4, chord: cf('1') },
        { id: '2', arrangementId: 'jazz', barIndex: 0, beatPos: 0, beats: 4, chord: cf('1', 'maj9') },
        { id: '3', arrangementId: 'jazz', barIndex: 1, beatPos: 0, beats: 4, chord: cf('4', '13') },
      ],
    });
    expect(mostCompleteArrangementId(s)).toBe('jazz');
  });

  it('breaks ties to the earliest-created arrangement', () => {
    const s = section({
      arrangements: [{ id: 'basic', name: 'Basic' }, { id: 'jazz', name: 'Jazz' }],
      chordPlacements: [
        { id: '1', arrangementId: 'jazz', barIndex: 0, beatPos: 0, beats: 4, chord: cf('1') },
        { id: '2', arrangementId: 'basic', barIndex: 0, beatPos: 0, beats: 4, chord: cf('1') },
      ],
    });
    expect(mostCompleteArrangementId(s)).toBe('basic');
  });

  it('counts a blank unparsed chord as charted — NOT the isEmpty rule', () => {
    // The one input on which `isMeaningfulChord` and `isEmpty`
    // disagree. This test exists so a future tidy-up that "unifies"
    // the two predicates fails loudly instead of quietly changing
    // which arrangement the quiz reads.
    const blankUnparsed: ChordFunction = { function: '', quality: '', raw: '', unparsed: true };
    const s = section({
      arrangements: [{ id: 'basic', name: 'Basic' }, { id: 'alt', name: 'Alt' }],
      chordPlacements: [
        { id: '1', arrangementId: 'alt', barIndex: 0, beatPos: 0, beats: 4, chord: blankUnparsed },
      ],
    });
    expect(mostCompleteArrangementId(s)).toBe('alt');
  });
});
