import { describe, expect, it } from 'vitest';
import type { SongLyricLine } from '../../../lib/db';
import {
  anchorsMatching,
  buildBeatAxis,
  buildCellIndex,
  cellKey,
  lineStatus,
  unplaceAnchorsMatching,
  type BeatAxis,
} from '../lyricSyllables';

/**
 * ORPHAN TESTS — asserted against what the grid actually RENDERS.
 *
 * Every case here previously passed its write-path unit tests while
 * producing a syllable that reported `placed` and rendered nowhere.
 * That is the failure mode worth guarding: the UI actively said the
 * line was fine.
 *
 * So these do not check anchors. They rebuild the read model the grid
 * uses and ask the only question that matters — walk every cell that
 * exists and collect what is drawn there. Anything counted as placed
 * but absent from that walk is an orphan.
 */

const A = 'sec-A';
const B = 'sec-B';

interface SectionShape {
  id: string;
  bars: number;
  bpb: number;
}

function axisFor(secs: SectionShape[]): BeatAxis {
  return buildBeatAxis(
    secs.map(s => ({ sectionId: s.id, beatsPerBar: s.bpb, barCount: s.bars })),
  );
}

/** Every syllable id the grid would actually draw as placed. */
function renderedIds(lines: SongLyricLine[], secs: SectionShape[]): Set<string> {
  const index = buildCellIndex(lines, axisFor(secs));
  const out = new Set<string>();
  for (const s of secs) {
    for (let bar = 0; bar < s.bars; bar++) {
      for (let beat = 0; beat < s.bpb; beat++) {
        const key = cellKey({ sectionId: s.id, barIndex: bar, beatPos: beat });
        for (const occupant of index.get(key) ?? []) {
          if (occupant.placed) out.add(occupant.syllable.id);
        }
      }
    }
  }
  return out;
}

/** Placed-but-undrawable: the exact shape of the bug. */
function orphans(lines: SongLyricLine[], secs: SectionShape[]): string[] {
  const drawn = renderedIds(lines, secs);
  return lines
    .flatMap(l => l.syllables ?? [])
    .filter(s => s.anchor && !drawn.has(s.id))
    .map(s => s.id);
}

const at = (sectionId: string, barIndex: number, beatPos: number) => ({
  sectionId,
  barIndex,
  beatPos,
});

/** One line whose words span two sections and several bars. */
function spanningLine(): SongLyricLine[] {
  return [
    {
      id: 'l1',
      kind: 'lyric',
      text: 'w0 w1 w2 w3',
      syllables: [
        { id: 'w0', text: 'w0', anchor: at(A, 0, 0) },
        { id: 'w1', text: 'w1', anchor: at(A, 1, 0) },
        { id: 'w2', text: 'w2', anchor: at(A, 2, 3) },
        { id: 'w3', text: 'w3', anchor: at(B, 0, 0) },
      ],
    },
  ];
}

const THREE_BARS: SectionShape[] = [
  { id: A, bars: 3, bpb: 4 },
  { id: B, bars: 2, bpb: 4 },
];

describe('baseline', () => {
  it('draws every placed word when nothing has been restructured', () => {
    expect(orphans(spanningLine(), THREE_BARS)).toEqual([]);
  });
});

describe('delete a bar', () => {
  // Before the fix: deleting bar 1 orphaned the word in bar 2 while the
  // line still reported "placed 4/4".
  const afterDelete: SectionShape[] = [
    { id: A, bars: 2, bpb: 4 },
    { id: B, bars: 2, bpb: 4 },
  ];

  // Deleting a bar also SHRINKS the section, so the old last bar index
  // stops addressing anything. Because anchors deliberately do not
  // shift, those words do not follow anything down — they simply stop
  // resolving. Un-placing only the deleted bar is therefore not
  // enough, which this suite caught.
  const homeless = (deleted: number, remainingBars: number) =>
    (a: { sectionId: string; barIndex: number }) =>
      a.sectionId === A && (a.barIndex === deleted || a.barIndex >= remainingBars);

  it('un-places the deleted bar AND the now-unaddressable last index', () => {
    const next = unplaceAnchorsMatching(spanningLine(), homeless(1, 2));
    expect(orphans(next, afterDelete)).toEqual([]);
  });

  it('does NOT shift the words between — they keep their own bar', () => {
    // The principle, on a section long enough to show it: delete bar 1
    // of four and the word in bar 2 stays in bar 2. It is now under
    // whatever chord bar 3 used to hold, and that is the intended
    // trade.
    const four: SongLyricLine[] = [
      {
        id: 'l1',
        kind: 'lyric',
        text: 'x y',
        syllables: [
          { id: 'x', text: 'x', anchor: at(A, 2, 0) },
          { id: 'y', text: 'y', anchor: at(A, 0, 0) },
        ],
      },
    ];
    const next = unplaceAnchorsMatching(four, homeless(1, 3));
    expect(next[0].syllables!.find(s => s.id === 'x')!.anchor).toMatchObject({
      barIndex: 2,
    });
    expect(orphans(next, [{ id: A, bars: 3, bpb: 4 }])).toEqual([]);
  });

  it('reports the count the warning will show — both groups', () => {
    expect(anchorsMatching(spanningLine(), homeless(1, 2))).toHaveLength(2);
  });

  it('un-placed words stay in the line as text', () => {
    const next = unplaceAnchorsMatching(spanningLine(), homeless(1, 2));
    expect(next[0].syllables?.map(s => s.text)).toEqual(['w0', 'w1', 'w2', 'w3']);
    expect(lineStatus(next[0]).status).toBe('partial');
  });
});

describe('delete a section', () => {
  const afterDelete: SectionShape[] = [{ id: A, bars: 3, bpb: 4 }];

  it('orphans the cross-section word if nothing un-places it', () => {
    // The bug, pinned: this is what the old behaviour produced.
    expect(orphans(spanningLine(), afterDelete)).toEqual(['w3']);
    expect(lineStatus(spanningLine()[0])).toMatchObject({
      status: 'placed',
      placed: 4,
    });
  });

  it('leaves no orphan once the section is un-placed', () => {
    const next = unplaceAnchorsMatching(spanningLine(), a => a.sectionId === B);
    expect(orphans(next, afterDelete)).toEqual([]);
  });

  it('keeps the rest of the SAME LINE placed', () => {
    // A line can span sections; only the homeless part goes.
    const next = unplaceAnchorsMatching(spanningLine(), a => a.sectionId === B);
    expect(lineStatus(next[0]).placed).toBe(3);
    expect(renderedIds(next, afterDelete)).toEqual(new Set(['w0', 'w1', 'w2']));
  });
});

describe('change the time signature', () => {
  const threeFour: SectionShape[] = [
    { id: A, bars: 3, bpb: 3 },
    { id: B, bars: 2, bpb: 4 },
  ];

  it('orphans a word on a beat that no longer exists', () => {
    // w2 sits on beat 3, which 3/4 does not have.
    expect(orphans(spanningLine(), threeFour)).toEqual(['w2']);
  });

  it('leaves no orphan once those beats are un-placed', () => {
    const next = unplaceAnchorsMatching(
      spanningLine(),
      a => a.sectionId === A && a.beatPos >= 3,
    );
    expect(orphans(next, threeFour)).toEqual([]);
  });

  it('does not disturb words on beats that survive', () => {
    const next = unplaceAnchorsMatching(
      spanningLine(),
      a => a.sectionId === A && a.beatPos >= 3,
    );
    expect(renderedIds(next, threeFour)).toEqual(new Set(['w0', 'w1', 'w3']));
  });
});

describe('reorder bars', () => {
  it('needs no un-place — every bar still exists', () => {
    // Anchors deliberately do not chase reordered bars, and a
    // permutation removes no cell, so nothing is homeless.
    expect(orphans(spanningLine(), THREE_BARS)).toEqual([]);
  });
});
