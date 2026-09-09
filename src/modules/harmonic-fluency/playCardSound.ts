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

  handles.push(await playBlockedSequence(
    sound.steps,
    sound.rootMidi,
    CARD_AUDIO_BPM,
    { speedMultiplier: speed },
  ));

  return { stop: () => handles.forEach(h => h.stop()) };
}
