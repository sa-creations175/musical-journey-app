// @vitest-environment jsdom
/**
 * The canonical song-key set, and the drift guard between the picker
 * and the matrix.
 *
 * The failure being prevented: the key field used to be free text, so
 * any string became a song's "original key". `keysOrderedFromOriginal`
 * falls back to prepending an unrecognised key onto the full cycle,
 * which renders a THIRTEEN-row matrix — and step 2 materialises cells
 * per rendered key, so an unrecognised value would mint a phantom
 * column of rows that nothing can ever clear.
 *
 * Asserting on the SET rather than the array lets the picker order
 * (chromatic, keyboard-shaped) and the matrix order (circle of
 * fourths, layout-shaped) differ without letting their membership
 * differ.
 */
import { describe, expect, it } from 'vitest';
import {
  CIRCLE_OF_FOURTHS_KEYS,
  SONG_KEY_OPTIONS,
  isCanonicalSongKey,
  keysOrderedFromOriginal,
} from '../keys';

describe('SONG_KEY_OPTIONS', () => {
  it('offers exactly the twelve keys the matrix renders', () => {
    expect(new Set(SONG_KEY_OPTIONS)).toEqual(new Set(CIRCLE_OF_FOURTHS_KEYS));
    expect(SONG_KEY_OPTIONS).toHaveLength(12);
  });

  it('contains no duplicates', () => {
    expect(new Set(SONG_KEY_OPTIONS).size).toBe(SONG_KEY_OPTIONS.length);
  });

  it('is in chromatic order for the picker', () => {
    // Display order is allowed to differ from the matrix's cycle
    // order; this pins that it is deliberate rather than accidental.
    expect([...SONG_KEY_OPTIONS]).toEqual([
      'C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B',
    ]);
  });

  it('every option produces a 12-row matrix, never 13', () => {
    // The property that actually matters downstream: anything the
    // picker can emit must be recognised by the grid.
    for (const key of SONG_KEY_OPTIONS) {
      expect(keysOrderedFromOriginal(key), key).toHaveLength(12);
      expect(keysOrderedFromOriginal(key)[0], key).toBe(key);
    }
  });
});

describe('isCanonicalSongKey', () => {
  it('accepts every canonical key', () => {
    for (const key of CIRCLE_OF_FOURTHS_KEYS) {
      expect(isCanonicalSongKey(key), key).toBe(true);
    }
  });

  it('rejects the shapes free text used to allow', () => {
    // Each of these was enterable in the old input and each produces
    // a 13-row matrix.
    for (const bad of ['A♭', 'Ab ', 'ab', 'AB', 'Ab major', 'D minor', 'Gb', 'Cm', '']) {
      expect(isCanonicalSongKey(bad), JSON.stringify(bad)).toBe(false);
    }
  });

  it('rejects absent values', () => {
    expect(isCanonicalSongKey(undefined)).toBe(false);
    expect(isCanonicalSongKey(null)).toBe(false);
  });

  it('agrees with what the grid actually accepts', () => {
    // The two must not be able to disagree: a key this predicate
    // approves but the grid doesn't would be worse than free text,
    // because it would look validated.
    for (const candidate of [...SONG_KEY_OPTIONS, 'Gb', 'A♭', 'H']) {
      const rendersTwelve = keysOrderedFromOriginal(candidate).length === 12;
      expect(isCanonicalSongKey(candidate), candidate).toBe(rendersTwelve);
    }
  });
});
