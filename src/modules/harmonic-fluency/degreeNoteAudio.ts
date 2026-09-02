/**
 * Hearing a degree-and-note card: home, then the note.
 *
 * =====================================================================
 * THE TONIC IS NOT DECORATION HERE EITHER.
 *
 * Playing A♭ on its own teaches a pitch. Playing C and then A♭ teaches
 * a POSITION — home, then the ♭6 — which is the thing the card is
 * about. `degreeAudio` makes the same argument for the abstract degree
 * cards and this follows it rather than restating it.
 *
 * REVEAL-SIDE ONLY on the two written types, and that is a rule about
 * sequence rather than about sound. Sounding the answer before it is
 * given would turn a written question into an ear question — a
 * different card, and one the deck already has in Ear Training. The
 * knowing comes first.
 *
 * =====================================================================
 * THE ROOT PITCH COMES FROM EAR TRAINING'S OWN PARSER.
 *
 * `keyToRootMidi` already turns a key name into a comfortable MIDI
 * root, accepting both alphabets and both accidental glyphs, and it is
 * the function every progression in the app sounds from. A second
 * note-name-to-pitch table here would be a second thing to keep in step
 * with the first for no gain — the answer note is simply the root plus
 * the degree's own semitone count, which the degree table already
 * carries.
 * =====================================================================
 */
import { getPref } from '../../lib/userPrefs';
import { defaultSpeed, speedPrefKey } from '../../lib/goalConfig';
import {
  TONIC_DURATION, playNoteSequence, tonicLeadInSeconds,
  type PlaybackHandle, type TonicContext,
} from '../../lib/musicalPlayback';
import { keyToRootMidi, playTonicDrone } from '../ear-training/chord-progressions/progressionTheory';
import { DEGREE_BY_ID } from './chromaticDegrees';

/** The same module ref the abstract degree cards sound under, so one
 *  speed setting governs both. */
export const DEGREE_NOTE_AUDIO_MODULE = 'harmonic-fluency';

/** Beats per note and the tempo they are counted at. Slow, because the
 *  point is to place one pitch against a reference. */
const NOTE_BEATS = 1;
const BPM = 60;

/** The tonic sits BESIDE the note, not under it — the same reasoning
 *  `degreeAudio` gives: a reference an octave away is one more interval
 *  to work out before the card's own can be heard. */
const TONIC_OCTAVE_SHIFT = 0;

function wait(ms: number): Promise<void> {
  return new Promise(resolve => { window.setTimeout(resolve, ms); });
}

/**
 * Sound the key, then the note the degree lands on.
 *
 * Returns a handle whose `stop` silences everything scheduled, so
 * leaving the card mid-playback does not leave a note ringing.
 */
export async function playDegreeNote(
  root: string,
  degreeId: string,
  context: TonicContext,
): Promise<PlaybackHandle> {
  const degree = DEGREE_BY_ID.get(degreeId);
  const semitones = degree?.semitones ?? 0;
  const rootMidi = keyToRootMidi(root);
  const speed = await getPref<number>(
    speedPrefKey(DEGREE_NOTE_AUDIO_MODULE),
    defaultSpeed(DEGREE_NOTE_AUDIO_MODULE),
  );

  const handles: PlaybackHandle[] = [];
  if (context === 'singleNote') {
    handles.push(await playTonicDrone(rootMidi, TONIC_DURATION, {
      octaveShift: TONIC_OCTAVE_SHIFT,
    }));
    // A fixed wait, not a scaled one — the priming note is a reference
    // pitch rather than part of the music.
    await wait(tonicLeadInSeconds(context) * 1000);
  }
  handles.push(await playNoteSequence(
    rootMidi,
    [
      { semitones: 0, beats: NOTE_BEATS },
      { semitones, beats: NOTE_BEATS },
    ],
    BPM,
    { speedMultiplier: speed },
  ));

  return { stop: () => handles.forEach(h => h.stop()) };
}
