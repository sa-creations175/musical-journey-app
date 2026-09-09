/**
 * Modal Improvisation — the cards, against the prototype that ruled them.
 *
 * Every assertion here reads `PROTOTYPE_CARDS`, which is the signed-off
 * click-through's own output rather than a retyped copy of the
 * generator. See that file's header for why the third copy is the one
 * that makes the other two checkable.
 */
import { describe, expect, it } from 'vitest';
import { FLASHCARDS, CATEGORY_LABELS, CATEGORY_ORDER } from '../catalog';
import { THIRTEEN_KEYS } from '../catalogExpansions';
import {
  MODAL_CHORDS, MODAL_IMPROV_CATEGORY_NAME, MODAL_IMPROV_STOPS, MINOR_TARGETS,
  modalCardId, modalCardText,
} from '../modalImprovisation';
import { chooseDecoys, tripped } from '../decoyGuard';
import { PROTOTYPE_CARDS } from './modalImprovisationPrototype';

const CARDS = FLASHCARDS.filter(c => c.category === 'modal-improvisation');
const BY_ID = new Map(CARDS.map(c => [c.id, c]));

describe('the family is registered', () => {
  it('has a label and a place in the order', () => {
    expect(CATEGORY_LABELS['modal-improvisation']).toBe(MODAL_IMPROV_CATEGORY_NAME);
    expect(MODAL_IMPROV_CATEGORY_NAME).toBe('Modal Improvisation');
    expect(CATEGORY_ORDER).toContain('modal-improvisation');
  });

  it('asks the prototype\'s ten chords in the prototype\'s thirteen keys', () => {
    expect(MODAL_CHORDS).toHaveLength(10);
    expect(MODAL_CHORDS.filter(c => c.kind === 'in')).toHaveLength(5);
    expect(MODAL_CHORDS.filter(c => c.kind === 'borrow')).toHaveLength(5);
    expect(THIRTEEN_KEYS).toHaveLength(13);
  });
});

describe('every card says what the prototype says', () => {
  it('is the prototype\'s 130 less exactly the four stops', () => {
    expect(PROTOTYPE_CARDS).toHaveLength(130);
    expect(MODAL_IMPROV_STOPS).toHaveLength(4);
    expect(CARDS).toHaveLength(126);

    const stopped = new Set(MODAL_IMPROV_STOPS.map(s => `${s.key}|${s.chord}`));
    const expected = PROTOTYPE_CARDS
      .filter(r => !stopped.has(`${r.key}|${r.chord}`))
      .map(r => modalCardId(r.chord, r.key));
    expect(CARDS.map(c => c.id)).toEqual(expected);
  });

  it('carries the question, the answer and the explanation word for word', () => {
    for (const row of PROTOTYPE_CARDS) {
      const card = BY_ID.get(modalCardId(row.chord, row.key));
      if (card === undefined) continue;
      expect(card.question, card.id).toBe(row.question);
      expect(card.correctAnswer, card.id).toBe(row.answer);
      expect(card.explanation, card.id).toBe(row.explanation);
    }
  });

  it('builds the same words for the four that are not in the deck', () => {
    // The stop is about the DECOYS. What those cards would say is
    // still the prototype's, and pinning it is what makes the stop
    // reversible the day the pool is widened.
    for (const stop of MODAL_IMPROV_STOPS) {
      const chord = MODAL_CHORDS.find(c => c.id === stop.chord)!;
      const row = PROTOTYPE_CARDS.find(
        r => r.key === stop.key && r.chord === stop.chord)!;
      const text = modalCardText(stop.key, chord);
      expect(text.question).toBe(row.question);
      expect(text.answer).toBe(row.answer);
      expect(text.explanation).toBe(row.explanation);
    }
  });

  it('names an in-key answer the key itself, and a borrowed one its target', () => {
    // The family's whole claim, asserted rather than illustrated.
    for (const row of PROTOTYPE_CARDS) {
      const chord = MODAL_CHORDS.find(c => c.id === row.chord)!;
      if (chord.kind === 'in') {
        expect(row.answer, `${row.key}|${row.chord}`).toContain(' major scale');
      } else {
        const minor = MINOR_TARGETS.has(chord.target!);
        expect(row.answer, `${row.key}|${row.chord}`)
          .toContain(minor ? ' melodic minor scale' : ' major scale');
      }
    }
  });
});

describe('the ids and the coordinates', () => {
  it('mints a prefix that has never existed', () => {
    const others = FLASHCARDS
      .filter(c => c.category !== 'modal-improvisation')
      .filter(c => c.id.startsWith('mi-'));
    expect(others).toEqual([]);
    for (const c of CARDS) expect(c.id.startsWith('mi-modal-'), c.id).toBe(true);
  });

  it('carries the key as written and the chord, on every card', () => {
    for (const c of CARDS) {
      expect(Object.keys(c.axis ?? {}).sort(), c.id).toEqual(['chord', 'key']);
      expect(THIRTEEN_KEYS, c.id).toContain(c.axis!.key);
      expect(MODAL_CHORDS.map(m => m.id), c.id).toContain(c.axis!.chord);
    }
  });

  it('gathers under the Number chip in the key, and the Progression chip out of it', () => {
    for (const c of CARDS) {
      const chord = MODAL_CHORDS.find(m => m.id === c.axis!.chord)!;
      expect(c.facets?.key, c.id).toBe(c.axis!.key);
      if (chord.kind === 'in') {
        expect(c.facets?.degree, c.id).toBe(chord.degree);
        expect(c.facets?.progression, c.id).toBeUndefined();
      } else {
        expect(c.facets?.progression, c.id).toBe(chord.facet);
        expect(c.facets?.degree, c.id).toBeUndefined();
      }
    }
  });

  it('spells the three new secondary dominants the way the two old ones are', () => {
    expect(MODAL_CHORDS.filter(c => c.kind === 'borrow').map(c => c.facet))
      .toEqual(['V/ii', 'V/iii', 'V/IV', 'V/V', 'V/vi']);
  });
});

describe('the decoys', () => {
  it('offers three, all of them another scale from the same key', () => {
    for (const c of CARDS) {
      expect(c.decoys, c.id).toHaveLength(3);
      const key = String(c.axis!.key);
      const answers = new Set(MODAL_CHORDS.map(m => modalCardText(key, m).answer));
      for (const d of c.decoys) {
        expect(answers.has(d), `${c.id}: ${d}`).toBe(true);
        expect(d).not.toBe(c.correctAnswer);
      }
    }
  });

  it('is answerable by no blind rule', () => {
    for (const c of CARDS) {
      expect(tripped(c.correctAnswer, c.decoys, c.category), c.id).toEqual([]);
    }
  });

  /**
   * THE STOP LIST IS EXACT, AND THIS IS WHAT MAKES IT A STATEMENT.
   *
   * Four cards cannot be given a fair set of wrong answers out of their
   * own key's ten, so they are not in the deck. A `try/catch` around
   * the generator would let a fifth join them silently. This asserts
   * both halves: every card named really is refused, and no card not
   * named is.
   */
  it('refuses exactly the four cards the stop list names', () => {
    const refused: string[] = [];
    for (const key of THIRTEEN_KEYS) {
      const answers = [...new Set(MODAL_CHORDS.map(m => modalCardText(key, m).answer))];
      for (const chord of MODAL_CHORDS) {
        const correct = modalCardText(key, chord).answer;
        try {
          chooseDecoys(correct, answers.filter(a => a !== correct), {
            count: 3, seed: modalCardId(chord.id, key),
            label: modalCardId(chord.id, key), category: 'modal-improvisation',
          });
        } catch {
          refused.push(`${key}|${chord.id}`);
        }
      }
    }
    expect(refused).toEqual(MODAL_IMPROV_STOPS.map(s => `${s.key}|${s.chord}`));
  });

  it('says which rule refuses each of the four', () => {
    // The rule is in the stop list so the report and the code cannot
    // disagree about WHY a card is missing.
    for (const stop of MODAL_IMPROV_STOPS) {
      const chord = MODAL_CHORDS.find(c => c.id === stop.chord)!;
      const correct = modalCardText(stop.key, chord).answer;
      const others = [...new Set(MODAL_CHORDS.map(m => modalCardText(stop.key, m).answer))]
        .filter(a => a !== correct);
      // Any three of them trip the named rule — that is what "no clean
      // set exists" means.
      expect(tripped(correct, others.slice(0, 3), 'modal-improvisation'),
        `${stop.key}|${stop.chord}`).toContain(stop.rule);
    }
  });
});
