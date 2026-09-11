// @vitest-environment jsdom
/**
 * A Chord Motion chord's letter follows its degree's accidental.
 *
 * Silas's ruling of 10 Sep 2026: the question says ♯4, so in the key of
 * **C** the chord is F♯m7♭5 or F♯dim7, never G♭ — whatever the note-name
 * setting. ♭2 is D♭, ♭3 E♭, ♭6 A♭, ♭7 B♭. A diatonic degree keeps
 * following the setting. The legend names the root as the chord does.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { motionChords } from '../motionChords';
import { chipText } from '../motionDegrees';
import ChordColorLegend from '../../../../components/ChordColorLegend';
import { DEFAULT_PLAYER_SETTINGS } from '../../../../lib/player/settings';
import type { Spelling } from '../../../../lib/spelling';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const nameOf = (to: Parameters<typeof motionChords>[2], spelling: Spelling) =>
  motionChords(0, '1', to, 'seventh', spelling).chords[1].name;

describe('the letter follows the degree’s accidental', () => {
  for (const spelling of ['flat', 'sharp'] as const) {
    it(`in the key of C, with ${spelling}s set`, () => {
      expect(nameOf('#4', spelling)).toBe('F♯ø7');
      expect(nameOf('#4dim7', spelling)).toBe('F♯°7');
      expect(nameOf('b2', spelling)).toBe('D♭maj7');
      expect(nameOf('b3', spelling)).toBe('E♭maj7');
      expect(nameOf('b6', spelling)).toBe('A♭maj7');
      expect(nameOf('b7', spelling)).toBe('B♭maj7');
    });
  }

  it('leaves a diatonic degree to the setting', () => {
    // Key of D♭: the 1 is D♭ with flats and C♯ with sharps, as it
    // always was — the setting decides where the question has no
    // accidental of its own.
    const one = (s: Spelling) => motionChords(1, '1', '4', 'seventh', s).chords[0].name;
    expect(one('flat')).toBe('D♭maj7');
    expect(one('sharp')).toBe('C♯maj7');
  });
});

describe('the legend names the root as the chord does', () => {
  let host: HTMLDivElement;
  let root: Root;
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); window.localStorage.clear(); });

  it('reads F♯ root under a flats setting, and the other tones by the setting', async () => {
    window.localStorage.setItem('chordColorLegendOpen', 'open');
    const chord = motionChords(0, '1', '#4dim7', 'seventh', 'flat').chords[1];
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root.render(<ChordColorLegend chord={chord} settings={DEFAULT_PLAYER_SETTINGS} spelling="flat" />);
    });
    const chips = [...host.querySelectorAll('[data-testid="legend-chips"] > *')].map(c => c.textContent ?? '');
    expect(chips.some(c => c.startsWith('F♯ root'))).toBe(true);
    expect(chips.some(c => c.startsWith('G♭'))).toBe(false);
    // F♯ A C E♭: the dim7's seventh stays E♭, not D♯.
    expect(chips.some(c => c.startsWith('E♭'))).toBe(true);
  });
});

describe('the chord symbol follows the spelling setting, as the chip does', () => {
  const WORDS = (halfDimTriad: '°' | 'dim', halfDimSeventh: 'ø' | 'm7♭5') =>
    ({ separator: 'hyphen', qualities: 'all', halfDimTriad, halfDimSeventh }) as const;
  const symbol = (to: '#4' | '#4dim7', rung: 'seventh' | 'triads', w: ReturnType<typeof WORDS>) =>
    motionChords(0, '1', to, rung, 'flat', 'asc', w).chords[1].name;

  it('writes F♯ø7 with ø on, F♯m7♭5 with m7♭5 on', () => {
    expect(symbol('#4', 'seventh', WORDS('°', 'ø'))).toBe('F♯ø7');
    expect(symbol('#4', 'seventh', WORDS('°', 'm7♭5'))).toBe('F♯m7♭5');
  });

  it('writes the dim7 F♯°7 or F♯dim7 by the same setting', () => {
    expect(symbol('#4dim7', 'seventh', WORDS('°', 'ø'))).toBe('F♯°7');
    expect(symbol('#4dim7', 'seventh', WORDS('dim', 'ø'))).toBe('F♯dim7');
  });

  it('writes the triad F♯° or F♯dim at Triads', () => {
    expect(symbol('#4', 'triads', WORDS('°', 'ø'))).toBe('F♯°');
    expect(symbol('#4dim7', 'triads', WORDS('dim', 'm7♭5'))).toBe('F♯dim');
  });

  it('reads the same formatter as the chip: change the setting and both move', () => {
    const w = WORDS('dim', 'm7♭5');
    expect(chipText('#4', w)).toBe('♯4m7♭5');
    expect(symbol('#4', 'seventh', w)).toBe('F♯m7♭5');
    expect(chipText('#4dim7', w)).toBe('♯4dim7');
    expect(symbol('#4dim7', 'seventh', w)).toBe('F♯dim7');
  });
});

describe('the four theoretical spellings carry their gloss', () => {
  const root = (keyPc: number, to: Parameters<typeof motionChords>[2], spelling: Spelling) =>
    motionChords(keyPc, '1', to, 'seventh', spelling).chords[1];

  it('the ♯4 of F♯ is B♯(C)', () => {
    const c = root(6, '#4', 'sharp');
    expect(c.rootLetter).toBe('B♯(C)');
    expect(c.name).toBe('B♯(C)ø7');
  });
  it('the ♯4 of B is E♯(F)', () => {
    expect(root(11, '#4', 'sharp').rootLetter).toBe('E♯(F)');
  });
  it('the ♭3 of D♭ is F♭(E)', () => {
    const c = root(1, 'b3', 'flat');
    expect(c.rootLetter).toBe('F♭(E)');
    expect(c.name).toBe('F♭(E)maj7');
  });
  it('the ♭2 of B♭ is C♭(B)', () => {
    expect(root(10, 'b2', 'flat').rootLetter).toBe('C♭(B)');
  });

  it('leaves every ordinary spelling bare, and a double accidental as it was', () => {
    // Guard: the ♯4 of C is still plain F♯ — the gloss is for the four.
    expect(root(0, '#4', 'flat').rootLetter).toBe('F♯');
    // The key of G♭ (flats): its ♯4 is C natural, by letter.
    expect(root(6, '#4', 'flat').rootLetter).toBe('C');
    // The ♭6 of D♭ would be B𝄫; it keeps its old name, A.
    expect(root(1, 'b6', 'flat').rootLetter).toBe('A');
  });

  it('shows the gloss on the legend’s root chip', async () => {
    window.localStorage.setItem('chordColorLegendOpen', 'open');
    const chord = root(6, '#4', 'sharp');
    const host = document.createElement('div');
    document.body.appendChild(host);
    const r = createRoot(host);
    await act(async () => {
      r.render(<ChordColorLegend chord={chord} settings={DEFAULT_PLAYER_SETTINGS} spelling="sharp" />);
    });
    const chips = [...host.querySelectorAll('[data-testid="legend-chips"] > *')].map(c => c.textContent ?? '');
    expect(chips.some(c => c.startsWith('B♯(C) root'))).toBe(true);
    await act(async () => r.unmount());
    host.remove();
  });
});
