/**
 * The six inversions, and the audit that goes with them.
 *
 * =====================================================================
 * WHAT THIS CAN AND CANNOT CHECK.
 *
 * It cannot check that a line is Silas's — only he can say that. What
 * it CAN check is the shape of a quotation: that the strings still read
 * like a player's notes rather than like copy, that the tells of a
 * rewrite are absent (his "⅓", his unfinished sentence, his lower-case
 * starts), and that nobody has tidied one of them on the way past.
 *
 * And it pins the audit: which of the six the deck asks for, which it
 * does not, and which of its own shapes are outside the six. That is a
 * fact about the deck today, and the day it changes somebody should
 * have decided to change it.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import {
  ESSENTIAL_INVERSIONS, essentialInversionForShape,
} from '../essentialInversions';
import { SLASH_SHAPES } from '../catalogExpansions';

describe('the six Silas keeps', () => {
  it('is six, and the 6 minor over its ♭7 is not one of them', () => {
    // "I only want these if the function is pretty clear." Number 7 in
    // the notes has a heading and no function under it.
    expect(ESSENTIAL_INVERSIONS.map(i => i.name)).toEqual([
      '1 / 3', '1 / 5', '4 / 5', '2 / 3', '3 / 3', '5 / 3',
    ]);
    expect(ESSENTIAL_INVERSIONS.some(i => i.chord === '6')).toBe(false);
  });

  it('gives every one of them a function, because that is the rule', () => {
    for (const i of ESSENTIAL_INVERSIONS) {
      expect(i.function.length, i.name).toBeGreaterThan(0);
      for (const line of i.function) expect(line.trim(), i.name).not.toBe('');
    }
  });

  it('leaves the SOUND line absent where Silas left it empty', () => {
    // An empty heading is not a missing string to fill in. Three of the
    // six have no SOUND written and are quoted with none.
    expect(ESSENTIAL_INVERSIONS.filter(i => i.sound !== undefined)
      .map(i => i.name)).toEqual(['1 / 3', '1 / 5', '2 / 3']);
  });

  it('keeps his own characters, tidied by nobody', () => {
    const byName = new Map(ESSENTIAL_INVERSIONS.map(i => [i.name, i]));
    // The fraction he typed.
    expect(byName.get('1 / 3')!.function[1]).toContain('⅓');
    // The sentence he did not finish.
    expect(byName.get('4 / 5')!.function[0]).toMatch(/^Resolves to One could/);
    // The lower-case start.
    expect(byName.get('3 / 3')!.function[0]).toMatch(/^you put the 3rd tone/);
    // His `#4`, not the app's ♯4 glyph.
    expect(byName.get('2 / 3')!.sound).toContain('#4');
  });

  it('names the bass twice, because the two conventions disagree', () => {
    // A degree of the CHORD, which is how the notes name it, and a
    // degree of the KEY, which is how the deck does. They agree only
    // where the chord is the 1.
    const disagree = ESSENTIAL_INVERSIONS
      .filter(i => i.bassOfChord !== i.bassOfKey)
      .map(i => i.name);
    expect(disagree).toEqual(['4 / 5', '2 / 3', '3 / 3', '5 / 3']);
    // The one that matters most: his 4/5 is F over C and the deck's
    // `4-5` card is F/G.
    const four = ESSENTIAL_INVERSIONS.find(i => i.name === '4 / 5')!;
    expect(four.inC).toBe('F/C');
    expect(four.shapeId).toBeNull();
    expect(SLASH_SHAPES.find(s => s.id === '4-5')!.bass).toBe('5');
  });
});

describe('the audit — the deck against the six', () => {
  const shapesInDeck = SLASH_SHAPES.map(s => s.id);

  it('asks for three of the six today', () => {
    // Linked by the CHORD, not by the label: `5-7` and Silas's `5 / 3`
    // are the same chord written two ways.
    const linked = ESSENTIAL_INVERSIONS
      .filter(i => i.shapeId !== null).map(i => i.shapeId);
    expect(linked).toEqual(['1-3', '1-5', '5-7']);
    for (const id of linked) expect(shapesInDeck, id!).toContain(id);
  });

  it('has no card for the other three', () => {
    expect(ESSENTIAL_INVERSIONS.filter(i => i.shapeId === null)
      .map(i => i.name)).toEqual(['4 / 5', '2 / 3', '3 / 3']);
  });

  it('and carries four shapes that are not on the list', () => {
    // 52 of the 91 generated cards. NOTHING IS RETIRED HERE — the audit
    // is the deliverable and what happens to these is Silas's call.
    const kept = new Set(ESSENTIAL_INVERSIONS.map(i => i.shapeId));
    expect(shapesInDeck.filter(id => !kept.has(id)))
      .toEqual(['4-5', '5-1', '1-4', '2-1']);
  });

  it('still generates 13 cards a shape, 91 in all', () => {
    expect(SLASH_SHAPES).toHaveLength(7);
  });

  it('looks a row up by the deck\'s shape id', () => {
    expect(essentialInversionForShape('5-7')!.name).toBe('5 / 3');
    expect(essentialInversionForShape('2-1')).toBeNull();
  });
});
