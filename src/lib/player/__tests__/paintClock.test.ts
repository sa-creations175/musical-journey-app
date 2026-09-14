/**
 * Law (b) of the shared player: the board repaints on the audio clock.
 *
 * =====================================================================
 * PAINT AND SOUND SHARE ONE TIMESTAMP PER STEP.
 *
 * The old surfaces computed a screen timer from the audio cursor and
 * fired the highlight off it. That is not the same thing: the timer
 * queue is starved by a busy main thread and throttled in a background
 * tab while the audio graph plays on, so the lights drift and never
 * recover.
 *
 * `seqSchedule` is the one calculation both jobs read — the notes are
 * scheduled from it and the frame loop fires each step's paint when
 * `currentTime` reaches the same `at`. This test asserts the number is
 * one number: every step's paint moment IS its first note's start.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import { seqSchedule, type SeqChord } from '../../audio';
import { chordStep, placeBass } from '../voices';
import { DEFAULT_PLAYER_SETTINGS } from '../settings';
import { motionChords } from '../../../modules/ear-training/chord-progressions/motionChords';

/** Two beats at 60bpm is a second; the arithmetic stays readable. */
const SEC_PER_BEAT = 1;

const chords: SeqChord[] = [
  { intervals: [60, 64, 67], beats: 2 },
  { intervals: [62, 65, 69], beats: 2 },
  { intervals: [59, 62, 67], beats: 4 },
];

describe('paint and sound share one timestamp', () => {
  it('gives every step its first note’s start as its paint moment', () => {
    const { steps } = seqSchedule(chords, 0, SEC_PER_BEAT, 10);
    expect(steps).toHaveLength(3);
    for (const step of steps) {
      expect(step.notes.length).toBeGreaterThan(0);
      expect(step.at).toBe(step.notes[0].at);
    }
  });

  it('walks the cursor by the step’s own beats', () => {
    const { steps, endsAt } = seqSchedule(chords, 0, SEC_PER_BEAT, 10);
    expect(steps.map(s => s.at)).toEqual([10, 12, 14]);
    expect(endsAt).toBe(18);
  });

  it('lights a rolled chord when its FIRST note strikes', () => {
    const rolled: SeqChord[] = [{ intervals: [60, 64, 67], beats: 2, roll: 0.5 }];
    const { steps } = seqSchedule(rolled, 0, SEC_PER_BEAT, 0);
    expect(steps[0].notes.map(n => n.at)).toEqual([0, 0.5, 1]);
    expect(steps[0].at).toBe(0);
  });

  it('drops the steps Resume has already passed, and keeps the rest in time', () => {
    // Two beats in: the first chord's turn has gone, the other two shift
    // back to the top and keep their spacing.
    const { steps } = seqSchedule(chords, 0, SEC_PER_BEAT, 5, 2);
    expect(steps.map(s => s.index)).toEqual([1, 2]);
    expect(steps.map(s => s.at)).toEqual([5, 7]);
    for (const step of steps) expect(step.at).toBe(step.notes[0].at);
  });
});

describe('a chord motion sounds exactly the notes it schedules', () => {
  it('schedules the same pitches the step carries, in the same order', () => {
    const settings = DEFAULT_PLAYER_SETTINGS;
    const { chords: motion } = motionChords(5, '2', '5', 'seventh');
    const seq = placeBass(motion, settings).map(c => chordStep(c, settings, 2));
    const { steps } = seqSchedule(seq, 0, SEC_PER_BEAT, 0);
    steps.forEach((step, i) => {
      expect(step.notes.map(n => n.midi)).toEqual(seq[i].intervals);
      expect(step.notes.map(n => n.hand)).toEqual(seq[i].hands);
    });
  });
});
