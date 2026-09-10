/**
 * What counts as the same kind of chord, once the dominants stop being
 * one thing.
 *
 * =====================================================================
 * THE COLLAPSE IS A KINDNESS THAT HAD GONE TOO FAR.
 *
 * A reader who builds Cmaj7 where the card wanted C has heard the
 * chord right, so the grade compares families rather than spellings.
 * That was true of the extensions and it was NOT true of the altered
 * dominants: with every dominant in one family, a card asking for a
 * 7♭9 would have accepted a plain 7, and a 7♭9 and a 7♯9♯5 would have
 * answered each other.
 *
 * They are three different sounds. Hearing which one is sounding is
 * the whole of what those cards test, and a grade that cannot tell
 * them apart is not testing it. Silas's ruling, 9 Sep 2026.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import {
  ALTERED_QUALITIES,
  CHORD_INTERVALS,
  FAMILY_OF,
  QUALITIES,
  SLASH_QUALITY_IDS,
  TRIAD_OF,
  familyMatches,
  qualityTilesFor,
  type QualityId,
} from '../chordShapes';

const ALL = Object.keys(CHORD_INTERVALS) as QualityId[];

describe('the six families', () => {
  it('places every quality in one of them', () => {
    const seen = new Set(ALL.map(q => FAMILY_OF[q]));
    expect([...seen].sort()).toEqual(
      ['dim', 'dom', 'dom-alt', 'half-dim', 'maj', 'min'],
    );
  });

  it('reads the altered dominants as their own family', () => {
    expect(FAMILY_OF['7b9']).toBe('dom-alt');
    expect(FAMILY_OF['7#9']).toBe('dom-alt');
    expect(FAMILY_OF['7#9#5']).toBe('dom-alt');
    expect(FAMILY_OF['7']).toBe('dom');
    expect(FAMILY_OF['9']).toBe('dom');
  });

  it('keeps the extensions collapsing as they did', () => {
    // The part of the rule that was right stays right.
    expect(familyMatches('', 'maj7')).toBe(true);
    expect(familyMatches('maj7', 'maj9')).toBe(true);
    expect(familyMatches('m', 'm9')).toBe(true);
    expect(familyMatches('', 'm')).toBe(false);
    // A dominant accepts a plain major, and only in that direction.
    expect(familyMatches('7', '')).toBe(true);
    expect(familyMatches('', '7')).toBe(false);
  });
});

describe('an altered target is graded exactly', () => {
  it('refuses a plain dominant', () => {
    expect(familyMatches('7b9', '7')).toBe(false);
    expect(familyMatches('7#9#5', '7')).toBe(false);
    expect(familyMatches('7b9', '9')).toBe(false);
    // And a plain major, which a plain dominant would have accepted.
    expect(familyMatches('7b9', '')).toBe(false);
  });

  it('refuses a different alteration', () => {
    // The pair the ruling names: they are different sounds, and that
    // is the point.
    expect(familyMatches('7b9', '7#9#5')).toBe(false);
    expect(familyMatches('7#9#5', '7b9')).toBe(false);
    expect(familyMatches('7b9', '7#9')).toBe(false);
  });

  it('accepts itself, and only itself', () => {
    for (const wanted of ALL.filter(q => FAMILY_OF[q] === 'dom-alt')) {
      for (const built of ALL) {
        expect(familyMatches(wanted, built), `${wanted} ← ${built}`)
          .toBe(wanted === built);
      }
    }
  });

  it('does not answer a plain dominant either', () => {
    // The other direction, which the family check already handled: a
    // card wanting a plain 7 is not answered by a 7♭9.
    expect(familyMatches('7', '7b9')).toBe(false);
    expect(familyMatches('9', '7#9#5')).toBe(false);
  });
});

describe('the diminished and the half-diminished are apart', () => {
  it('do not answer each other, or anything else', () => {
    expect(familyMatches('dim7', 'm7b5')).toBe(false);
    expect(familyMatches('m7b5', 'dim7')).toBe(false);
    expect(familyMatches('m7b5', 'm7')).toBe(false);
    expect(familyMatches('dim7', 'dim7')).toBe(true);
    expect(familyMatches('m7b5', 'm7b5')).toBe(true);
  });
});

describe('the intervals are the chords chord recognition teaches', () => {
  it('writes an altered ninth above the octave, as the plain one is', () => {
    // The voicing engine stacks upward: a 9 written as 2 would sit
    // under the third and change the shape rather than the spelling.
    expect(CHORD_INTERVALS['7b9']).toEqual([0, 4, 7, 10, 13]);
    expect(CHORD_INTERVALS['7#9']).toEqual([0, 4, 7, 10, 15]);
    expect(CHORD_INTERVALS['7#9#5']).toEqual([0, 4, 8, 10, 15]);
    expect(CHORD_INTERVALS.dim7).toEqual([0, 3, 6, 9]);
    expect(CHORD_INTERVALS.m7b5).toEqual([0, 3, 6, 10]);
  });

  it('thins an altered dominant to a plain major triad', () => {
    // The same ruling the ear-training ladder follows: the rung is
    // what the hand plays there, and no hand plays a ♭9 in a triad.
    expect(TRIAD_OF['7b9']).toBe('');
    expect(TRIAD_OF['7#9#5']).toBe('');
  });
});

describe('the tile row is the card\'s, not the deck\'s', () => {
  it('is the eight, unchanged, where no altered chord is wanted', () => {
    expect(qualityTilesFor(['', 'm7', '7', 'maj9'])).toBe(QUALITIES);
    expect(qualityTilesFor([])).toBe(QUALITIES);
  });

  it('adds the two altered tiles where the card asks for one', () => {
    const tiles = qualityTilesFor(['maj7', '7b9']);
    expect(tiles.map(t => t.id)).toEqual([
      ...QUALITIES.map(q => q.id), '7b9', '7#9#5',
    ]);
    // BOTH, not only the one the card wants — offering exactly the
    // right answer and nothing near it is not a question.
    expect(tiles.map(t => t.id)).toContain('7#9#5');
  });

  it('labels them with glyphs rather than an ASCII b and #', () => {
    expect(ALTERED_QUALITIES.map(q => q.label)).toEqual(['7♭9', '7♯9♯5']);
  });

  it('works the same on the slash picker\'s shorter row', () => {
    const base = QUALITIES.filter(q => SLASH_QUALITY_IDS.includes(q.id));
    expect(qualityTilesFor(['m7'], base)).toBe(base);
    expect(qualityTilesFor(['7#9#5'], base).map(t => t.id))
      .toEqual([...base.map(q => q.id), '7b9', '7#9#5']);
  });

  it('adds nothing twice', () => {
    const once = qualityTilesFor(['7b9']);
    const twice = qualityTilesFor(['7b9'], once);
    expect(twice.map(t => t.id)).toEqual(once.map(t => t.id));
  });

  it('offers no card a diminished or half-diminished tile yet', () => {
    // They are in the grading map so a chord this app can NAME is a
    // chord this file can grade. No card in the six built-answer
    // families answers one, so no row offers one — when the passes'
    // cards arrive this is the line that says so.
    for (const tiles of [QUALITIES, qualityTilesFor(['7b9'])]) {
      expect(tiles.map(t => t.id)).not.toContain('dim7');
      expect(tiles.map(t => t.id)).not.toContain('m7b5');
    }
  });
});
