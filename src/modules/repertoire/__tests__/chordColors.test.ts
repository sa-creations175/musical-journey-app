import { describe, expect, it } from 'vitest';
import type { ChordFunction } from '../../../lib/db';
import { chordPalette, darkenColor, resolveDegree } from '../chordColors';

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

  it('falls back to neutral for unparsed chords, empty degrees, and unreadable tokens', () => {
    const neutralText = '#404040';
    expect(chordPalette(chord({ unparsed: true }), false).text).toBe(neutralText);
    expect(chordPalette(chord({ function: '' }), false).text).toBe(neutralText);
    expect(chordPalette(chord({ function: 'x' }), false).text).toBe(neutralText);
    expect(chordPalette(chord({ function: '1x' }), false).text).toBe(neutralText);
  });
});

// --- T2.3: flattened degrees ------------------------------------------
// "Color follows the sounding note, not the spelling."

/** HSL lightness of a hex color, for asserting "darker" without
 *  hard-coding derived values (they move whenever DARK_STEP is tuned). */
function lightness(hex: string): number {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
}

describe('resolveDegree', () => {
  it('maps naturals to their own family', () => {
    for (const degree of Object.keys(LIGHT_TEXT)) {
      expect(resolveDegree(degree)).toEqual({ family: degree, flattened: false });
    }
  });

  it('maps each flat degree to its family as flattened', () => {
    expect(resolveDegree('b2')).toEqual({ family: '2', flattened: true });
    expect(resolveDegree('b3')).toEqual({ family: '3', flattened: true });
    expect(resolveDegree('b5')).toEqual({ family: '5', flattened: true });
    expect(resolveDegree('b6')).toEqual({ family: '6', flattened: true });
    expect(resolveDegree('b7')).toEqual({ family: '7', flattened: true });
  });

  it('resolves sharp spellings to their enharmonic flat twin', () => {
    expect(resolveDegree('#1')).toEqual(resolveDegree('b2'));
    expect(resolveDegree('#2')).toEqual(resolveDegree('b3'));
    expect(resolveDegree('#4')).toEqual(resolveDegree('b5'));
    expect(resolveDegree('#5')).toEqual(resolveDegree('b6'));
    expect(resolveDegree('#6')).toEqual(resolveDegree('b7'));
  });

  it('handles the enharmonic edges that land back on a natural degree', () => {
    expect(resolveDegree('#3')).toEqual({ family: '4', flattened: false }); // E# = F
    expect(resolveDegree('#7')).toEqual({ family: '1', flattened: false }); // B# = C
    expect(resolveDegree('b1')).toEqual({ family: '7', flattened: false }); // Cb = B
    expect(resolveDegree('b4')).toEqual({ family: '3', flattened: false }); // Fb = E
    expect(resolveDegree('bb3')).toEqual({ family: '2', flattened: false }); // = 2
  });

  it('maps extensions down to their base degree, carrying the accidental', () => {
    expect(resolveDegree('9')).toEqual(resolveDegree('2'));
    expect(resolveDegree('11')).toEqual(resolveDegree('4'));
    expect(resolveDegree('13')).toEqual(resolveDegree('6'));
    expect(resolveDegree('b13')).toEqual(resolveDegree('b6'));
    expect(resolveDegree('b9')).toEqual(resolveDegree('b2'));
  });

  it('returns null for unreadable tokens', () => {
    expect(resolveDegree('')).toBeNull();
    expect(resolveDegree('x')).toBeNull();
    expect(resolveDegree('1x')).toBeNull();
    expect(resolveDegree('b')).toBeNull();
  });
});

describe('chordPalette — flattened degrees', () => {
  it('gives a flat degree a darker shade of its own family', () => {
    for (const family of ['2', '3', '5', '6', '7']) {
      const natural = chordPalette(chord({ function: family }), false);
      const flat = chordPalette(chord({ function: `b${family}` }), false);
      expect(flat).not.toEqual(natural);
      // The fill is the dominant signal — it must actually darken.
      expect(lightness(flat.bg)).toBeLessThan(lightness(natural.bg));
      expect(lightness(flat.border)).toBeLessThan(lightness(natural.border));
    }
  });

  it('colors a sharp spelling identically to its flat twin', () => {
    expect(chordPalette(chord({ function: '#4' }), false)).toEqual(
      chordPalette(chord({ function: 'b5' }), false),
    );
    expect(chordPalette(chord({ function: '#5' }), false)).toEqual(
      chordPalette(chord({ function: 'b6' }), false),
    );
  });

  it('no longer treats b3 and 3 as the same color (T2.2 behaviour, now replaced)', () => {
    expect(chordPalette(chord({ function: 'b3' }), false)).not.toEqual(
      chordPalette(chord({ function: '3' }), false),
    );
  });

  it('applies the flattened rule to a slash chord via its bass', () => {
    const slash = chord({ function: '1', quality: 'maj', bass: 'b6' });
    expect(chordPalette(slash, false)).toEqual(
      chordPalette(chord({ function: 'b6' }), false),
    );
  });

  it('darkens the dark-mode palette too, preserving its alpha', () => {
    const flat = chordPalette(chord({ function: 'b6' }), true);
    expect(flat.bg).toMatch(/^rgba\(\d+, \d+, \d+, 0\.4\)$/);
  });
});

describe('darkenColor', () => {
  it('preserves hue while reducing lightness', () => {
    const darker = darkenColor('#3b82f6', 0.2);
    expect(lightness(darker)).toBeLessThan(lightness('#3b82f6'));
  });

  it('keeps alpha on rgba input and returns hex for opaque input', () => {
    expect(darkenColor('rgba(23, 37, 84, 0.4)', 0.2)).toMatch(/^rgba\(.*, 0\.4\)$/);
    expect(darkenColor('#eff6ff', 0.2)).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('passes unparseable input through unchanged', () => {
    expect(darkenColor('transparent', 0.2)).toBe('transparent');
  });

  it('is a no-op at step 0', () => {
    expect(darkenColor('#3b82f6', 0)).toBe('#3b82f6');
  });
});
