/**
 * The interval-name table, and the inversion counted in semitones.
 *
 * ---------------------------------------------------------------
 * WHAT THIS FILE USED TO BE.
 *
 * Two hundred lines about fifteen fact cards — that a Major 3rd
 * inverts to a minor 6th, that pairs sum to 9, that perfect stays
 * perfect. The cards are gone (9 Sep 2026): the skill is the
 * relationship between two notes on the keyboard, both ways, and the
 * interval grid asks both directions of every pair already.
 *
 * What survives is the table and one function, and both still have to
 * be right, because the grid's reveal names the flip from them.
 * ---------------------------------------------------------------
 */
import { describe, expect, it } from 'vitest';
import {
  INTERVAL_NAMES, SEMITONES_PER_OCTAVE, article, intervalNameAt,
  invertedSemitones,
} from '../intervalInversion';

describe('the inversion, counted in semitones', () => {
  it('sends every interval in the table to another one in the table', () => {
    // The property the reveal depends on: there is no interval whose
    // flip has no name, so no card can be left with half a sentence.
    for (const iv of INTERVAL_NAMES) {
      expect(intervalNameAt(invertedSemitones(iv.semitones)), iv.name)
        .toBeDefined();
    }
  });

  it('pairs sum to twelve, and the tritone is its own partner', () => {
    for (const iv of INTERVAL_NAMES) {
      expect(iv.semitones + invertedSemitones(iv.semitones), iv.name)
        .toBe(SEMITONES_PER_OCTAVE);
    }
    expect(intervalNameAt(invertedSemitones(6))).toBe('Tritone');
  });

  it('flips minor to major and back, and leaves perfect alone', () => {
    // Not asserted as a rule a card teaches any more — asserted as a
    // property of the table, because the reveal will print it.
    for (const iv of INTERVAL_NAMES) {
      const flipped = intervalNameAt(invertedSemitones(iv.semitones))!;
      if (/^minor/.test(iv.name)) expect(flipped, iv.name).toMatch(/^Major/);
      if (/^Major/.test(iv.name)) expect(flipped, iv.name).toMatch(/^minor/);
      if (/^Perfect/.test(iv.name)) expect(flipped, iv.name).toMatch(/^Perfect/);
    }
  });
});

describe('the moved table still matches the ear-training seed list', () => {
  it('holds the same thirteen intervals', async () => {
    // seed.ts keeps its own copy because it carries per-direction
    // anchors this table does not. Membership must still agree.
    const { INTERVAL_SEEDS } = await import('../../ear-training/intervals/seed');
    expect(INTERVAL_NAMES.map(i => i.semitones).sort((a, b) => a - b))
      .toEqual(INTERVAL_SEEDS.map(i => i.semitones).sort((a, b) => a - b));
  });
});

describe('a or an, by sound rather than by first letter', () => {
  it('says an Octave and a Unison', () => {
    // U takes "a" — "a unison", the way it is "a university" — which a
    // vowel list gets wrong for one of the thirteen.
    expect(article('Octave')).toBe('an');
    expect(article('Unison')).toBe('a');
    for (const iv of INTERVAL_NAMES) {
      expect(['a', 'an'], iv.name).toContain(article(iv.name));
    }
  });
});
