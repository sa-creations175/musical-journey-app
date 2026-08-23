/**
 * Key detection is the one ear-training path where a key name is
 * STORED, and re-spelling it is silent.
 *
 * `addAttempt` writes `key-detection:${round.key}`, and the fluency
 * tracker reads accuracy back per key by matching that string. Nothing
 * validates it. So if a spelled name ever reached this builder —
 * 'key-detection:G♭' instead of 'key-detection:F#' — every attempt in
 * that key would land under a new id: no error, no warning, just a key
 * that reads as never drilled while its real history sits under the
 * old id forever.
 *
 * That is the failure this file exists to make impossible. It is
 * deliberately written BEFORE the spelling conversion of
 * KeyDetectionTab, so the guard is in place before the file it guards
 * is edited.
 */
import { describe, it, expect } from 'vitest';
import { keyDetectionItemId } from '../keyDetectionIds';
import { KEYS } from '../progressionTheory';
import { FLAT_SIGN, SHARP_SIGN, spellKey } from '../../../../lib/spelling';

describe('keyDetectionItemId', () => {
  it('builds the stored id from every key the module can pick', () => {
    for (const key of KEYS) {
      expect(keyDetectionItemId(key)).toBe(`key-detection:${key}`);
    }
  });

  it('never emits an accidental SIGN, whatever it is handed', () => {
    // The stored vocabulary is ASCII. A sign in an itemId is a new,
    // empty history for a key the user has been drilling for months.
    for (const key of KEYS) {
      for (const candidate of [key, spellKey(key, 'flat'), spellKey(key, 'sharp')]) {
        const id = keyDetectionItemId(candidate);
        expect(id, `${candidate} produced ${id}`).not.toContain(FLAT_SIGN);
        expect(id, `${candidate} produced ${id}`).not.toContain(SHARP_SIGN);
      }
    }
  });

  it('collapses a display-spelled key onto its stored id', () => {
    // The direct statement of the rule: however the name arrives, the
    // row it addresses is the same row.
    expect(keyDetectionItemId(`G${FLAT_SIGN}`)).toBe('key-detection:F#');
    expect(keyDetectionItemId(`F${SHARP_SIGN}`)).toBe('key-detection:F#');
    expect(keyDetectionItemId('F#')).toBe('key-detection:F#');

    expect(keyDetectionItemId(`B${FLAT_SIGN}`)).toBe('key-detection:Bb');
    expect(keyDetectionItemId(`A${SHARP_SIGN}`)).toBe('key-detection:Bb');
    expect(keyDetectionItemId('Bb')).toBe('key-detection:Bb');
  });

  it('gives one id per pitch, not one per spelling', () => {
    // Twelve keys, twelve ids — not seventeen because five of them can
    // be written two ways.
    const ids = new Set<string>();
    for (const key of KEYS) {
      ids.add(keyDetectionItemId(key));
      ids.add(keyDetectionItemId(spellKey(key, 'flat')));
      ids.add(keyDetectionItemId(spellKey(key, 'sharp')));
    }
    expect(ids.size).toBe(KEYS.length);
  });

  it('leaves an unrecognised key alone rather than inventing one', () => {
    // Not defensive padding: a freeform or legacy value should stay
    // addressable as itself, not be silently folded onto some other
    // key's history.
    expect(keyDetectionItemId('H')).toBe('key-detection:H');
  });
});
