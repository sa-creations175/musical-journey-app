import { describe, expect, it } from 'vitest';
import { isHeaderLine, parseLyricSheet } from '../lyricSheetParse';

describe('isHeaderLine', () => {
  it('recognises the bare section words, case-insensitively', () => {
    for (const word of ['Verse', 'Chorus', 'Refrain', 'Bridge', 'Intro', 'Outro', 'Tag', 'Vamp']) {
      expect(isHeaderLine(word)).toBe(true);
      expect(isHeaderLine(word.toLowerCase())).toBe(true);
      expect(isHeaderLine(word.toUpperCase())).toBe(true);
    }
  });

  it('accepts the pre-chorus spellings', () => {
    expect(isHeaderLine('Pre-Chorus')).toBe(true);
    expect(isHeaderLine('Prechorus')).toBe(true);
    expect(isHeaderLine('Pre Chorus')).toBe(true);
  });

  it('accepts a numeric, roman, or letter suffix', () => {
    expect(isHeaderLine('Verse 1')).toBe(true);
    expect(isHeaderLine('Verse 2')).toBe(true);
    expect(isHeaderLine('Verse II')).toBe(true);
    expect(isHeaderLine('Verse A')).toBe(true);
    expect(isHeaderLine('Chorus - 2')).toBe(true);
  });

  it('accepts bracketed and punctuated forms', () => {
    expect(isHeaderLine('[Refrain]')).toBe(true);
    expect(isHeaderLine('(Chorus)')).toBe(true);
    expect(isHeaderLine('Chorus:')).toBe(true);
    expect(isHeaderLine('[Verse 1]')).toBe(true);
    expect(isHeaderLine('  [Bridge]  ')).toBe(true);
  });

  it('rejects real lyric lines that merely start with a header word', () => {
    // The false-positive case that matters: extra words mean it's a lyric.
    expect(isHeaderLine('Bridge over troubled water')).toBe(false);
    expect(isHeaderLine('Tag you are it')).toBe(false);
    expect(isHeaderLine('O come all ye faithful')).toBe(false);
    expect(isHeaderLine('Verse of the day is here')).toBe(false);
  });

  it('rejects empty and whitespace-only input', () => {
    expect(isHeaderLine('')).toBe(false);
    expect(isHeaderLine('   ')).toBe(false);
    expect(isHeaderLine('[]')).toBe(false);
  });
});

describe('parseLyricSheet', () => {
  it('splits into rows, tagging headers and dropping blank lines', () => {
    const rows = parseLyricSheet(
      '[Verse 1]\nO come all ye faithful\n\nJoyful and triumphant\n\nRefrain\nO come let us adore Him',
    );
    expect(rows).toEqual([
      { kind: 'header', text: 'Verse 1' },
      { kind: 'lyric', text: 'O come all ye faithful' },
      { kind: 'lyric', text: 'Joyful and triumphant' },
      { kind: 'header', text: 'Refrain' },
      { kind: 'lyric', text: 'O come let us adore Him' },
    ]);
  });

  it('strips header decoration but keeps the user casing', () => {
    expect(parseLyricSheet('[pre-chorus]')).toEqual([
      { kind: 'header', text: 'pre-chorus' },
    ]);
    expect(parseLyricSheet('CHORUS:')).toEqual([
      { kind: 'header', text: 'CHORUS' },
    ]);
  });

  it('trims lyric rows but preserves their text verbatim', () => {
    expect(parseLyricSheet('   Sing, choirs of angels   ')).toEqual([
      { kind: 'lyric', text: 'Sing, choirs of angels' },
    ]);
  });

  it('handles CRLF input and empty input', () => {
    expect(parseLyricSheet('Verse 1\r\nO come\r\n')).toEqual([
      { kind: 'header', text: 'Verse 1' },
      { kind: 'lyric', text: 'O come' },
    ]);
    expect(parseLyricSheet('')).toEqual([]);
    expect(parseLyricSheet('\n\n\t\n')).toEqual([]);
  });
});

// ---------------------------------------------------------------------
// Names added in 13.15
// ---------------------------------------------------------------------

describe('interlude and hook are recognised', () => {
  it('reads them as headers', () => {
    expect(isHeaderLine('interlude')).toBe(true);
    expect(isHeaderLine('Hook')).toBe(true);
  });

  it('reads their numbered and bracketed forms', () => {
    expect(isHeaderLine('Interlude 2')).toBe(true);
    expect(isHeaderLine('[Hook]')).toBe(true);
    expect(isHeaderLine('Hook 2:')).toBe(true);
  });

  it('parses them into header rows, not placeable lines', () => {
    expect(parseLyricSheet('Interlude\nHook 2')).toEqual([
      { kind: 'header', text: 'Interlude' },
      { kind: 'header', text: 'Hook 2' },
    ]);
  });

  it('still refuses a multi-word line containing one of them', () => {
    // The matcher is anchored: "Hook me up" is a lyric, not a header.
    expect(isHeaderLine('Hook me up')).toBe(false);
    expect(isHeaderLine('the interlude begins')).toBe(false);
  });
});

describe('a name that is NOT recognised', () => {
  it('becomes a placeable lyric line, silently', () => {
    // Worth pinning: this is the failure mode behind naming the header
    // capability on the button. It is recoverable — the row menu flips
    // any unplaced line to a header — but nothing announces it.
    expect(parseLyricSheet('Breakdown')).toEqual([
      { kind: 'lyric', text: 'Breakdown' },
    ]);
    expect(isHeaderLine('Coda')).toBe(false);
  });
});
