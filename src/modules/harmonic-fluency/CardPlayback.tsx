/**
 * The play control. One of them, on every family that has a sound
 * (ruling 33).
 *
 * =====================================================================
 * IT WAS TWO BUTTONS ON TWO FAMILIES AND IT IS ONE ON ALL OF THEM.
 *
 * `DegreePlayback` and the button inside `DegreeNoteReveal` did the
 * same job with different labels, different padding and two copies of
 * the pref read, the busy flag and the stop-on-unmount. Five more
 * families would have been five more copies. This is the one, and the
 * per-family part — what the card sounds like — lives in `cardAudio`,
 * where it is data rather than a component.
 *
 * WHAT IS ALLOWED TO DIFFER is written down in `cardAudio`'s header.
 * Of the four entries, only one touches this file: WHERE the control
 * sits. The degree-and-note card puts it under its keyboard, inside
 * that card's own row; everything else puts it under the explanation.
 * Hence `align`, and hence nothing else.
 *
 * =====================================================================
 * REVEAL-SIDE ONLY, AND THAT IS A RULE ABOUT SEQUENCE.
 *
 * Sounding the answer before it is given turns a written question into
 * an ear question — a different card, and one the deck already has in
 * Ear Training. The knowing comes first. Enforced by the caller, which
 * renders nothing until the card is answered; stated here because this
 * is where a future caller will look.
 *
 * =====================================================================
 * THE CONTEXT SETTING IS THE EAR-TRAINING ONE, READ NOT COPIED.
 *
 * Chord progressions already asks "prime me with the tonic first, or
 * don't" and stores the answer under `chordProgressionsTonicContext`. A
 * reader who has turned priming off there has said something about how
 * they want to practise, not something about chord progressions.
 * =====================================================================
 */
import { useEffect, useRef, useState } from 'react';
import { getPref } from '../../lib/userPrefs';
import type { PlaybackHandle, TonicContext } from '../../lib/musicalPlayback';
import SpeedControl from '../../components/SpeedControl';
import type { Flashcard } from './catalog';
import { cardSound } from './cardAudio';
import { CARD_AUDIO_MODULE, playCardSound } from './playCardSound';

/** The pref chord progressions writes. One switch, every caller. */
const PREF_TONIC = 'chordProgressionsTonicContext';

/** The label, on every family. Carried over from the degree-and-note
 *  card, which is the one that already had a written one. */
export const HEAR_IT_LABEL = 'Hear it';

export default function CardPlayback({
  card, align = 'start',
}: {
  card: Flashcard;
  /** The one thing allowed to differ here — see the header. */
  align?: 'start' | 'center';
}) {
  const [context, setContext] = useState<TonicContext>('singleNote');
  const playing = useRef<PlaybackHandle | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void getPref<TonicContext>(PREF_TONIC, 'singleNote')
      // Swallowed: a failed pref read means the default, and an
      // uncaught rejection here would surface as an app-level error
      // for a playback button.
      .then(value => { if (live) setContext(value); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  // Stop on unmount, so moving to the next card does not leave the
  // previous one's last chord hanging over it.
  useEffect(() => () => { playing.current?.stop(); }, []);

  const sound = cardSound(card);
  // A card that has not said what it is about has no sound, and gets no
  // button rather than a button that does nothing.
  if (sound === null) return null;

  const play = () => {
    playing.current?.stop();
    setBusy(true);
    playCardSound(sound, context)
      .then(handle => { playing.current = handle; })
      .catch(() => {})
      .finally(() => { setBusy(false); });
  };

  return (
    <div
      className={`mt-2 flex items-center gap-3 flex-wrap ${
        align === 'center' ? 'justify-center' : ''
      }`}
      data-testid="card-playback"
    >
      <button
        type="button"
        data-testid="card-play"
        onClick={play}
        disabled={busy}
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-black/10 dark:border-white/20 text-xs font-medium hover:bg-black/[0.04] dark:hover:bg-white/10 disabled:opacity-50 transition-colors"
      >
        <span aria-hidden className="text-sm leading-none">♪</span>
        {HEAR_IT_LABEL}
      </button>
      <SpeedControl moduleId={CARD_AUDIO_MODULE} />
    </div>
  );
}
