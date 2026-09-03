/**
 * A scale degree and a note, in a named key.
 *
 * =====================================================================
 * THE SPELLING IS THE POINT, NOT A DETAIL OF IT.
 *
 * ♯4 and ♭5 are the same sound and different notes; ♭6 and 5 are
 * different sounds a semitone apart with different letters. A generator
 * that reached the right PITCH by the wrong letter would produce cards
 * that are wrong in exactly the way the family exists to correct, and
 * they would all look plausible.
 *
 * So the assertions here are about letters as much as about pitches.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import {
  CHROMATIC_DEGREES, accidentalWidth, degreeNoteAscii, degreePitchClass,
} from '../chromaticDegrees';
import {
  degreeNotePairs, isPressedCard, nameItCards, parsePressedId, placeItCards,
  pressItCards, pressedPitchClass, pressedRootPitchClass,
} from '../degreeNoteCards';
import { FLAT_TWELVE } from '../catalogExpansions';
import { pitchClassOf } from '../../../lib/spelling';

describe('the degree table', () => {
  it('spells the tritone both ways, as two different degrees', () => {
    // Same sound, different notes. A reader who answers G♭ to "the ♯4
    // of C" has made the mistake this family exists to catch, and it
    // cannot be caught if the table holds one entry.
    expect(degreeNoteAscii('C', '#4')).toBe('F#');
    expect(degreeNoteAscii('C', 'b5')).toBe('Gb');
    expect(degreePitchClass('C', '#4')).toBe(degreePitchClass('C', 'b5'));
  });

  it('spells altered degrees from the root’s own letter', () => {
    expect(degreeNoteAscii('C', 'b6')).toBe('Ab');
    expect(degreeNoteAscii('Ab', 'b6')).toBe('Fb');
    expect(degreeNoteAscii('E', 'b7')).toBe('D');
    expect(degreeNoteAscii('Db', 'b7')).toBe('Cb');
  });

  it('keeps one letter per degree number, however it is altered', () => {
    // The 6 and the ♭6 are both an A-something in C. If the ♭6 came
    // back as G♯ the pitch would be right and the card would be wrong.
    for (const root of FLAT_TWELVE) {
      const six = degreeNoteAscii(root, '6');
      const flatSix = degreeNoteAscii(root, 'b6');
      expect(six?.[0], `${root}`).toBe(flatSix?.[0]);
    }
  });

  it('spells every degree from every key', () => {
    for (const root of FLAT_TWELVE) {
      for (const degree of CHROMATIC_DEGREES) {
        expect(degreeNoteAscii(root, degree.id), `${degree.id} of ${root}`)
          .not.toBeNull();
      }
    }
  });

  it('lands on the pitch the semitone count says, every time', () => {
    // The letter is checked above; this is the other half. The two
    // together are what "letter-correct" means.
    for (const root of FLAT_TWELVE) {
      const rootPc = pitchClassOf(root)!;
      for (const degree of CHROMATIC_DEGREES) {
        expect(degreePitchClass(root, degree.id), `${degree.id} of ${root}`)
          .toBe((rootPc + degree.semitones) % 12);
      }
    }
  });

  it('places a double accidental, which a name lookup cannot', () => {
    // `pitchClassOf` has no row for B𝄫 — it reads a table of names. A
    // card that could not say where its own answer sits could not be
    // sounded or pressed.
    expect(degreeNoteAscii('Db', 'b5')).toBe('Abb');
    expect(pitchClassOf('Abb')).toBeNull();
    expect(degreePitchClass('Db', 'b5')).toBe(7);
  });
});

describe('the three card types', () => {
  it('asks the same grid three ways', () => {
    const pairs = degreeNotePairs().length;
    expect(nameItCards()).toHaveLength(pairs);
    expect(placeItCards()).toHaveLength(pairs);
    expect(pressItCards()).toHaveLength(pairs);
  });

  it('makes the two written directions distinct cards', () => {
    // Named Notes and Reverse Key Pivots are the same reversal for
    // keys, and the deck already treats those as two skills.
    const name = nameItCards().find(c => c.id === 'dgn-C-b6')!;
    const place = placeItCards().find(c => c.id === 'dgd-C-b6')!;
    expect(name.id).not.toBe(place.id);
    expect(name.correctAnswer).toBe('Ab');
    expect(place.correctAnswer).toBe('b6');
    expect(name.question).not.toBe(place.question);
    expect(name.skillTag).not.toBe(place.skillTag);
  });

  it('gives every card a unique id', () => {
    const all = [...nameItCards(), ...placeItCards(), ...pressItCards()];
    expect(new Set(all.map(c => c.id)).size).toBe(all.length);
  });

  it('never writes an accidental glyph or a # into an id', () => {
    // An id is a stable handle for spacing state, and a `#` in a URL is
    // a fragment marker rather than a sharp.
    for (const card of [...nameItCards(), ...placeItCards(), ...pressItCards()]) {
      expect(card.id, card.id).not.toMatch(/[#♯♭]/);
    }
  });

  it('offers the neighbouring degree as a decoy, which is the mistake', () => {
    // Answering the 6 when asked for the ♭6 is the failure mode, so it
    // has to be on screen.
    const card = nameItCards().find(c => c.id === 'dgn-C-b6')!;
    expect(card.decoys).toContain('A');
  });

  it('puts the same number with a different alteration on the degree cards', () => {
    const card = placeItCards().find(c => c.id === 'dgd-C-b6')!;
    expect(card.decoys).toContain('6');
  });

  it('writes the playable name beside a spelling nobody can play', () => {
    // E𝄫 is correct and unplayable as written; the bracket is the
    // instruction, not a footnote.
    //
    // A LONE DEGREE, ON PURPOSE. This used to read `dgn-Db-b5`, which
    // is one half of the ♯4 / ♭5 pair — and a joint answer now drops a
    // gloss its sibling already supplies. The claim here is about a
    // degree that has nobody beside it, which is where the bracket is
    // the only thing naming the key.
    //
    // WITHOUT THE BOLD MARKER. `noteWithPlayable` writes `(**D**)` for
    // a component that turns the asterisks into weight; a card's
    // explanation is a plain string rendered through no such component,
    // so four asterisks would reach the screen. The parenthetical is
    // the instruction and it survives — see `noteDisplay`.
    const card = nameItCards().find(c => c.id === 'dgn-Db-b2')!;
    expect(card.explanation).toContain('𝄫');
    expect(card.explanation).toContain('(D)');
    expect(card.explanation).not.toContain('*');
  });
});

describe('what a pressed answer is judged against', () => {
  it('knows which cards are answered by pressing', () => {
    expect(isPressedCard('dgp-C-b6')).toBe(true);
    expect(isPressedCard('dgn-C-b6')).toBe(false);
    expect(isPressedCard('dgd-C-b6')).toBe(false);
    expect(isPressedCard('tt-1')).toBe(false);
  });

  it('names the pitch class the press has to land on', () => {
    // Ab in C.
    expect(pressedPitchClass('dgp-C-b6')).toBe(8);
    // And the key itself, which is what the board marks.
    expect(pressedRootPitchClass('dgp-C-b6')).toBe(0);
  });

  it('answers for a sharpened degree, whose id carries an s', () => {
    expect(parsePressedId('dgp-C-s4')).toEqual({ root: 'C', degreeId: '#4' });
    expect(pressedPitchClass('dgp-C-s4')).toBe(6);
  });

  it('declines to judge a card that is not one of these', () => {
    expect(pressedPitchClass('tt-1')).toBeNull();
    expect(parsePressedId('sdm-2-down-m6')).toBeNull();
  });

  it('agrees with the card’s own written answer', () => {
    // The keyboard's rule and the card's `correctAnswer` are two
    // statements of one fact; if they disagreed, a right press would be
    // marked wrong.
    for (const card of pressItCards()) {
      const pc = pressedPitchClass(card.id);
      const spelled = pitchClassOf(card.correctAnswer);
      // A double accidental has no name lookup — checked by spelling
      // instead, which is what the card itself does.
      if (spelled !== null) expect(pc, card.id).toBe(spelled);
      expect(pc, card.id).not.toBeNull();
    }
  });
});

describe('the shape of the grid', () => {
  it('is every key against every degree', () => {
    expect(degreeNotePairs()).toHaveLength(
      FLAT_TWELVE.length * CHROMATIC_DEGREES.length,
    );
  });

  it('reaches a double accidental in ten places, and no further', () => {
    // Reported rather than hidden: these are the cards whose answer is
    // correct and unspeakable, and how many there are is a scope fact.
    const doubles = degreeNotePairs().filter(p => accidentalWidth(p.note) >= 2);
    expect(doubles).toHaveLength(10);
    for (const p of doubles) expect(accidentalWidth(p.note)).toBe(2);
  });
});
