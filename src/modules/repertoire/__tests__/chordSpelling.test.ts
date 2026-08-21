/**
 * Chord display under the spelling seam (step 3).
 *
 * The lead sheet stores chords FUNCTIONALLY — `{ function, quality,
 * bass }`, scale degrees, no note names — and derives the concrete
 * symbol at render. So re-spelling is genuinely free there, and the
 * interesting risk is not the rendering.
 *
 * THE RISK IS THE ROUND TRIP. Chord cells are editable: a symbol the
 * app rendered can be typed, pasted, or left in place and re-parsed.
 * Once display emits 'G♭maj7' and the parser only accepted 'Gbmaj7',
 * the app would stop understanding its own output — and the failure is
 * silent, because `parseConcreteNotation` returning null just marks the
 * chord `unparsed` and shows the raw text back. That reads as "the user
 * typed something odd", not "we broke parsing".
 */
import { describe, it, expect } from 'vitest';
import {
  chordToDisplay,
  parseChordFunction,
  renderConcrete,
} from '../chordFunction';
import { FLAT_SIGN, SHARP_SIGN, type Spelling } from '../../../lib/spelling';
import type { ChordFunction } from '../../../lib/db';

const cf = (fn: string, quality = '', bass?: string): ChordFunction =>
  bass ? { function: fn, quality, bass } : { function: fn, quality };

describe('renderConcrete honours the spelling, not the key', () => {
  it('spells the same degree either way in a black-key key', () => {
    // 1 in Gb is one pitch. What it is CALLED is now the reader's call.
    expect(renderConcrete(cf('1'), 'Gb', 'flat')).toBe(`G${FLAT_SIGN}`);
    expect(renderConcrete(cf('1'), 'Gb', 'sharp')).toBe(`F${SHARP_SIGN}`);
    // And the identity spelling of that key resolves identically.
    expect(renderConcrete(cf('1'), 'F#', 'flat')).toBe(`G${FLAT_SIGN}`);
  });

  it('no longer lets the key name pick the accidentals', () => {
    // Before this step, `keyPrefersFlats('Bb')` forced flats and
    // `keyPrefersFlats('F#')` forced sharps, whatever the user wanted.
    expect(renderConcrete(cf('4'), 'Bb', 'sharp')).toBe(`D${SHARP_SIGN}`);
    expect(renderConcrete(cf('1'), 'F#', 'flat')).toBe(`G${FLAT_SIGN}`);
  });

  it('leaves naturals identical in both spellings', () => {
    for (const spelling of ['flat', 'sharp'] as Spelling[]) {
      expect(renderConcrete(cf('1', 'maj7'), 'C', spelling)).toBe('Cmaj7');
      expect(renderConcrete(cf('5', '7'), 'C', spelling)).toBe('G7');
    }
  });

  it('spells the slash bass too, not just the root', () => {
    // A half-converted renderer would show 'G♭/Bb' — two alphabets in
    // one chord symbol.
    const out = renderConcrete(cf('1', '', '3'), 'Gb', 'flat');
    expect(out).toBe(`G${FLAT_SIGN}/B${FLAT_SIGN}`);
    expect(out).not.toContain('b/');
  });
});

/**
 * THE ROUND TRIP — the actual defect risk in this step.
 */
describe('what the app renders, the app can read back', () => {
  const DEGREES = ['1', 'b2', '2', 'b3', '3', '4', '#4', '5', 'b6', '6', 'b7', '7'];
  const KEYS = ['C', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'F#', 'B', 'E', 'A', 'D', 'G'];

  it('re-parses every rendered chord back to the degree it came from', () => {
    for (const spelling of ['flat', 'sharp'] as Spelling[]) {
      for (const key of KEYS) {
        for (const degree of DEGREES) {
          const rendered = renderConcrete(cf(degree, 'maj7'), key, spelling);
          const reparsed = parseChordFunction(rendered, key);
          expect(reparsed, `${degree} in ${key} → "${rendered}"`).not.toBeNull();
          expect(reparsed?.unparsed, `"${rendered}" came back unparsed`)
            .toBeFalsy();
          expect(reparsed?.function, `"${rendered}" in ${key}`).toBe(degree);
        }
      }
    }
  });

  it('still reads ASCII input — nobody has to type a ♭', () => {
    // The signs are what the app WRITES. They are not a requirement on
    // what a person types, and every chart pasted from anywhere else
    // will use b and #.
    for (const raw of ['Gbmaj7', 'F#maj7', 'Bbm7', 'A#m7', 'Db7']) {
      const parsed = parseChordFunction(raw, 'C');
      expect(parsed, raw).not.toBeNull();
      expect(parsed?.unparsed, raw).toBeFalsy();
    }
  });

  it('reads a slash chord written with signs', () => {
    const parsed = parseChordFunction(`E${FLAT_SIGN}/G`, 'Bb');
    expect(parsed?.unparsed).toBeFalsy();
    expect(parsed?.function).toBe('4');
    expect(parsed?.bass).toBe('6');
  });
});

describe('chordToDisplay', () => {
  it('shows unparsed input verbatim rather than a re-spelling', () => {
    // The user should see what they typed while they are editing it.
    const unparsed: ChordFunction = { function: '', quality: '', raw: 'Gb?', unparsed: true };
    expect(chordToDisplay(unparsed, 'concrete', 'C', 'flat')).toBe('Gb?');
  });

  it('ignores the spelling in non-concrete modes', () => {
    // Numbers and Roman carry no note names, so a spelling cannot leak
    // into them — asserted so a future refactor cannot make it.
    for (const spelling of ['flat', 'sharp'] as Spelling[]) {
      expect(chordToDisplay(cf('4', 'maj7'), 'numbers', 'Gb', spelling)).toBe('4maj7');
      expect(chordToDisplay(cf('4', 'maj7'), 'roman', 'Gb', spelling)).toBe('IVmaj7');
    }
  });
});
