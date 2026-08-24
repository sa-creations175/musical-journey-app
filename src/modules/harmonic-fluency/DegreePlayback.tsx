import { useEffect, useRef, useState } from 'react';
import { getPref } from '../../lib/userPrefs';
import type { PlaybackHandle, TonicContext } from '../../lib/musicalPlayback';
import SpeedControl from '../../components/SpeedControl';
import {
  DEGREE_AUDIO_MODULE, playDegreeCard,
} from './degreeAudio';
import type { Direction, IntervalQuality } from './scaleDegreeQuality';

/**
 * Hear the card: home, then the start degree, then where you land.
 *
 * ---------------------------------------------------------------
 * THE CONTEXT SETTING IS THE EAR-TRAINING ONE, READ NOT COPIED.
 *
 * Chord progressions already asks "prime me with the tonic first, or
 * don't", and stores the answer under `chordProgressionsTonicContext`.
 * A reader who has turned priming off there has said something about
 * how they want to practise, not something about chord progressions,
 * so this reads the same pref rather than adding a second switch that
 * means the same thing and disagrees with it.
 *
 * Reveal-side only, like the rows above it. Playing the two degrees
 * before an answer would turn a written question into an ear question
 * — a different card, and one the deck already has elsewhere.
 * ---------------------------------------------------------------
 */

/** The pref chord progressions writes. One switch, two callers. */
const PREF_TONIC = 'chordProgressionsTonicContext';

export default function DegreePlayback({
  startDegree, quality, direction,
}: {
  startDegree: number;
  quality: IntervalQuality;
  direction: Direction;
}) {
  const [context, setContext] = useState<TonicContext>('singleNote');
  const playing = useRef<PlaybackHandle | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    getPref<TonicContext>(PREF_TONIC, 'singleNote')
      .then(value => { if (live) setContext(value); })
      // Swallowed: a failed pref read means the default, and an
      // uncaught rejection here would surface as an app-level error
      // for a playback button.
      .catch(() => {});
    return () => { live = false; };
  }, []);

  // Stop on unmount, so moving to the next card does not leave the
  // previous one's landing note hanging over it.
  useEffect(() => () => { playing.current?.stop(); }, []);

  const play = () => {
    playing.current?.stop();
    setBusy(true);
    playDegreeCard(startDegree, quality, direction, context)
      .then(handle => { playing.current = handle; })
      .catch(() => {})
      .finally(() => { setBusy(false); });
  };

  return (
    <div className="mt-2 flex items-center gap-3 flex-wrap">
      <button
        type="button"
        onClick={play}
        disabled={busy}
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-black/10 dark:border-white/20 text-xs font-medium hover:bg-black/[0.04] dark:hover:bg-white/10 disabled:opacity-50 transition-colors"
      >
        <span aria-hidden className="text-sm leading-none">♪</span>
        {context === 'singleNote'
          ? `hear it — home, then ${startDegree}, then the answer`
          : `hear it — ${startDegree}, then the answer`}
      </button>
      <SpeedControl moduleId={DEGREE_AUDIO_MODULE} />
    </div>
  );
}
