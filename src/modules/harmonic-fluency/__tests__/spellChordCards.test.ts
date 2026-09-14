/**
 * Spell the chord in a key — the family's shape and spelling.
 */
import { describe, expect, it } from 'vitest';
import { CHORD_INTERVALS } from '../../../lib/builtAnswers/chordShapes';
import { pitchClassOf } from '../../../lib/spelling';
import { THIRTEEN_KEYS } from '../catalogExpansions';
import { generateSpellChordCards, spellChord } from '../spellChordCards';

const cards = generateSpellChordCards();
const byId = new Map(cards.map(c => [c.id, c]));

describe('the family', () => {
  it('is thirteen keys by seven degrees, one card each', () => {
    expect(cards).toHaveLength(91);
    expect(new Set(cards.map(c => c.id)).size).toBe(91);
    expect(cards.every(c => c.category === 'chord-construction')).toBe(true);
  });

  it('asks in the app\'s words, and answers with the chord and its notes', () => {
    const f7 = byId.get('cc-spell-major-F-7')!;
    expect(f7.question).toBe('In the key of F major, build the 7 chord.');
    expect(f7.correctAnswer).toBe('Eø · E G B♭ D');
    expect(f7.explanation).toBe('Eø · E G B♭ D. The 7 chord in the key of F major is half-diminished.');
    expect(byId.get('cc-spell-major-C-1')!.correctAnswer).toBe('Cmaj7 · C E G B');
    expect(byId.get('cc-spell-major-C-5')!.correctAnswer).toBe('G7 · G B D F');
    expect(byId.get('cc-spell-major-C-2')!.correctAnswer).toBe('Dm7 · D F A C');
  });

  it('carries its coordinates for the built answer to read', () => {
    expect(byId.get('cc-spell-major-Gb-4')!.axis).toEqual({ key: 'Gb', degree: 4, scale: 'major' });
  });
});

describe('the chord', () => {
  it('is the seventh the major scale builds on each degree, in every key', () => {
    const qualities = ['maj7', 'm7', 'm7', 'maj7', '7', 'm7', 'm7b5'];
    for (const key of THIRTEEN_KEYS) {
      for (let d = 1; d <= 7; d += 1) {
        const chord = spellChord(key, String(d));
        expect(chord.quality, `${key} ${d}`).toBe(qualities[d - 1]);
        const rootPc = pitchClassOf(chord.rootAscii)!;
        expect(chord.pcs, `${key} ${d}`)
          .toEqual(CHORD_INTERVALS[chord.quality].map(t => (rootPc + t) % 12));
      }
    }
  });

  it('is spelled from the key\'s own letters, with the keyboard name where one is needed', () => {
    const fs7 = byId.get('cc-spell-major-F#-7')!;
    expect(fs7.correctAnswer).toBe('E♯ø · E♯ G♯ B D♯');
    expect(fs7.explanation).toContain('E♯');
    expect(fs7.explanation).toContain(' F');
  });

  it('writes ♭ and ♯, never b and #', () => {
    for (const c of cards) {
      for (const text of [c.question, c.correctAnswer, ...c.decoys, c.explanation ?? '']) {
        expect(text, c.id).not.toMatch(/#|(^|[^A-Za-z])[A-G]b(?![a-z])/);
      }
    }
  });

  it('takes a scale, and generates only major', () => {
    expect(() => spellChord('C', '1', 'minor' as never)).toThrow();
  });
});

describe('the decoys', () => {
  it('are three other sevenths, never the answer, never spelled with a double accidental', () => {
    for (const c of cards) {
      expect(c.decoys, c.id).toHaveLength(3);
      expect(c.decoys, c.id).not.toContain(c.correctAnswer);
      for (const d of c.decoys) expect(d, c.id).not.toMatch(/[𝄪𝄫]/u);
    }
  });
});
