import { describe, expect, it } from 'vitest';
import type { ChordFunction } from '../../../lib/db';
import { chordPalette } from '../chordColors';

// Locks the T2.2 palette swap: these hexes reproduce the Tailwind class
// strings the chord cells used before the move to inline styles, so the
// refactor is provably no-visual-change. T2.3 changes the *mapping*
// rules (flattened degrees get their own dark twin); the per-family
// values asserted here are the baseline it derives from.

function chord(overrides: Partial<ChordFunction> = {}): ChordFunction {
  return { function: '1', quality: '', ...overrides };
}

const LIGHT_TEXT: Record<string, string> = {
  '1': '#15803d', // green-700
  '2': '#be185d', // pink-700
  '3': '#0f766e', // teal-700
  '4': '#7e22ce', // purple-700
  '5': '#b45309', // amber-700
  '6': '#1d4ed8', // blue-700
  '7': '#b91c1c', // red-700
};

describe('chordPalette — degree families', () => {
  it('maps each diatonic degree to its family color', () => {
    for (const [degree, text] of Object.entries(LIGHT_TEXT)) {
      expect(chordPalette(chord({ function: degree }), false).text).toBe(text);
    }
  });

  it('returns the light set when not in dark mode and the dark set when in it', () => {
    const light = chordPalette(chord({ function: '1' }), false);
    const dark = chordPalette(chord({ function: '1' }), true);
    expect(light.bg).toBe('#f0fdf4');
    expect(dark.bg).toBe('rgba(5, 46, 22, 0.4)');
    expect(dark.text).toBe('#bbf7d0');
  });

  it("preserves degree 4's light/dark border asymmetry", () => {
    // The original classes were `border-purple-600 dark:border-purple-500`
    // — the only family whose border shade differs between modes.
    expect(chordPalette(chord({ function: '4' }), false).border).toBe('#9333ea');
    expect(chordPalette(chord({ function: '4' }), true).border).toBe('#a855f7');
  });

  it('uses one dot color across both modes (the classes had no dark variant)', () => {
    for (const degree of Object.keys(LIGHT_TEXT)) {
      const light = chordPalette(chord({ function: degree }), false);
      const dark = chordPalette(chord({ function: degree }), true);
      expect(light.dot).toBe(dark.dot);
    }
  });
});

describe('chordPalette — resolution rules', () => {
  it('colors a slash chord by its BASS degree, not its root', () => {
    const slash = chord({ function: '1', quality: 'maj', bass: '5' });
    expect(chordPalette(slash, false).text).toBe(LIGHT_TEXT['5']);
  });

  it('ignores an empty-string bass and falls back to the root', () => {
    const notSlash = chord({ function: '1', bass: '' });
    expect(chordPalette(notSlash, false).text).toBe(LIGHT_TEXT['1']);
  });

  it('strips the accidental — b3 and 3 share a palette (pre-T2.3 behaviour)', () => {
    // Deliberately asserted so T2.3's flattened-degree rule has to
    // update this test consciously rather than silently.
    expect(chordPalette(chord({ function: 'b3' }), false)).toEqual(
      chordPalette(chord({ function: '3' }), false),
    );
    expect(chordPalette(chord({ function: '#4' }), false)).toEqual(
      chordPalette(chord({ function: '4' }), false),
    );
  });

  it('falls back to neutral for unparsed chords, empty degrees, and out-of-range degrees', () => {
    const neutralText = '#404040';
    expect(chordPalette(chord({ unparsed: true }), false).text).toBe(neutralText);
    expect(chordPalette(chord({ function: '' }), false).text).toBe(neutralText);
    expect(chordPalette(chord({ function: '9' }), false).text).toBe(neutralText);
  });
});
