import { describe, it, expect } from 'vitest';
import {
  parseChordFunction,
  renderNumbers,
  renderRoman,
} from '../chordFunction';

describe('renderRoman — minor quality stripping', () => {
  it('keeps the long "min7" form whole (regression: vimin7, not viin7)', () => {
    // G#m7 in B major = the 6th degree. The bug sliced one char off
    // "min7" → "in7", rendering "viin7" (reads like vii).
    expect(renderRoman({ function: '6', quality: 'min7' })).toBe('vimin7');
  });

  it('still folds the short "m"/"m7" form into the lowercase numeral', () => {
    expect(renderRoman({ function: '6', quality: 'm7' })).toBe('vi7');
    expect(renderRoman({ function: '2', quality: 'm' })).toBe('ii');
  });

  it('leaves major / dominant qualities intact', () => {
    expect(renderRoman({ function: '1', quality: 'maj7' })).toBe('Imaj7');
    expect(renderRoman({ function: '5', quality: '7' })).toBe('V7');
  });
});

describe('renderNumbers — Nashville primary', () => {
  it('shows the degree number with the full quality', () => {
    expect(renderNumbers({ function: '6', quality: 'min7' })).toBe('6min7');
    expect(renderNumbers({ function: '5', quality: '7' })).toBe('57');
  });
});

describe('scale-degree of G#m7 in B major is the 6th (not 7th)', () => {
  it('parses G#m7 in B to function "6"', () => {
    const cf = parseChordFunction('G#m7', 'B');
    expect(cf?.function).toBe('6');
  });
});
