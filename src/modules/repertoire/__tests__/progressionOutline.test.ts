import { describe, expect, it } from 'vitest';
import type { ChordPlacement, Song, SongSection } from '../../../lib/db';
import {
  buildSectionProgression,
  buildSongProgression,
  clearOrphanedHides,
  orphanedHides,
  tokenKey,
  toDetectChords,
} from '../progressionOutline';
import { BASIC_ARRANGEMENT_ID } from '../beatsModel';

const song = {
  id: 's1',
  title: 'Test',
  timeSignature: '4/4',
  key: 'C',
  eighths: false,
} as Song;

function p(
  id: string,
  barIndex: number,
  fn = '1',
  quality = 'maj',
): ChordPlacement {
  return {
    id,
    arrangementId: BASIC_ARRANGEMENT_ID,
    barIndex,
    beatPos: 0,
    beats: 4,
    chord: { function: fn, quality },
  } as ChordPlacement;
}

function section(
  id: string,
  order: number,
  placements: ChordPlacement[],
  overrides: Partial<SongSection> = {},
): SongSection {
  return {
    id,
    songId: 's1',
    name: id,
    order,
    lyrics: '',
    chordPlacements: placements,
    ...overrides,
  } as SongSection;
}

describe('buildSectionProgression', () => {
  it('returns one token per placement, in reading order', () => {
    const s = buildSectionProgression(
      song,
      section('verse', 0, [p('a', 0, '1'), p('b', 1, '5'), p('c', 2, '6')]),
    )!;
    expect(s.heading).toBe('verse');
    expect(s.order).toEqual(['a', 'b', 'c']);
    expect(s.phrases).toHaveLength(1);
    expect(s.phrases[0].tokens.map(t => t.chord.function)).toEqual(['1', '5', '6']);
  });

  it('returns null for a section with no chords', () => {
    expect(buildSectionProgression(song, section('empty', 0, []))).toBeNull();
  });

  it('keys tokens by (sectionId, placementId)', () => {
    const s = buildSectionProgression(song, section('verse', 0, [p('a', 0)]))!;
    expect(s.phrases[0].tokens[0].key).toBe('verse:a');
    expect(tokenKey('verse', 'a')).toBe('verse:a');
  });

  it('does not collide when two sections share a placement id', () => {
    const out = buildSongProgression(song, [
      section('verse', 0, [p('same', 0)]),
      section('refrain', 1, [p('same', 0)]),
    ]);
    const keys = out.flatMap(s => s.phrases.flatMap(f => f.tokens.map(t => t.key)));
    expect(keys).toEqual(['verse:same', 'refrain:same']);
    expect(new Set(keys).size).toBe(2);
  });
});

describe('hidden tokens are carried, not dropped', () => {
  const withHidden = () =>
    section('verse', 0, [p('a', 0, '1'), p('b', 1, '5'), p('c', 2, '6')], {
      sequenceView: { breaks: [], hidden: ['b'] },
    });

  it('keeps a hidden token in place, flagged', () => {
    const s = buildSectionProgression(song, withHidden())!;
    const tokens = s.phrases[0].tokens;
    expect(tokens.map(t => t.placementId)).toEqual(['a', 'b', 'c']);
    expect(tokens.map(t => t.hidden)).toEqual([false, true, false]);
    expect(s.hiddenCount).toBe(1);
  });

  it('leaves phrase boundaries identical whether or not a token is hidden', () => {
    // A break on a hidden token still breaks, by design — so building
    // with hiding off must not move any boundary.
    const base = section('verse', 0, [p('a', 0), p('b', 1), p('c', 2)], {
      sequenceView: {
        breaks: [{ afterPlacementId: 'b', kind: 'separator' }],
        hidden: [],
      },
    });
    const hiddenToo = section('verse', 0, [p('a', 0), p('b', 1), p('c', 2)], {
      sequenceView: {
        breaks: [{ afterPlacementId: 'b', kind: 'separator' }],
        hidden: ['b'],
      },
    });
    const shape = (s: SongSection) =>
      buildSectionProgression(song, s)!.phrases.map(f =>
        f.tokens.map(t => t.placementId).join(''),
      );
    expect(shape(hiddenToo)).toEqual(shape(base));
    expect(shape(base)).toEqual(['ab', 'c']);
  });

  it('carries phrase notes through', () => {
    const s = buildSectionProgression(
      song,
      section('verse', 0, [p('a', 0), p('b', 1)], {
        sequenceView: {
          breaks: [{ afterPlacementId: 'a', kind: 'row', note: 'intro' }],
          hidden: [],
          tailNote: 'turnaround',
        },
      }),
    )!;
    expect(s.phrases[0].note).toBe('intro');
    expect(s.phrases[0].endKind).toBe('row');
    expect(s.phrases[1].note).toBe('turnaround');
  });
});

describe('buildSongProgression', () => {
  it('walks sections in order', () => {
    const out = buildSongProgression(song, [
      section('refrain', 1, [p('b', 0)]),
      section('verse', 0, [p('a', 0)]),
    ]);
    expect(out.map(s => s.heading)).toEqual(['verse', 'refrain']);
  });

  it('EXCLUDES hidden sections, matching the lead sheet', () => {
    const out = buildSongProgression(song, [
      section('verse', 0, [p('a', 0)]),
      section('cut', 1, [p('b', 0)], { hidden: true }),
    ]);
    expect(out.map(s => s.heading)).toEqual(['verse']);
  });

  it('skips sections with no chords rather than printing an empty heading', () => {
    const out = buildSongProgression(song, [
      section('verse', 0, [p('a', 0)]),
      section('bridge', 1, []),
    ]);
    expect(out.map(s => s.heading)).toEqual(['verse']);
  });
});

describe('patterns are detected from the TRUE grid', () => {
  it('hiding a chord does not change what is detected', () => {
    // Otherwise a ii-V-I could be manufactured by hiding the chord in
    // between, and the app would be lying about the music.
    const chords = [p('a', 0, '2', 'm7'), p('b', 1, '4'), p('c', 2, '5', '7'), p('d', 3, '1')];
    const plain = buildSectionProgression(song, section('v', 0, chords))!;
    const hidden = buildSectionProgression(
      song,
      section('v', 0, chords, {
        sequenceView: { breaks: [], hidden: ['b'] },
      }),
    )!;
    expect(hidden.patterns).toEqual(plain.patterns);
  });

  it('toDetectChords drops unparsed and empty-function chords', () => {
    const out = toDetectChords([
      { chord: { function: '1', quality: 'maj' }, barIndex: 0 },
      { chord: { function: '', quality: '' }, barIndex: 1 },
      { chord: { function: '5', quality: '7', unparsed: true }, barIndex: 2 },
    ]);
    expect(out.map(c => c.degree)).toEqual(['1']);
  });

  it('marks minor without treating maj as minor', () => {
    const out = toDetectChords([
      { chord: { function: '2', quality: 'm7' }, barIndex: 0 },
      { chord: { function: '1', quality: 'maj7' }, barIndex: 1 },
    ]);
    expect(out.map(c => c.isMinor)).toEqual([true, false]);
  });
});

describe('orphaned hides — dead references only', () => {
  it('finds a hide naming a chord that no longer exists', () => {
    const s = section('v', 0, [p('a', 0)], {
      sequenceView: { breaks: [], hidden: ['a', 'gone'] },
    });
    expect(orphanedHides(s, ['a'])).toEqual(['gone']);
  });

  it('treats every hide as dead when the section has no chords left', () => {
    const s = section('v', 0, [], {
      sequenceView: { breaks: [], hidden: ['x', 'y'] },
    });
    expect(orphanedHides(s, [])).toEqual(['x', 'y']);
  });

  it('clears only the dead ids', () => {
    const s = section('v', 0, [p('a', 0)], {
      sequenceView: { breaks: [], hidden: ['a', 'gone'] },
    });
    expect(clearOrphanedHides(s, ['a'])!.sequenceView!.hidden).toEqual(['a']);
  });

  it('LEAVES ORPHANED BREAKS AND THEIR NOTES ALONE', () => {
    // buildPhrases already carries a dead break's note forward, so it
    // works as intended. Clearing it would destroy writing.
    const s = section('v', 0, [p('a', 0)], {
      sequenceView: {
        breaks: [{ afterPlacementId: 'gone', kind: 'separator', note: 'keep' }],
        hidden: ['dead'],
      },
    });
    const patch = clearOrphanedHides(s, ['a'])!;
    expect(patch.sequenceView!.hidden).toEqual([]);
    expect(patch.sequenceView!.breaks).toEqual([
      { afterPlacementId: 'gone', kind: 'separator', note: 'keep' },
    ]);
  });

  it('preserves the tail note', () => {
    const s = section('v', 0, [p('a', 0)], {
      sequenceView: { breaks: [], hidden: ['dead'], tailNote: 'coda' },
    });
    expect(clearOrphanedHides(s, ['a'])!.sequenceView!.tailNote).toBe('coda');
  });

  it('returns null when there is nothing dead, so no write happens', () => {
    const s = section('v', 0, [p('a', 0)], {
      sequenceView: { breaks: [], hidden: ['a'] },
    });
    expect(clearOrphanedHides(s, ['a'])).toBeNull();
    expect(clearOrphanedHides(section('v', 0, [p('a', 0)]), ['a'])).toBeNull();
  });
});
