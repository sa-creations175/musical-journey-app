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
  MODAL_CHORDS, MODAL_IMPROV_CATEGORY_NAME, MODAL_IMPROV_WIDENED, MINOR_TARGETS,
  modalCardId, modalCardText, modalDecoyPools,
} from '../modalImprovisation';
import { chooseDecoysOrNull, tripped } from '../decoyGuard';
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
  it('is the prototype\'s 130, all of them', () => {
    expect(PROTOTYPE_CARDS).toHaveLength(130);
    expect(CARDS).toHaveLength(130);
    expect(CARDS.map(c => c.id))
      .toEqual(PROTOTYPE_CARDS.map(r => modalCardId(r.chord, r.key)));
  });

  it('carries the question, the answer and the explanation word for word', () => {
    for (const row of PROTOTYPE_CARDS) {
      const card = BY_ID.get(modalCardId(row.chord, row.key))!;
      expect(card.question, card.id).toBe(row.question);
      expect(card.correctAnswer, card.id).toBe(row.answer);
      expect(card.explanation, card.id).toBe(row.explanation);
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
  it('offers three, every one of them a scale this family names', () => {
    const everyAnswer = new Set(
      THIRTEEN_KEYS.flatMap(k => MODAL_CHORDS.map(m => modalCardText(k, m).answer)));
    for (const c of CARDS) {
      expect(c.decoys, c.id).toHaveLength(3);
      for (const d of c.decoys) {
        expect(everyAnswer.has(d), `${c.id}: ${d}`).toBe(true);
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
   * NO CARD IS REFUSED, AND FOUR REACH NEXT DOOR.
   *
   * Both halves matter. The first is the ruling — 130 cards, none of
   * them answerable without the question. The second is what keeps the
   * widening honest: a `try the next pool` loop that quietly widened
   * for forty cards would look identical from outside, and every one
   * of those forty would be offering wrong answers from a key its
   * question never mentions.
   */
  it('builds every card from its own key, or from exactly one key next door', () => {
    const widened: string[] = [];
    for (const key of THIRTEEN_KEYS) {
      for (const chord of MODAL_CHORDS) {
        const correct = modalCardText(key, chord).answer;
        const id = modalCardId(chord.id, key);
        const opts = {
          count: 3, seed: id, label: id, category: 'modal-improvisation',
        };
        const pools = modalDecoyPools(key, correct);
        const depth = pools.findIndex(
          pool => chooseDecoysOrNull(correct, pool, opts) !== null);
        // Nothing is refused at every depth — the "asserts zero" half.
        expect(depth, id).toBeGreaterThanOrEqual(0);
        if (depth > 0) widened.push(`${key}|${chord.id}`);
      }
    }
    expect(widened).toEqual(MODAL_IMPROV_WIDENED.map(w => `${w.key}|${w.chord}`));
  });

  it('says which rule sent each of the four next door, and to which key', () => {
    for (const w of MODAL_IMPROV_WIDENED) {
      const chord = MODAL_CHORDS.find(c => c.id === w.chord)!;
      const correct = modalCardText(w.key, chord).answer;
      const [own] = modalDecoyPools(w.key, correct);
      // Any three of its own key trip the named rule — which is what
      // "no clean set exists at home" means.
      expect(tripped(correct, own.slice(0, 3), 'modal-improvisation'),
        `${w.key}|${w.chord}`).toContain(w.rule);
      // And the card really does end up carrying one from next door.
      const card = BY_ID.get(modalCardId(w.chord, w.key))!;
      const fromNextDoor = card.decoys.filter(d => !own.includes(d));
      expect(fromNextDoor.length, card.id).toBeGreaterThan(0);
      const neighbour = new Set(
        MODAL_CHORDS.map(c => modalCardText(w.from, c).answer));
      for (const d of fromNextDoor) expect(neighbour.has(d), `${card.id}: ${d}`).toBe(true);
    }
  });

  it('leaves the other 126 drawing only on their own key', () => {
    const widened = new Set(MODAL_IMPROV_WIDENED.map(w => `${w.key}|${w.chord}`));
    for (const c of CARDS) {
      const key = String(c.axis!.key);
      if (widened.has(`${key}|${String(c.axis!.chord)}`)) continue;
      const own = new Set(MODAL_CHORDS.map(m => modalCardText(key, m).answer));
      for (const d of c.decoys) expect(own.has(d), `${c.id}: ${d}`).toBe(true);
    }
  });
});
