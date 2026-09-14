/**
 * A card's sound in each of the four modes — see `cardPlayAs.ts`.
 */
import { describe, expect, it } from 'vitest';
import type { CardSound } from '../cardAudio';
import { soundInMode } from '../cardPlayAs';

const note = (s: number, beats = 1) => ({ semitones: [s], beats });
const LINE: CardSound = { rootMidi: 60, orient: [0, 4, 7], steps: [note(0), note(2), note(4)] };
const CHORD: CardSound = { rootMidi: 60, orient: null, steps: [{ semitones: [7, 0, 4], beats: 3 }] };
const semis = (s: CardSound) => s.steps.map(x => x.semitones);
const beats = (s: CardSound) => s.steps.reduce((n, x) => n + x.beats, 0);

describe('a line', () => {
  it('plays as written on Up', () => {
    const { sound, origin } = soundInMode(LINE, 'up');
    expect(semis(sound)).toEqual([[0], [2], [4]]);
    expect(origin).toEqual([0, 1, 2]);
  });

  it('plays backwards on Down, each note still pointing at its written step', () => {
    const { sound, origin } = soundInMode(LINE, 'down');
    expect(semis(sound)).toEqual([[4], [2], [0]]);
    expect(origin).toEqual([2, 1, 0]);
  });

  it('goes up and back on Up and Down, without repeating the top', () => {
    const { sound, origin } = soundInMode(LINE, 'upDown');
    expect(semis(sound)).toEqual([[0], [2], [4], [2], [0]]);
    expect(origin).toEqual([0, 1, 2, 1, 0]);
  });

  it('sounds every note at once on Together, for as long as the line lasted', () => {
    const { sound, origin } = soundInMode(LINE, 'together');
    expect(semis(sound)).toEqual([[0, 2, 4]]);
    expect(beats(sound)).toBe(3);
    expect(origin).toEqual([0]);
  });

  it('leaves the orienting chord alone', () => {
    for (const mode of ['together', 'up', 'down', 'upDown'] as const) {
      expect(soundInMode(LINE, mode).sound.orient).toEqual([0, 4, 7]);
    }
  });
});

describe('a chord', () => {
  it('is struck on Together, as the card always played it', () => {
    expect(semis(soundInMode(CHORD, 'together').sound)).toEqual([[7, 0, 4]]);
  });

  it('rolls inside its own beats on the other three', () => {
    const up = soundInMode(CHORD, 'up');
    expect(semis(up.sound)).toEqual([[0], [4], [7]]);
    expect(beats(up.sound)).toBe(3);
    expect(up.origin).toEqual([0, 0, 0]);
    expect(semis(soundInMode(CHORD, 'down').sound)).toEqual([[7], [4], [0]]);
    const both = soundInMode(CHORD, 'upDown');
    expect(semis(both.sound)).toEqual([[0], [4], [7], [4], [0]]);
    expect(beats(both.sound)).toBeCloseTo(3);
  });
});

describe('a line over chords', () => {
  const MODAL: CardSound = {
    rootMidi: 60,
    orient: null,
    steps: [note(0), note(2), note(4), note(5), note(7), note(9)],
    under: [{ semitones: [0, 4, 7], beats: 3 }, { semitones: [5, 9, 12], beats: 3 }],
  };

  it('reshapes inside each chord\'s span, so every note stays over its chord', () => {
    const { sound, origin } = soundInMode(MODAL, 'down');
    expect(semis(sound)).toEqual([[4], [2], [0], [9], [7], [5]]);
    expect(origin).toEqual([2, 1, 0, 5, 4, 3]);
  });

  it('fits Up and Down into the span it had', () => {
    const { sound } = soundInMode(MODAL, 'upDown');
    expect(beats(sound)).toBeCloseTo(6);
    expect(sound.under).toEqual(MODAL.under);
  });
});
