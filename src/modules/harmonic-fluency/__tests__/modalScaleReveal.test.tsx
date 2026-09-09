// @vitest-environment jsdom
/**
 * The answer scale on the reveal, against the row the prototype drew.
 *
 * `PROTOTYPE_CARDS[].scale` is the prototype's own `scaleNotes` with
 * its own `.alt` marks, for all 130. Everything here is checked against
 * that rather than against the generator's own arithmetic.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { FLASHCARDS } from '../catalog';
import { THIRTEEN_KEYS } from '../catalogExpansions';
import {
  MODAL_CHORDS, MINOR_TARGETS, modalAnswerScale, modalCardId,
} from '../modalImprovisation';
import ModalScaleReveal from '../ModalScaleReveal';
import { PROTOTYPE_CARDS } from './modalImprovisationPrototype';

const CARDS = FLASHCARDS.filter(c => c.category === 'modal-improvisation');
const BY_ID = new Map(CARDS.map(c => [c.id, c]));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  act(() => { root?.unmount(); });
  host?.remove();
  host = null;
  root = null;
});

/** The reveal, mounted, with its note row read back off the DOM. */
function draw(id: string): HTMLElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(<ModalScaleReveal card={BY_ID.get(id)!} />);
  });
  return host.querySelector('[data-testid="modal-scale"]') as HTMLElement;
}

describe('the scale is the prototype\'s, note for note and mark for mark', () => {
  it('matches on all 130', () => {
    for (const row of PROTOTYPE_CARDS) {
      const chord = MODAL_CHORDS.find(c => c.id === row.chord)!;
      expect(modalAnswerScale(row.key, chord), `${row.key}|${row.chord}`)
        .toEqual(row.scale.map(n => ({ note: n.note, outside: n.outside })));
    }
  });

  it('is seven notes, one per letter, from the scale\'s own root', () => {
    for (const row of PROTOTYPE_CARDS) {
      const chord = MODAL_CHORDS.find(c => c.id === row.chord)!;
      const scale = modalAnswerScale(row.key, chord);
      expect(scale, `${row.key}|${row.chord}`).toHaveLength(7);
      // ONE PER LETTER is what makes it a scale rather than a set of
      // pitches — it is why G♯ melodic minor's seventh is F𝄪.
      const letters = scale.map(n => n.note[0]);
      expect(new Set(letters).size, `${row.key}|${row.chord}`).toBe(7);
      // And it starts on the root the answer names.
      expect(row.answer.startsWith(`Notes of the ${scale[0].note} `),
        `${row.key}|${row.chord}`).toBe(true);
    }
  });

  it('marks nothing on an in-key card', () => {
    for (const key of THIRTEEN_KEYS) {
      for (const chord of MODAL_CHORDS.filter(c => c.kind === 'in')) {
        const scale = modalAnswerScale(key, chord);
        expect(scale.some(n => n.outside), `${key}|${chord.id}`).toBe(false);
      }
    }
  });

  /**
   * =====================================================================
   * HOW MANY NOTES ARE MARKED — AND THE SENTENCE ABOVE THEM.
   *
   * A MAJOR target is the key one step round the circle, so exactly one
   * note is outside: the 5 of 5 raises the key's 4, the 5 of 4 lowers
   * its 7.
   *
   * A MINOR target is the target's MELODIC minor, which is what was
   * ruled and what the phrase plays. That sits one note from the key
   * ONLY on the 5 of 2. The card's own sentence says "that is just C
   * major with one note raised: the chord's third", and the drawing now
   * shows three marks on a 5 of 3 and two on a 5 of 6 — because "the
   * key with the chord's third raised" is the target's HARMONIC minor
   * on those two, and harmonic minor was tried and rejected.
   *
   * Pinned as the fact it is, in every key. The sentence is Silas's to
   * settle and is in the report; nothing here rewrites it.
   * =====================================================================
   */
  it('marks the same count in every key, per chord', () => {
    const counts = new Map<string, Set<number>>();
    for (const key of THIRTEEN_KEYS) {
      for (const chord of MODAL_CHORDS) {
        const n = modalAnswerScale(key, chord).filter(x => x.outside).length;
        const seen = counts.get(chord.id) ?? new Set<number>();
        seen.add(n);
        counts.set(chord.id, seen);
      }
    }
    expect(Object.fromEntries(
      [...counts].map(([id, seen]) => [id, [...seen]]),
    )).toEqual({
      '2m': [0], '3m': [0], '4': [0], '5': [0], '6m': [0],
      // One note raised — the A7's third, and the sentence is true.
      '5of2': [1],
      // Three, and the sentence says one.
      '5of3': [3],
      // Major targets: the key one step round the circle.
      '5of4': [1], '5of5': [1],
      // Two, and the sentence says one.
      '5of6': [2],
    });
  });

  it('agrees with MINOR_TARGETS about which targets are minor', () => {
    expect([...MINOR_TARGETS].sort()).toEqual(['2', '3', '6']);
  });
});

describe('what the reveal draws', () => {
  it('draws the seven notes, with the borrowed one marked', () => {
    const row = draw(modalCardId('5of5', 'C'));
    const notes = [...row.children]
      .map(el => ({ note: el.textContent, outside: el.getAttribute('data-outside') }));
    expect(notes).toEqual([
      { note: 'G', outside: 'false' },
      { note: 'A', outside: 'false' },
      { note: 'B', outside: 'false' },
      { note: 'C', outside: 'false' },
      { note: 'D', outside: 'false' },
      { note: 'E', outside: 'false' },
      { note: 'F♯', outside: 'true' },
    ]);
  });

  it('draws an in-key card with nothing marked', () => {
    const notes = [...draw(modalCardId('2m', 'C')).children];
    expect(notes.map(el => el.textContent)).toEqual(
      ['C', 'D', 'E', 'F', 'G', 'A', 'B']);
    expect(notes.every(el => el.getAttribute('data-outside') === 'false')).toBe(true);
  });

  it('draws a double accidental where the scale needs one', () => {
    // G♯ melodic minor, in the key of F♯ major. The seventh is F𝄪, and
    // spelling it G would put two G's in a seven-note scale.
    expect([...draw(modalCardId('5of2', 'F#')).children].map(el => el.textContent))
      .toEqual(['G♯', 'A♯', 'B', 'C♯', 'D♯', 'E♯', 'F𝄪']);
  });

  it('keeps the play control under it', () => {
    draw(modalCardId('5of5', 'C'));
    expect(host!.querySelector('[data-testid="card-playback"]')).not.toBeNull();
  });

  it('marks the out-of-key note in the borrowed accent, not a status colour', () => {
    // A status orange encodes a RATING. A note wearing one would read
    // as "this note is Developing" — see the palette's own comment.
    const marked = [...draw(modalCardId('5of5', 'C')).children]
      .find(el => el.getAttribute('data-outside') === 'true')!;
    expect(marked.className).toContain('text-borrowed');
    expect(marked.className).not.toContain('developing');
  });
});
