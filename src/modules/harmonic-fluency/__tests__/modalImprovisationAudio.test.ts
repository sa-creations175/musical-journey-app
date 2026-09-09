/**
 * Modal Improvisation's phrase, against the one the prototype plays.
 *
 * `modalImprovisationPhrases.ts` holds absolute MIDI produced by the
 * prototype's own `playChord` and run arithmetic. Everything here adds
 * `rootMidi` back onto what `cardSound` describes and compares pitches,
 * because a fixture written in the app's own terms would be checking
 * the app against itself.
 */
import { describe, expect, it } from 'vitest';
import { FLASHCARDS } from '../catalog';
import { CARD_AUDIO_BPM, MODAL_IMPROV_BPM, cardSound, hasSound } from '../cardAudio';
import { MODAL_CHORDS, modalCardId } from '../modalImprovisation';
import { PROTOTYPE_PHRASES } from './modalImprovisationPhrases';

const CARDS = FLASHCARDS.filter(c => c.category === 'modal-improvisation');
const BY_ID = new Map(CARDS.map(c => [c.id, c]));

/** The phrase as pitches, split back into its segments by the rests. */
function played(id: string): Array<{ chord: number[]; run: number[] }> {
  const sound = cardSound(BY_ID.get(id)!)!;
  const runs: number[][] = [[]];
  for (const step of sound.steps) {
    if (step.semitones.length === 0) runs.push([]);
    else runs[runs.length - 1].push(...step.semitones.map(s => s + sound.rootMidi));
  }
  const chords = (sound.under ?? [])
    .filter(step => step.semitones.length > 0)
    .map(step => step.semitones.map(s => s + sound.rootMidi));
  return runs.map((run, i) => ({ chord: chords[i], run }));
}

describe('the phrase is the prototype\'s, note for note', () => {
  it('plays every card the deck holds and nothing it does not', () => {
    const ids = new Set(CARDS.map(c => c.id));
    const pinned = PROTOTYPE_PHRASES
      .map(p => modalCardId(p.chord, p.key))
      .filter(id => ids.has(id));
    expect(pinned).toHaveLength(130);
    for (const c of CARDS) expect(hasSound(c), c.id).toBe(true);
  });

  it('matches the prototype on all 130', () => {
    for (const phrase of PROTOTYPE_PHRASES) {
      const id = modalCardId(phrase.chord, phrase.key);
      expect(played(id).map(s => ({ chord: s.chord, run: s.run })), id)
        .toEqual(phrase.segments.map(s => ({ chord: [...s.chord], run: [...s.run] })));
    }
  });
});

describe('the shape of it', () => {
  it('is four segments out of the key and three inside it', () => {
    for (const c of CARDS) {
      const chord = MODAL_CHORDS.find(m => m.id === c.axis!.chord)!;
      expect(played(c.id), c.id).toHaveLength(chord.kind === 'in' ? 3 : 4);
    }
  });

  it('starts and ends at home, with the same chord and the same run', () => {
    for (const c of CARDS) {
      const segments = played(c.id);
      expect(segments[0], c.id).toEqual(segments[segments.length - 1]);
    }
  });

  it('runs a scale — eight notes, ascending, an octave apart end to end', () => {
    for (const c of CARDS) {
      for (const segment of played(c.id)) {
        expect(segment.run, c.id).toHaveLength(8);
        expect(segment.run[7] - segment.run[0], c.id).toBe(12);
        for (let i = 1; i < 8; i += 1) {
          expect(segment.run[i], c.id).toBeGreaterThan(segment.run[i - 1]);
        }
      }
    }
  });

  it('starts each run on its own chord\'s root', () => {
    for (const c of CARDS) {
      for (const segment of played(c.id)) {
        expect((segment.run[0] - segment.chord[0]) % 12, c.id).toBe(0);
      }
    }
  });

  it('holds each chord for exactly the run above it', () => {
    for (const c of CARDS) {
      const sound = cardSound(BY_ID.get(c.id)!)!;
      const total = (steps: readonly { beats: number }[]) =>
        steps.reduce((n, s) => n + s.beats, 0);
      expect(total(sound.steps), c.id).toBe(total(sound.under!));
      for (const step of sound.under!) {
        if (step.semitones.length > 0) expect(step.beats, c.id).toBe(4);
      }
    }
  });

  it('opens on the music rather than on a reference chord', () => {
    // Entry 2 of the allowed-to-differ list. The first bar IS home, so
    // a priming chord would strike the tonic twice.
    for (const c of CARDS) expect(cardSound(c)!.orient, c.id).toBeNull();
  });

  it('counts at the prototype\'s tempo, and leaves the deck\'s alone', () => {
    expect(MODAL_IMPROV_BPM).toBe(72);
    expect(CARD_AUDIO_BPM).toBe(60);
    for (const c of CARDS) expect(cardSound(c)!.bpm, c.id).toBe(MODAL_IMPROV_BPM);
    // No other family gained one.
    for (const c of FLASHCARDS.filter(f => f.category !== 'modal-improvisation')) {
      expect(cardSound(c)?.bpm, c.id).toBeUndefined();
    }
  });

  it('is the only family with a chord lane', () => {
    for (const c of FLASHCARDS.filter(f => f.category !== 'modal-improvisation')) {
      expect(cardSound(c)?.under, c.id).toBeUndefined();
    }
  });
});

describe('the two scales a borrowed card puts side by side', () => {
  it('plays the answer scale over the dominant and the key\'s own where it lands', () => {
    // A7 into Dm in C: D melodic minor over the A7 — C major with the
    // A7's third raised — and the notes of C over the Dm it resolves
    // to. Both bars, in one phrase, is the whole lesson.
    const segments = played('mi-modal-5of2-C');
    expect(segments[1].chord).toEqual([57, 69, 73, 76, 79]);        // A7
    expect(segments[1].run).toEqual([69, 71, 73, 74, 76, 77, 79, 81]);
    expect(segments[2].chord).toEqual([50, 62, 65, 69]);            // Dm
    expect(segments[2].run).toEqual([74, 76, 77, 79, 81, 83, 84, 86]);
    // The raised note is the A7's third, C♯ — 73 above, and 72 in the
    // bar after it.
    expect(segments[1].run).toContain(73);
    expect(segments[2].run).not.toContain(73);
  });

  it('plays a major target\'s own major scale, with no raised note', () => {
    // "In C, the band is on D7 (5 of 5)" — the card Silas could not
    // find. G major over the D7, G major over the G.
    const segments = played('mi-modal-5of5-C');
    expect(segments[1].chord).toEqual([50, 62, 66, 69, 72]);        // D7
    expect(segments[1].run).toEqual([74, 76, 78, 79, 81, 83, 84, 86]);
    expect(segments[2].chord).toEqual([55, 67, 71, 74]);            // G
    expect(segments[2].run).toEqual([67, 69, 71, 72, 74, 76, 78, 79]);
  });

  it('stays in the key for an in-key chord, three bars long', () => {
    const segments = played('mi-modal-2m-C');
    expect(segments).toHaveLength(3);
    expect(segments[1].chord).toEqual([50, 62, 65, 69]);            // Dm
    // D Dorian — the notes of C, started on the D.
    expect(segments[1].run).toEqual([74, 76, 77, 79, 81, 83, 84, 86]);
  });
});
