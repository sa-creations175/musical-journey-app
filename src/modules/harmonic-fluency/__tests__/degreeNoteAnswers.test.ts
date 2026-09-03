/**
 * What an answer says, now that Silas has ruled on it.
 *
 * =====================================================================
 * HE IS NOT BEING TESTED ON WHICH NAME IS CORRECT.
 *
 *   "I need to understand it from whenever someone would say flat five.
 *    What is the flat five? Sharp four. I just wanna know it from
 *    whenever I hear it or think about it or see it. I want it to just
 *    be automatic."
 *
 * Three rules come out of that, and each one has a failure this file
 * exists to catch:
 *
 *   · A NOTE ANSWER CARRIES THE KEY A PLAYER WOULD PRESS beside the
 *     letter-correct name — F♭ (E), E♯ (F), A𝄫 (G). Wherever the two
 *     differ, not only on the doubles. The failure is a reader marking
 *     an answer wrong because they were looking for E.
 *   · A DEGREE ANSWER NAMES BOTH — ♯4 / ♭5 — AND SO DOES ITS NOTE,
 *     in the same order: F♯ / G♭. Naming both degrees beside one note
 *     said G♭ was the ♯4, which it is not. Lining the two lists up is
 *     exactly right and still says both names are one key. The pair is
 *     never two OPTIONS, because two buttons reading the same thing is
 *     being marked wrong for picking the one that reads the same.
 *   · THE DISTANCE IS NAMED WHERE IT HAS A NAME. Only the tritone does,
 *     and nothing else in the table is given one.
 *
 * A QUESTION STILL NAMES ONE DEGREE, and that is the fourth assertion.
 * "What is the ♯4 / ♭5 of C" has two right answers — F♯ and G♭ — so
 * the both-names label belongs on the answer side and nowhere else.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import {
  degreeAnswerLabel, degreeLabel, degreeNoteOptionLabel, isTritoneDegree,
  jointDegreeIds, nameItCards, noteDisplay, placeItCards, pressItCards,
  pressedPitchClass, TRITONE_DEGREE_IDS,
} from '../degreeNoteCards';
import { CHROMATIC_DEGREES } from '../chromaticDegrees';

const BOTH = '♯4 / ♭5';

describe('a degree given as an answer', () => {
  it('names both, on each of the pair', () => {
    expect(degreeAnswerLabel('#4')).toBe(`${BOTH} (tritone)`);
    expect(degreeAnswerLabel('b5')).toBe(`${BOTH} (tritone)`);
  });

  it('names the distance only where the distance has a name', () => {
    // THE HONEST LENGTH OF THAT LIST IS ONE. A ♭3 is not "the blue
    // note" — ♭3, ♭5 and ♭7 are all called that and none of them
    // exclusively; the ♭7 has no name but its number; and "unison" is a
    // word about two voices, not about the tonic degree. Inventing one
    // would be giving a reader a word to learn wrongly.
    for (const degree of CHROMATIC_DEGREES) {
      const label = degreeAnswerLabel(degree.id);
      if (isTritoneDegree(degree.id)) continue;
      expect(label, degree.id).toBe(degreeLabel(degree.id));
      expect(label, degree.id).not.toContain('(');
    }
  });

  it('leaves every other degree exactly as it reads in a question', () => {
    expect(degreeAnswerLabel('b6')).toBe('♭6');
    expect(degreeAnswerLabel('1')).toBe('1');
  });
});

describe('a question still names one degree', () => {
  it('asks for the ♯4 and for the ♭5 separately', () => {
    // Two functions, two cards — the ♯4 rises out of a major context
    // and the ♭5 falls inside a minor or diminished one.
    const sharp = nameItCards().find(c => c.id === 'dgn-C-s4')!;
    const flat = nameItCards().find(c => c.id === 'dgn-C-b5')!;
    expect(sharp.question).toContain('what is the ♯4?');
    expect(flat.question).toContain('what is the ♭5?');
    expect(sharp.question).not.toContain('/');
    expect(flat.question).not.toContain('/');
  });

  it('and they have different answers, because they are different notes', () => {
    // The reason the both-names label cannot go in the question.
    expect(nameItCards().find(c => c.id === 'dgn-C-s4')!.correctAnswer).toBe('F#');
    expect(nameItCards().find(c => c.id === 'dgn-C-b5')!.correctAnswer).toBe('Gb');
  });

  it('says both in the explanation, which is the answer side', () => {
    const card = nameItCards().find(c => c.id === 'dgn-C-s4')!;
    expect(card.explanation).toBe(`The ${BOTH} (tritone) of C is F♯ / G♭.`);
  });
});

describe('a joint answer is in the same order as the joint label', () => {
  it('lines the notes up with the names on all three types', () => {
    // ♯4 → F♯, ♭5 → G♭, read left to right. And both cards of the pair
    // say the same sentence, because it is one fact.
    for (const id of ['dgn-C-s4', 'dgn-C-b5']) {
      expect(nameItCards().find(c => c.id === id)!.explanation)
        .toBe(`The ${BOTH} (tritone) of C is F♯ / G♭.`);
    }
    for (const id of ['dgd-C-s4', 'dgd-C-b5']) {
      expect(placeItCards().find(c => c.id === id)!.explanation)
        .toBe(`F♯ / G♭ is the ${BOTH} (tritone) of C.`);
    }
    for (const id of ['dgp-C-s4', 'dgp-C-b5']) {
      expect(pressItCards().find(c => c.id === id)!.explanation)
        .toBe(`The ${BOTH} (tritone) of C is F♯ / G♭.`);
    }
  });

  it('takes both orders from one list, so they cannot drift apart', () => {
    // THE REVERSAL THIS PROTECTS AGAINST. If the names were ever
    // reordered without the notes, the sentence would go back to being
    // wrong in exactly the way this fixed. Both `map` the same
    // constant, so the check is that the nth name's own note is the nth
    // note — derived, not typed out.
    for (const root of ['C', 'B', 'Db', 'F']) {
      const card = nameItCards()
        .find(c => c.id === `dgn-${root.replace('#', 's')}-s4`)!;
      const ids = jointDegreeIds('#4')!;
      const names = ids.map(degreeLabel).join(' / ');
      const notes = ids.map(id => noteDisplay(root, id)).join(' / ');
      expect(card.explanation, root)
        .toBe(`The ${names} (tritone) of ${root} is ${notes}.`);
    }
  });

  it('leaves a single-named degree with a single answer', () => {
    // Only the joint label changes. Nothing else in the thirteen has
    // two names, and none of them gained a second note.
    expect(nameItCards().find(c => c.id === 'dgn-Ab-b6')!.explanation)
      .toBe('The ♭6 of Ab is F♭ (E).');
    expect(placeItCards().find(c => c.id === 'dgd-C-5')!.explanation)
      .toBe('G is the 5 of C.');
    for (const card of [...nameItCards(), ...placeItCards(), ...pressItCards()]) {
      const joint = card.explanation!.includes(BOTH);
      expect(joint, card.id).toBe(isTritoneDegree(String(
        (card as { axis: Record<string, string | number> }).axis.degree,
      )));
    }
  });

  it('never puts a joint note in a question', () => {
    // "In the key of C, F♯ / G♭ is which degree?" would hand over half
    // the answer. A question is about one spelling.
    for (const card of [...nameItCards(), ...placeItCards(), ...pressItCards()]) {
      expect(card.question, card.id).not.toContain(' / ');
    }
  });
});

describe('the pair is never two options', () => {
  it('never offers the twin as a decoy on either card', () => {
    for (const id of TRITONE_DEGREE_IDS) {
      for (const card of placeItCards().filter(c => c.correctAnswer === id)) {
        for (const other of TRITONE_DEGREE_IDS) {
          expect(card.decoys, `${card.id} offered ${other}`).not.toContain(other);
        }
      }
    }
  });

  it('so no two options on one card ever read the same', () => {
    // The blanket form: whatever the labels become, a reader must
    // always be able to tell the four apart.
    for (const card of placeItCards()) {
      const labels = [card.correctAnswer, ...card.decoys]
        .map(o => degreeNoteOptionLabel(card.id, o));
      expect(new Set(labels).size, card.id).toBe(labels.length);
    }
  });

  it('still puts the same number differently altered on screen', () => {
    // Unchanged: answering the 6 when asked for the ♭6 is the mistake
    // the family exists to catch, so the twin by NUMBER is still
    // required. Only the twin by SOUND is excluded.
    const card = placeItCards().find(c => c.id === 'dgd-C-s4')!;
    expect(card.decoys).toContain('4');
  });
});

describe('a note given as an answer', () => {
  it('carries the key a player would press, on a single accidental', () => {
    expect(degreeNoteOptionLabel('dgn-Ab-b6', 'Fb')).toBe('F♭ (E)');
    expect(degreeNoteOptionLabel('dgn-B-s4', 'E#')).toBe('E♯ (F)');
  });

  it('and on a double, which the shell’s own rule does not reach', () => {
    // `glossTheoreticalSpellings` matches one accidental by design, so
    // `Abb` reached the screen with nothing beside it. This is the
    // "not only to double accidentals" half of the ruling, in the
    // direction the shell was missing.
    expect(degreeNoteOptionLabel('dgn-Db-b5', 'Abb')).toBe('A𝄫 (G)');
  });

  it('leaves an ordinary spelling alone', () => {
    expect(degreeNoteOptionLabel('dgn-C-5', 'G')).toBe('G');
    expect(degreeNoteOptionLabel('dgn-C-s4', 'F#')).toBe('F♯');
  });

  it('carries no markdown, because a card string reaches no component', () => {
    for (const card of [...nameItCards(), ...placeItCards(), ...pressItCards()]) {
      expect(card.explanation, card.id).not.toContain('*');
      expect(card.question, card.id).not.toContain('*');
    }
  });

  it('has no opinion about any other family’s options', () => {
    // Null falls through to the shell's own rule unchanged.
    expect(degreeNoteOptionLabel('nn-12', 'B')).toBeNull();
    expect(degreeNoteOptionLabel('tt-1', 'F#')).toBeNull();
  });
});

describe('on the pressed card, either name is the same key', () => {
  it('accepts one key for both members of the pair', () => {
    // "He must never be marked wrong for thinking of it as the other
    // one." On a keyboard he cannot be: they are one key, and this is
    // the assertion that says so rather than assuming it.
    for (const root of ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']) {
      const id = (degree: string) =>
        `dgp-${root.replace('#', 's')}-${degree.replace('#', 's')}`;
      const sharp = pressedPitchClass(id('#4'));
      const flat = pressedPitchClass(id('b5'));
      expect(sharp, root).not.toBeNull();
      expect(sharp, root).toBe(flat);
    }
  });

  it('and asks for one of them at a time', () => {
    const card = pressItCards().find(c => c.id === 'dgp-C-b5')!;
    expect(card.question).toBe('In the key of C, press the ♭5.');
  });
});
