import { describe, expect, it } from 'vitest';
import type { LyricLine } from '../../../lib/db';
import {
  applyEndMarkerDrag,
  applyStartMarkerDrag,
  applyWordNudge,
  distributedWordPositions,
  joinWords,
  setWordText,
  splitWord,
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

describe('splitWord', () => {
  it("splits 'somethin\\'' at position 4 into ['some','thin\\'']", () => {
    const line = mkLine({ words: ["somethin'"], startBeat: 0, endBeat: 4 });
    const next = splitWord(line, 0, 4, 4);
    expect(next.words).toEqual(['some', "thin'"]);
  });

  it('inserts the second-syllable offset = first offset + 0.5 (clamped)', () => {
    // 4-beat range, 3 words → base positions are 0, 2, 4.
    // Pre-existing offsets [0, 0, 0]. Split middle word with no existing offset
    // at position 1 → new offsets length 4. Second syllable inherits 0.5.
    const line = mkLine({
      words: ['abc', 'defgh', 'ijk'],
      startBeat: 0,
      endBeat: 4,
      wordOffsets: [0, 0, 0],
    });
    const next = splitWord(line, 1, 2, 4);
    expect(next.words).toEqual(['abc', 'de', 'fgh', 'ijk']);
    // Word index 1 keeps offset 0 (was 0). New word at index 2 inherits 0.5.
    expect(next.wordOffsets?.[1]).toBe(0);
    expect(next.wordOffsets?.[2]).toBe(0.5);
  });

  it('initializes wordOffsets when previously undefined', () => {
    const line = mkLine({ words: ['abcd'], startBeat: 0, endBeat: 4 });
    const next = splitWord(line, 0, 2, 4);
    expect(next.wordOffsets).toBeDefined();
    expect(next.wordOffsets).toHaveLength(2);
  });

  it('preserves offsets of other words (literal carry; no recompute)', () => {
    const line = mkLine({
      words: ['ab', 'cd', 'ef'],
      startBeat: 0,
      endBeat: 4,
      wordOffsets: [0, 0.25, -0.1],
    });
    const next = splitWord(line, 0, 1, 4);
    expect(next.words).toEqual(['a', 'b', 'cd', 'ef']);
    // Word 0 = 'a' keeps original offset 0; word 1 = 'b' inherits +0.5; word 2
    // = 'cd' keeps the offset that 'cd' had (0.25); word 3 = 'ef' keeps -0.1.
    expect(next.wordOffsets).toEqual([0, 0.5, 0.25, -0.1]);
  });

  it('clamps the new syllable so its position stays inside the line range', () => {
    // Single-word line at start=end=(0,0) means position == startGlobal for all.
    // Splitting and adding +0.5 would push past endGlobal; clamp pulls it back.
    const line = mkLine({
      words: ['abcd'],
      startBar: 0,
      startBeat: 0,
      endBar: 0,
      endBeat: 0,
    });
    const next = splitWord(line, 0, 2, 4);
    // After split there are 2 words; base for both is startGlobal=0 (single
    // point). Offset of +0.5 would put it at 0.5 > endGlobal=0 → clamp to 0.
    expect(next.wordOffsets?.[1]).toBe(0);
  });

  it('no-ops for out-of-range wordIndex or boundary splitAt', () => {
    const line = mkLine({ words: ['hi'] });
    expect(splitWord(line, -1, 1, 4)).toBe(line);
    expect(splitWord(line, 2, 1, 4)).toBe(line);
    // splitAt at boundaries: 0 (empty first half) and word.length (empty second half).
    expect(splitWord(line, 0, 0, 4)).toBe(line);
    expect(splitWord(line, 0, 2, 4)).toBe(line);
  });
});

describe('joinWords', () => {
  it("joins ['some','thin\\''] back into ['somethin\\'']", () => {
    const line = mkLine({ words: ['some', "thin'"], startBeat: 0, endBeat: 4 });
    const next = joinWords(line, 0);
    expect(next.words).toEqual(["somethin'"]);
  });

  it("keeps the first word's offset; drops the second", () => {
    const line = mkLine({
      words: ['a', 'b', 'c'],
      startBeat: 0,
      endBeat: 4,
      wordOffsets: [0.1, 0.5, -0.2],
    });
    const next = joinWords(line, 0);
    expect(next.words).toEqual(['ab', 'c']);
    expect(next.wordOffsets).toEqual([0.1, -0.2]);
  });

  it('leaves wordOffsets undefined when no offsets were set', () => {
    const line = mkLine({ words: ['a', 'b'] });
    const next = joinWords(line, 0);
    expect(next.words).toEqual(['ab']);
    expect(next.wordOffsets).toBeUndefined();
  });

  it('no-ops for out-of-range wordIndex or last word', () => {
    const line = mkLine({ words: ['a', 'b'] });
    expect(joinWords(line, -1)).toBe(line);
    expect(joinWords(line, 1)).toBe(line); // last word has no next
    expect(joinWords(line, 5)).toBe(line);
  });
});

describe('setWordText', () => {
  it('replaces the text at the given wordIndex', () => {
    const line = mkLine({ words: ['I', 'n', 'you'] });
    const next = setWordText(line, 1, 'on');
    expect(next.words).toEqual(['I', 'on', 'you']);
  });

  it('trims surrounding whitespace before storing', () => {
    const line = mkLine({ words: ['I', 'love', 'you'] });
    const next = setWordText(line, 1, '  loved  ');
    expect(next.words).toEqual(['I', 'loved', 'you']);
  });

  it('preserves wordOffsets — only the text changes', () => {
    const offsets = [0, 0.5, -0.25];
    const line = mkLine({
      words: ['a', 'b', 'c'],
      wordOffsets: offsets,
      endBeat: 4,
    });
    const next = setWordText(line, 1, 'B');
    expect(next.words).toEqual(['a', 'B', 'c']);
    expect(next.wordOffsets).toEqual(offsets);
  });

  it('no-ops when the trimmed value equals the current word (returns same ref)', () => {
    const line = mkLine({ words: ['I', 'love', 'you'] });
    expect(setWordText(line, 1, 'love')).toBe(line);
    expect(setWordText(line, 1, '  love  ')).toBe(line);
  });

  it('no-ops when the trimmed value is empty (refuses to leave an empty syllable)', () => {
    const line = mkLine({ words: ['I', 'love', 'you'] });
    expect(setWordText(line, 1, '')).toBe(line);
    expect(setWordText(line, 1, '   ')).toBe(line);
  });

  it('no-ops for out-of-range wordIndex', () => {
    const line = mkLine({ words: ['I', 'love', 'you'] });
    expect(setWordText(line, -1, 'x')).toBe(line);
    expect(setWordText(line, 3, 'x')).toBe(line);
    expect(setWordText(line, 99, 'x')).toBe(line);
  });
});
