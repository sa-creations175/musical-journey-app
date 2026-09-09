/**
 * The `u` flag on the guard's accidental class, and the proof it
 * changed nothing.
 *
 * =====================================================================
 * A REPAIR HAS TO BE SHOWN TO BE ONE.
 *
 * `hasAccidental` decides which cards `only-accidental` and
 * `only-natural` can fire on, and those two rules decide which cards
 * `chooseDecoys` will build at all. A regex edit that quietly widened
 * or narrowed it would move decoy sets across the deck — silently,
 * because every set it produced would still be a legal set.
 *
 * So the OLD class is reproduced here as deleted code and run beside
 * the new one over every option string in the deck. Same answer on all
 * of them is the whole content of this file.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import { FLASHCARDS } from '../catalog';
import { hasAccidental } from '../decoyGuard';

/**
 * The class as it was: no `u`, so 𝄪 and 𝄫 were read as their surrogate
 * halves and the class held three lone surrogates.
 */
// eslint-disable-next-line no-misleading-character-class
const OLD_CLASS = /[#♯♭𝄪𝄫]/;

function hasAccidentalOld(label: string): boolean {
  return OLD_CLASS.test(label)
    || /(^|[\s(,/])[A-G]b/.test(label)
    || /(^|[\s(,/])b\d/.test(label);
}

/** Every string a reader can be shown: questions, answers, decoys and
 *  explanations. */
function everyString(): string[] {
  const out: string[] = [];
  for (const c of FLASHCARDS) {
    out.push(c.question, c.correctAnswer, ...c.decoys);
    if (c.explanation !== undefined) out.push(c.explanation);
  }
  return out;
}

describe('the u flag changed the class and not the answer', () => {
  it('agrees with the old class on every string in the deck', () => {
    const differ = everyString()
      .filter(s => hasAccidental(s) !== hasAccidentalOld(s));
    expect(differ).toEqual([]);
  });

  it('covers the whole deck, so the agreement means something', () => {
    // Guards the test above: a filter over an empty list agrees with
    // anything. Both counts are asserted, because "some carry one" and
    // "some do not" are what make the comparison live.
    const all = everyString();
    expect(all.length).toBeGreaterThan(6000);
    expect(all.filter(hasAccidental).length).toBeGreaterThan(1000);
    expect(all.filter(s => !hasAccidental(s)).length).toBeGreaterThan(1000);
  });

  it('reads a double accidental as one character, not as two halves', () => {
    // The cards that made this reachable: F𝄪 in the key of B major's
    // 5 of 3, and E𝄫 in the key of D♭ major.
    expect(hasAccidental('F𝄪')).toBe(true);
    expect(hasAccidental('E𝄫')).toBe(true);
    expect(hasAccidental('D♯ major with a F♯ (♭3) instead of a F𝄪 (3)')).toBe(true);
    // And the deck really does show them, so this is not a hypothetical.
    const withDouble = everyString().filter(s => /[𝄪𝄫]/u.test(s));
    expect(withDouble.length).toBeGreaterThan(0);
    for (const s of withDouble) expect(hasAccidental(s), s).toBe(true);
  });

  it('no longer calls a lone surrogate an accidental', () => {
    // The defect itself. `\uD834` is the high half of 𝄪 and 𝄫 and of
    // every other U+1D1xx musical symbol; on its own it is not a note.
    expect(hasAccidental('\uD834')).toBe(false);
    expect(hasAccidentalOld('\uD834')).toBe(true);
    // A different symbol in the same block — a whole note — is not an
    // accidental either, and the old class said it was.
    expect(hasAccidental('\u{1D15D}')).toBe(false);
    expect(hasAccidentalOld('\u{1D15D}')).toBe(true);
  });

  it('still reads the three shapes the header lists', () => {
    expect(hasAccidental('B♭')).toBe(true);
    expect(hasAccidental('F♯')).toBe(true);
    expect(hasAccidental('Gb')).toBe(true);
    expect(hasAccidental('b3')).toBe(true);
    expect(hasAccidental('Bb')).toBe(true);
    // And the two things the three shapes exist to NOT match.
    expect(hasAccidental('dominant 7')).toBe(false);
    expect(hasAccidental('backdoor')).toBe(false);
  });
});
