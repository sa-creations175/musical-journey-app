/**
 * Spell the chord in a key: Chord Construction's generated family.
 *
 * =====================================================================
 * ONE CARD PER KEY × DEGREE (Silas, 14 Sep 2026; walked on tab 2 of
 * `hf-restructure-walk.html`): "In the key of F major, build the 7
 * chord." The reader taps the notes on the shared keyboard and checks;
 * the reveal names the chord and plays it.
 *
 * It replaces the eight key-of-C "contains the notes" cards, which
 * asked the same thing in one key and answered from four lists.
 *
 * =====================================================================
 * THE KEY SPELLS THE CHORD. Every note of a diatonic seventh is a degree
 * of its key, so the chord on the 7 of F♯ major is written from the key's
 * own letters: E♯ G♯ B D♯, never F G♯ B D♯. The theoretical spellings
 * carry their keyboard name in the explanation, as every generated
 * family does (`keyboardNote`).
 *
 * THE NAMES ARE THE DIATONIC CARDS': major 7 (maj7), minor 7 (m7),
 * dominant 7 (7), half-diminished (ø).
 *
 * =====================================================================
 * MAJOR ONLY, FOR NOW. The generator takes the scale as an argument so the
 * minors can arrive as the same shape per scale; only major is generated,
 * and asking for another throws rather than inventing one.
 * =====================================================================
 */
import type { Flashcard } from './catalog';
import { degreeAscii, degreeAsciiOrNull, keyboardNote, noteLabel, THIRTEEN_KEYS } from './catalogExpansions';
import { chooseDecoys } from './decoyGuard';
import type { QualityId } from '../../lib/builtAnswers/chordShapes';
import { pitchClassOf } from '../../lib/spelling';

export type SpellScale = 'major';

/** The scales the family is generated in today. */
export const SPELL_SCALES: ReadonlyArray<SpellScale> = ['major'];

export const SPELL_DEGREES: ReadonlyArray<string> = ['1', '2', '3', '4', '5', '6', '7'];

/** The seventh chord on each degree, by scale. */
const QUALITY_BY_DEGREE: Readonly<Record<SpellScale, ReadonlyArray<QualityId>>> = {
  major: ['maj7', 'm7', 'm7', 'maj7', '7', 'm7', 'm7b5'],
};

/** The four sevenths, as the Diatonic cards name them. */
export const SPELL_QUALITIES: Readonly<Record<string, { suffix: string; word: string; degrees: readonly string[] }>> = {
  maj7: { suffix: 'maj7', word: 'major 7', degrees: ['1', '3', '5', '7'] },
  m7: { suffix: 'm7', word: 'minor 7', degrees: ['1', 'b3', '5', 'b7'] },
  '7': { suffix: '7', word: 'dominant 7', degrees: ['1', '3', '5', 'b7'] },
  m7b5: { suffix: 'ø', word: 'half-diminished', degrees: ['1', 'b3', 'b5', 'b7'] },
};

export interface SpelledChord {
  rootAscii: string;
  quality: QualityId;
  /** "Eø", "Fmaj7". */
  symbol: string;
  word: string;
  /** The chord's notes, ASCII, root first. */
  notes: string[];
  pcs: number[];
}

/** A note one accidental lower, or null past a double flat. */
function lowered(ascii: string): string | null {
  const letter = ascii[0];
  const acc = ascii.slice(1);
  if (acc === '#') return letter;
  if (acc === '') return `${letter}b`;
  if (acc === '##') return `${letter}#`;
  return null;
}

/** A chord of a quality on any root, spelled from the root's letter. */
function spellOn(rootAscii: string, quality: string): string[] | null {
  const spec = SPELL_QUALITIES[quality];
  if (spec === undefined) return null;
  const out: string[] = [];
  for (const d of spec.degrees) {
    const note = d === 'b5'
      ? (() => { const five = degreeAsciiOrNull(rootAscii, '5'); return five === null ? null : lowered(five); })()
      : degreeAsciiOrNull(rootAscii, d);
    if (note === null) return null;
    out.push(note);
  }
  return out;
}

const pcsOf = (notes: readonly string[]): number[] =>
  notes.map(n => pitchClassOf(n)).filter((pc): pc is number => pc !== null);

/**
 * The chord a card asks for: the seventh on `degree` of `key`'s scale,
 * spelled from the key's own degrees. What the card is written from, and
 * what the built answer grades against.
 */
export function spellChord(key: string, degree: string, scale: SpellScale = 'major'): SpelledChord {
  if (scale !== 'major') throw new Error(`spell the chord: no ${String(scale)} yet`);
  const index = SPELL_DEGREES.indexOf(degree);
  if (index < 0) throw new Error(`spell the chord: no degree ${degree}`);
  const quality = QUALITY_BY_DEGREE[scale][index];
  // THE KEY'S OWN DEGREES: the 1, 3, 5 and 7 of the chord are the key's
  // degree, degree+2, degree+4 and degree+6.
  const notes = [0, 2, 4, 6].map(step => degreeAscii(key, SPELL_DEGREES[(index + step) % 7]));
  const spec = SPELL_QUALITIES[quality];
  return {
    rootAscii: notes[0],
    quality,
    symbol: `${noteLabel(notes[0])}${spec.suffix}`,
    word: spec.word,
    notes,
    pcs: pcsOf(notes),
  };
}

/** The card's answer: "Eø · E G B♭ D". */
const written = (symbol: string, notes: readonly string[]) =>
  `${symbol} · ${notes.map(noteLabel).join(' ')}`;

export function spellCardId(scale: SpellScale, key: string, degree: string): string {
  return `cc-spell-${scale}-${key}-${degree}`;
}

/** Every card of the family in one scale: 13 keys × 7 degrees. */
export function generateSpellChordCards(scale: SpellScale = 'major'): Flashcard[] {
  const out: Flashcard[] = [];
  for (const key of THIRTEEN_KEYS) {
    for (const degree of SPELL_DEGREES) {
      const chord = spellChord(key, degree, scale);
      const id = spellCardId(scale, key, degree);
      const answer = written(chord.symbol, chord.notes);
      // THE WRONG ANSWERS A READER WOULD BUILD: the key's other six
      // sevenths (the wrong degree), then every other seventh on every
      // root of the key (the wrong quality), which is what gives an
      // all-natural answer natural-note company in a sharp or flat key. Never shown — the keyboard is the answer
      // surface — and chosen by the guard all the same, so a set that
      // would give the answer away on a four-button fallback cannot ship.
      const pool: string[] = [];
      for (const other of SPELL_DEGREES) {
        if (other === degree) continue;
        const chord2 = spellChord(key, other, scale);
        pool.push(written(chord2.symbol, chord2.notes));
      }
      const roots = SPELL_DEGREES.map(d => degreeAscii(key, d));
      for (const root of roots) {
        for (const quality of Object.keys(SPELL_QUALITIES)) {
          const notes = spellOn(root, quality);
          // NO DOUBLE SHARP OR DOUBLE FLAT: no answer in this family needs
          // one, so a decoy spelled with F𝄪 is a wrong answer nobody would
          // build.
          if (notes === null || notes.some(n => n.endsWith('##') || n.endsWith('bb'))) continue;
          const option = written(`${noteLabel(root)}${SPELL_QUALITIES[quality].suffix}`, notes);
          if (option !== answer && !pool.includes(option)) pool.push(option);
        }
      }
      out.push({
        category: 'chord-construction',
        categoryName: 'Chord Construction',
        id,
        axis: { key, degree: Number(degree), scale },
        question: `In the key of ${noteLabel(key)} major, build the ${degree} chord.`,
        correctAnswer: answer,
        decoys: chooseDecoys(answer, pool, { count: 3, seed: id, label: id, category: 'chord-construction' }),
        explanation: `${answer}. The ${degree} chord in the key of ${noteLabel(key)} major is ${chord.word}.`
          + keyboardNote(...chord.notes),
        skillTag: `chord-spell-${scale}-${key}-${degree}`,
      });
    }
  }
  return out;
}
