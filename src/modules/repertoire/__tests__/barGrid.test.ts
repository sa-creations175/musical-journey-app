import { describe, expect, it } from 'vitest';
import type { ChordFunction, Phrase, SongSection } from '../../../lib/db';
import {
  autoHarmonicTag,
  deriveBarGrid,
  effectiveHarmonicTag,
  effectiveTimeSignature,
  isDominantQuality,
  parseTimeSignature,
  reorderChordPlacements,
} from '../barGrid';
import { BASIC_ARRANGEMENT_ID } from '../beatsModel';

function cf(fn: string, quality = '', extras: Partial<ChordFunction> = {}): ChordFunction {
  return { function: fn, quality, ...extras };
}

function mkSection(phrases: Phrase[], overrides: Partial<SongSection> = {}): SongSection {
  return {
    id: 'sec-1',
    songId: 'song-1',
    name: 'Verse',
    order: 0,
    lyrics: '',
    phrases,
    ...overrides,
  };
}

/** Build a phrase whose beats carry the supplied chord placements in
 *  order. Beats with `undefined` carry no chord; otherwise the chord
 *  occupies `beats` (or 1) of bar time. */
function phraseWithChords(
  chords: Array<ChordFunction | undefined>,
): Phrase {
  const beats = chords.map((_, i) => ({ id: `b${i}`, type: 'word' as const, text: '' }));
  const placements: Record<string, ChordFunction> = {};
  chords.forEach((c, i) => {
    if (c) placements[beats[i].id] = c;
  });
  return {
    id: 'p1',
    beats,
    chordsByArrangement: { [BASIC_ARRANGEMENT_ID]: placements },
  };
}

describe('parseTimeSignature', () => {
  it('defaults to 4/4 for empty / missing input', () => {
    expect(parseTimeSignature(undefined)).toEqual({ beatsPerBar: 4, beatUnit: 4 });
    expect(parseTimeSignature('')).toEqual({ beatsPerBar: 4, beatUnit: 4 });
    expect(parseTimeSignature(null)).toEqual({ beatsPerBar: 4, beatUnit: 4 });
  });

  it('parses common signatures', () => {
    expect(parseTimeSignature('4/4')).toEqual({ beatsPerBar: 4, beatUnit: 4 });
    expect(parseTimeSignature('3/4')).toEqual({ beatsPerBar: 3, beatUnit: 4 });
    expect(parseTimeSignature('6/8')).toEqual({ beatsPerBar: 6, beatUnit: 8 });
    expect(parseTimeSignature('12/8')).toEqual({ beatsPerBar: 12, beatUnit: 8 });
    expect(parseTimeSignature('5/4')).toEqual({ beatsPerBar: 5, beatUnit: 4 });
  });

  it('tolerates whitespace and falls back on garbage', () => {
    expect(parseTimeSignature('  6/8  ')).toEqual({ beatsPerBar: 6, beatUnit: 8 });
    expect(parseTimeSignature('common')).toEqual({ beatsPerBar: 4, beatUnit: 4 });
    expect(parseTimeSignature('4-4')).toEqual({ beatsPerBar: 4, beatUnit: 4 });
  });
});

describe('effectiveTimeSignature', () => {
  it('prefers the section override', () => {
    expect(
      effectiveTimeSignature({ timeSignature: '4/4' }, { timeSignature: '6/8' }),
    ).toBe('6/8');
  });

  it('falls back to the song-level value', () => {
    expect(effectiveTimeSignature({ timeSignature: '3/4' }, {})).toBe('3/4');
  });

  it('defaults to 4/4 when neither is set', () => {
    expect(effectiveTimeSignature(undefined, undefined)).toBe('4/4');
    expect(effectiveTimeSignature({}, {})).toBe('4/4');
  });

  it('ignores blank-string overrides', () => {
    expect(
      effectiveTimeSignature({ timeSignature: '3/4' }, { timeSignature: '   ' }),
    ).toBe('3/4');
  });
});

describe('deriveBarGrid — backward-compat defaults', () => {
  it('returns an empty grid when the section has no chords', () => {
    const section = mkSection([]);
    expect(deriveBarGrid(section, BASIC_ARRANGEMENT_ID, 4)).toEqual([]);
  });

  it('treats chords with no beats field as 1 beat each', () => {
    // 8 chords, all default-1-beat, in 4/4 → exactly 2 bars of 4.
    const section = mkSection([
      phraseWithChords([
        cf('1'), cf('4'), cf('5'), cf('6'),
        cf('1'), cf('4'), cf('5'), cf('6'),
      ]),
    ]);
    const bars = deriveBarGrid(section, BASIC_ARRANGEMENT_ID, 4);
    expect(bars).toHaveLength(2);
    expect(bars[0].cells).toHaveLength(4);
    expect(bars[1].cells).toHaveLength(4);
    expect(bars[0].cells.every(c => c.beats === 1)).toBe(true);
  });

  it('skips placements that are entirely empty (no function, no raw)', () => {
    const section = mkSection([
      phraseWithChords([cf('1'), cf(''), cf('5')]),
    ]);
    const bars = deriveBarGrid(section, BASIC_ARRANGEMENT_ID, 4);
    expect(bars).toHaveLength(1);
    expect(bars[0].cells.map(c => c.chord.function)).toEqual(['1', '5']);
  });

  it('keeps unparsed placements so the user sees what they typed', () => {
    const unparsed: ChordFunction = { function: '', quality: '', raw: 'huh?', unparsed: true };
    const section = mkSection([phraseWithChords([cf('1'), unparsed])]);
    const bars = deriveBarGrid(section, BASIC_ARRANGEMENT_ID, 4);
    expect(bars[0].cells).toHaveLength(2);
    expect(bars[0].cells[1].chord.unparsed).toBe(true);
  });
});

describe('deriveBarGrid — multi-beat chords', () => {
  it('packs two 2-beat chords into one 4/4 bar', () => {
    const section = mkSection([
      phraseWithChords([cf('1', '', { beats: 2 }), cf('5', '', { beats: 2 })]),
    ]);
    const bars = deriveBarGrid(section, BASIC_ARRANGEMENT_ID, 4);
    expect(bars).toHaveLength(1);
    expect(bars[0].cells).toHaveLength(2);
    expect(bars[0].cells.map(c => c.beats)).toEqual([2, 2]);
  });

  it('starts a new bar when a chord would overflow', () => {
    // 2 + 2 fills bar 1. The next 3-beat chord would overflow remaining
    // capacity (0) of bar 1 → starts bar 2; only 3 of 4 beats consumed.
    const section = mkSection([
      phraseWithChords([
        cf('1', '', { beats: 2 }),
        cf('5', '', { beats: 2 }),
        cf('4', '', { beats: 3 }),
      ]),
    ]);
    const bars = deriveBarGrid(section, BASIC_ARRANGEMENT_ID, 4);
    expect(bars).toHaveLength(2);
    expect(bars[0].cells.map(c => c.beats)).toEqual([2, 2]);
    expect(bars[1].cells.map(c => c.beats)).toEqual([3]);
  });

  it('splits a chord with tie flags when it overflows the bar', () => {
    // Bar 1 has 2 beats remaining after a 2-beat chord; a 3-beat
    // chord then takes the remaining 2 + 1 in the next bar.
    const section = mkSection([
      phraseWithChords([
        cf('1', '', { beats: 2 }),
        cf('5', '', { beats: 3 }),
      ]),
    ]);
    const bars = deriveBarGrid(section, BASIC_ARRANGEMENT_ID, 4);
    expect(bars).toHaveLength(2);
    expect(bars[0].cells).toHaveLength(2);
    expect(bars[0].cells[1]).toMatchObject({ beats: 2, tiedToNext: true });
    expect(bars[0].cells[1].tiedFromPrev).toBeUndefined();
    expect(bars[1].cells).toHaveLength(1);
    expect(bars[1].cells[0]).toMatchObject({
      beats: 1,
      tiedFromPrev: true,
    });
    expect(bars[1].cells[0].tiedToNext).toBeUndefined();
  });

  it('respects different time signatures', () => {
    // 3/4: 6 single-beat chords → 2 bars of 3.
    const section = mkSection([
      phraseWithChords([cf('1'), cf('4'), cf('5'), cf('1'), cf('4'), cf('5')]),
    ]);
    const bars = deriveBarGrid(section, BASIC_ARRANGEMENT_ID, 3);
    expect(bars).toHaveLength(2);
    expect(bars[0].cells).toHaveLength(3);
    expect(bars[1].cells).toHaveLength(3);
  });
});

describe('deriveBarGrid — multi-phrase sections', () => {
  it('concatenates chord placements in phrase order', () => {
    const section = mkSection([
      phraseWithChords([cf('1', '', { beats: 4 })]),
      phraseWithChords([cf('4', '', { beats: 4 })]),
      phraseWithChords([cf('5', '', { beats: 4 })]),
    ]);
    const bars = deriveBarGrid(section, BASIC_ARRANGEMENT_ID, 4);
    expect(bars).toHaveLength(3);
    expect(bars.map(b => b.cells[0].chord.function)).toEqual(['1', '4', '5']);
    expect(bars.every(b => b.cells.length === 1 && b.cells[0].beats === 4)).toBe(true);
  });

  it('only reads the active arrangement', () => {
    const beats = [
      { id: 'b0', type: 'word' as const, text: '' },
      { id: 'b1', type: 'word' as const, text: '' },
    ];
    const phrase: Phrase = {
      id: 'p1',
      beats,
      chordsByArrangement: {
        [BASIC_ARRANGEMENT_ID]: { b0: cf('1') },
        alt: { b1: cf('7') },
      },
    };
    const section = mkSection([phrase]);
    const basic = deriveBarGrid(section, BASIC_ARRANGEMENT_ID, 4);
    const alt = deriveBarGrid(section, 'alt', 4);
    expect(basic[0].cells.map(c => c.chord.function)).toEqual(['1']);
    expect(alt[0].cells.map(c => c.chord.function)).toEqual(['7']);
  });
});

describe('deriveBarGrid — source ids (for editor write-back)', () => {
  it('attaches phraseId + beatId from the originating placement', () => {
    const phrase: Phrase = {
      id: 'phr-A',
      beats: [
        { id: 'beat-x', type: 'word', text: '' },
        { id: 'beat-y', type: 'word', text: '' },
      ],
      chordsByArrangement: {
        [BASIC_ARRANGEMENT_ID]: {
          'beat-x': cf('1'),
          'beat-y': cf('5'),
        },
      },
    };
    const bars = deriveBarGrid(mkSection([phrase]), BASIC_ARRANGEMENT_ID, 4);
    expect(bars[0].cells[0]).toMatchObject({ phraseId: 'phr-A', beatId: 'beat-x' });
    expect(bars[0].cells[1]).toMatchObject({ phraseId: 'phr-A', beatId: 'beat-y' });
  });

  it('shares phraseId + beatId across both halves of a tie-split chord', () => {
    // Bar 1: A(2) fills 2/4. Bar then accepts B(3) which spills 2 + 1.
    const phrase: Phrase = {
      id: 'phr-1',
      beats: [
        { id: 'b-a', type: 'word', text: '' },
        { id: 'b-b', type: 'word', text: '' },
      ],
      chordsByArrangement: {
        [BASIC_ARRANGEMENT_ID]: {
          'b-a': cf('1', '', { beats: 2 }),
          'b-b': cf('5', '', { beats: 3 }),
        },
      },
    };
    const bars = deriveBarGrid(mkSection([phrase]), BASIC_ARRANGEMENT_ID, 4);
    expect(bars).toHaveLength(2);
    // First half of B in bar 1 + second half in bar 2 both reference b-b.
    const splitFirst = bars[0].cells[1];
    const splitSecond = bars[1].cells[0];
    expect(splitFirst).toMatchObject({ phraseId: 'phr-1', beatId: 'b-b', tiedToNext: true });
    expect(splitSecond).toMatchObject({ phraseId: 'phr-1', beatId: 'b-b', tiedFromPrev: true });
  });

  it('preserves phraseId across multi-phrase sections', () => {
    const section = mkSection([
      { ...phraseWithChords([cf('1')]), id: 'phr-1' },
      { ...phraseWithChords([cf('5')]), id: 'phr-2' },
    ]);
    const bars = deriveBarGrid(section, BASIC_ARRANGEMENT_ID, 4);
    expect(bars[0].cells[0].phraseId).toBe('phr-1');
    expect(bars[0].cells[1].phraseId).toBe('phr-2');
  });
});

describe('deriveBarGrid — edge cases', () => {
  it('coerces fractional / non-finite beat counts to >= 1', () => {
    const section = mkSection([
      phraseWithChords([
        cf('1', '', { beats: 0 }),
        cf('4', '', { beats: -3 }),
        cf('5', '', { beats: 1.4 }),
        cf('6', '', { beats: 1.6 }),
      ]),
    ]);
    const bars = deriveBarGrid(section, BASIC_ARRANGEMENT_ID, 4);
    // 0 → 1, -3 → 1, 1.4 → 1, 1.6 → 2 → total 5 beats → bar 1 full (4) + bar 2 (1)
    expect(bars).toHaveLength(2);
    expect(bars[0].cells.map(c => c.beats).reduce((a, b) => a + b, 0)).toBe(4);
    expect(bars[1].cells.map(c => c.beats).reduce((a, b) => a + b, 0)).toBe(1);
  });

  it('returns an empty grid for non-positive beatsPerBar', () => {
    const section = mkSection([phraseWithChords([cf('1')])]);
    expect(deriveBarGrid(section, BASIC_ARRANGEMENT_ID, 0)).toEqual([]);
    expect(deriveBarGrid(section, BASIC_ARRANGEMENT_ID, -2)).toEqual([]);
  });
});

describe('deriveBarGrid — section.barCount padding', () => {
  it('pads with empty bars when barCount exceeds the chord-derived count', () => {
    const section = mkSection(
      [phraseWithChords([cf('1', '', { beats: 4 }), cf('5', '', { beats: 4 })])],
      { barCount: 5 },
    );
    const bars = deriveBarGrid(section, BASIC_ARRANGEMENT_ID, 4);
    expect(bars).toHaveLength(5);
    expect(bars[0].cells).toHaveLength(1);
    expect(bars[1].cells).toHaveLength(1);
    for (let i = 2; i < 5; i++) {
      expect(bars[i]).toMatchObject({ index: i, cells: [], isEmpty: true });
    }
  });

  it('returns N empty bars when there are no chords but barCount is set', () => {
    const section = mkSection([], { barCount: 3 });
    const bars = deriveBarGrid(section, BASIC_ARRANGEMENT_ID, 4);
    expect(bars).toHaveLength(3);
    expect(bars.every(b => b.isEmpty && b.cells.length === 0)).toBe(true);
    expect(bars.map(b => b.index)).toEqual([0, 1, 2]);
  });

  it('ignores barCount when it is less than the chord-derived count', () => {
    const section = mkSection(
      [phraseWithChords([cf('1'), cf('4'), cf('5'), cf('6')])],
      { barCount: 0 },
    );
    const bars = deriveBarGrid(section, BASIC_ARRANGEMENT_ID, 4);
    expect(bars).toHaveLength(1);
    expect(bars[0].cells).toHaveLength(4);
  });

  it('barCount = undefined keeps the chord-derived count unchanged', () => {
    const section = mkSection([phraseWithChords([cf('1')])]);
    const bars = deriveBarGrid(section, BASIC_ARRANGEMENT_ID, 4);
    expect(bars).toHaveLength(1);
  });

  it('returns [] when no chords AND no barCount', () => {
    expect(deriveBarGrid(mkSection([]), BASIC_ARRANGEMENT_ID, 4)).toEqual([]);
  });
});

describe('reorderChordPlacements', () => {
  // Drag-to-reorder helper. Slot anchors (phrase + beat) stay put;
  // only which chord lives at each slot changes. Returns null for
  // no-op moves so the caller can skip the Dexie commit.
  function chordSequenceFor(
    next: Phrase[],
    arrId: string,
  ): string[] {
    const out: string[] = [];
    for (const p of next) {
      const placements = p.chordsByArrangement?.[arrId] ?? {};
      for (const beat of p.beats ?? []) {
        const c = placements[beat.id];
        if (c) out.push(c.function);
      }
    }
    return out;
  }

  it('reorders chords within a single phrase', () => {
    const section = mkSection([
      phraseWithChords([cf('1'), cf('4'), cf('5'), cf('6')]),
    ]);
    const next = reorderChordPlacements(section, BASIC_ARRANGEMENT_ID, 0, 2);
    expect(next).not.toBeNull();
    expect(chordSequenceFor(next!, BASIC_ARRANGEMENT_ID)).toEqual(['4', '5', '1', '6']);
  });

  it('reorders chords across phrases — chord values move, slots stay put', () => {
    const section = mkSection([
      { ...phraseWithChords([cf('1'), cf('4')]), id: 'phr-A' },
      { ...phraseWithChords([cf('5'), cf('6')]), id: 'phr-B' },
    ]);
    // Move document index 0 (1) to index 3 → expected ['4','5','6','1'].
    const next = reorderChordPlacements(section, BASIC_ARRANGEMENT_ID, 0, 3);
    expect(next).not.toBeNull();
    expect(chordSequenceFor(next!, BASIC_ARRANGEMENT_ID)).toEqual(['4', '5', '6', '1']);
    // Phrase ids should be preserved; the 1 chord now lives on phr-B.
    const phrB = next!.find(p => p.id === 'phr-B')!;
    const phrBPlacements = phrB.chordsByArrangement?.[BASIC_ARRANGEMENT_ID] ?? {};
    expect(phrBPlacements[phrB.beats![1].id].function).toBe('1');
  });

  it('preserves chord metadata (beats, harmonicTag, quality) on the moved chord', () => {
    const section = mkSection([
      phraseWithChords([
        cf('1', 'maj7', { beats: 2, harmonicTag: 'pedal' }),
        cf('5', '7'),
      ]),
    ]);
    const next = reorderChordPlacements(section, BASIC_ARRANGEMENT_ID, 0, 1);
    const placements = next![0].chordsByArrangement?.[BASIC_ARRANGEMENT_ID] ?? {};
    const beatIds = next![0].beats!.map(b => b.id);
    // The 1maj7 chord (with beats=2, harmonicTag=pedal) now sits at slot 1.
    expect(placements[beatIds[1]]).toMatchObject({
      function: '1',
      quality: 'maj7',
      beats: 2,
      harmonicTag: 'pedal',
    });
    expect(placements[beatIds[0]]).toMatchObject({ function: '5', quality: '7' });
  });

  it('returns null for no-op moves (same index, out of range, empty section)', () => {
    const section = mkSection([phraseWithChords([cf('1'), cf('4')])]);
    expect(reorderChordPlacements(section, BASIC_ARRANGEMENT_ID, 0, 0)).toBeNull();
    expect(reorderChordPlacements(section, BASIC_ARRANGEMENT_ID, -1, 1)).toBeNull();
    expect(reorderChordPlacements(section, BASIC_ARRANGEMENT_ID, 0, 99)).toBeNull();
    expect(reorderChordPlacements(mkSection([]), BASIC_ARRANGEMENT_ID, 0, 1)).toBeNull();
  });

  it('only rewrites the active arrangement; other arrangements untouched', () => {
    const beats = [
      { id: 'b0', type: 'word' as const, text: '' },
      { id: 'b1', type: 'word' as const, text: '' },
    ];
    const phrase: Phrase = {
      id: 'p1',
      beats,
      chordsByArrangement: {
        [BASIC_ARRANGEMENT_ID]: { b0: cf('1'), b1: cf('5') },
        alt: { b0: cf('2'), b1: cf('7') },
      },
    };
    const next = reorderChordPlacements(mkSection([phrase]), BASIC_ARRANGEMENT_ID, 0, 1);
    const placements = next![0].chordsByArrangement?.alt ?? {};
    expect(placements.b0.function).toBe('2');
    expect(placements.b1.function).toBe('7');
  });
});

describe('isDominantQuality', () => {
  it('detects bare dominant extensions', () => {
    expect(isDominantQuality('7')).toBe(true);
    expect(isDominantQuality('9')).toBe(true);
    expect(isDominantQuality('11')).toBe(true);
    expect(isDominantQuality('13')).toBe(true);
  });

  it('detects explicit `dom` prefix forms', () => {
    expect(isDominantQuality('dom7')).toBe(true);
    expect(isDominantQuality('dom9')).toBe(true);
    expect(isDominantQuality('dom13')).toBe(true);
    expect(isDominantQuality('dom9(13)')).toBe(true);
    expect(isDominantQuality('Dom7')).toBe(true);
  });

  it('detects dominants with altered/added tones', () => {
    expect(isDominantQuality('7b9')).toBe(true);
    expect(isDominantQuality('7#5')).toBe(true);
    expect(isDominantQuality('9(13)')).toBe(true);
    expect(isDominantQuality('7sus4')).toBe(true);
    expect(isDominantQuality('13b9')).toBe(true);
  });

  it('rejects major-seventh family', () => {
    expect(isDominantQuality('maj7')).toBe(false);
    expect(isDominantQuality('maj9')).toBe(false);
    expect(isDominantQuality('maj13')).toBe(false);
    expect(isDominantQuality('Maj7')).toBe(false);
  });

  it('rejects minor family', () => {
    expect(isDominantQuality('m')).toBe(false);
    expect(isDominantQuality('m7')).toBe(false);
    expect(isDominantQuality('m9')).toBe(false);
    expect(isDominantQuality('m11')).toBe(false);
    expect(isDominantQuality('min7')).toBe(false);
  });

  it('rejects diminished / half-diminished / augmented', () => {
    expect(isDominantQuality('dim')).toBe(false);
    expect(isDominantQuality('dim7')).toBe(false);
    expect(isDominantQuality('m7b5')).toBe(false);
    expect(isDominantQuality('aug')).toBe(false);
    expect(isDominantQuality('aug7')).toBe(false);
  });

  it('rejects empty / triad qualities', () => {
    expect(isDominantQuality('')).toBe(false);
    expect(isDominantQuality('sus4')).toBe(false);
    expect(isDominantQuality('add9')).toBe(false);
  });
});

describe('autoHarmonicTag', () => {
  it('tags dominant chords on degrees other than 5 as secondary dominants', () => {
    expect(autoHarmonicTag(cf('1', '7'))).toBe('secondary_dominant');
    expect(autoHarmonicTag(cf('2', '7'))).toBe('secondary_dominant');
    expect(autoHarmonicTag(cf('6', '9'))).toBe('secondary_dominant');
    expect(autoHarmonicTag(cf('3', '13b9'))).toBe('secondary_dominant');
  });

  it('does NOT tag the diatonic V (literal "5")', () => {
    expect(autoHarmonicTag(cf('5', '7'))).toBeUndefined();
    expect(autoHarmonicTag(cf('5', '9'))).toBeUndefined();
    expect(autoHarmonicTag(cf('5', '13b9'))).toBeUndefined();
  });

  it('tags altered fifths (b5/#5) as secondary dominants', () => {
    expect(autoHarmonicTag(cf('b5', '7'))).toBe('secondary_dominant');
    expect(autoHarmonicTag(cf('#5', '7'))).toBe('secondary_dominant');
  });

  it('does not tag non-dominant qualities', () => {
    expect(autoHarmonicTag(cf('2', 'm7'))).toBeUndefined();
    expect(autoHarmonicTag(cf('1', 'maj7'))).toBeUndefined();
    expect(autoHarmonicTag(cf('7', 'm7b5'))).toBeUndefined();
  });

  it('returns undefined for unparsed chords', () => {
    expect(autoHarmonicTag({ function: '', quality: '', raw: '?', unparsed: true })).toBeUndefined();
  });

  describe('secondary ii (minor on degree 5)', () => {
    it('tags minor v as secondary_ii', () => {
      expect(autoHarmonicTag(cf('5', 'm'))).toBe('secondary_ii');
      expect(autoHarmonicTag(cf('5', 'm7'))).toBe('secondary_ii');
      expect(autoHarmonicTag(cf('5', 'm9'))).toBe('secondary_ii');
      expect(autoHarmonicTag(cf('5', 'min7'))).toBe('secondary_ii');
    });

    it('does NOT apply to altered fifths (those are borrowed/secondary dom)', () => {
      // b5m7 is a minor on altered fifth — not the diatonic V acting as ii.
      expect(autoHarmonicTag(cf('b5', 'm7'))).toBe('borrowed');
    });
  });

  describe('borrowed (diatonic quality mismatch)', () => {
    it('tags minor i / iv / v-when-not-on-5 as borrowed', () => {
      expect(autoHarmonicTag(cf('1', 'm'))).toBe('borrowed');
      expect(autoHarmonicTag(cf('1', 'm7'))).toBe('borrowed');
      expect(autoHarmonicTag(cf('4', 'm'))).toBe('borrowed');
      expect(autoHarmonicTag(cf('4', 'm7'))).toBe('borrowed');
    });

    it('tags major II / III / VI as borrowed', () => {
      expect(autoHarmonicTag(cf('2', 'maj7'))).toBe('borrowed');
      expect(autoHarmonicTag(cf('3', 'maj'))).toBe('borrowed');
      expect(autoHarmonicTag(cf('6', 'maj7'))).toBe('borrowed');
    });

    it('tags minor or major on degree 7 (not dim/half-dim) as borrowed', () => {
      expect(autoHarmonicTag(cf('7', 'm7'))).toBe('borrowed');
      expect(autoHarmonicTag(cf('7', 'maj7'))).toBe('borrowed');
    });

    it('tags any chord on an altered degree as borrowed (when not secondary dom)', () => {
      expect(autoHarmonicTag(cf('b3', 'maj7'))).toBe('borrowed');
      expect(autoHarmonicTag(cf('b6', 'maj7'))).toBe('borrowed');
      expect(autoHarmonicTag(cf('b7', 'maj7'))).toBe('borrowed');
      expect(autoHarmonicTag(cf('b2', 'maj7'))).toBe('borrowed');
      expect(autoHarmonicTag(cf('#4', 'm7b5'))).toBe('borrowed');
    });

    it('still prefers secondary_dominant when both rules could apply', () => {
      // b7dom7 (backdoor dom) is on altered degree AND dominant — rule 1
      // wins (we don't try to disambiguate backdoor vs secondary).
      expect(autoHarmonicTag(cf('b7', 'dom7'))).toBe('secondary_dominant');
      expect(autoHarmonicTag(cf('b5', 'dom7'))).toBe('secondary_dominant');
    });

    it('augmented quality counts as a mismatch on any natural degree', () => {
      expect(autoHarmonicTag(cf('1', 'aug'))).toBe('borrowed');
      expect(autoHarmonicTag(cf('5', 'aug'))).toBe('borrowed');
    });
  });

  describe('non-flagging cases', () => {
    it('bare V triad on degree 5 stays diatonic', () => {
      expect(autoHarmonicTag(cf('5', ''))).toBeUndefined();
      expect(autoHarmonicTag(cf('5', 'maj'))).toBeUndefined();
    });

    it('sus chords are skipped (ambiguous)', () => {
      expect(autoHarmonicTag(cf('1', 'sus4'))).toBeUndefined();
      expect(autoHarmonicTag(cf('5', 'sus4'))).toBeUndefined();
      expect(autoHarmonicTag(cf('4', 'sus2'))).toBeUndefined();
    });

    it('diatonic chords return no tag', () => {
      expect(autoHarmonicTag(cf('1', ''))).toBeUndefined();
      expect(autoHarmonicTag(cf('1', 'maj7'))).toBeUndefined();
      expect(autoHarmonicTag(cf('2', 'm7'))).toBeUndefined();
      expect(autoHarmonicTag(cf('4', '6'))).toBeUndefined();
      expect(autoHarmonicTag(cf('6', 'm7'))).toBeUndefined();
      expect(autoHarmonicTag(cf('7', 'dim'))).toBeUndefined();
      expect(autoHarmonicTag(cf('7', 'm7b5'))).toBeUndefined();
    });
  });
});

describe('effectiveHarmonicTag', () => {
  it('uses the manual tag when set', () => {
    expect(effectiveHarmonicTag(cf('2', '7', { harmonicTag: 'borrowed' }))).toBe('borrowed');
  });

  it('manual tag overrides auto detection', () => {
    // 2(7) auto-detects as secondary_dominant but manual passing wins.
    expect(effectiveHarmonicTag(cf('2', '7', { harmonicTag: 'passing' }))).toBe('passing');
  });

  it('falls back to auto when no manual tag', () => {
    expect(effectiveHarmonicTag(cf('2', '7'))).toBe('secondary_dominant');
  });

  it('empty-string manual tag suppresses auto detection', () => {
    expect(effectiveHarmonicTag(cf('2', '7', { harmonicTag: '' }))).toBeUndefined();
  });

  it('returns undefined when no tag applies', () => {
    expect(effectiveHarmonicTag(cf('1', 'maj7'))).toBeUndefined();
  });
});
