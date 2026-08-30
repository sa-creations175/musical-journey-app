/**
 * The session builder's key ordering, after the last local copy of the
 * circle-of-fourths index was folded into the shared one.
 *
 * THIS IS A REFACTOR AND HAS TO PROVE IT. `vlKeyIndex` built its own
 * Map over `CIRCLE_OF_FOURTHS` and canonicalised before looking up;
 * `circleOfFourthsIndex` does the same two things. If the two ever
 * disagreed, unstarted voice-leading cells would surface in a
 * different order — a behaviour change wearing a refactor's clothes.
 *
 * So this asserts the property directly against the shared helper,
 * over the exact input the builder sees: every key in the VL catalog's
 * `KEYS`, plus the enharmonic spellings and an unknown.
 */
import { describe, expect, it } from 'vitest';
import { circleOfFourthsIndex } from '../../repertoire/circleOfFourths';
import { CIRCLE_OF_FOURTHS, canonicaliseKey } from '../../repertoire/circleOfFourths';
import { KEYS } from '../catalog';

/** The implementation that was deleted, kept here as the oracle. */
const OLD_INDEX: ReadonlyMap<string, number> = new Map(
  CIRCLE_OF_FOURTHS.map((k, i) => [k, i]),
);
function oldVlKeyIndex(keyName: string): number {
  const canonical = canonicaliseKey(keyName) ?? keyName;
  return OLD_INDEX.get(canonical) ?? CIRCLE_OF_FOURTHS.length;
}

describe('folding the last copy changes no ordering', () => {
  it('agrees with the retired implementation on every catalog key', () => {
    for (const k of KEYS) {
      expect(circleOfFourthsIndex(k), k).toBe(oldVlKeyIndex(k));
    }
  });

  it('agrees on the enharmonic spellings the builder can meet', () => {
    // `KEYS` is chromatic and flat-side; the wheel is identity-side.
    // Both spellings of the sixth key have to land on the same slot,
    // which is the one case the canonicalisation exists for.
    for (const k of ['Gb', 'F#', 'C#', 'Db', 'G#', 'Ab', 'A#', 'Bb']) {
      expect(circleOfFourthsIndex(k), k).toBe(oldVlKeyIndex(k));
    }
  });

  it('agrees that an unknown key sorts LAST, not first', () => {
    // The property that separates this from a bare `indexOf`, which
    // returns -1 and would sort an unrecognised key to the front.
    expect(circleOfFourthsIndex('H')).toBe(oldVlKeyIndex('H'));
    expect(circleOfFourthsIndex('H')).toBe(CIRCLE_OF_FOURTHS.length);
  });

  it('sorts the catalog keys into the wheel, unchanged', () => {
    const sorted = [...KEYS].sort((a, b) => circleOfFourthsIndex(a) - circleOfFourthsIndex(b));
    const oldSorted = [...KEYS].sort((a, b) => oldVlKeyIndex(a) - oldVlKeyIndex(b));
    expect(sorted).toEqual(oldSorted);
    // And it really is the wheel, not chromatic order.
    expect(sorted[0]).toBe('C');
    expect(sorted[1]).toBe('F');
  });
});
