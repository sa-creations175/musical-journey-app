import { describe, it, expect } from 'vitest';
import {
  parseChordFunction,
  patternNumeralToDisplay,
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

describe('patternNumeralToDisplay — catalog templates in the reader\'s notation', () => {
  it('leaves Roman untouched — the catalog is already Roman', () => {
    // Identity on purpose. Round-tripping through a synthesised
    // ChordFunction would fire the case rule AND an explicit suffix,
    // giving "Imaj" / "iimin".
    for (const n of ['ii', 'V', 'I', 'vi', 'IV', 'VII']) {
      expect(patternNumeralToDisplay(n, 'roman', undefined, 'flat')).toBe(n);
    }
  });

  it('renders numbers with case spelled out as a quality suffix', () => {
    expect(patternNumeralToDisplay('ii', 'numbers', undefined, 'flat')).toBe('2min');
    expect(patternNumeralToDisplay('V', 'numbers', undefined, 'flat')).toBe('5maj');
    expect(patternNumeralToDisplay('I', 'numbers', undefined, 'flat')).toBe('1maj');
    expect(patternNumeralToDisplay('vi', 'numbers', undefined, 'flat')).toBe('6min');
    expect(patternNumeralToDisplay('VII', 'numbers', undefined, 'flat')).toBe('7maj');
  });

  it('treats stacked as numbers, matching renderChordFunction', () => {
    expect(patternNumeralToDisplay('ii', 'stacked', undefined, 'flat')).toBe('2min');
  });

  it('renders concrete against the section key', () => {
    expect(patternNumeralToDisplay('ii', 'concrete', 'C', 'flat')).toBe('Dmin');
    expect(patternNumeralToDisplay('V', 'concrete', 'C', 'flat')).toBe('Gmaj');
    expect(patternNumeralToDisplay('I', 'concrete', 'Ab', 'flat')).toBe('A\u266Dmaj');
    // Same pitch, the other spelling — the key is unchanged, the
    // reading of it is not.
    expect(patternNumeralToDisplay('I', 'concrete', 'Ab', 'sharp')).toBe('G\u266Fmaj');
  });

  it('covers every numeral the detection catalog actually ships', () => {
    // The full set in DETECTION_PATTERNS as of rev 5.
    const shipped = ['I', 'II', 'III', 'IV', 'V', 'VII', 'ii', 'vi'];
    for (const n of shipped) {
      expect(patternNumeralToDisplay(n, 'numbers', undefined, 'flat')).toMatch(/^[1-7](min|maj)$/);
    }
  });

  it('handles accidentals the catalog does not carry yet', () => {
    // No bVII entry exists today; it must not fall back to raw text if
    // one is added.
    expect(patternNumeralToDisplay('bVII', 'numbers', undefined, 'flat')).toBe('b7maj');
    expect(patternNumeralToDisplay('bIII', 'numbers', undefined, 'flat')).toBe('b3maj');
  });

  it('returns an unrecognised token unchanged rather than dropping it', () => {
    // A pattern identity is more useful mangled than missing.
    expect(patternNumeralToDisplay('', 'numbers', undefined, 'flat')).toBe('');
    expect(patternNumeralToDisplay('N.C.', 'numbers', undefined, 'flat')).toBe('N.C.');
    expect(patternNumeralToDisplay('VIII', 'numbers', undefined, 'flat')).toBe('VIII');
  });
});
