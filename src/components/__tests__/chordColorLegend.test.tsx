// @vitest-environment jsdom
/**
 * The Chord Color Legend.
 *
 * =====================================================================
 * THE BOARD HAS BEEN TEACHING A VOCABULARY NOBODY WROTE DOWN.
 *
 * Chord tones filled by interval, a green band under the bass, and on
 * some surfaces a ring on the root in its degree-of-the-key colour.
 * Three systems, all meaningful, none named anywhere a reader could
 * look. Silas's ruling of 10 Sep 2026.
 *
 * WHAT THESE ASSERT is that the chips are the SOUNDING chord — they
 * follow Listen to, the octave lift and the bass drop exactly as the
 * board does, because a legend for a chord that is not playing is a
 * legend for the wrong thing.
 * =====================================================================
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import ChordColorLegend from '../ChordColorLegend';
import { DEFAULT_PLAYER_SETTINGS } from '../../lib/player/settings';
import { placeBass } from '../../lib/player/voices';
import { inKeyRing } from '../../lib/player/inKeyColour';
import { intervalColor } from '../../lib/voicingColors';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement | null = null;
let root: Root | null = null;

/** A Dm7 in C, bass D below the hand. */
const DM7 = { name: 'Dm7', rootPc: 2, bass: 50, hand: [62, 65, 69, 72] };

function render(props: Partial<Parameters<typeof ChordColorLegend>[0]> = {}) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <ChordColorLegend
        chord={DM7}
        settings={DEFAULT_PLAYER_SETTINGS}
        spelling="flat"
        {...props}
      />,
    );
  });
  return host;
}

/** jsdom reports an inline colour as `rgb(r, g, b)`; the app writes
 *  hexes. Compare in one form. */
const rgbOf = (hex: string): string => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

const chips = (): string[] =>
  [...document.querySelectorAll('[data-testid="legend-chips"] span')]
    .filter(el => el.querySelector('[data-testid="legend-swatch"]'))
    .map(el => el.textContent!.replace(/\s+/g, ' ').trim());

const open = () => {
  const d = document.querySelector('[data-testid="chord-color-legend"]') as HTMLDetailsElement;
  act(() => { d.open = true; d.dispatchEvent(new Event('toggle')); });
};

beforeEach(() => {
  try { window.localStorage.clear(); } catch { /* private mode */ }
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe('the fold', () => {
  it('is titled and starts closed', () => {
    const el = render();
    const d = el.querySelector('[data-testid="chord-color-legend"]') as HTMLDetailsElement;
    expect(d.querySelector('summary')!.textContent).toBe('Chord Color Legend');
    expect(d.open).toBe(false);
  });

  it('is remembered per device', () => {
    render();
    open();
    act(() => { root!.unmount(); });
    host!.remove();
    const el = render();
    expect((el.querySelector('[data-testid="chord-color-legend"]') as HTMLDetailsElement).open)
      .toBe(true);
  });
});

describe('one chip per sounding note, named and coloured', () => {
  it('names each note by its interval from the chord root', () => {
    render();
    open();
    // A Dm7 with its root in the bass. ONE CHIP PER SOUNDING PITCH
    // CLASS: the bass D and the hand's D are one fact about the chord,
    // and the chip says both the interval and the job.
    expect(chips()).toEqual(['D root · bass', 'F ♭3', 'A 5', 'C ♭7']);
  });

  it('paints each chip in the colour that note is painted', () => {
    render();
    open();
    const swatches = [...document.querySelectorAll('[data-testid="legend-chips"] [data-testid="legend-swatch"]')]
      .map(el => (el as HTMLElement).style.background);
    // Read off the app's own table rather than typed here, so a
    // recoloured ramp moves the legend with it.
    for (const iv of [0, 3, 7, 10]) {
      expect(swatches, String(iv)).toContain(rgbOf(intervalColor(iv)));
    }
  });

  it('follows Bass only, because that is what is sounding', () => {
    render({ settings: { ...DEFAULT_PLAYER_SETTINGS, listen: 'bass' } });
    open();
    expect(chips()).toEqual(['D root · bass']);
  });

  it('follows the bass where the register placed it, so a chip names the key that is lit', () => {
    render({ chord: placeBass([DM7], DEFAULT_PLAYER_SETTINGS)[0] });
    open();
    // Forward placed the bass D an octave down; the chips still name it
    // D, and there is still exactly one of it.
    expect(chips().filter(c => c.includes('bass'))).toEqual(['D root · bass']);
  });

  it('says nothing about a chord that is not there', () => {
    render({ chord: null });
    open();
    expect(chips()).toEqual([]);
  });
});

describe('the written lines', () => {
  it('leaves the green band unglossed when the chips already name it', () => {
    // The bass here IS the chord's root, so the chip row says
    // "D root · bass" and a line about the band would gloss a mark the
    // reader has already been told about.
    render();
    open();
    expect(chips()).toContain('D root · bass');
    expect(document.querySelector('[data-testid="legend-bass-line"]')).toBeNull();
  });

  it('says what the green band is when the band is the only mark', () => {
    // Dm7/G: the bass is not the chord's root, so its key carries the
    // band and nothing else, and no chip calls it a root.
    render({ chord: { ...DM7, bass: 43 } });
    open();
    const line = document.querySelector('[data-testid="legend-bass-line"]')!;
    expect(line.textContent).toContain('green band under a key = the bass note');
    // THE SAME GREEN AS THE ROOT FILL, because it is one.
    expect((line.querySelector('[data-testid="legend-swatch"]') as HTMLElement).style.background)
      .toBe(rgbOf(intervalColor(0)));
  });

  it('says the 1 gets no ring, in words, instead of drawing one', () => {
    // A C chord in the key of C. Its root is the key's home and the
    // interval palette already fills it green; a green ring would read
    // as a second fill.
    const ring = inKeyRing(0, 0)!;
    expect(ring.colour).toBeNull();
    render({ chord: { ...DM7, rootPc: 0 }, ring });
    open();
    expect(document.querySelector('[data-testid="legend-home-line"]')!.textContent)
      .toContain('This chord is the 1 of the key');
    expect(document.querySelector(
      '[data-testid="legend-ring-line"] [data-testid="legend-swatch"]')).toBeNull();
  });

  it('names a degree and never a chord quality', () => {
    // "the 2 of the key", not "the 2m of the key" — the ring answers
    // where in the key the chord sits, and the chip row above carries
    // its quality.
    render({ ring: inKeyRing(2, 0)! });
    open();
    const text = document.querySelector('[data-testid="legend-ring-line"]')!.textContent!;
    expect(text).toContain('this chord is the 2 of the key');
    expect(text).not.toContain('2m');
  });

  it('writes the ring line only where a surface draws a ring', () => {
    render();
    open();
    expect(document.querySelector('[data-testid="legend-ring-line"]')).toBeNull();
  });

  it('names the ring colour and the degree when there is one', () => {
    // A Dm7 in the key of C: D is the 2 of C, which the lead sheet
    // colours pink.
    const ring = inKeyRing(2, 0)!;
    render({ ring });
    open();
    const line = document.querySelector('[data-testid="legend-ring-line"]')!;
    expect(line.textContent)
      .toContain('pink ring on the root = this chord is the 2 of the key');
    expect(ring.degree).toBe('2');
  });

  it('draws the ring swatch as a ring, not a fill', () => {
    render({ ring: inKeyRing(5, 0)! });
    open();
    const swatch = document.querySelector(
      '[data-testid="legend-ring-line"] [data-testid="legend-swatch"]') as HTMLElement;
    expect(swatch.style.border).toContain('3px solid');
    expect(swatch.style.background).toBe('');
  });
});

describe('the ring reads the lead sheet\'s own palette', () => {
  it('gives the seven degrees the words a reader would use', () => {
    // Not a bespoke palette: the same colours a chord cell wears on a
    // chart, so the ring means there what it means here.
    for (const [semitones, degree, word] of [
      [0, '1', 'green'], [2, '2', 'pink'], [4, '3', 'teal'],
      [5, '4', 'purple'], [7, '5', 'gold'], [9, '6', 'blue'],
      [11, '7', 'red'],
    ] as const) {
      const ring = inKeyRing(semitones, 0)!;
      expect(ring.degree, String(semitones)).toBe(degree);
      expect(ring.colourWord, String(semitones)).toBe(word);
    }
  });

  it('names a chromatic root by the degree it borrows', () => {
    expect(inKeyRing(10, 0)!.degree).toBe('♭7');
    // The sharpened fourth is the prototype's own name for it — a
    // tritone above the tonic reads up from the 4, not down from the 5.
    expect(inKeyRing(6, 0)!.degree).toBe('♯4');
  });

  it('gives a flattened degree its family\'s word', () => {
    // ♭3 and 3 are two shades of one teal, and a reader calls both teal.
    expect(inKeyRing(3, 0)!.colourWord).toBe('teal');
    expect(inKeyRing(4, 0)!.colourWord).toBe('teal');
  });
});
