import { describe, expect, it } from 'vitest';
import type { LyricLine } from '../../../lib/db';
import {
  applyEndMarkerDrag,
  applyStartMarkerDrag,
  applyWordNudge,
  distributedWordPositions,
  tokenizeLyricLines,
} from '../lyricLine';

function mkLine(overrides: Partial<LyricLine> = {}): LyricLine {
  return {
    id: 'line-1',
    words: ['I', 'love', 'you'],
    startBar: 0,
    startBeat: 0,
    endBar: 0,
    endBeat: 2,
    ...overrides,
  };
}

describe('tokenizeLyricLines', () => {
  it('splits a paste on newlines, one line per text line', () => {
    const lines = tokenizeLyricLines('yeah, yeah\nyou know it');
    expect(lines).toEqual([
      ['yeah,', 'yeah'],
      ['you', 'know', 'it'],
    ]);
  });

  it('treats CRLF and LF identically', () => {
    expect(tokenizeLyricLines('a b\r\nc d')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('drops blank lines and collapses whitespace within a line', () => {
    expect(tokenizeLyricLines('  hi   there \n\n\nnext  line  ')).toEqual([
      ['hi', 'there'],
      ['next', 'line'],
    ]);
  });

  it('preserves punctuation attached to words', () => {
    expect(tokenizeLyricLines("yeah, (almost)\ndon't stop")).toEqual([
      ['yeah,', '(almost)'],
      ["don't", 'stop'],
    ]);
  });

  it('returns [] for empty / whitespace-only input', () => {
    expect(tokenizeLyricLines('')).toEqual([]);
    expect(tokenizeLyricLines('\n\n\t')).toEqual([]);
  });
});

describe('distributedWordPositions', () => {
  it('spreads N words evenly across the range, first at start, last at end', () => {
    const line = mkLine({ words: ['a', 'b', 'c'], startBeat: 0, endBeat: 4 });
    expect(distributedWordPositions(line, 4)).toEqual([0, 2, 4]);
  });

  it('puts a single-word line at the start global beat', () => {
    const line = mkLine({ words: ['solo'], startBar: 1, startBeat: 2, endBar: 1, endBeat: 2 });
    expect(distributedWordPositions(line, 4)).toEqual([6]);
  });

  it('returns an empty array for a wordless line', () => {
    const line = mkLine({ words: [] });
    expect(distributedWordPositions(line, 4)).toEqual([]);
  });

  it('spans bar boundaries via the global-beat axis', () => {
    // 2 words from bar 0 beat 0 to bar 1 beat 0 in 4/4 → globals 0 and 4.
    const line = mkLine({ words: ['hi', 'bye'], startBar: 0, startBeat: 0, endBar: 1, endBeat: 0 });
    expect(distributedWordPositions(line, 4)).toEqual([0, 4]);
  });

  it('applies wordOffsets on top of the even distribution', () => {
    const line = mkLine({
      words: ['a', 'b', 'c'],
      startBeat: 0,
      endBeat: 4,
      wordOffsets: [0, 0.5, -0.25],
    });
    expect(distributedWordPositions(line, 4)).toEqual([0, 2.5, 3.75]);
  });

  it('treats missing offset entries as zero', () => {
    const line = mkLine({
      words: ['a', 'b', 'c'],
      startBeat: 0,
      endBeat: 4,
      wordOffsets: [0, 0.5], // index 2 missing
    });
    expect(distributedWordPositions(line, 4)).toEqual([0, 2.5, 4]);
  });
});

describe('applyStartMarkerDrag', () => {
  it('updates start bar/beat and resets wordOffsets', () => {
    const line = mkLine({
      startBeat: 0,
      endBeat: 2,
      wordOffsets: [0, 0.1, 0.2],
    });
    const next = applyStartMarkerDrag(line, 0, 1, 4);
    expect(next.startBeat).toBe(1);
    expect(next.wordOffsets).toBeUndefined();
  });

  it('refuses a drag that would land at or past the end', () => {
    const line = mkLine({ startBar: 0, startBeat: 0, endBar: 0, endBeat: 2 });
    expect(applyStartMarkerDrag(line, 0, 2, 4)).toBe(line);
    expect(applyStartMarkerDrag(line, 0, 3, 4)).toBe(line);
    expect(applyStartMarkerDrag(line, 1, 0, 4)).toBe(line);
  });

  it('allows widening a zero-range pending line', () => {
    // start==end means the line is pending — start drag should still
    // be allowed even if newStart == end (caller usually drags end first).
    const pending = mkLine({ startBar: 0, startBeat: 0, endBar: 0, endBeat: 0, words: ['hi'] });
    const next = applyStartMarkerDrag(pending, 0, 0, 4);
    expect(next.startBar).toBe(0);
    expect(next.startBeat).toBe(0);
  });
});

describe('applyEndMarkerDrag', () => {
  it('updates end bar/beat and resets wordOffsets', () => {
    const line = mkLine({
      endBar: 0,
      endBeat: 2,
      wordOffsets: [0, 0.1, 0.2],
    });
    const next = applyEndMarkerDrag(line, 1, 0, 4);
    expect(next.endBar).toBe(1);
    expect(next.endBeat).toBe(0);
    expect(next.wordOffsets).toBeUndefined();
  });

  it('refuses a drag that would land at or before the start', () => {
    const line = mkLine({ startBar: 0, startBeat: 1, endBar: 1, endBeat: 0 });
    expect(applyEndMarkerDrag(line, 0, 1, 4)).toBe(line);
    expect(applyEndMarkerDrag(line, 0, 0, 4)).toBe(line);
  });
});

describe('applyWordNudge', () => {
  it('initializes wordOffsets when missing', () => {
    const line = mkLine({ words: ['a', 'b', 'c'], startBeat: 0, endBeat: 4 });
    const next = applyWordNudge(line, 1, 0.25, 4);
    expect(next.wordOffsets).toEqual([0, 0.25, 0]);
  });

  it('accumulates onto an existing offset', () => {
    // Word 0 at base 0; existing offset 0.5 puts it at 0.5 (in range).
    // Nudge by +0.25 → offset becomes 0.75 (word at 0.75, still in range).
    const line = mkLine({ words: ['a', 'b'], startBeat: 0, endBeat: 4, wordOffsets: [0.5, 0] });
    const next = applyWordNudge(line, 0, 0.25, 4);
    expect(next.wordOffsets).toEqual([0.75, 0]);
  });

  it('clamps the nudge so the word stays inside the line range', () => {
    // Base positions for ['a','b','c'] in [0,4] are [0,2,4].
    const line = mkLine({ words: ['a', 'b', 'c'], startBeat: 0, endBeat: 4 });
    // Trying to nudge word 0 left past the start clamps to 0.
    const leftEdge = applyWordNudge(line, 0, -5, 4);
    expect(leftEdge.wordOffsets?.[0]).toBe(0);
    // Trying to nudge word 2 right past the end clamps to 0.
    const rightEdge = applyWordNudge(line, 2, 5, 4);
    expect(rightEdge.wordOffsets?.[2]).toBe(0);
  });

  it('is a no-op for an out-of-range word index', () => {
    const line = mkLine({ words: ['a'] });
    expect(applyWordNudge(line, 5, 0.25, 4)).toBe(line);
    expect(applyWordNudge(line, -1, 0.25, 4)).toBe(line);
  });
});
