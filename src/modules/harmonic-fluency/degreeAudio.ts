import { getPref } from '../../lib/userPrefs';
import { defaultSpeed, speedPrefKey } from '../../lib/goalConfig';
import {
  TONIC_DURATION, playNoteSequence, type PlaybackHandle, type TonicContext,
} from '../../lib/musicalPlayback';
import { playTonicDrone } from '../ear-training/chord-progressions/progressionTheory';
import {
  DIRECTIONS, degreeResult, type Direction, type IntervalQuality,
} from './scaleDegreeQuality';

/**
 * Hearing a scale-degree card.
 *
 * =====================================================================
 * CONTEXT, THEN THE START DEGREE, THEN WHERE YOU LAND.
 *
 * Playing the two notes alone teaches an INTERVAL. D then F♯ is a major
 * third whatever key it is in, and a reader who hears only that answers
 * a question this card did not ask.
 *
 * Playing the tonic first makes the same two notes a POSITION: home,
 * then the 2, then the ♯4. That is the thing the category exists to
 * train, and it is why the lead-in is not decoration.
 *
 * SINGLE NOTES AFTER THE CONTEXT, never chords. A chord would name the
 * harmony the degree sits in, and the question is about the degree.
 * =====================================================================
 */

/** Which octave the drill sounds in. Arbitrary and shared — every
 *  pitch below is relative to it. */
const BASE_MIDI = 60;

/** Semitones above the tonic, per scale degree. */
const MAJOR_SEMITONES = [0, 2, 4, 5, 7, 9, 11];

/** Beats per note, and the tempo they are counted at. Slow: the point
 *  is to place two pitches against a reference, not to hear a phrase. */
const NOTE_BEATS = 1;
const BPM = 60;

export const DEGREE_AUDIO_MODULE = 'harmonic-fluency';

/**
 * The tonic sits BESIDE the degrees, not under them.
 *
 * `playTonicDrone` defaults to `octaveShift: -12`, which is right for
 * chord progressions — there it is a bass note under a voicing. Here it
 * is the reference the two degrees are measured against, and a
 * reference an octave away is one more interval to work out before you
 * can use it.
 */
const TONIC_OCTAVE_SHIFT = 0;

export async function playDegreeCard(
  startDegree: number,
  quality: IntervalQuality,
  direction: Direction,
  context: TonicContext,
): Promise<PlaybackHandle> {
  const speed = await getPref<number>(
    speedPrefKey(DEGREE_AUDIO_MODULE),
    defaultSpeed(DEGREE_AUDIO_MODULE),
  );
  const sign = direction === 'up' ? 1 : -1;
  const start = MAJOR_SEMITONES[startDegree - 1];
  const land = start + sign * quality.semitones;

  const handles: PlaybackHandle[] = [];
  if (context === 'singleNote') {
    handles.push(await playTonicDrone(BASE_MIDI, TONIC_DURATION, {
      octaveShift: TONIC_OCTAVE_SHIFT,
    }));
    // The lead-in is a fixed wait, not a scaled one — the priming note
    // is a reference pitch, not part of the music, which is why
    // `tonicLeadInSeconds` does not scale it either.
    await wait(tonicLeadInMs());
  }
  handles.push(await playNoteSequence(
    BASE_MIDI,
    [
      { semitones: start, beats: NOTE_BEATS },
      { semitones: land, beats: NOTE_BEATS },
    ],
    BPM,
    { speedMultiplier: speed, overlap: 0 },
  ));
  return {
    stop: () => handles.forEach(h => h.stop()),
  };
}

function tonicLeadInMs(): number {
  return TONIC_DURATION * 1000;
}

function wait(ms: number): Promise<void> {
  return new Promise(resolve => { setTimeout(resolve, ms); });
}

/** Exported so a test can assert the order without an audio context. */
export function degreeSemitones(
  startDegree: number,
  quality: IntervalQuality,
  direction: Direction,
): { tonic: number; start: number; land: number } {
  const sign = direction === 'up' ? 1 : -1;
  const start = MAJOR_SEMITONES[startDegree - 1];
  return { tonic: 0, start, land: start + sign * quality.semitones };
}

/** Every direction is playable — asserted rather than assumed, because
 *  a descending sequence is the case a two-note engine gets wrong. */
export const PLAYABLE_DIRECTIONS = DIRECTIONS;

/** The landing degree the audio lands on, for a test that the sound
 *  and the answer agree. */
export function landingDegree(
  startDegree: number,
  quality: IntervalQuality,
  direction: Direction,
): number {
  return degreeResult(startDegree, quality, direction).resultDegree;
}
