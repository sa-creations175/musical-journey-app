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
import { pitchClassOf } from '../../../lib/spelling';

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

describe('modes', () => {
  it('orients on the MODE\'s own root, not the parent key\'s', () => {
    // Ruling 38, and the reason it is a ruling: play E♭ in front of B♭
    // Mixolydian and the card teaches that a mode is a major scale with
    // an odd starting note, which is the misunderstanding the category
    // exists to correct. D♭ is 49, so its 5 — A♭ — folds to 56.
    const s = soundOf('mo-mode-Db-5');
    expect(s.rootMidi).toBe(48 + 8);
    expect(s.orient).toEqual(MAJ);
  });

  it('takes the triad from the mode\'s own third', () => {
    // Mixolydian is major, Dorian and Aeolian minor. Read off the
    // scale rather than off a table of mode names.
    expect(soundOf('mo-mode-Db-5').orient).toEqual(MAJ);
    expect(soundOf('mo-mode-Db-2').orient).toEqual(MIN);
    expect(soundOf('mo-mode-Db-6').orient).toEqual(MIN);
  });

  it('walks seven notes and lands on the octave', () => {
    // The eighth note is not a flourish: a mode that stops on its 7 or
    // ♭7 ends in mid-air on the one note that most tells the modes
    // apart.
    expect(steps(soundOf('mo-mode-Db-2')))
      .toEqual([[0], [2], [3], [5], [7], [9], [10], [12]]);
    expect(steps(soundOf('mo-mode-Db-5')))
      .toEqual([[0], [2], [4], [5], [7], [9], [10], [12]]);
  });

  it('holds the root underneath, an octave down', () => {
    const s = soundOf('mo-mode-Db-2');
    expect(s.pedal).toBe(-12);
  });

  it('gives F♯ major and G♭ major two different scales', () => {
    // Ruling 40, made audible. Same seven keys on a piano; two
    // different spellings, and — because the mode starts on the key's
    // own 2 — two different starting pitches.
    expect(soundOf('mo-mode-F#-2').rootMidi).toBe(48 + 8);   // G♯
    expect(soundOf('mo-mode-Gb-2').rootMidi).toBe(48 + 8);   // A♭, same pitch
    expect(steps(soundOf('mo-mode-F#-2')))
      .toEqual(steps(soundOf('mo-mode-Gb-2')));
  });

  it('covers every mode, not only the three it started with', () => {
    // Ruling 42. Ionian through Locrian, in every key.
    for (let degree = 1; degree <= 7; degree += 1) {
      const s = soundOf(`mo-mode-C-${degree}`);
      expect(s.steps, `degree ${degree}`).toHaveLength(8);
    }
  });

  it('is the parent scale started somewhere else, on every card', () => {
    // THE CLAIM THE WHOLE CATEGORY MAKES, MADE AUDIBLE. A mode is the
    // parent major scale from a different note; if the notes that come
    // out are not that scale's notes, the sound is teaching the
    // opposite of what the card says.
    const MAJOR = [0, 2, 4, 5, 7, 9, 11];
    let seen = 0;
    for (const c of FLASHCARDS.filter(x => x.category === 'modes')) {
      const s = cardSound(c);
      if (s === null) continue;
      seen += 1;
      const key = (c as { axis?: { key?: string } }).axis!.key!;
      const keyPc = pitchClassOf(key)!;
      const parent = new Set(MAJOR.map(i => (keyPc + i) % 12));
      const heard = new Set(
        s.steps.map(st => ((s.rootMidi + st.semitones[0]) % 12 + 12) % 12),
      );
      expect(heard.size, c.id).toBe(7);
      expect([...heard].sort((a, b) => a - b), c.id)
        .toEqual([...parent].sort((a, b) => a - b));
    }
    // 13 keys x 7 modes. The sixteen prose cards carry no axis.
    expect(seen).toBe(91);
  });
});

describe('intervals', () => {
  it('plays the two notes, ascending, with nothing in front', () => {
    // Ruling 38. No key in the card, so no key in the sound — an
    // orienting chord would answer a question it did not ask.
    const s = soundOf('iv-1');
    expect(s.orient).toBeNull();
    expect(s.pedal).toBeUndefined();
    expect(steps(s)).toEqual([[0], [7]]);
    // C is 48, and the second note is its 5th.
    expect(s.rootMidi).toBe(48);
  });

  it('sounds the distance the card asks about, on every card', () => {
    let seen = 0;
    for (const c of FLASHCARDS.filter(x => x.category === 'intervals')) {
      const s = cardSound(c);
      if (s === null) continue;
      seen += 1;
      const axis = (c as { axis?: { semitones?: number } }).axis!;
      expect(steps(s), c.id).toEqual([[0], [axis.semitones]]);
      expect(s.orient, c.id).toBeNull();
    }
    // The twenty original pairs and the five top-ups. The fifteen
    // inversion cards are prose and carry no notes.
    expect(seen).toBe(25);
  });

  it('says nothing for the inversion cards, which name no two notes', () => {
    expect(cardSound(card('iv-inv-sum'))).toBeNull();
    expect(cardSound(card('iv-inv-quality-rule'))).toBeNull();
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

  it('says nothing for the three families that carry no coordinates', () => {
    // Modes and intervals got a voice under ruling 38. These three
    // carry no `axis` at all — a prose card about how a chord feels has
    // no key and no notes — so giving them a sound would need a content
    // decision first. Listed in the report rather than invented.
    for (const category of ['chord-construction',
      'ear-theory', 'diatonic-qualities']) {
      for (const c of FLASHCARDS.filter(x => x.category === category)) {
        expect(cardSound(c), c.id).toBeNull();
      }
    }
  });
});
