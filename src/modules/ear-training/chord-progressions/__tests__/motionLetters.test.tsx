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
      expect(nameOf('#4', spelling)).toBe('F♯m7♭5');
      expect(nameOf('#4dim7', spelling)).toBe('F♯dim7');
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
