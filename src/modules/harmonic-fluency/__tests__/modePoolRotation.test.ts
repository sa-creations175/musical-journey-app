/**
 * Which decoys appear must not name the answer.
 *
 * ---------------------------------------------------------------
 * THE POOL WAS THE ANSWER KEY.
 *
 * Each degree carried a fixed `others` list, so an Aeolian answer was
 * always shown against Dorian, Phrygian and Locrian. Locrian appears in
 * no other pool — so Locrian on screen meant Aeolian, in every key,
 * without reading the question. 36 of the category's 52 cards.
 *
 * The fix is not "add more modes"; it is that every mode must be able
 * to sit beside more than one answer. That is what these assert.
 * ---------------------------------------------------------------
 */
import { describe, expect, it } from 'vitest';
import { FLASHCARDS } from '../catalog';

const GENERATED = FLASHCARDS.filter(c => c.id.startsWith('mo-mode-of-'));
const modeOf = (option: string) => option.trim().split(/\s+/).at(-1)!;

describe('the mode decoy pool rotates', () => {
  it('generates a card for eleven roots × three degrees', () => {
    expect(GENERATED.length).toBe(33);
  });

  it('never lets one mode name pin one answer', () => {
    const answers = new Map<string, Set<string>>();
    for (const card of GENERATED) {
      for (const d of card.decoys) {
        const m = modeOf(d);
        if (!answers.has(m)) answers.set(m, new Set());
        answers.get(m)!.add(modeOf(card.correctAnswer));
      }
    }
    const pinning = [...answers]
      .filter(([, a]) => a.size < 2)
      .map(([m, a]) => `${m} only ever appears with ${[...a][0]}`);
    expect(pinning).toEqual([]);
  });

  it('puts Locrian beside more than one answer — the original tell', () => {
    const withLocrian = GENERATED.filter(c => c.decoys.some(d => modeOf(d) === 'Locrian'));
    expect(withLocrian.length).toBeGreaterThan(0);
    expect(new Set(withLocrian.map(c => modeOf(c.correctAnswer))).size)
      .toBeGreaterThan(1);
  });

  it('draws on all seven modes across the category', () => {
    // All seven, including the three that are answers elsewhere: a
    // card's own answer is excluded from its own decoys, not from the
    // pool. Dorian is the answer on the 2 and a decoy on the 5 and 6,
    // which is the whole point — a mode that only ever appeared as a
    // decoy would still be a signpost, just a quieter one.
    const seen = new Set(GENERATED.flatMap(c => c.decoys.map(modeOf)));
    expect([...seen].sort()).toEqual([
      'Aeolian', 'Dorian', 'Ionian', 'Locrian', 'Lydian', 'Mixolydian', 'Phrygian',
    ]);
  });

  it('keeps the starting note identical across all four options', () => {
    // The question is which MODE, never which note. A decoy on a
    // different note would be answerable by reading the question's
    // note and matching it — a different leak in the same card.
    for (const card of GENERATED) {
      const note = (s: string) => s.slice(0, s.lastIndexOf(' '));
      for (const d of card.decoys) expect(note(d)).toBe(note(card.correctAnswer));
    }
  });

  it('gives different roots different decoy sets', () => {
    const aeolian = GENERATED.filter(c => modeOf(c.correctAnswer) === 'Aeolian');
    const shapes = new Set(aeolian.map(c => c.decoys.map(modeOf).sort().join('|')));
    expect(shapes.size).toBeGreaterThan(1);
  });
});
