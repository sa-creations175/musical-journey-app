/**
 * maj7♯11, spelled by interval.
 *
 * ---------------------------------------------------------------
 * THE NATURAL-LETTER ROOTS ARE THE ONES THAT MATTER.
 *
 * A test covering C and F proves nothing: their ♯11s are F♯ and B, two
 * notes any pitch-class table spells correctly by accident. The cases
 * that separate a real implementation from a lucky one are the roots
 * whose ♯11 lands on a letter the twelve-slot tables cannot name:
 *
 *   A  → ♯11 is D♯. A flats-preferring table says E♭, which over an A
 *        root reads as a ♭5 — a lowered fifth, a different chord.
 *   B  → ♯11 is E♯. NO pitch-class table can produce this at all:
 *        E♯ is not a second name for a black key, it is a different
 *        letter on F's slot.
 *
 * So all twelve are pinned, and the two above are the reason.
 * ---------------------------------------------------------------
 */
import { describe, expect, it } from 'vitest';
import {
  QUADRANT_ROOTS, initialSelection, maj7Sharp11, rootLabel, rowOfRoot,
} from '../lydianChords';

/** The twelve chords, as they are written. */
const EXPECTED: ReadonlyArray<[string, string]> = [
  ['C',  'C E G B F♯'],
  ['F',  'F A C E B'],
  ['Bb', 'B♭ D F A E'],
  ['Eb', 'E♭ G B♭ D A'],
  ['Ab', 'A♭ C E♭ G D'],
  ['Db', 'D♭ F A♭ C G'],
  ['Gb', 'G♭ B♭ D♭ F C'],
  ['B',  'B D♯ F♯ A♯ E♯'],
  ['E',  'E G♯ B D♯ A♯'],
  ['A',  'A C♯ E G♯ D♯'],
  ['D',  'D F♯ A C♯ G♯'],
  ['G',  'G B D F♯ C♯'],
];

const spell = (root: string) =>
  (maj7Sharp11(root) ?? []).map(n => n.label).join(' ');

describe('the twelve maj7♯11 spellings', () => {
  for (const [root, expected] of EXPECTED) {
    it(`${root} → ${expected}`, () => {
      expect(spell(root)).toBe(expected);
    });
  }

  it('uses five consecutive letters, each exactly once, on every root', () => {
    // The structural rule underneath the fixture. A chord with two
    // F-letters and no E is a different chord that happens to sound
    // the same, and this catches that on a root the fixture might
    // some day miss.
    for (const [root] of EXPECTED) {
      const letters = (maj7Sharp11(root) ?? []).map(n => n.label[0]);
      expect(new Set(letters).size).toBe(5);
    }
  });

  it('always puts the ♯11 last', () => {
    // What the active row's marking depends on.
    expect(spell('C').split(' ').at(-1)).toBe('F♯');
    expect(spell('B').split(' ').at(-1)).toBe('E♯');
    expect(spell('A').split(' ').at(-1)).toBe('D♯');
  });
});

describe('the ♯11 is a raised FOURTH, never a lowered fifth', () => {
  it('spells A maj7♯11 with D♯, not E♭', () => {
    // The app defaults to flats. E♭ over an A root is a ♭5.
    const notes = spell('A');
    expect(notes).toContain('D♯');
    expect(notes).not.toContain('E♭');
  });

  it('spells B maj7♯11 with E♯, which no pitch-class table can emit', () => {
    const notes = spell('B');
    expect(notes).toContain('E♯');
    expect(notes).not.toContain('F ');
    expect(notes.endsWith('F')).toBe(false);
  });
});

describe('the parenthetical, on exactly four accidentals', () => {
  it('gives E♯ its common name', () => {
    const sharp11 = maj7Sharp11('B')!.at(-1)!;
    expect(sharp11.label).toBe('E♯');
    expect(sharp11.common).toBe('F');
  });

  it('gives ordinary accidentals none', () => {
    // D♯, C♯, G♭ and the rest read plain — a parenthetical on every
    // black key would be noise around the one case that needs it.
    for (const note of maj7Sharp11('A')!) {
      expect(note.common).toBeUndefined();
    }
    for (const note of maj7Sharp11('Gb')!) {
      expect(note.common).toBeUndefined();
    }
  });
});

describe('the rows', () => {
  it('are the app’s four quadrants, in circle-of-fourths order', () => {
    expect(QUADRANT_ROOTS).toEqual([
      ['C', 'F', 'Bb'],
      ['Eb', 'Ab', 'Db'],
      ['Gb', 'B', 'E'],
      ['A', 'D', 'G'],
    ]);
  });

  it('substitutes G♭ for the circle’s F♯ identity as a ROOT', () => {
    // Two spellings of ONE chord — B♯ and C are the same key, as are
    // E♯ and F. Both are correct; the row picks G♭ because F♯'s
    // spelling needs two theoretical accidentals to say the same thing.
    expect(spell('F#')).toBe('F♯ A♯ C♯ E♯ B♯');
    expect(spell('Gb')).toBe('G♭ B♭ D♭ F C');
  });

  it('renders root names with the app’s glyphs', () => {
    expect(rootLabel('Bb')).toBe('B♭');
    expect(rootLabel('F#')).toBe('F♯');
    expect(rootLabel('C')).toBe('C');
  });
});

describe('which key a card opens on', () => {
  it('defaults to the first of each quadrant', () => {
    expect(initialSelection()).toEqual(['C', 'Eb', 'Gb', 'A']);
  });

  it('opens mo-3 on F without disturbing the other rows', () => {
    // The ONE parameter the two cards differ by.
    expect(initialSelection('F')).toEqual(['F', 'Eb', 'Gb', 'A']);
  });

  it('falls back rather than opening on nothing for an unknown root', () => {
    expect(initialSelection('H')).toEqual(['C', 'Eb', 'Gb', 'A']);
  });

  it('knows which row a root is in', () => {
    expect(rowOfRoot('F')).toBe(0);
    expect(rowOfRoot('B')).toBe(2);
    expect(rowOfRoot('H')).toBeNull();
  });
});
