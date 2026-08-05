import { describe, expect, it } from 'vitest';
import type { LyricLine, SongLyricLine } from '../../../lib/db';
import {
  anchorToGlobal,
  buildBeatAxis,
  buildCellIndex,
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

describe('joinSyllables', () => {
  it('merges with the next syllable, keeping the head anchor', () => {
    const lines = [
      line('l1', [
        { id: 'a', text: 'some', at: [1, 2, 0] },
        { id: 'b', text: "thin'", at: [1, 3, 0] },
      ]),
    ];
    const next = joinSyllables(lines, 'a');
    const syllables = next[0].syllables!;
    expect(syllables).toHaveLength(1);
    expect(syllables[0].text).toBe("somethin'");
    expect(syllables[0].anchor?.beatPos).toBe(2);
  });

  it('is a no-op on the last syllable of a line', () => {
    const lines = [line('l1', [{ id: 'a', text: 'x' }])];
    expect(joinSyllables(lines, 'a')).toEqual(lines);
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

  it('assigns stacking order per cell in legacy render order', () => {
    // A collapsed range puts every word on one beat — exactly the bar-13
    // case from the audit. They must import as a stable stack.
    const collapsed = legacy({ endBar: 0, endBeat: 0 });
    const out = foldSectionLyrics(
      [{ sectionId: SEC, beatsPerBar: 4, lyricLines: [collapsed] }],
      seqIds(),
    );
    const syllables = out[0].syllables!;
    expect(syllables.map(s => s.anchor?.beatPos)).toEqual([0, 0, 0, 0]);
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
