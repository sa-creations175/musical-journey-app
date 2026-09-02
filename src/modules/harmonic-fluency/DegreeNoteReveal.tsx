/**
 * Where the note sits, and what it sounds like — after you have named
 * it.
 *
 * =====================================================================
 * REVEAL-SIDE ONLY, AND THAT IS THE WHOLE PROTECTION.
 *
 * The rule is `DegreePlayback`'s, followed rather than restated:
 * playing the note before the answer "would turn a written question
 * into an ear question — a different card". The same argument covers
 * the keyboard. A board showing the answer while the question is still
 * open would let a reader find the note by looking instead of by
 * knowing, which is the thing this family exists to train.
 *
 * So the knowing comes first. The keyboard and the sound follow it and
 * never replace it.
 *
 * =====================================================================
 * IT WRITES NOTHING.
 *
 * No attempt, no engagement, no spacing signal. The card was already
 * scored by the shell when the option was tapped; this is what happens
 * after. That is what keeps a keyboard on a written card from becoming
 * a second, unscored assessment nobody asked for.
 * =====================================================================
 */
import { useEffect, useRef, useState } from 'react';
import AnswerKeyboard from '../../components/AnswerKeyboard';
import SpeedControl from '../../components/SpeedControl';
import { getPref } from '../../lib/userPrefs';
import type { PlaybackHandle, TonicContext } from '../../lib/musicalPlayback';
import { degreePitchClass } from './chromaticDegrees';
import { DEGREE_NOTE_AUDIO_MODULE, playDegreeNote } from './degreeNoteAudio';

/**
 * The pref chord progressions writes, read here for the same reason
 * `DegreePlayback` reads it: a reader who has turned priming off has
 * said something about how they want to practise, not something about
 * one module.
 */
const PREF_TONIC = 'chordProgressionsTonicContext';

export default function DegreeNoteReveal({
  root, degreeId,
}: {
  root: string;
  degreeId: string;
}) {
  const [context, setContext] = useState<TonicContext>('singleNote');
  const playing = useRef<PlaybackHandle | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void getPref<TonicContext>(PREF_TONIC, 'singleNote')
      .then(v => { if (live) setContext(v); });
    return () => { live = false; };
  }, []);

  // A note left ringing after the card changes is a note answering the
  // wrong question.
  useEffect(() => () => { playing.current?.stop(); }, []);

  const rootPc = degreePitchClass(root, '1');
  const notePc = degreePitchClass(root, degreeId);
  if (rootPc === null || notePc === null) return null;

  return (
    <div className="space-y-2 pt-2" data-testid="degree-note-reveal">
      {/* NOT INTERACTIVE. `revealed` is true from the first frame, which
          is what makes the board a picture rather than a question: the
          keyboard ignores presses once revealed, and the marks are on
          before the reader could reach for one. */}
      <AnswerKeyboard
        subject={{ pc: rootPc, octave: 0 }}
        accepted={[{ pc: notePc, octave: 0 }, { pc: notePc, octave: 1 }]}
        pressed={null}
        revealed
        onPress={() => {}}
      />
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          data-testid="degree-note-play"
          disabled={busy}
          onClick={async () => {
            playing.current?.stop();
            setBusy(true);
            try {
              playing.current = await playDegreeNote(root, degreeId, context);
            } finally {
              setBusy(false);
            }
          }}
          className="text-xs rounded border border-neutral-300 dark:border-neutral-700 px-2 py-1 text-neutral-600 dark:text-neutral-300 hover:border-fluent hover:text-fluent disabled:opacity-40"
        >
          Hear it
        </button>
        <SpeedControl moduleId={DEGREE_NOTE_AUDIO_MODULE} />
      </div>
    </div>
  );
}
