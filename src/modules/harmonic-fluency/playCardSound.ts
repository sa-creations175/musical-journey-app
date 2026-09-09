/**
 * Sounding a `CardSound`.
 *
 * =====================================================================
 * ONE PATH TO THE SPEAKER, FOR EVERY FAMILY.
 *
 * `degreeAudio` and `degreeNoteAudio` were two files doing the same
 * four things — read the speed pref, sound the tonic, wait, play the
 * material, hand back one `stop`. Adding five more families as five
 * more files is how a module ends up with seven tempos and six answers
 * to "does the tonic play first".
 *
 * So the DESCRIPTION is per family (`cardAudio.ts`) and the PLAYING is
 * not. Everything below is shared by construction rather than by seven
 * callers remembering.
 *
 * =====================================================================
 * NO SECOND SYNTH. `playBlockedSequence` and `playBlocked` are
 * `lib/musicalPlayback`'s, over `lib/audio`'s one engine, and the
 * priming register is the one `progressionTheory` established.
 * =====================================================================
 */
import { getPref } from '../../lib/userPrefs';
import { defaultSpeed, speedPrefKey } from '../../lib/goalConfig';
import {
  TONIC_DURATION, playBlocked, playBlockedSequence, tonicLeadInSeconds,
  type PlaybackHandle, type TonicContext,
} from '../../lib/musicalPlayback';
import { CARD_AUDIO_BPM, type CardSound } from './cardAudio';

/** The module every harmonic-fluency sound reads its speed from, so
 *  one setting governs the whole deck. */
export const CARD_AUDIO_MODULE = 'harmonic-fluency';

/**
 * How loud a drone sits under a scale.
 *
 * QUIETER THAN THE NOTES ON TOP OF IT. `playTonicDrone` reaches for
 * 0.22 for the same job and the single-voice default is 0.3; a drone at
 * the melody's own level stops being underneath it and starts competing
 * with the degree the reader is trying to hear.
 */
const PEDAL_VELOCITY = 0.18;

function wait(ms: number): Promise<void> {
  return new Promise(resolve => { window.setTimeout(resolve, ms); });
}

/**
 * Sound one card. Returns a handle whose `stop` silences everything
 * scheduled, so leaving the card mid-playback leaves nothing ringing.
 *
 * THE ORIENTING CHORD IS NOT SCALED BY THE SPEED SETTING, and neither
 * is the wait after it. It is a reference, not part of the music —
 * `tonicLeadInSeconds` has said so since chord progressions, and the
 * two degree families followed it before this file existed.
 *
 * IT IS SKIPPED ENTIRELY when the reader has turned priming off. That
 * pref is a statement about how they want to practise, not about one
 * module, which is why it is read rather than duplicated.
 */
export async function playCardSound(
  sound: CardSound,
  context: TonicContext,
): Promise<PlaybackHandle> {
  const speed = await getPref<number>(
    speedPrefKey(CARD_AUDIO_MODULE),
    defaultSpeed(CARD_AUDIO_MODULE),
  );

  // THE CARD'S OWN TEMPO WHERE IT HAS ONE, the deck's otherwise —
  // `cardAudio`'s allowed-to-differ list, entry 8. The orienting chord
  // below is deliberately NOT counted at it: it is a reference in
  // front of the music, and a two-second tonic stays two seconds
  // whatever the phrase after it is played at.
  const bpm = sound.bpm ?? CARD_AUDIO_BPM;

  const handles: PlaybackHandle[] = [];
  if (sound.orient !== null && context === 'singleNote') {
    handles.push(await playBlocked(
      sound.rootMidi,
      [...sound.orient],
      TONIC_DURATION * (CARD_AUDIO_BPM / 60),
      CARD_AUDIO_BPM,
    ));
    await wait(tonicLeadInSeconds(context) * 1000);
  }

  /**
   * A HELD ROOT UNDER THE WHOLE OF IT (ruling 38), on the mode cards
   * and nowhere else.
   *
   * Scheduled as ONE note as long as the material rather than as a note
   * per step, because it is a drone: re-struck under every degree it
   * would become a rhythm, and the point of it is that nothing about
   * the tonic moves while the scale walks away from it.
   *
   * It scales with the speed setting exactly as the sequence does —
   * they are the same music, unlike the priming chord above, which is a
   * reference in front of it.
   */
  if (sound.pedal !== undefined) {
    const beats = sound.steps.reduce((n, step) => n + step.beats, 0);
    handles.push(await playBlocked(
      sound.rootMidi + sound.pedal,
      [0],
      beats,
      bpm,
      { speedMultiplier: speed, velocity: PEDAL_VELOCITY },
    ));
  }

  /**
   * A LANE OF CHORDS UNDER THE LINE (`cardAudio` entry 7), on Modal
   * Improvisation and nowhere else.
   *
   * SCHEDULED FIRST, and both lanes take their own cursor from the
   * context clock at the moment they are scheduled — the same shape
   * the drone above already has. It is the chord the reader is being
   * asked to play over, so it wants to be sounding before the note
   * that is meant to fit it, not after.
   *
   * NO VELOCITY OVERRIDE. `playBlockedSequence` already scales a
   * four-note block down by the square root of its polyphony, which
   * puts a chord underneath a single-note line without a second
   * number deciding how far.
   */
  if (sound.under !== undefined) {
    handles.push(await playBlockedSequence(
      sound.under,
      sound.rootMidi,
      bpm,
      { speedMultiplier: speed },
    ));
  }

  handles.push(await playBlockedSequence(
    sound.steps,
    sound.rootMidi,
    bpm,
    { speedMultiplier: speed },
  ));

  return { stop: () => handles.forEach(h => h.stop()) };
}
