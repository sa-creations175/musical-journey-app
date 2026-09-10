/**
 * The phrases, checked against the numbers the prototype plays.
 *
 * =====================================================================
 * THE PORT IS THE CLAIM, SO THE PORT IS WHAT IS TESTED.
 *
 * The prototype writes each bass as an absolute MIDI note in the key of
 * C major. Those numbers are the signed-off phrases, and they are
 * unusable in the other twelve keys — so they became degrees. Every one
 * of them is asserted to come back out in the key of C major, which is
 * what makes "ported, not rewritten" checkable.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import { SLASH_SHAPES } from '../../catalogExpansions';
import { contextsFor, stepBass, stepTones } from '../slashContexts';

/** The bass notes the prototype plays, per shape and phrase, in the
 *  key of C major. Transcribed from `docs/built-answers-prototype_1.html`. */
const PROTOTYPE_BASS: Readonly<Record<string, Readonly<Record<string, number[]>>>> = {
  '1-3': { alone: [40], up: [36, 40, 41], down: [41, 40, 38] },
  '5-7': { alone: [47], down: [48, 47, 45], up: [45, 47, 48] },
  '4-5': { alone: [43], resolve: [43, 36], inout: [36, 43, 36] },
  '1-5': { alone: [43], cad: [43, 43, 36], full: [41, 43, 43, 36] },
  '5-1': { alone: [36], pedal: [36, 36, 36] },
  '2-1': { alone: [36], pedal: [36, 36, 36] },
  '1-4': { alone: [41], settle: [41, 41, 36] },
};

describe('every phrase plays the notes the prototype plays', () => {
  it('in the key of C major, bass note for bass note', () => {
    for (const shape of SLASH_SHAPES) {
      const wanted = PROTOTYPE_BASS[shape.id];
      expect(wanted, shape.id).toBeDefined();
      const built = contextsFor(shape.id, shape.bass);
      expect(built.map(c => c.id).sort(), shape.id)
        .toEqual(Object.keys(wanted).sort());
      for (const context of built) {
        expect(context.steps.map(s => stepBass(s, 0)), `${shape.id}/${context.id}`)
          .toEqual(wanted[context.id]);
      }
    }
  });

  it('holds the same bass note under two chords where the phrase does', () => {
    // The cadential 6-4: the bass stays on the 5 while the chord above
    // it changes. A walking rule that must always move would push the
    // second one an octave, which is why a phrase places its own bass.
    const cad = contextsFor('1-5', '5').find(c => c.id === 'cad')!;
    expect(cad.steps.map(s => stepBass(s, 0))).toEqual([43, 43, 36]);
  });

  it('transposes, which the prototype\'s numbers cannot', () => {
    // The same phrase in the key of E♭ major, three semitones up.
    const inC = contextsFor('1-3', '3').find(c => c.id === 'up')!;
    expect(inC.steps.map(s => stepBass(s, 3)))
      .toEqual([36, 40, 41].map(m => m + 3));
  });

  it('stays in the bass register in every key', () => {
    for (const shape of SLASH_SHAPES) {
      for (const context of contextsFor(shape.id, shape.bass)) {
        for (let keyPc = 0; keyPc < 12; keyPc += 1) {
          for (const step of context.steps) {
            const midi = stepBass(step, keyPc);
            expect(midi, `${shape.id}/${context.id}`).toBeGreaterThanOrEqual(36);
            expect(midi, `${shape.id}/${context.id}`).toBeLessThanOrEqual(59);
          }
        }
      }
    }
  });
});

describe('the chords around the slash chord', () => {
  it('names the triads of the key, minor where the key is minor', () => {
    const down = contextsFor('5-7', '7').find(c => c.id === 'down')!;
    // 1 · 5/7 · 6m in the key of C major: C, the slash chord, Am.
    expect(stepTones(down.steps[0], 0)).toEqual({ rootPc: 0, pcs: [0, 4, 7] });
    expect(stepTones(down.steps[1], 0)).toBeNull();
    expect(stepTones(down.steps[2], 0)).toEqual({ rootPc: 9, pcs: [9, 0, 4] });
  });

  it('leaves the slash chord itself to the reader\'s hand', () => {
    // The one step whose notes are not the key's: the reader's own
    // voicing is the anchor the phrase is voice-led around.
    for (const shape of SLASH_SHAPES) {
      for (const context of contextsFor(shape.id, shape.bass)) {
        const slashSteps = context.steps.filter(s => stepTones(s, 0) === null);
        expect(slashSteps, `${shape.id}/${context.id}`).toHaveLength(1);
      }
    }
  });

  it('covers every shape the deck generates', () => {
    // A shape added by a ruling shows up as a missing phrase rather
    // than as the wrong chord being played.
    for (const shape of SLASH_SHAPES) {
      expect(contextsFor(shape.id, shape.bass).length, shape.id)
        .toBeGreaterThan(1);
    }
    // And an id nothing generates gets the chord on its own, not a
    // guess.
    expect(contextsFor('9-9', '1').map(c => c.id)).toEqual(['alone']);
  });
});
