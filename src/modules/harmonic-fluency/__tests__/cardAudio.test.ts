/**
 * What each family sounds like (ruling 33).
 *
 * =====================================================================
 * ASSERTED AS PITCHES, NOT AS A SHAPE OF CALLS.
 *
 * A test that checked "playBlocked was called three times" would pass
 * on three wrong chords. These read the semitones back and name the
 * notes, so a ii-V-I that lost its seventh, a slash chord whose bass
 * sat above its triad, or a relative minor built on the 5 instead of
 * the 6 fails here rather than in Silas's ears.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import { FLASHCARDS } from '../catalog';
import { cardSound, type CardSound } from '../cardAudio';
import { SLASH_SHAPES } from '../catalogExpansions';

const card = (id: string) => FLASHCARDS.find(c => c.id === id)!;
const soundOf = (id: string): CardSound => {
  const found = cardSound(card(id));
  expect(found, `${id} has no sound`).not.toBeNull();
  return found!;
};

/** Every step's notes, as semitones above the sound's own root. */
const steps = (s: CardSound) => s.steps.map(st => [...st.semitones]);

const MAJ = [0, 4, 7];
const MIN = [0, 3, 7];

describe('the shape is the same everywhere', () => {
  it('is the key\'s own chord first, then the material', () => {
    // Ruling 33's one sentence, asserted across the five families it
    // gave a voice to plus the two that already had one.
    for (const id of ['sc-1-3-G', 'fh-ii-v-i-Eb', 'pr-1564-Eb',
      'pent-major-Ab', 'ks-relative-Eb', 'dgn-Ab-b6', 'sdm-1-up-P5']) {
      const s = soundOf(id);
      expect(s.orient, id).not.toBeNull();
      expect(s.steps.length, id).toBeGreaterThan(0);
    }
  });

  it('sounds a keyed card at its own key', () => {
    // `keyToRootMidi` is 48 + the pitch class, so E♭ is 51.
    expect(soundOf('fh-ii-v-i-Eb').rootMidi).toBe(51);
    expect(soundOf('pr-1564-Eb').rootMidi).toBe(51);
  });
});

describe('slash chords', () => {
  it('puts the named bass UNDER the chord, every shape, every key', () => {
    // The whole notation. G/B is not a G — it is a G with a B in the
    // bass, and a bass note voiced above the triad would be a different
    // chord with the same name.
    let seen = 0;
    for (const c of FLASHCARDS.filter(x => x.category === 'slash-chords')) {
      const shape = SLASH_SHAPES.find(sh => c.id.startsWith(`sc-${sh.id}-`));
      if (shape === undefined) continue;
      seen += 1;
      const s = cardSound(c)!;
      expect(s.steps, c.id).toHaveLength(1);
      const notes = [...s.steps[0].semitones];
      const bass = notes[0];
      expect(bass, c.id).toBeLessThan(Math.min(...notes.slice(1)));
    }
    expect(seen).toBe(SLASH_SHAPES.length * 12);
  });

  it('5/7 in G is F♯ under a D triad', () => {
    // Read off in semitones from G: the 7 is 11, dropped an octave to
    // −1; the 5 is 7 and its triad is 7, 11, 14.
    expect(steps(soundOf('sc-5-7-G'))).toEqual([[11 - 12, 7, 11, 14]]);
  });

  it('2m/1 is a MINOR triad over the tonic', () => {
    // The one shape whose chord is not major. A major triad here would
    // be a chord that does not exist in the key.
    expect(steps(soundOf('sc-2-1-G'))).toEqual([[0 - 12, 2, 5, 9]]);
  });
});

describe('the little progressions', () => {
  it('plays 2 5 1 with the qualities the card names', () => {
    // m7, dominant 7, maj7 — the answer string says exactly that, and
    // a triad reading would drop the sevenths the card is about.
    expect(steps(soundOf('fh-ii-v-i-Eb'))).toEqual([
      [2, 5, 9, 12],    // 2m7
      [7, 11, 14, 17],  // 5dom7
      [0, 4, 7, 11],    // 1maj7
    ]);
  });

  it('plays 5 of 5 as the secondary dominant AND its target', () => {
    // Playing the dominant alone leaves out the half that makes it
    // secondary. The card's own explanation says "resolving to the 5".
    expect(steps(soundOf('fh-v-of-v-Eb'))).toEqual([
      [2, 6, 9, 12],    // 2dom7 — the 2 made major with a seventh
      [7, 11, 14, 17],  // 5dom7
    ]);
  });

  it('plays 5 of 6 as the move the card describes', () => {
    expect(steps(soundOf('fh-v-of-vi-Eb'))).toEqual([
      [4, 8, 11, 14],   // 3dom7
      [9, 12, 16],      // 6m
    ]);
  });

  it('plays 1 5 6 4 in order, with the 6 minor', () => {
    expect(steps(soundOf('pr-1564-Eb'))).toEqual([
      MAJ, [7, 11, 14], [9, 12, 16], [5, 9, 12],
    ]);
  });
});

describe('pentatonics', () => {
  it('is five notes ascending', () => {
    for (const id of ['pent-minor-A', 'pent-major-Ab']) {
      const s = soundOf(id);
      expect(s.steps, id).toHaveLength(5);
      const notes = s.steps.map(st => st.semitones[0]);
      expect([...notes].sort((a, b) => a - b), id).toEqual(notes);
    }
  });

  it('is the minor shape on a minor card and the major on a major one', () => {
    expect(steps(soundOf('pent-minor-A'))).toEqual([[0], [3], [5], [7], [10]]);
    expect(steps(soundOf('pent-major-Ab'))).toEqual([[0], [2], [4], [7], [9]]);
  });

  it('orients with the chord the root actually carries', () => {
    // A minor pentatonic's tonic chord is minor. Priming it with a
    // major triad would put a third in the ear the scale does not have.
    expect(soundOf('pent-minor-A').orient).toEqual(MIN);
    expect(soundOf('pent-major-Ab').orient).toEqual(MAJ);
  });
});

describe('the major/minor key relations', () => {
  it('plays home, then the relative minor on the 6', () => {
    const s = soundOf('ks-relative-Eb');
    expect(s.orient).toEqual(MAJ);
    expect(steps(s)).toEqual([[9, 12, 16]]);
  });

  it('plays home, then the parallel minor on the same root', () => {
    const s = soundOf('ks-parallel-Eb');
    expect(s.orient).toEqual(MAJ);
    expect(steps(s)).toEqual([MIN]);
  });
});

describe('enharmonic equivalents', () => {
  const noteCards = FLASHCARDS.filter(c => c.id.startsWith('enh-n-'));
  const intervalCards = FLASHCARDS.filter(c => c.id.startsWith('enh-i-'));

  it('plays a note ONCE, with nothing in front of it', () => {
    // Ruling 33: one sound is the point. The card names no key, so an
    // orienting chord would answer a question it did not ask.
    expect(noteCards.length).toBeGreaterThan(0);
    for (const c of noteCards) {
      const s = cardSound(c)!;
      expect(s.orient, c.id).toBeNull();
      expect(s.steps, c.id).toHaveLength(1);
    }
  });

  it('plays an interval as its two pitches', () => {
    expect(intervalCards.length).toBeGreaterThan(0);
    for (const c of intervalCards) {
      const s = cardSound(c)!;
      expect(s.orient, c.id).toBeNull();
      expect(s.steps, c.id).toHaveLength(2);
      expect(s.steps[0].semitones, c.id).toEqual([0]);
    }
  });

  it('gives the two spellings of one sound the same pitch', () => {
    // The claim the whole category makes, made audible: if ♯4 and ♭5
    // sounded differently the cards would be teaching the opposite of
    // what they say.
    const sharp = FLASHCARDS.find(c => c.question === 'Enharmonic equivalent of #4?')!;
    const flat = FLASHCARDS.find(c => c.question === 'Enharmonic equivalent of b5?')!;
    expect(steps(cardSound(sharp)!)).toEqual(steps(cardSound(flat)!));
  });
});

describe('what stays silent, and why', () => {
  it('says nothing for a card that has not said what it is about', () => {
    // The hand-written PROSE slash cards carry no `axis` — the same
    // reason the Slash Chord filter row cannot see them. A sound
    // derived from their question text would be a sound derived from
    // prose. The three that duplicated the generator are gone
    // (ruling 37); these ask about slash chords in general.
    expect(cardSound(card('sc-13'))).toBeNull();
    expect(cardSound(card('sc-14'))).toBeNull();
  });

  it('says nothing for the five families ruling 33 stopped on', () => {
    // Listed in the report with what their material would be, and NOT
    // built: a family given a sound nobody ruled on is a family taught
    // something nobody approved.
    for (const category of ['modes', 'intervals', 'chord-construction',
      'ear-theory', 'diatonic-qualities']) {
      for (const c of FLASHCARDS.filter(x => x.category === category)) {
        expect(cardSound(c), c.id).toBeNull();
      }
    }
  });
});
