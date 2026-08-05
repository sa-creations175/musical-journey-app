import { describe, expect, it } from 'vitest';
import type { LyricLine, SongLyricLine } from '../../../lib/db';
import { distributedWordPositions } from '../lyricLine';
import {
  anchorToGlobal,
  buildBeatAxis,
  buildCellIndex,
  canJoinNext,
  cellKey,
  foldSectionLyrics,
  globalToCell,
  joinSyllables,
  lineStatus,
  linesFromParsedRows,
  normalizeCellOrders,
  placeSyllable,
  placedSyllablesInBar,
  provisionalPlacements,
  remapAnchorBars,
  setCellOrder,
  setSyllableText,
  shiftAnchorsAfterBarDelete,
  splitSyllable,
  syllablesFromText,
  unplaceSyllable,
} from '../lyricSyllables';

// Deterministic ids so assertions can name syllables directly.
function seqIds(prefix = 'id') {
  let n = 0;
  return () => `${prefix}${n++}`;
}

const SEC = 'sec-a';

function line(
  id: string,
  syllables: Array<{ id: string; text: string; at?: [number, number, number] }>,
): SongLyricLine {
  return {
    id,
    kind: 'lyric',
    text: syllables.map(s => s.text).join(' '),
    syllables: syllables.map(s => ({
      id: s.id,
      text: s.text,
      ...(s.at
        ? {
            anchor: {
              sectionId: SEC,
              barIndex: s.at[0],
              beatPos: s.at[1],
              order: s.at[2],
            },
          }
        : {}),
    })),
  };
}

function anchorOf(lines: SongLyricLine[], id: string) {
  for (const l of lines) {
    const s = (l.syllables ?? []).find(x => x.id === id);
    if (s) return s.anchor;
  }
  return undefined;
}

const axis4 = buildBeatAxis([{ sectionId: SEC, beatsPerBar: 4, barCount: 4 }]);

// --- construction -----------------------------------------------------

describe('syllablesFromText', () => {
  it('splits on whitespace, keeping attached punctuation', () => {
    expect(syllablesFromText("yeah, don't stop", seqIds()).map(s => s.text)).toEqual([
      'yeah,',
      "don't",
      'stop',
    ]);
  });

  it('drops empty tokens and yields nothing for blank input', () => {
    expect(syllablesFromText('   ', seqIds())).toEqual([]);
    expect(syllablesFromText('', seqIds())).toEqual([]);
  });
});

describe('linesFromParsedRows', () => {
  it('gives headers no syllables and lyric rows one per word', () => {
    const lines = linesFromParsedRows(
      [
        { kind: 'header', text: 'Verse 1' },
        { kind: 'lyric', text: 'O come all' },
      ],
      seqIds(),
    );
    expect(lines[0].kind).toBe('header');
    expect(lines[0].syllables).toBeUndefined();
    expect(lines[1].syllables?.map(s => s.text)).toEqual(['O', 'come', 'all']);
    expect(lines[1].syllables?.every(s => s.anchor === undefined)).toBe(true);
  });
});

describe('lineStatus', () => {
  it('reports header, unplaced, partial, and placed', () => {
    expect(lineStatus({ id: 'h', kind: 'header', text: 'Verse 1' }).status).toBe('header');
    expect(lineStatus(line('l', [{ id: 'a', text: 'x' }])).status).toBe('unplaced');
    expect(
      lineStatus(line('l', [{ id: 'a', text: 'x', at: [0, 0, 0] }, { id: 'b', text: 'y' }])),
    ).toEqual({ status: 'partial', placed: 1, total: 2 });
    expect(
      lineStatus(line('l', [{ id: 'a', text: 'x', at: [0, 0, 0] }])).status,
    ).toBe('placed');
  });
});

// --- placement (the no-ripple rule) -----------------------------------

describe('placeSyllable', () => {
  it('appends to the target cell without displacing what is there', () => {
    const lines = [
      line('l1', [
        { id: 'a', text: 'A', at: [0, 0, 0] },
        { id: 'b', text: 'B', at: [0, 0, 1] },
      ]),
      line('l2', [{ id: 'c', text: 'C' }]),
    ];
    const next = placeSyllable(lines, 'c', { sectionId: SEC, barIndex: 0, beatPos: 0 });
    expect(anchorOf(next, 'c')?.order).toBe(2);
    // Neighbours untouched — the whole point of §C.
    expect(anchorOf(next, 'a')).toEqual(anchorOf(lines, 'a'));
    expect(anchorOf(next, 'b')).toEqual(anchorOf(lines, 'b'));
  });

  it('moves only the dragged syllable when re-placing across cells', () => {
    const lines = [
      line('l1', [
        { id: 'a', text: 'A', at: [0, 0, 0] },
        { id: 'b', text: 'B', at: [0, 1, 0] },
        { id: 'c', text: 'C', at: [0, 2, 0] },
      ]),
    ];
    const next = placeSyllable(lines, 'b', { sectionId: SEC, barIndex: 3, beatPos: 3 });
    expect(anchorOf(next, 'b')).toEqual({
      sectionId: SEC, barIndex: 3, beatPos: 3, order: 0,
    });
    expect(anchorOf(next, 'a')).toEqual(anchorOf(lines, 'a'));
    expect(anchorOf(next, 'c')).toEqual(anchorOf(lines, 'c'));
  });

  it('compacts the cell a syllable left, preserving relative order', () => {
    const lines = [
      line('l1', [
        { id: 'a', text: 'A', at: [0, 0, 0] },
        { id: 'b', text: 'B', at: [0, 0, 1] },
        { id: 'c', text: 'C', at: [0, 0, 2] },
      ]),
    ];
    const next = placeSyllable(lines, 'a', { sectionId: SEC, barIndex: 1, beatPos: 0 });
    expect(anchorOf(next, 'b')?.order).toBe(0);
    expect(anchorOf(next, 'c')?.order).toBe(1);
  });

  it('places into a cell in another section', () => {
    const lines = [line('l1', [{ id: 'a', text: 'A' }])];
    const next = placeSyllable(lines, 'a', {
      sectionId: 'sec-b', barIndex: 2, beatPos: 1,
    });
    expect(anchorOf(next, 'a')?.sectionId).toBe('sec-b');
  });

  it('is a no-op for an unknown syllable id', () => {
    const lines = [line('l1', [{ id: 'a', text: 'A', at: [0, 0, 0] }])];
    const next = placeSyllable(lines, 'nope', { sectionId: SEC, barIndex: 1, beatPos: 1 });
    expect(next).toEqual(lines);
  });
});

describe('unplaceSyllable', () => {
  it('clears the anchor and compacts the vacated cell', () => {
    const lines = [
      line('l1', [
        { id: 'a', text: 'A', at: [0, 0, 0] },
        { id: 'b', text: 'B', at: [0, 0, 1] },
      ]),
    ];
    const next = unplaceSyllable(lines, 'a');
    expect(anchorOf(next, 'a')).toBeUndefined();
    expect(anchorOf(next, 'b')?.order).toBe(0);
  });
});

describe('normalizeCellOrders', () => {
  it('compacts gaps while preserving relative order', () => {
    const lines = [
      line('l1', [
        { id: 'a', text: 'A', at: [0, 0, 5] },
        { id: 'b', text: 'B', at: [0, 0, 9] },
      ]),
    ];
    const next = normalizeCellOrders(lines);
    expect(anchorOf(next, 'a')?.order).toBe(0);
    expect(anchorOf(next, 'b')?.order).toBe(1);
  });

  it('breaks duplicate orders deterministically by id', () => {
    const lines = [
      line('l1', [{ id: 'zz', text: 'Z', at: [0, 0, 0] }]),
      line('l2', [{ id: 'aa', text: 'A', at: [0, 0, 0] }]),
    ];
    const next = normalizeCellOrders(lines);
    expect(anchorOf(next, 'aa')?.order).toBe(0);
    expect(anchorOf(next, 'zz')?.order).toBe(1);
  });

  it('leaves cells in different sections independent', () => {
    const lines = [
      line('l1', [{ id: 'a', text: 'A', at: [0, 0, 0] }]),
      {
        id: 'l2',
        kind: 'lyric' as const,
        text: 'B',
        syllables: [
          { id: 'b', text: 'B', anchor: { sectionId: 'sec-b', barIndex: 0, beatPos: 0, order: 0 } },
        ],
      },
    ];
    const next = normalizeCellOrders(lines);
    expect(anchorOf(next, 'a')?.order).toBe(0);
    expect(anchorOf(next, 'b')?.order).toBe(0);
  });
});

describe('setCellOrder', () => {
  it('applies the requested sequence', () => {
    const lines = [
      line('l1', [
        { id: 'a', text: 'A', at: [0, 0, 0] },
        { id: 'b', text: 'B', at: [0, 0, 1] },
        { id: 'c', text: 'C', at: [0, 0, 2] },
      ]),
    ];
    const next = setCellOrder(lines, { sectionId: SEC, barIndex: 0, beatPos: 0 }, ['c', 'a', 'b']);
    expect(anchorOf(next, 'c')?.order).toBe(0);
    expect(anchorOf(next, 'a')?.order).toBe(1);
    expect(anchorOf(next, 'b')?.order).toBe(2);
  });

  it('puts unlisted occupants after the listed ones', () => {
    const lines = [
      line('l1', [
        { id: 'a', text: 'A', at: [0, 0, 0] },
        { id: 'b', text: 'B', at: [0, 0, 1] },
      ]),
    ];
    const next = setCellOrder(lines, { sectionId: SEC, barIndex: 0, beatPos: 0 }, ['b']);
    expect(anchorOf(next, 'b')?.order).toBe(0);
    expect(anchorOf(next, 'a')?.order).toBe(1);
  });
});

// --- split / join / edit ----------------------------------------------

describe('splitSyllable', () => {
  it('keeps the anchor on the first piece and leaves the tail unplaced', () => {
    const lines = [line('l1', [{ id: 'a', text: "somethin'", at: [1, 2, 0] }])];
    const next = splitSyllable(lines, 'a', 4, seqIds('new'));
    const syllables = next[0].syllables!;
    expect(syllables.map(s => s.text)).toEqual(['some', "thin'"]);
    expect(syllables[0].anchor).toEqual({
      sectionId: SEC, barIndex: 1, beatPos: 2, order: 0,
    });
    expect(syllables[1].anchor).toBeUndefined();
  });

  it('does not move any other placed syllable in the line', () => {
    // The old model re-based every position when the count changed.
    const lines = [
      line('l1', [
        { id: 'a', text: 'aaaa', at: [0, 0, 0] },
        { id: 'b', text: 'bbbb', at: [1, 0, 0] },
        { id: 'c', text: 'cccc', at: [2, 0, 0] },
      ]),
    ];
    const next = splitSyllable(lines, 'a', 2, seqIds('new'));
    expect(anchorOf(next, 'b')).toEqual(anchorOf(lines, 'b'));
    expect(anchorOf(next, 'c')).toEqual(anchorOf(lines, 'c'));
  });

  it('refuses splits that would leave an empty side', () => {
    const lines = [line('l1', [{ id: 'a', text: 'ab' }])];
    expect(splitSyllable(lines, 'a', 0, seqIds())).toEqual(lines);
    expect(splitSyllable(lines, 'a', 2, seqIds())).toEqual(lines);
    expect(splitSyllable(lines, 'a', 9, seqIds())).toEqual(lines);
  });
});

describe('joinSyllables — word-boundary guard', () => {
  /** A line whose two syllables came from splitting one word. */
  function splitPair(): SongLyricLine[] {
    const base = [
      line('l1', [
        { id: 'a', text: "somethin'", at: [1, 2, 0] },
        { id: 'z', text: 'else' },
      ]),
    ];
    return splitSyllable(base, 'a', 4, seqIds('new'));
  }

  it('merges a split pair back, keeping the head anchor', () => {
    const lines = splitPair();
    const tailId = lines[0].syllables![1].id;
    expect(lines[0].syllables![1].continuesWord).toBe(true);
    const next = joinSyllables(lines, 'a');
    const syllables = next[0].syllables!;
    expect(syllables.map(s => s.text)).toEqual(["somethin'", 'else']);
    expect(syllables[0].anchor?.beatPos).toBe(2);
    expect(syllables.some(s => s.id === tailId)).toBe(false);
  });

  it('REFUSES to join across a word boundary', () => {
    // The case that would corrupt the lyric: "ful" + "and" → "fuland".
    const lines = [
      line('l1', [
        { id: 'ful', text: 'ful', at: [2, 2, 0] },
        { id: 'and', text: 'and', at: [3, 0, 0] },
      ]),
    ];
    expect(canJoinNext(lines, 'ful')).toBe(false);
    expect(joinSyllables(lines, 'ful')).toEqual(lines);
  });

  it('allows joining down a chain of repeated splits', () => {
    // "somethin'" → "some" + "thin'" → "some" + "th" + "in'".
    let lines = splitPair();
    const tailId = lines[0].syllables![1].id;
    lines = splitSyllable(lines, tailId, 2, seqIds('deep'));
    expect(lines[0].syllables!.map(s => s.text)).toEqual(['some', 'th', "in'", 'else']);
    expect(canJoinNext(lines, 'a')).toBe(true);
    expect(canJoinNext(lines, lines[0].syllables![1].id)).toBe(true);
    // ...but the last piece still can't swallow the next WORD.
    expect(canJoinNext(lines, lines[0].syllables![2].id)).toBe(false);
  });

  it('refuses on the last syllable of a line and on unknown ids', () => {
    const lines = [line('l1', [{ id: 'a', text: 'x' }])];
    expect(canJoinNext(lines, 'a')).toBe(false);
    expect(canJoinNext(lines, 'nope')).toBe(false);
    expect(joinSyllables(lines, 'a')).toEqual(lines);
  });

  it('refuses for migrated legacy syllables, which carry no lineage', () => {
    const out = foldSectionLyrics(
      [{
        sectionId: SEC,
        beatsPerBar: 4,
        lyricLines: [{
          id: 'legacy',
          words: ['faith', 'ful'],
          startBar: 0, startBeat: 0, endBar: 1, endBeat: 0,
        }],
      }],
      seqIds(),
    );
    expect(canJoinNext(out, out[0].syllables![0].id)).toBe(false);
  });
});

describe('setSyllableText', () => {
  it('rewrites text without touching position', () => {
    const lines = [line('l1', [{ id: 'a', text: 'teh', at: [0, 1, 0] }])];
    const next = setSyllableText(lines, 'a', '  the  ');
    expect(next[0].syllables![0].text).toBe('the');
    expect(anchorOf(next, 'a')).toEqual(anchorOf(lines, 'a'));
  });

  it('refuses an empty value', () => {
    const lines = [line('l1', [{ id: 'a', text: 'the' }])];
    expect(setSyllableText(lines, 'a', '   ')).toEqual(lines);
  });
});

// --- the beat axis ----------------------------------------------------

describe('beat axis', () => {
  it('lays sections end to end in order', () => {
    const axis = buildBeatAxis([
      { sectionId: 'a', beatsPerBar: 4, barCount: 2 },
      { sectionId: 'b', beatsPerBar: 3, barCount: 2 },
    ]);
    expect(axis.offsets.get('a')).toBe(0);
    expect(axis.offsets.get('b')).toBe(8);
    expect(axis.totalBeats).toBe(14);
  });

  it('round-trips an anchor through the global axis', () => {
    const axis = buildBeatAxis([
      { sectionId: 'a', beatsPerBar: 4, barCount: 2 },
      { sectionId: 'b', beatsPerBar: 3, barCount: 2 },
    ]);
    const anchor = { sectionId: 'b', barIndex: 1, beatPos: 2 };
    const global = anchorToGlobal(axis, anchor)!;
    expect(global).toBe(8 + 3 + 2);
    expect(globalToCell(axis, global)).toEqual(anchor);
  });

  it('returns null off the axis', () => {
    expect(anchorToGlobal(axis4, { sectionId: 'nope', barIndex: 0, beatPos: 0 })).toBeNull();
    expect(globalToCell(axis4, -1)).toBeNull();
    expect(globalToCell(axis4, 9999)).toBeNull();
  });
});

// --- provisional spread -----------------------------------------------

describe('provisionalPlacements', () => {
  it('spreads an unplaced run evenly between two placed neighbours', () => {
    // Pins at bar0beat0 (global 0) and bar1beat0 (global 4), 3 between.
    const l = line('l1', [
      { id: 'p0', text: 'A', at: [0, 0, 0] },
      { id: 'g1', text: 'B' },
      { id: 'g2', text: 'C' },
      { id: 'g3', text: 'D' },
      { id: 'p1', text: 'E', at: [1, 0, 0] },
    ]);
    const ghosts = provisionalPlacements(l, axis4);
    expect(ghosts.map(g => g.syllableId)).toEqual(['g1', 'g2', 'g3']);
    expect(ghosts.map(g => g.cell.beatPos)).toEqual([1, 2, 3]);
    expect(ghosts.every(g => g.cell.barIndex === 0)).toBe(true);
  });

  it('renders nothing for a run hanging off either end', () => {
    const leading = line('l1', [
      { id: 'g', text: 'A' },
      { id: 'p', text: 'B', at: [1, 0, 0] },
    ]);
    const trailing = line('l2', [
      { id: 'p', text: 'A', at: [0, 0, 0] },
      { id: 'g', text: 'B' },
    ]);
    expect(provisionalPlacements(leading, axis4)).toEqual([]);
    expect(provisionalPlacements(trailing, axis4)).toEqual([]);
  });

  it('renders nothing for a line with fewer than two placed syllables', () => {
    expect(provisionalPlacements(line('l', [{ id: 'a', text: 'A' }]), axis4)).toEqual([]);
    expect(
      provisionalPlacements(line('l', [{ id: 'a', text: 'A', at: [0, 0, 0] }]), axis4),
    ).toEqual([]);
  });

  it('cannot produce the old zero-width collapse', () => {
    // The legacy model spread every word across start/end; dragging both
    // markers onto one beat divided a zero-width range and stacked the
    // whole line into one cell (audit §6). Two pins on the SAME beat
    // leave no beats between them, so nothing spreads there.
    const l = line('l1', [
      { id: 'p0', text: 'A', at: [0, 2, 0] },
      { id: 'g', text: 'B' },
      { id: 'p1', text: 'C', at: [0, 2, 1] },
    ]);
    const ghosts = provisionalPlacements(l, axis4);
    // At most the one ghost, and it can only land on that same beat —
    // never a six-deep stack of an entire line.
    expect(ghosts).toHaveLength(1);
    expect(ghosts[0].cell).toEqual({ sectionId: SEC, barIndex: 0, beatPos: 2 });
  });

  it('ignores headers', () => {
    expect(provisionalPlacements({ id: 'h', kind: 'header', text: 'Verse 1' }, axis4)).toEqual([]);
  });
});

// --- read model -------------------------------------------------------

describe('buildCellIndex', () => {
  it('groups by cell, placed first by order then ghosts', () => {
    const lines = [
      line('l1', [
        { id: 'p0', text: 'A', at: [0, 0, 0] },
        { id: 'g1', text: 'B' },
        { id: 'p1', text: 'C', at: [0, 2, 0] },
      ]),
      line('l2', [{ id: 'x', text: 'X', at: [0, 1, 0] }]),
    ];
    const index = buildCellIndex(lines, axis4);
    const cell = index.get(cellKey({ sectionId: SEC, barIndex: 0, beatPos: 1 }))!;
    expect(cell.map(o => o.syllable.id)).toEqual(['x', 'g1']);
    expect(cell.map(o => o.placed)).toEqual([true, false]);
  });

  it('stacks syllables from different lines in one cell, ordered', () => {
    const lines = [
      line('l1', [{ id: 'a', text: 'A', at: [0, 0, 1] }]),
      line('l2', [{ id: 'b', text: 'B', at: [0, 0, 0] }]),
    ];
    const index = buildCellIndex(lines, axis4);
    const cell = index.get(cellKey({ sectionId: SEC, barIndex: 0, beatPos: 0 }))!;
    expect(cell.map(o => o.syllable.id)).toEqual(['b', 'a']);
  });

  it('omits headers entirely', () => {
    const index = buildCellIndex([{ id: 'h', kind: 'header', text: 'Verse 1' }], axis4);
    expect(index.size).toBe(0);
  });
});

// --- bar operations ---------------------------------------------------

describe('remapAnchorBars', () => {
  it('moves anchors through a bar permutation, keeping beat and order', () => {
    const lines = [
      line('l1', [
        { id: 'a', text: 'A', at: [0, 2, 1] },
        { id: 'b', text: 'B', at: [1, 0, 0] },
      ]),
    ];
    const next = remapAnchorBars(lines, SEC, new Map([[0, 1], [1, 0]]));
    expect(anchorOf(next, 'a')).toEqual({
      sectionId: SEC, barIndex: 1, beatPos: 2, order: 1,
    });
    expect(anchorOf(next, 'b')?.barIndex).toBe(0);
  });

  it('leaves other sections alone', () => {
    const lines = [
      {
        id: 'l1',
        kind: 'lyric' as const,
        text: 'A',
        syllables: [
          { id: 'a', text: 'A', anchor: { sectionId: 'other', barIndex: 0, beatPos: 0, order: 0 } },
        ],
      },
    ];
    expect(remapAnchorBars(lines, SEC, new Map([[0, 3]]))).toEqual(lines);
  });
});

describe('bar delete helpers', () => {
  it('reports the placed syllables a delete would destroy', () => {
    const lines = [
      line('l1', [
        { id: 'a', text: 'A', at: [1, 0, 0] },
        { id: 'b', text: 'B', at: [2, 0, 0] },
      ]),
    ];
    expect(placedSyllablesInBar(lines, SEC, 1).map(s => s.id)).toEqual(['a']);
    expect(placedSyllablesInBar(lines, SEC, 5)).toEqual([]);
  });

  it('un-places anchors in the deleted bar and shifts later ones down', () => {
    const lines = [
      line('l1', [
        { id: 'a', text: 'A', at: [0, 0, 0] },
        { id: 'b', text: 'B', at: [1, 0, 0] },
        { id: 'c', text: 'C', at: [2, 0, 0] },
      ]),
    ];
    const next = shiftAnchorsAfterBarDelete(lines, SEC, 1);
    expect(anchorOf(next, 'a')?.barIndex).toBe(0);
    expect(anchorOf(next, 'b')).toBeUndefined();
    expect(anchorOf(next, 'c')?.barIndex).toBe(1);
  });
});

// --- migration --------------------------------------------------------

describe('foldSectionLyrics', () => {
  function legacy(overrides: Partial<LyricLine> = {}): LyricLine {
    return {
      id: 'legacy-1',
      words: ['O', 'come', 'all', 'ye'],
      startBar: 0,
      startBeat: 0,
      endBar: 0,
      endBeat: 3,
      ...overrides,
    };
  }

  it('imports existing positions as PLACED, matching the legacy render math', () => {
    const out = foldSectionLyrics(
      [{ sectionId: SEC, beatsPerBar: 4, lyricLines: [legacy()] }],
      seqIds(),
    );
    expect(out).toHaveLength(1);
    const syllables = out[0].syllables!;
    expect(syllables.map(s => s.text)).toEqual(['O', 'come', 'all', 'ye']);
    // Even distribution over beats 0..3 of bar 0.
    expect(syllables.map(s => s.anchor?.beatPos)).toEqual([0, 1, 2, 3]);
    expect(syllables.every(s => s.anchor?.sectionId === SEC)).toBe(true);
  });

  it('folds a legacy PENDING line to unplaced syllables, not a stack at 0:0', () => {
    // Regression for fold v1. A (0,0)→(0,0) range is the legacy
    // sentinel for "in the tray, not placed" — the check lived only in
    // the renderer, so reading the record directly made
    // distributedWordPositions return 0 for every word and stacked
    // whole un-placed lines onto bar 0 beat 0.
    const pending = legacy({ startBar: 0, startBeat: 0, endBar: 0, endBeat: 0 });
    const out = foldSectionLyrics(
      [{ sectionId: SEC, beatsPerBar: 4, lyricLines: [pending] }],
      seqIds(),
    );
    const syllables = out[0].syllables!;
    expect(syllables).toHaveLength(4);
    expect(syllables.every(s => s.anchor === undefined)).toBe(true);
    expect(lineStatus(out[0]).status).toBe('unplaced');
  });

  it('imports an unplaced header line as a header row', () => {
    const out = foldSectionLyrics(
      [{
        sectionId: SEC,
        beatsPerBar: 4,
        lyricLines: [legacy({
          words: ['[Refrain]'],
          startBar: 0, startBeat: 0, endBar: 0, endBeat: 0,
        })],
      }],
      seqIds(),
    );
    expect(out[0]).toMatchObject({ kind: 'header', text: 'Refrain' });
    expect(out[0].syllables).toBeUndefined();
  });

  it('keeps a PLACED header-looking line as a placeable lyric line', () => {
    // Reclassifying it would silently discard a real placement.
    const out = foldSectionLyrics(
      [{
        sectionId: SEC,
        beatsPerBar: 4,
        lyricLines: [legacy({ words: ['[Refrain]'], endBar: 0, endBeat: 3 })],
      }],
      seqIds(),
    );
    expect(out[0].kind).toBe('lyric');
    expect(out[0].syllables![0].anchor).toBeDefined();
  });

  it('stacks multiple words landing in one cell in legacy render order', () => {
    // A genuinely collapsed range that is NOT the pending sentinel.
    const collapsed = legacy({ startBar: 2, startBeat: 1, endBar: 2, endBeat: 1 });
    const out = foldSectionLyrics(
      [{ sectionId: SEC, beatsPerBar: 4, lyricLines: [collapsed] }],
      seqIds(),
    );
    const syllables = out[0].syllables!;
    expect(syllables.map(s => s.anchor?.barIndex)).toEqual([2, 2, 2, 2]);
    expect(syllables.map(s => s.anchor?.beatPos)).toEqual([1, 1, 1, 1]);
    expect(syllables.map(s => s.anchor?.order)).toEqual([0, 1, 2, 3]);
  });

  it('walks sections in order and tags anchors with their own section', () => {
    const out = foldSectionLyrics(
      [
        { sectionId: 'sec-1', beatsPerBar: 4, lyricLines: [legacy({ words: ['one'] })] },
        { sectionId: 'sec-2', beatsPerBar: 4, lyricLines: [legacy({ words: ['two'] })] },
      ],
      seqIds(),
    );
    expect(out.map(l => l.text)).toEqual(['one', 'two']);
    expect(out[0].syllables![0].anchor?.sectionId).toBe('sec-1');
    expect(out[1].syllables![0].anchor?.sectionId).toBe('sec-2');
  });

  it('honours per-section beats-per-bar', () => {
    const out = foldSectionLyrics(
      [{
        sectionId: SEC,
        beatsPerBar: 3,
        lyricLines: [legacy({ words: ['a', 'b', 'c', 'd'], endBar: 1, endBeat: 0 })],
      }],
      seqIds(),
    );
    const anchors = out[0].syllables!.map(s => s.anchor!);
    expect(anchors[0]).toMatchObject({ barIndex: 0, beatPos: 0 });
    expect(anchors[3]).toMatchObject({ barIndex: 1, beatPos: 0 });
  });

  it('handles sections with no lyric lines and produces a readable line text', () => {
    expect(foldSectionLyrics([{ sectionId: SEC, beatsPerBar: 4 }], seqIds())).toEqual([]);
    const out = foldSectionLyrics(
      [{ sectionId: SEC, beatsPerBar: 4, lyricLines: [legacy()] }],
      seqIds(),
    );
    expect(out[0].text).toBe('O come all ye');
    expect(out[0].kind).toBe('lyric');
  });

  it('is idempotent — same input, same output', () => {
    const input = [{ sectionId: SEC, beatsPerBar: 4, lyricLines: [legacy()] }];
    const a = foldSectionLyrics(input, seqIds());
    const b = foldSectionLyrics(input, seqIds());
    expect(a).toEqual(b);
  });
});

// --- real-data verification -------------------------------------------
//
// The harness that should have caught fold v1 instead of a screenshot
// diff. Fixture is the ACTUAL "O Come All Ye Faithful / Verse 1" record
// dumped from the user's IndexedDB (2026-08-05): five placed lines with
// hand-nudged wordOffsets, plus four tray lines carrying the legacy
// pending sentinel — one of which is a section header.
//
// Two independent assertions:
//   1. Against hand-computed expected cells, so a change to the fold's
//      own math can't quietly redefine "correct".
//   2. Against a reference reimplementation of the legacy renderer's
//      positioning (BarGridView's floor/round/clamp), so the fold and
//      the renderer can't drift apart.

describe('foldSectionLyrics — real O Come All Ye Faithful data', () => {
  const REAL_LINES: LyricLine[] = [
    {
      id: 'r0',
      words: ['O', 'come,', 'all', 'ye', 'faith', 'ful'],
      startBar: 0, startBeat: 3, endBar: 2, endBeat: 3,
      wordOffsets: [
        0, -0.5999999999999996, -1.2000000000000002,
        -0.7999999999999998, -1.4000000000000004, -1,
      ],
    },
    {
      id: 'r1',
      words: ['joy', 'ful', 'and', 'tri', 'um', 'phant'],
      startBar: 3, startBeat: 0, endBar: 4, endBeat: 2,
      wordOffsets: [0, 0, 0, 0, -0.8000000000000007, 0],
    },
    {
      id: 'r3',
      words: ['Come', 'and', 'be', 'hold', 'Him'],
      startBar: 9, startBeat: 0, endBar: 10, endBeat: 2,
      wordOffsets: [0, 0, 0, -0.5, 0],
    },
    {
      id: 'r4',
      words: ['born', 'the', 'King', 'of', 'an', 'gels'],
      startBar: 11, startBeat: 0, endBar: 12, endBeat: 2,
      wordOffsets: [
        0, -0.5, -0.3999999999999986, -0.6000000000000014,
        -0.7999999999999972, 0,
      ],
    },
    // The tray. All four carry the pending sentinel.
    { id: 'r5', words: ['[Refrain]'], startBar: 0, startBeat: 0, endBar: 0, endBeat: 0 },
    { id: 'r6', words: ['O', 'come,', 'let', 'us', 'adore', 'Him'], startBar: 0, startBeat: 0, endBar: 0, endBeat: 0 },
    { id: 'r7', words: ['O', 'come,', 'let', 'us', 'adore', 'Him'], startBar: 0, startBeat: 0, endBar: 0, endBeat: 0 },
    { id: 'r8', words: ['Christ', 'the', 'Lord'], startBar: 0, startBeat: 0, endBar: 0, endBeat: 0 },
  ];

  const folded = foldSectionLyrics(
    [{ sectionId: SEC, beatsPerBar: 4, lyricLines: REAL_LINES }],
    seqIds(),
  );

  const cellsOf = (line: SongLyricLine) =>
    (line.syllables ?? []).map(s =>
      s.anchor ? `${s.anchor.barIndex}:${s.anchor.beatPos}` : '—',
    );

  it('places the four positioned lines at their pre-migration cells', () => {
    expect(cellsOf(folded[0])).toEqual(['0:3', '1:0', '1:1', '1:3', '2:0', '2:2']);
    expect(cellsOf(folded[1])).toEqual(['3:0', '3:1', '3:2', '3:3', '4:0', '4:2']);
    expect(cellsOf(folded[2])).toEqual(['9:0', '9:2', '9:3', '10:0', '10:2']);
    expect(cellsOf(folded[3])).toEqual(['11:0', '11:1', '11:2', '11:3', '12:0', '12:2']);
  });

  it('leaves every tray line unplaced', () => {
    for (const line of folded.slice(4)) {
      expect(lineStatus(line).placed).toBe(0);
    }
  });

  it('imports [Refrain] as a header and the rest as unplaced lyric lines', () => {
    expect(folded[4]).toMatchObject({ kind: 'header', text: 'Refrain' });
    expect(folded[5].kind).toBe('lyric');
    expect(folded[6].kind).toBe('lyric');
    expect(folded[7].kind).toBe('lyric');
    expect(folded).toHaveLength(8);
  });

  it('never anchors anything at 0:0 (the fold v1 signature)', () => {
    const at00 = folded.flatMap(l =>
      (l.syllables ?? []).filter(
        s => s.anchor?.barIndex === 0 && s.anchor.beatPos === 0,
      ),
    );
    expect(at00).toEqual([]);
  });

  it('agrees with a reference implementation of the legacy renderer math', () => {
    const beatsPerBar = 4;
    for (const legacyLine of REAL_LINES) {
      if (
        legacyLine.startBar === 0 && legacyLine.startBeat === 0 &&
        legacyLine.endBar === 0 && legacyLine.endBeat === 0
      ) {
        continue; // tray lines render nowhere
      }
      // Mirrors BarGridView's LyricBarSegment exactly.
      const expected = distributedWordPositions(legacyLine, beatsPerBar).map(pos => {
        const bar = Math.floor(pos / beatsPerBar);
        const beat = Math.round(pos - bar * beatsPerBar);
        return `${bar}:${Math.min(Math.max(0, beat), beatsPerBar - 1)}`;
      });
      const line = folded.find(l => l.text === legacyLine.words.join(' '))!;
      expect(cellsOf(line)).toEqual(expected);
    }
  });
});
